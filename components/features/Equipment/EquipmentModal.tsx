import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 角色数据结构, 装备槽位 } from '../../../types';
import { 游戏物品 } from '../../../models/item';
import { getRarityNameClass, getRarityStyles } from '../../ui/rarityStyles';
import { 获取图片展示地址 } from '../../../utils/imageAssets';
import { 获取物品已选图标地址 } from '../../../utils/itemImage';
import { IconSwords, IconDagger, IconShield, IconArmor, IconBackpack, IconRing, IconBelt, IconHelmet, IconBoot, IconPants, IconGlove, IconHorse, ItemTypeIcon } from '../../ui/Icons';
import { 获取物品可装备槽位, 计算装备评分, 装备物品到角色, 卸下角色装备 } from '../../../utils/equipmentActions';

interface Props {
    character: 角色数据结构;
    onClose: () => void;
    onCharacterChange?: (nextCharacter: 角色数据结构) => void;
}

const 读取装备数值 = (item: any, key: string, fallback = 0): number => {
    const value = Number(item?.[key]);
    return Number.isFinite(value) ? value : fallback;
};

const 格式化装备数值 = (value: number): string => {
    if (!Number.isFinite(value)) return '0';
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
};

const 格式化词条数值 = (mod: any): string => {
    const value = Number(mod?.数值);
    const safeValue = Number.isFinite(value) ? value : 0;
    const sign = safeValue > 0 ? '+' : '';
    const suffix = mod?.类型 === '百分比' ? '%' : '';
    return `${sign}${格式化装备数值(safeValue)}${suffix}`;
};

const 读取词条名称 = (mod: any): string => {
    const name = typeof mod?.名称 === 'string' ? mod.名称.trim() : '';
    const attr = typeof mod?.属性 === 'string' ? mod.属性.trim() : '';
    return name || attr || '未命名词条';
};

const 是否显示词条属性 = (mod: any): boolean => {
    const name = typeof mod?.名称 === 'string' ? mod.名称.trim() : '';
    const attr = typeof mod?.属性 === 'string' ? mod.属性.trim() : '';
    return Boolean(name && attr && name !== attr);
};

const 读取有效词条列表 = (item: any): any[] => {
    if (!Array.isArray(item?.词条列表)) return [];
    return item.词条列表.filter((mod: any) => {
        const name = typeof mod?.名称 === 'string' ? mod.名称.trim() : '';
        const attr = typeof mod?.属性 === 'string' ? mod.属性.trim() : '';
        const value = Number(mod?.数值);
        return Boolean(name || attr || (Number.isFinite(value) && value !== 0));
    });
};

