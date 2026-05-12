import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getRarityNameClass, getRarityStyles } from '../../ui/rarityStyles';
import {
    自动装备最佳装备,
    装备物品到角色,
    卸下角色装备,
    是否可装备物品,
    获取物品可装备槽位,
    获取装备槽位标签
} from '../../../utils/equipmentActions';
import { 获取物品已选图标地址 } from '../../../utils/itemImage';
import { 获取物品明细分组 } from '../../../utils/rulebook';
import { 是否杂物类物品 } from '../../../utils/inventoryActions';
import { 规范化消耗品使用效果 } from '../../../utils/itemEffects';

interface Props {
    character: any;
    onClose: () => void;
    onCharacterChange?: (nextCharacter: any) => void;
    onSellItem?: (itemId: string) => { ok: boolean; message: string } | void;
    onDiscardItem?: (itemId: string) => { ok: boolean; message: string } | void;
    onSellAllMisc?: () => { ok: boolean; message: string } | void;
    onDiscardAllMisc?: () => { ok: boolean; message: string } | void;
}

type ItemCategory = '全部' | '装备' | '任务道具' | '消耗品' | '材料' | '秘籍' | '杂物';

const TYPE_ORDER = ['武器', '防具', '饰品', '任务道具', '秘籍', '消耗品', '材料', '杂物', '杂项'];
const QUALITY_ORDER = ['传说', '绝世', '极品', '上品', '良品', '凡品'];
const CATEGORY_COLORS: Record<ItemCategory, string> = {
    全部: 'text-wuxia-gold',
    装备: 'text-amber-400',
    任务道具: 'text-sky-400',
    消耗品: 'text-emerald-400',
    材料: 'text-cyan-400',
    秘籍: 'text-purple-400',
    杂物: 'text-stone-400',
};
const CATEGORIES: ItemCategory[] = ['全部', '装备', '任务道具', '消耗品', '材料', '秘籍', '杂物'];

const getSafeNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const getSafeText = (value: unknown, fallback = '') => (
    typeof value === 'string' ? value.trim() : fallback
);

const cloneData = <T,>(data: T): T => JSON.parse(JSON.stringify(data)) as T;

const recalculateWeight = (items: any[]) => items.reduce((sum, item) => (
    sum + getSafeNumber(item?.重量) * getSafeNumber(item?.堆叠数量, 1)
), 0);

const BODY_PARTS = ['头部', '胸部', '腹部', '左手', '右手', '左腿', '右腿'];

const applyCharacterEffect = (nextCharacter: any, target: string, value: number) => {
    if (!target || !Number.isFinite(value)) return false;
    if (target === '全身血量') {
        let touched = false;
        BODY_PARTS.forEach((part) => {
            const currentKey = `${part}当前血量`;
            const maxKey = `${part}最大血量`;
            const current = getSafeNumber(nextCharacter[currentKey], Number.NaN);
            const maxValue = getSafeNumber(nextCharacter[maxKey], Number.NaN);
            if (!Number.isFinite(current) || !Number.isFinite(maxValue)) return;
            nextCharacter[currentKey] = Math.min(maxValue, Math.max(0, current + value));
            touched = true;
        });
        return touched;
    }
    const current = getSafeNumber(nextCharacter[target], Number.NaN);
    if (!Number.isFinite(current)) return false;
    const maxKey = target.startsWith('当前') ? target.replace(/^当前/, '最大') : '';
    const maxValue = maxKey ? getSafeNumber(nextCharacter[maxKey], Number.NaN) : Number.NaN;
    const nextValue = current + value;
    nextCharacter[target] = Number.isFinite(maxValue)
        ? Math.min(maxValue, Math.max(0, nextValue))
        : nextValue;
    return true;
};

