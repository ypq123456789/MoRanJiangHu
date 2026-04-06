import React, { useState, useMemo } from 'react';
import { 角色数据结构 } from '../../../types';
import { 游戏物品 } from '../../../models/item';
import { getRarityNameClass, getRarityStyles } from '../../ui/rarityStyles';

interface Props {
    character: 角色数据结构;
    onClose: () => void;
}

type ItemCategory = '全部' | '装备' | '消耗品' | '材料' | '秘籍' | '杂物';

const renderItemIcon = (type: string, className: string) => {
    const props = { className, fill: "currentColor", viewBox: "0 0 24 24", xmlns: "http://www.w3.org/2000/svg" };
    switch (type) {
        case '武器': return <svg {...props}><path d="M12 1L9 9h2v7H7v2h4v4h2v-4h4v-2h-4V9h2L12 1z" /></svg>;
        case '防具': return <svg {...props}><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>;
        case '饰品': return <svg {...props}><path d="M12 2C7.03 2 3 6.03 3 11c0 4.97 4.03 9 9 9s9-4.03 9-9c0-4.97-4.03-9-9-9zm0 16c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7zm0-12c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z" /></svg>;
        case '消耗品': return <svg {...props}><path d="M15 6v2H9V6h6zm-2-2V2h-2v2h-2v2h6V4h-2zM9 10v8c0 1.1.9 2 2 2h2c1.1 0 2-.9 2-2v-8H9zm2 8v-6h2v6h-2z" /></svg>;
        case '秘籍': return <svg {...props}><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h4.18c.42 1.16 1.54 2 2.82 2s2.4-.84 2.82-2H19c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 15.5c-0.83 0-1.5-0.67-1.5-1.5s0.67-1.5 1.5-1.5 1.5 0.67 1.5 1.5-0.67 1.5-1.5 1.5zm0-4c-0.83 0-1.5-0.67-1.5-1.5s0.67-1.5 1.5-1.5 1.5 0.67 1.5 1.5-0.67 1.5-1.5 1.5z" /></svg>;
        case '材料': return <svg {...props}><path d="M12 2C7.5 2 4 6.5 4 12s3.5 10 8 10 8-4.5 8-10-3.5-10-8-10zm0 18c-3.5 0-6-3.5-6-8s2.5-8 6-8 6 3.5 6 8-2.5 8-6 8z M12 6c-1.5 0-3 1.5-3 3s1.5 3 3 3 3-1.5 3-3-1.5-3-3-3z" /></svg>;
        default: return <svg {...props}><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" /></svg>;
    }
};