const EquipmentModal: React.FC<Props> = ({ character, onClose, onCharacterChange }) => {
    const [selectedItem, setSelectedItem] = useState<游戏物品 | null>(null);
    const [actionMessage, setActionMessage] = useState('');
    const [imageViewer, setImageViewer] = useState<{ src: string; alt: string } | null>(null);
    const playerImageHistory = Array.isArray(character?.图片档案?.生图历史) ? character.图片档案!.生图历史 : [];
    const selectedPortraitId = typeof character?.图片档案?.已选立绘图片ID === 'string'
        ? character.图片档案.已选立绘图片ID.trim()
        : '';
    const selectedPortrait = playerImageHistory.find((item: any) => item?.id === selectedPortraitId)
        || (character?.图片档案?.最近生图结果?.id === selectedPortraitId ? character.图片档案.最近生图结果 : null);
    const 主角披挂像地址 = 获取图片展示地址(selectedPortrait);

    const getItem = (idOrName: string): 游戏物品 | null => {
        if (!idOrName || idOrName === '无') return null;
        return character.物品列表.find(i => i.ID === idOrName || i.名称 === idOrName) || null;
    };

    const getItemRef = (item: any): string => {
        if (!item) return '';
        return typeof item.ID === 'string' && item.ID.trim() ? item.ID.trim() : item.名称;
    };

    const selectedSlot = selectedItem?.当前装备部位;
    const switchTarget = selectedItem && selectedSlot
        ? [...(Array.isArray(character?.物品列表) ? character.物品列表 : [])]
            .filter((item: any) => {
                if (!item || getItemRef(item) === getItemRef(selectedItem)) return false;
                return 获取物品可装备槽位(item).includes(selectedSlot);
            })
            .sort((a: any, b: any) => 计算装备评分(b) - 计算装备评分(a))[0] || null
        : null;
    const selectedItemAffixes = selectedItem ? 读取有效词条列表(selectedItem) : [];

    const applyCharacterChange = (nextCharacter: 角色数据结构, nextSelectedRef?: string) => {
        onCharacterChange?.(nextCharacter);
        if (!nextSelectedRef) {
            setSelectedItem(null);
            return;
        }
        const nextItem = Array.isArray(nextCharacter?.物品列表)
            ? nextCharacter.物品列表.find((item: any) => item?.ID === nextSelectedRef || item?.名称 === nextSelectedRef)
            : null;
        setSelectedItem(nextItem || null);
    };

    const handleUnequipSelected = () => {
        if (!selectedItem || !onCharacterChange) return;
        const nextCharacter = 卸下角色装备(character, getItemRef(selectedItem));
        applyCharacterChange(nextCharacter, getItemRef(selectedItem));
        setActionMessage('已卸下');
    };

    const handleSwitchSelected = () => {
        if (!selectedItem || !switchTarget || !selectedSlot || !onCharacterChange) return;
        const switchRef = getItemRef(switchTarget);
        const nextCharacter = 装备物品到角色(character, switchRef, selectedSlot);
        applyCharacterChange(nextCharacter, switchRef);
        setActionMessage(`已切换为${switchTarget.名称}`);
    };


    // 经典 RPG 对称布局
    const leftSlots: { key: keyof typeof character.装备, label: string, icon: React.ReactNode }[] = [
        { key: '头部', label: '头部', icon: <IconHelmet size={24} /> },
        { key: '内衬', label: '内衬', icon: <IconArmor size={24} /> },
        { key: '主武器', label: '主武器', icon: <IconSwords size={24} /> },
        { key: '手部', label: '手部', icon: <IconGlove size={24} /> },
        { key: '暗器', label: '暗器', icon: <IconDagger size={24} /> },
        { key: '背部', label: '背负', icon: <IconBackpack size={24} /> },
    ];
    
    const rightSlots: { key: keyof typeof character.装备, label: string, icon: React.ReactNode }[] = [
        { key: '胸部', label: '上装', icon: <IconArmor size={24} /> },
        { key: '盔甲', label: '盔甲', icon: <IconArmor size={24} /> },
        { key: '副武器', label: '副武器', icon: <IconShield size={24} /> },
        { key: '腰部', label: '腰间', icon: <IconBelt size={24} /> },
        { key: '腿部', label: '下装', icon: <IconPants size={24} /> },
        { key: '足部', label: '鞋履', icon: <IconBoot size={24} /> },
    ];

    const bottomSlots: { key: keyof typeof character.装备, label: string, icon: React.ReactNode }[] = [
        { key: '坐骑', label: '坐骑', icon: <IconHorse size={24} /> },
    ];

    const renderSlot = (slot: { key: keyof typeof character.装备, label: string, icon: React.ReactNode }) => {
        const itemRef = character.装备[slot.key];
        const item = getItem(itemRef);
        const itemIconImage = item ? 获取物品已选图标地址(item) : '';
        const qualityClass = item
            ? `${getRarityStyles(item.品质).border} ${getRarityStyles(item.品质).text} ${getRarityStyles(item.品质).bg} shadow-inner bg-opacity-10 border-opacity-50 hover:bg-opacity-20`
            : 'border-wuxia-gold/15 text-gray-400 border-dashed bg-black/30 hover:bg-black/50 hover:border-wuxia-gold/35';

        return (
            <div 
                key={slot.key} 
                onClick={() => item && setSelectedItem(item)}
                className={`flex items-center gap-2 p-2 md:gap-3 md:p-3 rounded-xl md:rounded-2xl border transition-all h-[66px] md:h-[88px] relative group overflow-hidden ${qualityClass} ${item ? 'cursor-pointer hover:scale-[1.02]' : ''}`}
            >
                {item && <div className="absolute right-0 top-0 bottom-0 w-1 bg-current opacity-50 shadow-[0_0_10px_currentColor]"></div>}
                
                {/* Icon Box */}
                <div className={`w-9 h-9 md:w-12 md:h-12 shrink-0 rounded-lg md:rounded-xl flex items-center justify-center border ${item ? 'bg-black/50 border-white/10 shadow-lg text-wuxia-gold/90' : 'bg-black/60 border-gray-700/60 text-gray-400'}`}>
                    {itemIconImage ? (
                        <img src={itemIconImage} alt={item?.名称 || slot.label} className="h-full w-full rounded-lg object-cover" loading="lazy" />
                    ) : (
                        <span className="scale-90 opacity-85 transition-opacity duration-300 group-hover:scale-110 group-hover:opacity-100 md:scale-100">{slot.icon}</span>
                    )}
                    </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rotate-45 bg-gray-400 group-hover:bg-wuxia-gold/70 transition-colors"></span>
                        <div className="text-[10px] md:text-xs text-gray-300 font-serif tracking-[0.12em] md:tracking-[0.18em]">{slot.label}</div>
                    </div>
                    {item ? (
                        <>
                            <div className={`text-sm md:text-base font-bold font-serif truncate drop-shadow-sm ${getRarityNameClass(item.品质)}`}>{item.名称}</div>
                            <div className="text-[10px] md:text-xs text-gray-200 flex items-center gap-1.5 md:gap-2 font-mono mt-0.5">
                                <span className={`border px-1.5 rounded-sm ${getRarityStyles(item.品质).text} ${getRarityStyles(item.品质).border}`}>{item.品质}</span>
                                <span className="w-px h-2 bg-gray-700"></span>
                                <span className="text-wuxia-gold/80">耐久 {item.当前耐久}</span>
                            </div>
                        </>
                    ) : (
                        <div className="text-[11px] md:text-xs text-gray-300 font-serif mt-1 bg-black/45 px-2.5 md:px-3 py-0.5 rounded-full inline-block self-start border border-gray-700/60">空置</div>
                    )}
                </div>
            </div>
        );
    };

    const selectedItemIconImage = 获取物品已选图标地址(selectedItem);

    return (
        <>
        <div className="equipment-modal-body fixed inset-0 bg-black/95 backdrop-blur-sm z-[200] flex items-center justify-center p-0 md:p-4 animate-fadeIn">
            {/* 主窗口：采用 max-w-7xl h-[90vh] 标准，增加仙侠金边渐变效果 */}
            <div className="bg-ink-black/95 border-y border-wuxia-gold/20 md:border md:border-wuxia-gold/20 w-full max-w-none md:max-w-[calc(100vw-2rem)] 2xl:max-w-[1780px] h-[100dvh] md:max-h-[92vh] md:h-[92vh] flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.9)] relative overflow-hidden rounded-none md:rounded-2xl">
                
                {/* 背景装饰层 */}
                <div className="absolute inset-0 pointer-events-none z-0">
                    <div className="absolute inset-0 bg-[url('/assets/images/ui/paper-texture.png')] opacity-[0.03] mix-blend-overlay"></div>
                    <div className="absolute inset-0 bg-gradient-radial from-wuxia-gold/5 to-transparent blur-[80px]"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[500px] font-serif text-wuxia-gold opacity-[0.02] filter blur-sm">
                        甲
                    </div>
                </div>

                {/* Header */}
                <div className="shrink-0 h-14 md:h-20 flex items-center justify-between px-4 md:px-8 bg-gradient-to-r from-black/80 to-black/40 border-b border-wuxia-gold/10 relative z-50">
                    <div className="flex items-center gap-3 md:gap-4 min-w-0">
                        <div className="w-9 h-9 md:w-12 md:h-12 rounded-full border border-wuxia-gold/40 bg-gradient-to-br from-wuxia-gold/20 to-black flex items-center justify-center text-wuxia-gold font-serif font-bold text-lg md:text-2xl shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                            甲
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 md:gap-3">
                                <h3 className="truncate text-wuxia-gold font-serif font-bold text-base md:text-2xl tracking-[0.18em] md:tracking-[0.4em] drop-shadow-[0_0_10px_rgba(212,175,55,0.3)]">全身披挂</h3>
                                <span className="hidden md:inline-block text-[10px] uppercase text-wuxia-gold/50 tracking-widest border border-wuxia-gold/20 px-2 py-0.5 rounded-full mt-1">HERO EQUIPMENT</span>
                            </div>
                            <p className="hidden md:flex text-gray-200 text-sm tracking-[0.12em] mt-1.5 font-serif items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-wuxia-gold/50 rotate-45"></span>
                                先利其器，后成其道
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 md:gap-6 shrink-0">
                        <div className="flex items-center gap-2 md:gap-3 bg-black/60 px-3 md:px-5 py-1.5 md:py-2.5 rounded-xl border border-wuxia-gold/20 shadow-inner">
                            <span className="text-xs md:text-sm text-wuxia-gold/80 font-serif tracking-[0.14em] md:tracking-widest">身负</span>
                            <div className="text-sm md:text-xl font-mono relative">
                                <span className={character.当前负重 > character.最大负重 ? 'text-red-500 font-bold drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'text-wuxia-gold drop-shadow-[0_0_5px_rgba(212,175,55,0.5)]'}>
                                    {character.当前负重}
                                </span>
                                <span className="text-gray-300 mx-1">/</span>
                                <span className="text-gray-100">{character.最大负重}</span>
                            </div>
                            <span className="text-[10px] md:text-xs text-gray-300 font-serif">斤</span>
                        </div>
                        <button onClick={onClose} className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-black/60 border border-gray-700 text-gray-400 hover:text-wuxia-red hover:border-wuxia-red hover:bg-red-950/30 transition-all hover:rotate-90 group">
                            <svg className="w-4 h-4 md:w-5 md:h-5 group-hover:drop-shadow-[0_0_5px_rgba(220,38,38,0.8)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 flex overflow-hidden relative z-10">
                    <div className={`flex-1 overflow-y-auto ${selectedItem ? 'md:w-2/3 w-full' : 'w-full'} transition-all duration-300`} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        <div className="max-w-[980px] md:max-w-6xl mx-auto flex flex-col items-center justify-start h-full min-h-[420px] md:min-h-[560px] py-3 md:py-6 px-2.5 md:px-6">
                            <div className="grid grid-cols-[minmax(0,1fr)_128px_minmax(0,1fr)] md:grid-cols-[1fr_auto_1fr] w-full gap-2 md:gap-10 items-start justify-center relative">
                                
                                {/* 角色虚影背景阵法 */}
                                <div className="absolute left-1/2 top-[45%] md:top-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] h-[240px] md:w-[600px] md:h-[600px] pointer-events-none opacity-20">
                                    <div className="absolute inset-0 rounded-full border border-wuxia-gold/30 border-dashed animate-[spin_60s_linear_infinite]"></div>
                                    <div className="absolute inset-4 md:inset-10 rounded-full border border-wuxia-gold/20 animate-[spin_40s_linear_infinite_reverse]"></div>
                                    <div className="absolute inset-0 flex items-center justify-center text-wuxia-gold/20">
                                        <svg className="w-[180px] h-[180px] md:w-[450px] md:h-[450px]" viewBox="0 0 100 100">
                                            <polygon points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5" fill="none" stroke="currentColor" strokeWidth="0.5"/>
                                            <polygon points="50,15 80,32 80,68 50,85 20,68 20,32" fill="none" stroke="currentColor" strokeWidth="0.5"/>
                                        </svg>
                                    </div>
                                </div>

                                {/* Left Column */}
                                <div className="w-full flex justify-end">
                                    <div className="flex flex-col gap-2 md:gap-3.5 w-full max-w-[9.5rem] md:max-w-[19rem] z-10">
                                        {leftSlots.map(renderSlot)}
                                    </div>
                                </div>

                                {/* Center Character Display */}
                                <div className="flex flex-col w-[128px] md:w-64 shrink-0 items-center justify-start relative z-20 pt-0 md:pt-2">
                                    <div className="w-[108px] h-[216px] md:w-56 md:h-[450px] border border-wuxia-gold/30 bg-gradient-to-b from-wuxia-gold/10 to-transparent rounded-[120px] md:rounded-[200px] overflow-hidden relative shadow-[0_0_50px_rgba(212,175,55,0.1)] group">
                                        <div className="absolute inset-0 bg-[url('/assets/images/ui/paper-texture.png')] opacity-10 mix-blend-overlay"></div>
                                        {主角披挂像地址 ? (
                                            <>
                                                <img
                                                    src={主角披挂像地址}
                                                    alt={`${character.姓名 || '主角'}披挂像`}
                                                    className="absolute inset-0 z-10 h-full w-full object-contain"
                                                />
                                            </>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity">
                                                <svg className="w-20 h-[156px] md:w-48 md:h-[350px] text-wuxia-gold/40 filter drop-shadow-[0_0_10px_rgba(212,175,55,0.5)]" viewBox="0 0 24 24" fill="currentColor">
                                                    <path fillRule="evenodd" d="M12 2.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5ZM5.5 13.5a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 17 22.5h-10a1.5 1.5 0 0 1-1.5-1.5v-7.5Z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-3 md:mt-6 w-full font-serif text-center bg-black/60 px-2.5 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl border border-wuxia-gold/20 shadow-lg backdrop-blur-md">
                                        <div className="flex items-center gap-1 md:gap-2 justify-center mb-1">
                                            <span className="w-1 h-1 md:w-1.5 md:h-1.5 bg-wuxia-gold rotate-45"></span>
                                            <div className="text-[13px] md:text-2xl font-bold text-wuxia-gold drop-shadow-md tracking-[0.08em] md:tracking-wider truncate">{character.姓名}</div>
                                            <span className="w-1 h-1 md:w-1.5 md:h-1.5 bg-wuxia-gold rotate-45"></span>
                                        </div>
                                        <div className="text-[9px] md:text-sm text-gray-400 font-mono tracking-[0.12em] md:tracking-widest truncate">{character.境界 || '境界不显'}</div>
                                    </div>
                                </div>

                                {/* Right Column */}
                                <div className="w-full flex justify-start">
                                    <div className="flex flex-col gap-2 md:gap-3.5 w-full max-w-[9.5rem] md:max-w-[19rem] z-10">
                                        {rightSlots.map(renderSlot)}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Bottom Mount Row */}
                            <div className="w-full max-w-[9.5rem] md:max-w-sm mx-auto mt-3 md:mt-6 relative z-10">
                                <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-wuxia-gold/30 to-transparent -z-10"></div>
                                <div className="bg-black/80 p-1.5 md:p-2 rounded-2xl md:rounded-3xl backdrop-blur-sm border border-wuxia-gold/10">
                                    {bottomSlots.map(renderSlot)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Detail Panel */}
                    {selectedItem && (
                        <div className="absolute inset-0 md:static w-full md:w-[520px] 2xl:w-[560px] shrink-0 border-l-0 md:border-l border-wuxia-gold/20 bg-gradient-to-b from-black/95 to-[#0b0c0f]/95 backdrop-blur-md flex flex-col animate-slideInRight shadow-[-20px_0_80px_rgba(0,0,0,0.8)] relative z-20">
                            <div className="shrink-0 border-b border-wuxia-gold/10 bg-black/40 p-4 md:p-8 relative overflow-hidden">
                                <div className={`absolute -right-10 -top-10 w-48 h-48 rounded-full filter blur-3xl opacity-20 ${getRarityStyles(selectedItem.品质).bg}`}></div>
                                <div className="absolute right-4 bottom-4 text-[100px] opacity-[0.03] select-none pointer-events-none font-serif leading-none">
                                    谱
                                </div>
                                <div className="flex gap-3 md:gap-5 relative z-10">
                                    <button
                                        type="button"
                                        onClick={() => selectedItemIconImage && setImageViewer({ src: selectedItemIconImage, alt: selectedItem.名称 || '装备图标' })}
                                        disabled={!selectedItemIconImage}
                                        className={`w-14 h-14 md:w-20 md:h-20 rounded-xl md:rounded-2xl border-2 ${getRarityStyles(selectedItem.品质).border} ${getRarityStyles(selectedItem.品质).bg} bg-opacity-20 flex items-center justify-center shrink-0 overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.3)] disabled:cursor-default`}
                                        aria-label={selectedItemIconImage ? `放大查看${selectedItem.名称}` : undefined}
                                    >
                                        {selectedItemIconImage ? (
                                            <img src={selectedItemIconImage} alt={selectedItem.名称 || '装备图标'} className="h-full w-full object-cover" />
                                        ) : (
                                            <span className="drop-shadow-md">
                                                <ItemTypeIcon type={selectedItem.类型} size={36} />
                                            </span>
                                        )}
                                    </button>
                                    <div className="flex-1 min-w-0 pr-10 md:pr-6">
                                        <div className={`text-xl md:text-3xl font-serif font-black truncate drop-shadow-md mb-2 md:mb-3 tracking-wide ${getRarityNameClass(selectedItem.品质)}`}>
                                            {selectedItem.名称}
                                        </div>
                                        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                                            <span className={`text-xs md:text-sm px-2.5 md:px-3 py-1 rounded-sm border uppercase tracking-[0.12em] md:tracking-[0.18em] font-serif shadow-inner ${getRarityStyles(selectedItem.品质).border} ${getRarityStyles(selectedItem.品质).text} bg-black/60`}>
                                                {selectedItem.品质}造物
                                            </span>
                                            <span className="text-xs md:text-sm text-gray-100 font-serif border border-white/10 px-2.5 md:px-3 py-1 rounded-sm bg-black/60 shadow-inner">
                                                归类 · {selectedItem.类型}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                <button
                                    onClick={() => setSelectedItem(null)}
                                    className="absolute top-4 md:top-5 right-4 md:right-5 text-gray-500 hover:text-white hover:rotate-90 transition-all bg-black/40 rounded-full p-1.5 border border-gray-800"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-5 md:space-y-7 relative z-10" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                <div className="bg-black/30 border-l-4 border-wuxia-gold/40 p-4 md:p-5 rounded-r-2xl shadow-inner relative overflow-hidden">
                                    <p className="text-gray-100 text-base md:text-lg font-serif leading-8 md:leading-9 tracking-wide overflow-wrap-break-word">
                                        {selectedItem.描述 || '此神兵来历不明，似有天道之力缠绕。'}
                                    </p>
                                </div>

                                <div className="rounded-2xl border border-wuxia-gold/20 bg-wuxia-gold/5 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <span className="text-sm font-bold tracking-[0.14em] text-wuxia-gold">装备操作</span>
                                        <span className="truncate text-xs text-gray-300">
                                            {selectedSlot ? `当前：${selectedSlot}` : '未装备'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={handleUnequipSelected}
                                            disabled={!onCharacterChange || !selectedSlot}
                                            className="rounded-lg border border-sky-400/35 bg-sky-500/10 px-3 py-2.5 text-sm font-semibold text-sky-50 transition hover:border-sky-300/60 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            卸下
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSwitchSelected}
                                            disabled={!onCharacterChange || !switchTarget}
                                            className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-50 transition hover:border-emerald-300/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            切换
                                        </button>
                                    </div>
                                    <div className="mt-2 truncate text-xs text-wuxia-gold/90">
                                        {actionMessage || (switchTarget ? `可切换：${switchTarget.名称}` : '无可切换装备')}
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-4 border-b border-wuxia-gold/10 pb-2">
                                        <span className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/50"></span>
                                        <div className="text-base text-wuxia-gold uppercase tracking-[0.16em] font-serif font-bold">基本属性</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                                        <div className="bg-gradient-to-br from-black/60 to-black/30 border border-gray-700/80 rounded-xl p-3 md:p-4 flex flex-col items-center justify-center hover:border-wuxia-gold/30 transition-colors shadow-inner">
                                            <span className="text-xs text-gray-300 font-serif tracking-[0.16em] mb-1.5">万钧之重</span>
                                            <span className="text-xl md:text-2xl font-mono text-gray-50">{selectedItem.重量} <span className="text-sm text-gray-300 font-serif">斤</span></span>
                                        </div>
                                        <div className="bg-gradient-to-br from-black/60 to-black/30 border border-gray-700/80 rounded-xl p-3 md:p-4 flex flex-col items-center justify-center hover:border-amber-500/30 transition-colors shadow-inner">
                                            <span className="text-xs text-gray-300 font-serif tracking-[0.16em] mb-1.5">坊市估值</span>
                                            <span className="text-xl md:text-2xl font-mono text-amber-300">{selectedItem.价值} <span className="text-sm text-amber-300 font-serif">铜</span></span>
                                        </div>
                                        <div className="bg-gradient-to-br from-black/60 to-black/30 border border-gray-700/80 rounded-xl p-3 md:p-4 flex flex-col items-center justify-center hover:border-blue-400/30 transition-colors shadow-inner col-span-2">
                                            <span className="text-xs text-gray-300 font-serif tracking-[0.16em] mb-2">品相耐久</span>
                                            <div className="w-full h-1.5 bg-black rounded-full overflow-hidden border border-white/5">
                                                <div 
                                                    className="h-full bg-wuxia-gold shadow-[0_0_5px_rgba(212,175,55,0.45)]" 
                                                    style={{ width: `${(selectedItem.当前耐久 / Math.max(selectedItem.最大耐久, 1)) * 100}%` }}
                                                ></div>
                                            </div>
                                            <span className="mt-2 text-base font-mono text-blue-200">{selectedItem.当前耐久} / {selectedItem.最大耐久}</span>
                                        </div>
                                    </div>
                                </div>

                                {(selectedItem.类型 === '武器' || selectedItem.类型 === '防具') && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-4 border-b border-red-900/40 pb-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-red-600/70 shadow-[0_0_5px_currentColor]"></span>
                                            <div className="text-base text-red-300 uppercase tracking-[0.16em] font-serif font-bold">武道参数</div>
                                        </div>
                                        <div className="space-y-3 bg-red-950/10 border border-red-800/30 p-5 rounded-xl shadow-inner">
                                            {selectedItem.类型 === '武器' && (
                                                <>
                                                    <div className="flex justify-between items-center text-base">
                                                        <span className="text-gray-100 font-serif">兵刃杀力</span>
                                                        <span className="text-2xl font-black font-mono text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]">
                                                            {格式化装备数值(读取装备数值(selectedItem, '最小攻击'))}-{格式化装备数值(读取装备数值(selectedItem, '最大攻击'))}
                                                        </span>
                                                    </div>
                                                    <div className="h-px w-full bg-gradient-to-r from-red-900/30 via-red-900/10 to-transparent my-1"></div>
                                                    <div className="flex justify-between items-center text-base">
                                                        <span className="text-gray-100 font-serif">身法干涉</span>
                                                        <span className="text-lg font-mono text-emerald-300">x{格式化装备数值(读取装备数值(selectedItem, '攻速修正', 1))}</span>
                                                    </div>
                                                </>
                                            )}
                                            {selectedItem.类型 === '防具' && (
                                                <>
                                                    <div className="flex justify-between items-center text-base">
                                                        <span className="text-gray-100 font-serif">外家护体</span>
                                                        <span className="text-2xl font-black font-mono text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]">
                                                            +{格式化装备数值(读取装备数值(selectedItem, '物理防御'))}
                                                        </span>
                                                    </div>
                                                    <div className="h-px w-full bg-gradient-to-r from-blue-900/30 via-blue-900/10 to-transparent my-1"></div>
                                                    <div className="flex justify-between items-center text-base">
                                                        <span className="text-gray-100 font-serif">内劲消解</span>
                                                        <span className="text-xl font-bold font-mono text-purple-400">
                                                            +{格式化装备数值(读取装备数值(selectedItem, '内功防御'))}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {selectedItem.词条列表 && selectedItem.词条列表.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-4 border-b border-cyan-900/40 pb-2">
                                            <span className="w-1.5 h-1.5 rotate-45 border border-cyan-500 bg-cyan-950 shadow-[0_0_5px_currentColor]"></span>
                                            <div className="text-base text-cyan-300 uppercase tracking-[0.16em] font-serif font-bold">天启词条</div>
                                        </div>
                                        {selectedItemAffixes.length > 0 ? (
                                            <div className="space-y-3">
                                                {selectedItemAffixes.map((mod, i) => (
                                                    <div key={`mod_${i}`} className="bg-gradient-to-r from-cyan-950/20 to-black border border-cyan-800/35 p-4 rounded-xl flex justify-between items-center hover:border-cyan-600/60 transition-colors shadow-sm group">
                                                        <span className="text-gray-50 font-serif flex items-center gap-2 text-base">
                                                            <span className="text-cyan-600 group-hover:text-cyan-400 transition-colors">◈</span>
                                                            {读取词条名称(mod)}
                                                            {是否显示词条属性(mod) && <span className="text-xs text-gray-300 font-mono tracking-widest ml-2">({mod.属性})</span>}
                                                        </span>
                                                        <span className="text-cyan-300 font-mono font-bold bg-cyan-950/40 border border-cyan-900/30 px-3 py-1 rounded shadow-inner">
                                                            {格式化词条数值(mod)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="rounded-xl border border-cyan-900/25 bg-cyan-950/10 p-4 text-sm text-cyan-100/80 font-serif">
                                                暂无有效词条
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            <div className="hidden">
                                <button className="invisible"></button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        {imageViewer && typeof document !== 'undefined' && createPortal((
            <div
                className="fixed inset-0 z-[360] flex items-center justify-end pr-8 backdrop-blur-sm"
                style={{ backgroundColor: 'rgba(0,0,0,0.82)' }}
                onClick={() => setImageViewer(null)}
            >
                <div className="relative max-w-[85vw]" onClick={(event) => event.stopPropagation()}>
                    <button
                        type="button"
                        onClick={() => setImageViewer(null)}
                        className="absolute right-3 top-3 z-10 flex h-12 min-h-[48px] w-12 min-w-[48px] items-center justify-center rounded-full border-2 border-white bg-red-600 text-white shadow-[0_0_24px_rgba(220,38,38,0.75)] transition hover:scale-110 hover:bg-red-500 hover:shadow-[0_0_32px_rgba(248,113,113,0.95)]"
                        aria-label="关闭图片预览"
                    >
                        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <img src={imageViewer.src} alt={imageViewer.alt} className="max-h-[94vh] max-w-[85vw] rounded-lg border border-white/25 bg-black object-contain shadow-2xl" />
                </div>
            </div>
        ), document.body)}
        </>
    );
};

export default EquipmentModal;