const applyConsumableEffect = (character: any, selectedItem: any) => {
    const nextCharacter = cloneData(character);
    nextCharacter.物品列表 = Array.isArray(nextCharacter?.物品列表) ? nextCharacter.物品列表 : [];
    const itemRef = getSafeText(selectedItem?.ID) || getSafeText(selectedItem?.名称);
    const itemIndex = nextCharacter.物品列表.findIndex((item: any) => item?.ID === itemRef || item?.名称 === itemRef);
    const item = itemIndex >= 0 ? nextCharacter.物品列表[itemIndex] : null;
    if (!item || getSafeText(item?.类型) !== '消耗品') {
        return { nextCharacter, message: '此物品不可使用', consumed: false };
    }

    const effects = 规范化消耗品使用效果(item);
    effects.forEach((effect: any) => {
        const target = getSafeText(effect?.目标属性);
        const value = getSafeNumber(effect?.数值);
        applyCharacterEffect(nextCharacter, target, value);
    });

    const count = getSafeNumber(item?.堆叠数量, 1);
    if (count > 1) {
        item.堆叠数量 = count - 1;
    } else {
        nextCharacter.物品列表.splice(itemIndex, 1);
    }
    nextCharacter.当前负重 = recalculateWeight(nextCharacter.物品列表);
    return { nextCharacter, message: `已使用${getSafeText(item?.名称, '消耗品')}`, consumed: true };
};

const getCategoryCount = (items: any[], category: ItemCategory) => {
    if (category === '全部') return items.length;
    if (category === '装备') return items.filter((item) => ['武器', '防具', '饰品'].includes(getSafeText(item?.类型))).length;
    if (category === '杂物') return items.filter(是否杂物类物品).length;
    return items.filter((item) => getSafeText(item?.类型) === category).length;
};

const renderItemIcon = (type: string, className: string) => {
    const icons: Record<string, React.ReactElement> = {
        全部: (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z" />
            </svg>
        ),
        装备: (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L4 6v5c0 5.55 3.84 10.74 8 12c4.16-1.26 8-6.45 8-12V6l-8-4z" />
            </svg>
        ),
        任务道具: (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 3h10l2 3v15H5V6l2-3zm1 5h8V6H8v2zm0 4h8v2H8v-2zm0 4h5v2H8v-2z" />
            </svg>
        ),
        武器: (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.5 2C7.5 2 9 4 12 4C15 4 16.5 2 16.5 2L17 2.5C17 2.5 16 4.5 16 6C16 7.5 17.5 9 19 9.5L20 10L19.5 11C19.5 11 17 10.5 15 11.5C13 12.5 12 15 12 15C12 15 11 12.5 9 11.5C7 10.5 4.5 11 4.5 11L4 10L5 9.5C6.5 9 8 7.5 8 6C8 4.5 7 2.5 7 2.5L7.5 2Z" />
                <path d="M12 15V22M9 19H15" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
        ),
        防具: (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L4 6V11C4 16 7 20.5 12 22C17 20.5 20 16 20 11V6L12 2ZM12 4.5L17.5 7.5V11C17.5 14.5 15.5 17.5 12 19C8.5 17.5 6.5 14.5 6.5 11V7.5L12 4.5Z" />
            </svg>
        ),
        饰品: (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C9 2 6.5 4 6 7C5.5 10 7.5 13 10 14.5V17C10 18.5 8.5 20 7 20.5V22H17V20.5C15.5 20 14 18.5 14 17V14.5C16.5 13 18.5 10 18 7C17.5 4 15 2 12 2ZM12 4C13.5 4 14.5 4.5 15 6H9C9.5 4.5 10.5 4 12 4ZM12 13C10 13 8.5 11.5 8 9.5H16C15.5 11.5 14 13 12 13Z" />
            </svg>
        ),
        消耗品: (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 2H15V4H17C18.5 4 19.5 5 19.5 6.5V19.5C19.5 21 18.5 22 17 22H7C5.5 22 4.5 21 4.5 19.5V6.5C4.5 5 5.5 4 7 4H9V2ZM12 18C13.5 18 14.5 17 14.5 15.5C14.5 14 13.5 13 12 13C10.5 13 9.5 14 9.5 15.5C9.5 17 10.5 18 12 18ZM8 6H16V10H8V6Z" />
            </svg>
        ),
        秘籍: (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4H20V20H4V4ZM6 6V18H18V6H6ZM8 8H16V10H8V8ZM8 12H14V14H8V12Z" />
                <path d="M12 2L13 4H11L12 2Z" fill="currentColor" />
            </svg>
        ),
        材料: (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14 8H20L15 12L17 18L12 14L7 18L9 12L4 8H10L12 2Z" />
            </svg>
        ),
        杂物: (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 6H19V8H5V6ZM5 10H15V12H5V10ZM5 14H17V16H5V14ZM5 18H13V20H5V18Z" />
                <circle cx="18" cy="17" r="3" fill="currentColor" />
            </svg>
        ),
        杂项: (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2ZM12 20C7.5 20 4 16.5 4 12C4 7.5 7.5 4 12 4C16.5 4 20 7.5 20 12C20 16.5 16.5 20 12 20ZM11 7H13V13H11V7ZM11 15H13V17H11V15Z" />
            </svg>
        ),
    };

    return icons[type] || icons.杂物;
};