const MobileInventoryModal: React.FC<Props> = ({ character, onClose }) => {
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
            const typeOrder = ['武器', '防具', '饰品', '秘籍', '消耗品', '材料', '杂物', '杂项'];
            const qualityOrder = ['传说', '极品', '上品', '良品', '凡品'];
            if (a.类型 !== b.类型) return typeOrder.indexOf(a.类型) - typeOrder.indexOf(b.类型);
            if (a.品质 !== b.品质) return qualityOrder.indexOf(a.品质) - qualityOrder.indexOf(b.品质);
            return a.名称.localeCompare(b.名称);
        });
    }, [character.物品列表, activeCategory]);

    const categories: ItemCategory[] = ['全部', '装备', '消耗品', '材料', '秘籍', '杂物'];

    const totalWeight = character.当前负重 || 0;
    const maxWeight = character.最大负重 || 50;
    const isOverloaded = totalWeight > maxWeight;


    return (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 animate-fadeIn">
            {/* Mobile Card Container */}
            <div className="bg-gray-900 border border-gray-700 w-full max-w-sm rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] relative">
                
                {/* Header */}
                <div className="shrink-0 h-12 flex items-center justify-between px-4 bg-black/40 border-b border-gray-800">
                    <span className="text-gray-200 font-bold tracking-wider">行囊</span>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-mono ${isOverloaded ? 'text-red-500' : 'text-gray-500'}`}>
                            {totalWeight}/{maxWeight}斤
                        </span>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Category Scroll Area */}
                <div className="shrink-0 flex items-center gap-2 overflow-x-auto no-scrollbar py-2 px-3 bg-black/20 border-b border-gray-800">
                     {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`shrink-0 px-3 py-1 rounded-md text-xs font-bold transition-all border ${
                                activeCategory === cat 
                                ? 'bg-gray-800 text-gray-200 border-gray-600'
                                : 'text-gray-500 border-transparent hover:text-gray-300'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Item List (Compact) */}
                <div className="flex-1 overflow-y-auto p-2 bg-black/10 space-y-2">
                    {displayItems.length > 0 ? (
                        displayItems.map((item) => {
                            const count = item.堆叠数量 || 1;
                            const styles = getRarityStyles(item.品质);
                            const isEquipped = !!item.当前装备部位;
                            
                            return (
                                <div 
                                    key={item.ID} 
                                    onClick={() => setSelectedItem(item)}
                                    className={`relative p-2 rounded-lg border flex items-center gap-3 transition-all ${styles.border} ${styles.bg} active:scale-95`}
                                >
                                    {/* Icon Box */}
                                    <div className="w-10 h-10 shrink-0 bg-black/60 rounded flex items-center justify-center border border-gray-800">
                                        {renderItemIcon(item.类型, `w-6 h-6 opacity-80 ${styles.text}`)}
                                    </div>
                                    
                                    {/* Info */}
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <div className="flex justify-between items-start">
                                            <div className={`text-xs truncate ${getRarityNameClass(item.品质)}`}>{item.名称}</div>
                                            {count > 1 && (
                                                <span className="text-[10px] font-mono text-gray-400 bg-black/40 px-1 rounded">
                                                    x{count}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                                            <span className="flex gap-2">
                                                <span className={`${getRarityStyles(item.品质).text} ${getRarityStyles(item.品质).glow}`}>{item.品质}</span>
                                                {isEquipped && <span className="text-blue-500">已装备</span>}
                                            </span>
                                            <span className="font-mono">{item.重量}斤</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full opacity-30 text-gray-500 gap-2 py-10">
                            <span className="text-3xl">🈳</span>
                            <span className="text-xs">分类下空无一物</span>
                        </div>
                    )}
                </div>

                {/* Mobile Detail Overlay */}
                {selectedItem && (
                    <div className="absolute inset-0 bg-gray-900/95 z-10 flex flex-col animate-slideInRight">
                        <div className="shrink-0 h-10 flex items-center justify-between px-4 border-b border-gray-800 bg-black/20">
                            <div className="flex items-center gap-2">
                                <span className={`text-sm ${getRarityNameClass(selectedItem.品质)} truncate max-w-[180px]`}>
                                    {selectedItem.名称}
                                </span>
                                {selectedItem.当前装备部位 && <span className="text-[9px] bg-blue-900/30 text-blue-400 px-1 rounded">已装备</span>}
                            </div>
                            <button onClick={() => setSelectedItem(null)} className="text-gray-400 text-xs px-2 py-1 rounded bg-gray-800">返回</button>
                        </div>

                        <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs text-gray-300 bg-black/10">
                            <p className="opacity-80 leading-relaxed bg-black/20 p-2 rounded">
                                {selectedItem.描述}
                            </p>

                            <div className="grid grid-cols-2 gap-2 bg-black/20 p-2 rounded border border-gray-800/50">
                                <div className="flex justify-between"><span className="text-gray-500">类型</span><span>{selectedItem.类型}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">品质</span><span className={`${getRarityStyles(selectedItem.品质).text} ${getRarityStyles(selectedItem.品质).glow}`}>{selectedItem.品质}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">单件重量</span><span className="font-mono">{selectedItem.重量}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">总价值</span><span className="font-mono text-amber-500/80">{selectedItem.价值 * (selectedItem.堆叠数量 || 1)}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">耐久度</span><span className="font-mono">{selectedItem.当前耐久}/{selectedItem.最大耐久}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">持有数量</span><span className="font-mono">{selectedItem.堆叠数量 || 1}</span></div>
                            </div>

                            {['武器', '防具', '饰品'].includes(selectedItem.类型) && (
                                <div className="bg-black/20 p-2 rounded space-y-1.5 border border-gray-800/50">
                                    {selectedItem.类型 === '武器' && (
                                        <>
                                            <div className="flex justify-between"><span className="text-gray-500">攻击力</span><span className="text-red-400 font-mono">{(selectedItem as any).最小攻击} - {(selectedItem as any).最大攻击}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-500">攻速修正</span><span className="font-mono">{(selectedItem as any).攻速修正}</span></div>
                                            {(selectedItem as any).格挡率 !== undefined && (
                                                <div className="flex justify-between"><span className="text-gray-500">格挡率</span><span className="font-mono text-yellow-500">{(selectedItem as any).格挡率}%</span></div>
                                            )}
                                            {(selectedItem as any).武器子类 && (
                                                <div className="flex justify-between"><span className="text-gray-500">武器类型</span><span className="text-gray-400">{(selectedItem as any).武器子类}</span></div>
                                            )}
                                        </>
                                    )}
                                    {selectedItem.类型 === '防具' && (
                                        <>
                                            <div className="flex justify-between"><span className="text-gray-500">物理防御</span><span className="text-blue-400 font-mono">{(selectedItem as any).物理防御}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-500">内功防御</span><span className="text-purple-400 font-mono">{(selectedItem as any).内功防御}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-500">护甲位置</span><span className="text-gray-400">{(selectedItem as any).装备位置}</span></div>
                                        </>
                                    )}
                                    {selectedItem.类型 === '饰品' && (
                                        <div className="flex justify-between"><span className="text-gray-500">佩戴位置</span><span className="text-gray-400">{(selectedItem as any).当前装备部位 || '任意'}</span></div>
                                    )}
                                </div>
                            )}

                            {selectedItem.词条列表 && selectedItem.词条列表.length > 0 && (
                                <div className="space-y-1.5">
                                    <div className="text-gray-500 mb-1 border-b border-gray-800 pb-1">附加词条</div>
                                    {selectedItem.词条列表.map((m, i) => (
                                        <div key={i} className="bg-gray-800/30 text-gray-300 px-2 py-1.5 rounded border border-gray-700/50 flex justify-between">
                                            {typeof m === 'string' ? (
                                                <span className="text-blue-300 font-bold">{m}</span>
                                            ) : (
                                                <>
                                                    <span>{m.名称}</span>
                                                    <span className="text-blue-400 font-mono">{m.属性} {m.数值 > 0 ? '+' : ''}{m.数值}{m.类型 === '百分比' ? '%' : ''}</span>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {selectedItem.类型 === '消耗品' && (selectedItem as any).使用效果 && (
                                <div className="space-y-1.5">
                                    <div className="text-gray-500 mb-1 border-b border-gray-800 pb-1">使用效果</div>
                                    {Array.isArray((selectedItem as any).使用效果) && (selectedItem as any).使用效果.map((eff: any, i: number) => (
                                        <div key={i} className="bg-gray-800/30 text-gray-300 px-2 py-1.5 rounded border border-gray-700/50 flex justify-between items-center">
                                            {typeof eff === 'string' ? (
                                                <span>{eff}</span>
                                            ) : (
                                                <>
                                                    <span>恢复 {eff?.目标属性 ? String(eff.目标属性).replace('当前', '') : (eff?.属性 ? String(eff.属性).replace('当前', '') : '未知')}</span>
                                                    <span className="text-emerald-400 font-mono">+{eff?.数值 || 0}</span>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                    {(selectedItem as any).毒性 > 0 && (
                                        <div className="bg-red-900/20 text-gray-300 px-2 py-1.5 rounded border border-red-900/30 flex justify-between mt-2">
                                            <span>蕴含毒性</span>
                                            <span className="text-red-500 font-mono">{(selectedItem as any).毒性}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MobileInventoryModal;
