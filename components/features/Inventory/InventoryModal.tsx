import React, { useState, useMemo } from 'react';
import { 角色数据结构 } from '../../../types';
import { 游戏物品, 物品类型 } from '../../../models/item';
import { getRarityNameClass, getRarityStyles } from '../../ui/rarityStyles';

interface Props {
    character: 角色数据结构;
    onClose: () => void;
}

type ItemCategory = '全部' | '装备' | '消耗品' | '材料' | '秘籍' | '杂物';

const categoryColors: Record<ItemCategory, string> = {
    '全部': 'text-wuxia-gold',
    '装备': 'text-amber-400',
    '消耗品': 'text-emerald-400',
    '材料': 'text-cyan-400',
    '秘籍': 'text-purple-400',
    '杂物': 'text-stone-400'
};

const renderItemIcon = (type: 物品类型 | ItemCategory, className: string) => {
    const icons: Record<string, React.ReactElement> = {
        '全部': (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z" />
            </svg>
        ),
        '装备': (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L4 6v5c0 5.55 3.84 10.74 8 12c4.16-1.26 8-6.45 8-12V6l-8-4z" />
            </svg>
        ),
        '武器': (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.5 2C7.5 2 9 4 12 4C15 4 16.5 2 16.5 2L17 2.5C17 2.5 16 4.5 16 6C16 7.5 17.5 9 19 9.5L20 10L19.5 11C19.5 11 17 10.5 15 11.5C13 12.5 12 15 12 15C12 15 11 12.5 9 11.5C7 10.5 4.5 11 4.5 11L4 10L5 9.5C6.5 9 8 7.5 8 6C8 4.5 7 2.5 7 2.5L7.5 2Z" />
                <path d="M12 15V22M9 19H15" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
        ),
        '防具': (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L4 6V11C4 16 7 20.5 12 22C17 20.5 20 16 20 11V6L12 2ZM12 4.5L17.5 7.5V11C17.5 14.5 15.5 17.5 12 19C8.5 17.5 6.5 14.5 6.5 11V7.5L12 4.5Z" />
            </svg>
        ),
        '饰品': (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C9 2 6.5 4 6 7C5.5 10 7.5 13 10 14.5V17C10 18.5 8.5 20 7 20.5V22H17V20.5C15.5 20 14 18.5 14 17V14.5C16.5 13 18.5 10 18 7C17.5 4 15 2 12 2ZM12 4C13.5 4 14.5 4.5 15 6H9C9.5 4.5 10.5 4 12 4ZM12 13C10 13 8.5 11.5 8 9.5H16C15.5 11.5 14 13 12 13Z" />
            </svg>
        ),
        '消耗品': (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 2H15V4H17C18.5 4 19.5 5 19.5 6.5V19.5C19.5 21 18.5 22 17 22H7C5.5 22 4.5 21 4.5 19.5V6.5C4.5 5 5.5 4 7 4H9V2ZM12 18C13.5 18 14.5 17 14.5 15.5C14.5 14 13.5 13 12 13C10.5 13 9.5 14 9.5 15.5C9.5 17 10.5 18 12 18ZM8 6H16V10H8V6Z" />
            </svg>
        ),
        '秘籍': (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4H20V20H4V4ZM6 6V18H18V6H6ZM8 8H16V10H8V8ZM8 12H14V14H8V12Z" />
                <path d="M12 2L13 4H11L12 2Z" fill="currentColor" />
            </svg>
        ),
        '材料': (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14 8H20L15 12L17 18L12 14L7 18L9 12L4 8H10L12 2Z" />
            </svg>
        ),
        '杂物': (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 6H19V8H5V6ZM5 10H15V12H5V10ZM5 14H17V16H5V14ZM5 18H13V20H5V18Z" />
                <circle cx="18" cy="17" r="3" fill="currentColor" />
            </svg>
        ),
        '杂项': (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2ZM12 20C7.5 20 4 16.5 4 12C4 7.5 7.5 4 12 4C16.5 4 20 7.5 20 12C20 16.5 16.5 20 12 20ZM11 7H13V13H11V7ZM11 15H13V17H11V15Z" />
            </svg>
        )
    };
    return icons[type] || icons['杂物'];
};