const InventoryModal: React.FC<Props> = ({ character, onClose, onCharacterChange, onSellItem, onDiscardItem, onSellAllMisc, onDiscardAllMisc }) => {
    const [activeCategory, setActiveCategory] = useState<ItemCategory>('全部');
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [actionMessage, setActionMessage] = useState('');
    const [imageViewer, setImageViewer] = useState<{ src: string; alt: string } | null>(null);

    const items = Array.isArray(character?.物品列表) ? character.物品列表 : [];
    const totalWeight = getSafeNumber(character?.当前负重);
    const maxWeight = getSafeNumber(character?.最大负重, 50);
    const weightPercent = maxWeight > 0 ? Math.min((totalWeight / maxWeight) * 100, 100) : 0;
    const isOverloaded = totalWeight > maxWeight;

    const displayItems = useMemo(() => {
        const filtered = items.filter((item) => {
            const type = getSafeText(item?.类型);
            if (activeCategory === '全部') return true;
            if (activeCategory === '装备') return ['武器', '防具', '饰品'].includes(type);
            if (activeCategory === '杂物') return 是否杂物类物品(item);
            return type === activeCategory;
        });

        return [...filtered].sort((a, b) => {
            const leftType = TYPE_ORDER.indexOf(getSafeText(a?.类型));
            const rightType = TYPE_ORDER.indexOf(getSafeText(b?.类型));
            if (leftType !== rightType) return Math.max(leftType, 0) - Math.max(rightType, 0);

            const leftQuality = QUALITY_ORDER.indexOf(getSafeText(a?.品质));
            const rightQuality = QUALITY_ORDER.indexOf(getSafeText(b?.品质));
            if (leftQuality !== rightQuality) return Math.max(leftQuality, 0) - Math.max(rightQuality, 0);

            return getSafeText(a?.名称).localeCompare(getSafeText(b?.名称), 'zh-Hans-CN');
        });
    }, [activeCategory, items]);
    React.useEffect(() => {
        if (!selectedItem) return;
        const itemRef = getSafeText(selectedItem?.ID) || getSafeText(selectedItem?.名称);
        const freshItem = items.find((item: any) => item?.ID === itemRef || item?.名称 === itemRef);
        if (freshItem && freshItem !== selectedItem) setSelectedItem(freshItem);
    }, [items, selectedItem]);

    const totalValue = items.reduce((sum, item) => (
        sum + getSafeNumber(item?.价值) * getSafeNumber(item?.堆叠数量, 1)
    ), 0);
    const selectedEquipSlots = selectedItem ? 获取物品可装备槽位(selectedItem) : [];
    const selectedCanEquip = selectedItem ? 是否可装备物品(selectedItem) : false;
    const selectedCanUse = getSafeText(selectedItem?.类型) === '消耗品';
    const selectedDetailGroups = selectedItem ? 获取物品明细分组(selectedItem) : [];

    const applyCharacterChange = (nextCharacter: any, selectedItemRef?: string) => {
        onCharacterChange?.(nextCharacter);
        if (selectedItemRef) {
            const nextItem = Array.isArray(nextCharacter?.物品列表)
                ? nextCharacter.物品列表.find((item: any) => item?.ID === selectedItemRef || item?.名称 === selectedItemRef)
                : null;
            if (nextItem) setSelectedItem(nextItem);
    }
};

const DetailMetricCard: React.FC<{ groupTitle: string; entry: any }> = ({ groupTitle, entry }) => (
    <div className="min-w-0 rounded-lg border border-white/12 bg-black/35 px-2.5 py-2 transition hover:border-wuxia-gold/45 hover:bg-wuxia-gold/5">
        <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
                <div className="break-words text-[12px] font-semibold leading-4 text-gray-100">{entry.标签}</div>
                <div className="mt-1 break-words font-mono text-[15px] font-bold leading-5 text-amber-100">{entry.数值}</div>
            </div>
            <span
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-wuxia-gold/25 bg-wuxia-gold/10 text-[10px] font-bold text-wuxia-gold/85"
                title={`${groupTitle} · ${entry.标签}：${entry.依据}`}
                aria-label={`${entry.标签}说明`}
            >
                ?
            </span>
        </div>
    </div>
);

    const handleEquipSelected = () => {
        if (!selectedItem || !onCharacterChange) return;
        const itemRef = getSafeText(selectedItem?.ID) || getSafeText(selectedItem?.名称);
        const nextCharacter = 装备物品到角色(character, itemRef, selectedEquipSlots[0]);
        applyCharacterChange(nextCharacter, itemRef);
        setActionMessage(`已装备到${获取装备槽位标签(selectedEquipSlots[0])}`);
    };

    const handleUnequipSelected = () => {
        if (!selectedItem || !onCharacterChange) return;
        const itemRef = getSafeText(selectedItem?.ID) || getSafeText(selectedItem?.名称);
        const nextCharacter = 卸下角色装备(character, itemRef);
        applyCharacterChange(nextCharacter, itemRef);
        setActionMessage('已卸下装备');
    };

    const handleEquipBest = () => {
        if (!onCharacterChange) return;
        const nextCharacter = 自动装备最佳装备(character);
        applyCharacterChange(nextCharacter, getSafeText(selectedItem?.ID) || getSafeText(selectedItem?.名称));
        setActionMessage('已自动换上当前最优装备');
    };

    const handleUseSelected = () => {
        if (!selectedItem || !onCharacterChange) return;
        const result = applyConsumableEffect(character, selectedItem);
        onCharacterChange(result.nextCharacter);
        if (result.consumed) {
            const itemRef = getSafeText(selectedItem?.ID) || getSafeText(selectedItem?.名称);
            const nextItem = Array.isArray(result.nextCharacter?.物品列表)
                ? result.nextCharacter.物品列表.find((item: any) => item?.ID === itemRef || item?.名称 === itemRef)
                : null;
            setSelectedItem(nextItem || null);
        }
        setActionMessage(result.message);
    };

    const handleSellSelected = () => {
        if (!selectedItem || !onSellItem) return;
        const itemRef = getSafeText(selectedItem?.ID);
        if (!itemRef) return;
        const result = onSellItem(itemRef);
        setActionMessage(result?.message || '已送入拍卖行寄卖');
        if (!result || result.ok) setSelectedItem(null);
    };

    const handleDiscardSelected = () => {
        if (!selectedItem || !onDiscardItem) return;
        const itemRef = getSafeText(selectedItem?.ID);
        if (!itemRef) return;
        const result = onDiscardItem(itemRef);
        setActionMessage(result?.message || '已丢弃物品');
        if (!result || result.ok) setSelectedItem(null);
    };

    const handleSellAllMisc = () => {
        if (!onSellAllMisc) return;
        const result = onSellAllMisc();
        setActionMessage(result?.message || '已一键寄售杂物');
        if (!result || result.ok) setSelectedItem(null);
    };

    const handleDiscardAllMisc = () => {
        if (!onDiscardAllMisc) return;
        const result = onDiscardAllMisc();
        setActionMessage(result?.message || '已一键丢弃杂物');
        if (!result || result.ok) setSelectedItem(null);
    };

    return (
        <div className="inventory-modal-body fixed inset-0 z-[200] hidden items-center justify-center p-3 backdrop-blur-sm animate-fadeIn md:flex" style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}>
            <div className="relative flex h-[92vh] max-h-[92vh] w-full max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-wuxia-gold/20 bg-ink-black/95 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 2xl:max-w-[1780px]">
                <div className="relative z-50 flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-gradient-to-r from-black/80 to-black/40 px-6">
                    <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.8)] animate-pulse" />
                        <h3 className="font-serif text-2xl font-bold tracking-[0.32em] text-wuxia-gold drop-shadow-md">
                            仙途行囊
                            <span className="ml-3 rounded-full border border-wuxia-gold/25 px-2.5 py-1 font-mono text-[11px] tracking-widest text-wuxia-gold/70">
                                INVENTORY
                            </span>
                        </h3>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3 rounded border border-wuxia-gold/20 bg-black/40 px-4 py-1.5 shadow-inner">
                            <span className="text-xs uppercase tracking-widest text-wuxia-gold/80">负重</span>
                            <div className="h-1.5 w-32 overflow-hidden rounded-full border border-white/5 bg-gray-900">
                                <div
                                    className="h-full bg-gradient-to-r from-wuxia-gold/70 via-wuxia-gold to-wuxia-gold/80 shadow-[0_0_5px_rgba(212,175,55,0.65)] transition-all duration-300"
                                    style={{ width: `${weightPercent}%` }}
                                />
                            </div>
                            <span className={`text-xs font-mono ${isOverloaded ? 'text-red-300' : 'text-gray-100'}`}>
                                {totalWeight.toFixed(1)} / {maxWeight}
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 bg-black/50 text-gray-400 transition-all hover:rotate-90 hover:border-red-400 hover:bg-red-400/10 hover:text-red-400"
                            title="关闭"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="relative flex flex-1 overflow-hidden">
                    <div className="absolute inset-0 z-0">
                        <div className="absolute inset-0 bg-ink-wash/5 bg-cover bg-center opacity-30 mix-blend-luminosity blur-sm" />
                        <div className="absolute inset-0 bg-gradient-to-br from-wuxia-gold/5 via-transparent to-black" />
                    </div>

                    <div className="relative z-10 flex w-60 shrink-0 flex-col gap-2 overflow-y-auto border-r border-wuxia-gold/10 bg-black/40 p-4 backdrop-blur-sm custom-scrollbar">
                        <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.26em] text-wuxia-gold/70">
                            <span className="h-3 w-1 rounded-full bg-wuxia-gold/50" />
                            行囊格位
                        </div>

                        {CATEGORIES.map((category) => (
                            <button
                                key={category}
                                type="button"
                                onClick={() => {
                                    setActiveCategory(category);
                                    setSelectedItem(null);
                                }}
                                className={`group relative flex items-center justify-between overflow-hidden rounded-xl px-3 py-3 transition-all ${
                                    activeCategory === category
                                        ? 'border border-wuxia-gold/40 bg-gradient-to-r from-wuxia-gold/20 to-wuxia-gold/5 shadow-[0_0_15px_rgba(212,175,55,0.15)]'
                                        : 'border border-transparent hover:border-white/10 hover:bg-white/[0.03]'
                                }`}
                            >
                                {activeCategory === category ? (
                                    <div className="absolute inset-y-0 left-0 z-10 w-1 bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.8)]" />
                                ) : null}
                                <span className={`flex items-center gap-3 font-serif text-base ${
                                    activeCategory === category ? 'font-bold text-wuxia-gold drop-shadow-sm' : 'text-gray-200 group-hover:text-white'
                                }`}>
                                    <span className={`flex h-5 w-5 items-center justify-center ${
                                        activeCategory === category ? 'text-wuxia-gold' : CATEGORY_COLORS[category]
                                    } opacity-80 group-hover:opacity-100`}>
                                        {renderItemIcon(category, 'h-4 w-4')}
                                    </span>
                                    <span>{category}</span>
                                </span>
                                <span className={`rounded border px-1.5 py-0.5 font-mono text-xs ${
                                    activeCategory === category
                                        ? 'border-wuxia-gold/30 bg-wuxia-gold/20 text-wuxia-gold'
                                        : 'border-gray-700 bg-black/60 text-gray-300'
                                }`}>
                                    {getCategoryCount(items, category)}
                                </span>
                            </button>
                        ))}

                        <div className="mt-auto space-y-3 border-t border-wuxia-gold/10 pt-6">
                            <button
                                type="button"
                                onClick={handleEquipBest}
                                disabled={!onCharacterChange}
                                className="w-full rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2.5 text-sm font-semibold tracking-[0.08em] text-amber-100 transition hover:border-amber-300/60 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                自动穿戴最佳
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={handleSellAllMisc}
                                    disabled={!onSellAllMisc || getCategoryCount(items, '杂物') <= 0}
                                    className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    杂物全售
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDiscardAllMisc}
                                    disabled={!onDiscardAllMisc || getCategoryCount(items, '杂物') <= 0}
                                    className="rounded-lg border border-red-400/30 bg-red-500/10 px-2 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300/60 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    杂物全弃
                                </button>
                            </div>
                            {actionMessage ? (
                                <div className="rounded border border-white/10 bg-black/35 px-2 py-1.5 text-xs text-gray-300">{actionMessage}</div>
                            ) : null}
                            <div className="rounded-lg border border-wuxia-gold/5 bg-black/40 p-3">
                                <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-gray-400">Total Value</div>
                                <div className="flex items-center gap-1.5 font-serif text-base text-wuxia-gold">
                                    <svg className="h-3.5 w-3.5 opacity-80" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 100-16 8 8 0 000 16zm-1-8H9v-2h2V8h2v2h2v2h-2v2h-2v-2z" />
                                    </svg>
                                    {totalValue.toLocaleString()} 铜
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            {displayItems.length > 0 ? (
                                <div className="grid grid-cols-[repeat(auto-fill,minmax(7.4rem,1fr))] gap-2.5">
                                    {displayItems.map((item, index) => {
                                        const count = getSafeNumber(item?.堆叠数量, 1);
                                        const styles = getRarityStyles(getSafeText(item?.品质));
                                        const name = getSafeText(item?.名称, '未命名物品');
                                        const isEquipped = Boolean(item?.当前装备部位);
                                        const isSelected = selectedItem?.ID === item?.ID;
                                        const key = String(item?.ID ?? `${name}-${index}`);
                                        const itemIconImage = 获取物品已选图标地址(item);

                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setSelectedItem(item)}
                                                className={`group relative aspect-square cursor-pointer rounded-lg text-left transition-all active:scale-95 ${
                                                    isSelected
                                                        ? 'scale-[1.02] ring-2 ring-wuxia-gold/60 shadow-[0_0_15px_rgba(212,175,55,0.3)]'
                                                        : 'hover:scale-[1.02]'
                                                }`}
                                            >
                                                <div className="absolute inset-0 rounded-lg border border-white/5 bg-gradient-to-br from-black/80 to-black opacity-80 transition-opacity group-hover:opacity-100" />
                                                <div className={`absolute inset-0 rounded-lg border ${styles.border} ${styles.bg} ${
                                                    isSelected ? 'border-opacity-80 bg-opacity-30' : 'border-opacity-30 bg-opacity-10'
                                                } shadow-inner transition-all group-hover:border-opacity-50 group-hover:bg-opacity-20`} />

                                                {isEquipped ? (
                                                    <div className="absolute -right-1.5 -top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-sky-400 to-blue-600 shadow-[0_0_8px_rgba(56,189,248,0.5)]">
                                                        <span className="text-[9px] font-bold text-white drop-shadow-md">装</span>
                                                    </div>
                                                ) : null}

                                                <div className="absolute inset-x-2 top-2 bottom-10 flex items-center justify-center overflow-hidden rounded-md border border-white/10 bg-black/30 shadow-inner transition-transform duration-300 group-hover:-translate-y-0.5">
                                                    <div className={`flex h-full w-full items-center justify-center overflow-hidden ${styles.text}`}>
                                                        {itemIconImage ? (
                                                            <img
                                                                src={itemIconImage}
                                                                alt={name}
                                                                className="h-full w-full object-cover"
                                                                loading="lazy"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setImageViewer({ src: itemIconImage, alt: name });
                                                                }}
                                                            />
                                                        ) : (
                                                            renderItemIcon(getSafeText(item?.类型), 'h-8 w-8 opacity-90 drop-shadow-md group-hover:opacity-100')
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="absolute bottom-2 left-0 right-0 px-1.5 text-center">
                                                    <div className={`line-clamp-2 break-words text-[13px] font-bold leading-[1.1] tracking-wide drop-shadow-sm ${getRarityNameClass(getSafeText(item?.品质))}`}>
                                                        {name}
                                                    </div>
                                                    <div className="mt-0.5 font-mono text-xs text-gray-200">x{count}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-500 opacity-30">
                                    <span className="text-4xl">空</span>
                                    <span className="text-xl tracking-widest">空空如也</span>
                                </div>
                            )}
                        </div>

                        {selectedItem ? (
                            (() => {
                                const selectedIconImage = 获取物品已选图标地址(selectedItem);
                                return (
                            <div className="shrink-0 border-t border-wuxia-gold/20 bg-gradient-to-r from-black/95 via-[#08090b]/95 to-black/95 p-3 shadow-[0_-18px_45px_rgba(0,0,0,0.65)] backdrop-blur-md animate-fadeIn">
                                <div className="grid min-w-0 items-start grid-cols-[minmax(300px,0.9fr)_minmax(460px,1.35fr)] gap-3">
                                    <div className="relative col-start-1 row-start-1 flex min-w-0 gap-4 overflow-hidden rounded-xl border border-white/10 bg-black/30 p-3">
                                        <div className={`absolute right-0 top-0 h-24 w-24 rounded-full opacity-20 blur-3xl ${getRarityStyles(getSafeText(selectedItem?.品质)).bg}`} />
                                        <div className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-opacity-20 shadow-lg ${
                                            getRarityStyles(getSafeText(selectedItem?.品质)).border
                                        } ${getRarityStyles(getSafeText(selectedItem?.品质)).bg}`}>
                                            {selectedIconImage ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setImageViewer({ src: selectedIconImage, alt: getSafeText(selectedItem?.名称, '物品图标') })}
                                                    className="h-full w-full overflow-hidden rounded-xl"
                                                    aria-label={`放大查看${getSafeText(selectedItem?.名称, '物品图标')}`}
                                                >
                                                    <img src={selectedIconImage} alt={getSafeText(selectedItem?.名称, '物品图标')} className="h-full w-full object-cover" />
                                                </button>
                                            ) : (
                                                renderItemIcon(getSafeText(selectedItem?.类型), `h-6 w-6 drop-shadow-md ${getRarityStyles(getSafeText(selectedItem?.品质)).text}`)
                                            )}
                                        </div>
                                        <div className="relative z-10 min-w-0 flex-1">
                                            <div className={`truncate text-xl font-bold ${getRarityNameClass(getSafeText(selectedItem?.品质))}`}>
                                                {getSafeText(selectedItem?.名称, '未命名物品')}
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2 text-sm">
                                                <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-gray-100">
                                                    {getSafeText(selectedItem?.类型, '未知')}
                                                </span>
                                                <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-gray-100">
                                                    {getSafeText(selectedItem?.品质, '未知')}
                                                </span>
                                                {selectedItem?.当前装备部位 ? (
                                                    <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-1 text-blue-300">
                                                        已装备：{selectedItem.当前装备部位}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedItem(null)}
                                            className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-800 bg-black/40 text-gray-500 transition-all hover:rotate-90 hover:text-white"
                                            title="关闭详情"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    <div className="col-start-1 row-start-4 max-h-28 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-3 text-[15px] leading-7 text-gray-100 custom-scrollbar">
                                        {getSafeText(selectedItem?.描述, '暂无描述')}
                                    </div>

                                    <div className="col-start-1 row-start-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                            <span className="text-sm font-bold tracking-[0.12em] text-emerald-100">拍卖行出售</span>
                                            <span className="truncate text-xs text-gray-300">按市场价寄售，下回合入账</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSellSelected}
                                            disabled={!onSellItem}
                                            className="w-full rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-50 transition hover:border-emerald-300/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            出售
                                        </button>
                                    </div>

                                    <div className="col-start-1 row-start-5 rounded-xl border border-red-400/20 bg-red-500/5 p-3">
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                            <span className="text-sm font-bold tracking-[0.12em] text-red-100">直接丢弃</span>
                                            <span className="truncate text-xs text-gray-300">从背包移除当前物品</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleDiscardSelected}
                                            disabled={!onDiscardItem}
                                            className="w-full rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-50 transition hover:border-red-300/60 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            丢弃
                                        </button>
                                    </div>

                                    {selectedCanEquip ? (
                                        <div className="col-start-1 row-start-3 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3">
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                <span className="text-sm font-bold tracking-[0.12em] text-amber-100">装备操作</span>
                                                <span className="truncate text-xs text-gray-300">
                                                    {selectedItem?.当前装备部位 ? `当前：${selectedItem.当前装备部位}` : `可装备：${selectedEquipSlots.map(获取装备槽位标签).join(' / ')}`}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleEquipSelected}
                                                    disabled={!onCharacterChange}
                                                    className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-50 transition hover:border-emerald-300/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    装备
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleUnequipSelected}
                                                    disabled={!onCharacterChange || !selectedItem?.当前装备部位}
                                                    className="rounded-lg border border-sky-400/35 bg-sky-500/10 px-3 py-2.5 text-sm font-semibold text-sky-50 transition hover:border-sky-300/60 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    卸下
                                                </button>
                                            </div>
                                            {actionMessage ? (
                                                <div className="mt-2 truncate text-xs text-amber-100">{actionMessage}</div>
                                            ) : null}
                                        </div>
                                    ) : selectedCanUse ? (
                                        <div className="col-start-1 row-start-3 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                <span className="text-sm font-bold tracking-[0.12em] text-emerald-100">消耗操作</span>
                                                <span className="truncate text-xs text-gray-300">持有：{getSafeNumber(selectedItem?.堆叠数量, 1)}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleUseSelected}
                                                disabled={!onCharacterChange}
                                                className="w-full rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-50 transition hover:border-emerald-300/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                使用
                                            </button>
                                            {actionMessage ? (
                                                <div className="mt-2 truncate text-xs text-emerald-100">{actionMessage}</div>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="col-start-1 row-start-3 flex items-center justify-center rounded-xl border border-white/10 bg-black/25 text-sm text-gray-300">
                                            此物品不可操作
                                        </div>
                                    )}

                                    <div className="col-start-2 row-start-1 row-span-5 min-h-[22rem] min-w-0 space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-gray-100 custom-scrollbar">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-bold tracking-[0.18em] text-wuxia-gold">属性与判定依据</div>
                                            <div className="text-xs text-gray-300">依据悬停查看</div>
                                        </div>
                                        {selectedDetailGroups.map((group) => (
                                            <div key={group.标题}>
                                                <div className="mb-2 text-xs font-bold tracking-[0.16em] text-wuxia-gold/85">{group.标题}</div>
                                                <div className="grid grid-cols-3 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                                                    {group.条目.map((entry) => (
                                                        <DetailMetricCard key={`${group.标题}-${entry.标签}`} groupTitle={group.标题} entry={entry} />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                                );
                            })()
                        ) : null}
                    </div>
                </div>
            </div>
            {imageViewer && typeof document !== 'undefined' && createPortal((
                <div
                    className="fixed inset-0 z-[360] flex items-center justify-center p-4 backdrop-blur-sm"
                    style={{ backgroundColor: 'rgba(0,0,0,0.88)' }}
                    onClick={() => setImageViewer(null)}
                    role="dialog"
                    aria-label="物品图片预览"
                >
                    {/* 固定在屏幕右上角的主关闭按钮：即便图片超大也能第一眼看到 */}
                    <button
                        type="button"
                        onClick={() => setImageViewer(null)}
                        className="fixed z-[380] flex h-14 min-h-[56px] w-14 min-w-[56px] items-center justify-center rounded-full border-[3px] border-white bg-red-600 text-white shadow-[0_0_32px_rgba(220,38,38,0.9)] transition hover:scale-110 hover:bg-red-500 hover:shadow-[0_0_48px_rgba(248,113,113,1)]"
                        style={{ top: 'max(env(safe-area-inset-top, 0px), 16px)', right: 'max(env(safe-area-inset-right, 0px), 16px)' }}
                        aria-label="关闭图片预览"
                        title="关闭图片预览"
                    >
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    {/* 底部可见的关闭提示按钮：作为第二入口，彻底避免"找不到退出" */}
                    <button
                        type="button"
                        onClick={() => setImageViewer(null)}
                        className="fixed bottom-6 left-1/2 z-[380] -translate-x-1/2 rounded-full border-2 border-white bg-red-600/95 px-5 py-2 text-sm font-bold tracking-widest text-white shadow-[0_0_16px_rgba(220,38,38,0.75)] hover:bg-red-500"
                        style={{ bottom: 'max(env(safe-area-inset-bottom, 0px), 24px)' }}
                    >
                        关闭预览
                    </button>
                    <div className="relative max-h-full max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
                        <img src={imageViewer.src} alt={imageViewer.alt} className="max-h-[86vh] max-w-[92vw] rounded-lg border border-white/25 object-contain shadow-2xl" />
                    </div>
                </div>
            ), document.body)}
        </div>
    );
};

export default InventoryModal;