const InventoryModal: React.FC<Props> = ({ character, onClose }) => {
    const [activeCategory, setActiveCategory] = useState<ItemCategory>('全部');
    const [selectedItem, setSelectedItem] = useState<游戏物品 | null>(null);

    const displayItems = useMemo(() => {
        const rawItems = character.物品列表 || [];
        const filtered = rawItems.filter(item => {
            if (activeCategory === '全部') return true;
            if (activeCategory === '装备') return ['武器', '防具', '饰品'].includes(item.类型);
            if (activeCategory === '杂物') return ['杂物', '杂项'].includes(item.类型);
            return item.类型 === activeCategory;
        });

        return filtered.sort((a, b) => {
            const typeOrder: 物品类型[] = ['武器', '防具', '饰品', '秘籍', '消耗品', '材料', '杂物', '杂项'];
            const qualityOrder = ['传说', '绝世', '极品', '上品', '良品', '凡品'];
            if (a.类型 !== b.类型) return typeOrder.indexOf(a.类型) - typeOrder.indexOf(b.类型);
            if (a.品质 !== b.品质) return qualityOrder.indexOf(a.品质) - qualityOrder.indexOf(b.品质);
            return a.名称.localeCompare(b.名称);
        });
    }, [character.物品列表, activeCategory]);

    const categories: ItemCategory[] = ['全部', '装备', '消耗品', '材料', '秘籍', '杂物'];

    const totalWeight = character.当前负重 || 0;
    const maxWeight = character.最大负重 || 50;
    const weightPercent = Math.min((totalWeight / maxWeight) * 100, 100);
    const isOverloaded = totalWeight > maxWeight;

    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        categories.forEach(cat => {
            if (cat === '全部') {
                counts[cat] = character.物品列表?.length || 0;
            } else if (cat === '装备') {
                counts[cat] = character.物品列表?.filter(i => ['武器', '防具', '饰品'].includes(i.类型)).length || 0;
            } else if (cat === '杂物') {
                counts[cat] = character.物品列表?.filter(i => ['杂物', '杂项'].includes(i.类型)).length || 0;
            } else {
                counts[cat] = character.物品列表?.filter(i => i.类型 === cat).length || 0;
            }
        });
        return counts;
    }, [categories, character.物品列表]);

    const handleItemClick = (item: 游戏物品) => {
        if (selectedItem?.ID === item.ID) {
            setSelectedItem(null);
        } else {
            setSelectedItem(item);
        }
    };

    return (
        <div className="hidden md:flex fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] items-center justify-center p-4 animate-fadeIn">
            <div className="bg-ink-black/95 w-full max-w-7xl max-h-[90vh] h-[90vh] flex flex-col rounded-2xl border border-wuxia-gold/20 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 relative overflow-hidden">
                <div className="h-14 shrink-0 border-b border-white/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-6 relative z-50">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-wuxia-gold animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>
                        <h3 className="text-wuxia-gold font-serif font-bold text-xl tracking-[0.4em] drop-shadow-md">
                            仙途行囊
                            <span className="text-[10px] text-wuxia-gold/50 ml-2 font-mono tracking-widest border border-wuxia-gold/20 px-2 py-0.5 rounded-full">INVENTORY</span>
                        </h3>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3 bg-black/40 px-4 py-1.5 rounded border border-wuxia-gold/20 shadow-inner">
                            <span className="text-[10px] text-wuxia-gold/70 uppercase tracking-widest">负重</span>
                            <div className="w-32 h-1.5 bg-gray-900 rounded-full overflow-hidden border border-white/5">
                                <div
                                    className={`h-full transition-all duration-300 ${isOverloaded ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]' : weightPercent > 80 ? 'bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.8)]' : 'bg-wuxia-gold shadow-[0_0_5px_rgba(212,175,55,0.8)]'}`}
                                    style={{ width: `${weightPercent}%` }}
                                ></div>
                            </div>
                            <span className={`text-[10px] font-mono ${isOverloaded ? 'text-red-400' : 'text-gray-300'}`}>
                                {totalWeight.toFixed(1)} / {maxWeight}
                            </span>
                        </div>

                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-400 hover:bg-red-400/10 transition-all hover:rotate-90"
                            title="关闭"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden relative">
                    <div className="absolute inset-0 z-0">
                        <div className="absolute inset-0 bg-ink-wash/5 bg-cover bg-center opacity-30 mix-blend-luminosity filter blur-sm"></div>
                        <div className="absolute inset-0 bg-gradient-to-br from-wuxia-gold/5 via-transparent to-black"></div>
                    </div>

                    <div className="w-56 shrink-0 border-r border-wuxia-gold/10 bg-black/40 backdrop-blur-sm flex flex-col p-4 gap-2 relative z-10 overflow-y-auto custom-scrollbar">
                        <div className="text-[10px] text-wuxia-gold/50 tracking-[0.3em] uppercase mb-4 flex items-center gap-2">
                            <span className="w-1 h-3 bg-wuxia-gold/50 rounded-full"></span>
                            行囊格位
                        </div>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => {
                                    setActiveCategory(cat);
                                    setSelectedItem(null);
                                }}
                                className={`flex items-center justify-between px-3 py-3 rounded-xl transition-all relative group overflow-hidden ${activeCategory === cat
                                    ? 'bg-gradient-to-r from-wuxia-gold/20 to-wuxia-gold/5 border border-wuxia-gold/40 shadow-[0_0_15px_rgba(212,175,55,0.15)]'
                                    : 'border border-transparent hover:border-white/10 hover:bg-white/[0.03]'
                                    }`}
                            >
                                {activeCategory === cat && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.8)] z-10"></div>
                                )}
                                <span className={`flex items-center gap-3 font-serif ${activeCategory === cat ? 'text-wuxia-gold drop-shadow-sm font-bold' : 'text-gray-300 group-hover:text-gray-200'}`}>
                                    <span className={`w-5 h-5 flex items-center justify-center ${activeCategory === cat ? 'text-wuxia-gold' : categoryColors[cat]} opacity-80 group-hover:opacity-100`}>
                                        {renderItemIcon(cat, 'w-4 h-4')}
                                    </span>
                                    <span>{cat}</span>
                                </span>
                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${activeCategory === cat ? 'bg-wuxia-gold/20 text-wuxia-gold border-wuxia-gold/30' : 'bg-black/60 text-gray-500 border-gray-800'}`}>
                                    {categoryCounts[cat] || 0}
                                </span>
                            </button>
                        ))}

                        <div className="mt-auto pt-6 border-t border-wuxia-gold/10 space-y-3">
                            <div className="bg-black/40 p-3 rounded-lg border border-wuxia-gold/5">
                                <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-1 font-mono">Total Value</div>
                                <div className="text-sm text-wuxia-gold font-serif flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5 opacity-80" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 100-16 8 8 0 000 16zm-1-8H9v-2h2V8h2v2h2v2h-2v2h-2v-2z" /></svg>
                                    {character.物品列表?.reduce((sum, i) => sum + (i.价值 * (i.堆叠数量 || 1)), 0).toLocaleString()} 铜
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar relative z-10">
                        {displayItems.length > 0 ? (
                            <div className="grid grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 gap-4">
                                {displayItems.map((item) => {
                                    const count = item.堆叠数量 || 1;
                                    const styles = getRarityStyles(item.品质);
                                    const isEquipped = !!item.当前装备部位;
                                    const isSelected = selectedItem?.ID === item.ID;

                                    return (
                                        <div
                                            key={item.ID}
                                            onClick={() => handleItemClick(item)}
                                            className={`relative aspect-square group cursor-pointer transition-all active:scale-95 rounded-xl
                                                ${isSelected ? 'ring-2 ring-wuxia-gold/60 shadow-[0_0_15px_rgba(212,175,55,0.3)] scale-[1.02]' : 'hover:scale-[1.02]'}
                                            `}
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-br from-black/80 to-black rounded-xl border border-white/5 opacity-80 group-hover:opacity-100 transition-opacity"></div>
                                            <div className={`absolute inset-0 rounded-xl border ${styles.border} ${styles.bg} 
                                                ${isSelected ? 'bg-opacity-30 border-opacity-80' : 'bg-opacity-10 border-opacity-30'}
                                                group-hover:bg-opacity-20 group-hover:border-opacity-50 transition-all shadow-inner
                                            `}></div>

                                            {isEquipped && (
                                                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gradient-to-br from-sky-400 to-blue-600 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(56,189,248,0.5)] z-20 border border-white/20">
                                                    <span className="text-[9px] font-bold text-white drop-shadow-md">装</span>
                                                </div>
                                            )}

                                            <div className="absolute inset-0 flex items-center justify-center pb-4 transition-transform group-hover:-translate-y-1 duration-300">
                                                <div className={`w-10 h-10 flex items-center justify-center rounded-full bg-black/40 border border-white/5 shadow-inner ${styles.text}`}>
                                                    {renderItemIcon(item.类型, `w-6 h-6 opacity-90 group-hover:opacity-100 drop-shadow-md`)}
                                                </div>
                                            </div>

                                            <div className="absolute bottom-1.5 left-0 right-0 px-1 text-center">
                                                <div className={`text-[10px] truncate ${getRarityNameClass(item.品质)} font-medium tracking-wide drop-shadow-sm`}>
                                                    {item.名称}
                                                </div>
                                            </div>

                                            {count > 1 && (
                                                <div className="absolute top-1 left-1.5 text-[9px] font-mono text-gray-300 bg-black/80 border border-white/10 px-1.5 rounded-sm shadow-sm backdrop-blur">
                                                    x{count > 999 ? '999+' : count}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-wuxia-gold/30 gap-4 font-serif relative">
                                <div className="absolute inset-0 bg-ink-wash/10 bg-center bg-no-repeat opacity-20 filter blur-sm"></div>
                                <span className="text-6xl drop-shadow-lg z-10 opacity-40">
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 inline-block">
                                        <path d="M5 6H19V8H5V6ZM5 10H15V12H5V10ZM5 14H17V16H5V14ZM5 18H13V20H5V18Z" />
                                    </svg>
                                </span>
                                <span className="text-xl tracking-widest z-10">空空如也</span>
                            </div>
                        )}
                    </div>

                    {selectedItem && (
                        <div className="absolute right-0 top-0 bottom-0 w-[400px] border-l border-wuxia-gold/20 bg-gradient-to-b from-black/95 to-[#0c0d0f]/95 backdrop-blur-md flex flex-col animate-slideInRight shadow-[-20px_0_50px_rgba(0,0,0,0.8)] z-20">
                            <div className="shrink-0 border-b border-wuxia-gold/10 bg-black/60 p-5 relative overflow-hidden group">
                                <div className={`absolute top-0 right-0 w-32 h-32 rounded-full filter blur-3xl opacity-20 ${getRarityStyles(selectedItem.品质).bg}`}></div>
                                
                                <div className="flex gap-4 relative z-10">
                                    <div className={`w-16 h-16 rounded-xl border ${getRarityStyles(selectedItem.品质).border} ${getRarityStyles(selectedItem.品质).bg} bg-opacity-20 flex items-center justify-center shrink-0 shadow-lg`}>
                                        {renderItemIcon(selectedItem.类型, `w-8 h-8 ${getRarityStyles(selectedItem.品质).text} drop-shadow-md`)}
                                    </div>
                                    <div className="flex-1 min-w-0 pr-6">
                                        <div className={`text-xl font-serif font-bold truncate ${getRarityNameClass(selectedItem.品质)} drop-shadow-sm`}>
                                            {selectedItem.名称}
                                        </div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className={`text-[10px] px-2 py-0.5 rounded border tracking-widest ${getRarityStyles(selectedItem.品质).badge} shadow-sm`}>
                                                {selectedItem.品质}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-serif border border-white/10 px-2 py-0.5 rounded bg-black/40">
                                                {selectedItem.类型}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                <button
                                    onClick={() => setSelectedItem(null)}
                                    className="absolute top-4 right-4 text-gray-500 hover:text-white hover:rotate-90 transition-all bg-black/40 rounded-full p-1"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 relative z-10">
                                <div className="text-sm text-gray-300 leading-loose italic border-l-2 border-wuxia-gold/40 pl-4 py-1">
                                    “{selectedItem.描述 || '此物来历未明，待有缘人发掘。'}”
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-black/40 border border-white/5 rounded-lg p-3 hover:border-wuxia-gold/20 transition-colors">
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <svg className="w-3.5 h-3.5 text-wuxia-gold/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
                                            <div className="text-[10px] text-gray-400 uppercase tracking-widest">重量</div>
                                        </div>
                                        <div className="text-xs text-gray-200 font-mono">
                                            {(selectedItem.重量 * (selectedItem.堆叠数量 || 1)).toFixed(1)} <span className="font-serif text-gray-500">斤</span>
                                        </div>
                                    </div>
                                    <div className="bg-black/40 border border-white/5 rounded-lg p-3 hover:border-wuxia-gold/20 transition-colors">
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <svg className="w-3.5 h-3.5 text-amber-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            <div className="text-[10px] text-gray-400 uppercase tracking-widest">价值</div>
                                        </div>
                                        <div className="text-xs text-wuxia-gold font-mono">
                                            {selectedItem.价值.toLocaleString()} <span className="font-serif text-wuxia-gold/70">铜</span>
                                        </div>
                                    </div>
                                    <div className="bg-black/40 border border-white/5 rounded-lg p-3 hover:border-wuxia-gold/20 transition-colors">
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <svg className="w-3.5 h-3.5 text-blue-400/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            <div className="text-[10px] text-gray-400 uppercase tracking-widest">耐久</div>
                                        </div>
                                        <div className="text-xs text-gray-200 font-mono">
                                            {selectedItem.当前耐久} <span className="text-gray-600">/</span> {selectedItem.最大耐久}
                                        </div>
                                    </div>
                                    <div className="bg-black/40 border border-white/5 rounded-lg p-3 hover:border-wuxia-gold/20 transition-colors">
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <svg className="w-3.5 h-3.5 text-purple-400/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                            <div className="text-[10px] text-gray-400 uppercase tracking-widest">持有</div>
                                        </div>
                                        <div className="text-xs text-gray-200 font-mono">
                                            {selectedItem.堆叠数量 || 1} <span className="font-serif text-gray-500">件</span>
                                        </div>
                                    </div>
                                </div>

                                {['武器', '防具', '饰品'].includes(selectedItem.类型) && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/50"></span>
                                            <div className="text-sm text-wuxia-gold/90 font-bold uppercase tracking-widest font-serif">装备属性</div>
                                            <div className="flex-1 h-px bg-gradient-to-r from-wuxia-gold/20 to-transparent"></div>
                                        </div>
                                        <div className="bg-gradient-to-br from-black/60 to-black/30 border border-wuxia-gold/10 rounded-xl p-4 space-y-3 shadow-inner">
                                            {selectedItem.类型 === '武器' && (
                                                <>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-400 font-serif">威能</span>
                                                        <span className="text-red-400 font-mono bg-red-950/30 px-2 py-0.5 rounded border border-red-900/40">
                                                            {(selectedItem as any).最小攻击} - {(selectedItem as any).最大攻击}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-400 font-serif">身法修正</span>
                                                        <span className="text-emerald-300 font-mono">
                                                            {(selectedItem as any).攻速修正 || '1.0'}
                                                        </span>
                                                    </div>
                                                    {(selectedItem as any).武器子类 && (
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-gray-400 font-serif">兵器种类</span>
                                                            <span className="text-gray-200 font-serif">{(selectedItem as any).武器子类}</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {selectedItem.类型 === '防具' && (
                                                <>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-400 font-serif">外功护体</span>
                                                        <span className="text-blue-400 font-mono bg-blue-950/30 px-2 py-0.5 rounded border border-blue-900/40">
                                                            +{(selectedItem as any).物理防御 || 0}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-400 font-serif">内功护体</span>
                                                        <span className="text-purple-400 font-mono bg-purple-950/30 px-2 py-0.5 rounded border border-purple-900/40">
                                                            +{(selectedItem as any).内功防御 || 0}
                                                        </span>
                                                    </div>
                                                    {(selectedItem as any).装备位置 && (
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-gray-400 font-serif">着装</span>
                                                            <span className="text-gray-200 font-serif">{(selectedItem as any).装备位置}</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {selectedItem.类型 === '饰品' && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-gray-400 font-serif">佩戴</span>
                                                    <span className="text-gray-200 font-serif">
                                                        {(selectedItem as any).当前装备部位 || '随身法宝'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {selectedItem.词条列表 && selectedItem.词条列表.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/50"></span>
                                            <div className="text-sm text-cyan-400/90 font-bold uppercase tracking-widest font-serif">附魔词条</div>
                                            <div className="flex-1 h-px bg-gradient-to-r from-cyan-900/40 to-transparent"></div>
                                        </div>
                                        <div className="space-y-2">
                                            {selectedItem.词条列表.map((m, i) => (
                                                <div key={i} className="text-sm bg-cyan-950/10 border border-cyan-900/30 rounded-lg p-3 flex justify-between items-center hover:bg-cyan-900/20 transition-colors shadow-sm">
                                                    {typeof m === 'string' ? (
                                                        <span className="text-cyan-200 font-serif">{m}</span>
                                                    ) : (
                                                        <>
                                                            <span className="text-cyan-100 font-serif">{m.名称 || m.属性}</span>
                                                            <span className="text-cyan-400 font-mono font-bold bg-cyan-950/40 px-2 py-0.5 rounded">
                                                                {m.数值 > 0 ? '+' : ''}{m.数值}{m.类型 === '百分比' ? '%' : ''}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedItem.类型 === '消耗品' && (selectedItem as any).使用效果 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-1 h-3 bg-emerald-500/50 rounded-full"></span>
                                            <div className="text-sm text-emerald-400/90 font-bold uppercase tracking-widest font-serif">药石之效</div>
                                            <div className="flex-1 h-px bg-gradient-to-r from-emerald-900/40 to-transparent"></div>
                                        </div>
                                        <div className="space-y-2">
                                            {Array.isArray((selectedItem as any).使用效果) && (selectedItem as any).使用效果.map((eff: any, i: number) => (
                                                <div key={i} className="text-sm bg-emerald-950/10 border border-emerald-900/30 rounded-lg p-3 flex justify-between items-center group hover:bg-emerald-900/20 transition-colors">
                                                    {typeof eff === 'string' ? (
                                                        <span className="text-emerald-100 font-serif">{eff}</span>
                                                    ) : (
                                                        <>
                                                            <span className="text-emerald-200/90 font-serif flex items-center gap-1.5">
                                                                <svg className="w-4 h-4 text-emerald-500 opacity-60 group-hover:opacity-100" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
                                                                恢复 {eff?.目标属性 ? String(eff.目标属性).replace('当前', '') : '生机'}
                                                            </span>
                                                            <span className="text-emerald-400 font-mono font-bold bg-emerald-950/40 px-2 py-0.5 rounded">+{eff?.数值 || 0}</span>
                                                        </>
                                                    )}
                                                </div>
                                            ))}
                                            {(selectedItem as any).毒性 > 0 && (
                                                <div className="text-sm bg-red-950/20 border-l-2 border-red-800/50 rounded-r-lg p-3 flex justify-between items-center text-red-200/90 hover:bg-red-900/20 transition-colors">
                                                    <span className="flex items-center gap-1.5 font-serif">
                                                        <span className="text-red-500 text-base">☠</span> 随身毒性
                                                    </span>
                                                    <span className="text-red-400 font-mono bg-red-900/30 px-2 py-0.5 rounded">+{ (selectedItem as any).毒性 }</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InventoryModal;