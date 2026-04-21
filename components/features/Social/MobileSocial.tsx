import React, { useEffect, useState } from 'react';
import { NPC结构 } from '../../../models/social';
import type { 香闺秘档部位类型 } from '../../../models/imageGeneration';
import { 构建NPC记忆展示结果 } from '../../../hooks/useGame/npcMemorySummary';
import { use图片资源回源预取 } from '../../../hooks/useImageAssetPrefetch';
import { 获取图片展示地址 } from '../../../utils/imageAssets';
import { IconBeads, IconHeart, IconMars, IconScroll } from '../../ui/Icons';

interface Props {
    socialList: NPC结构[];
    cultivationSystemEnabled?: boolean;
    onClose: () => void;
    selectedNpcId?: string | null;
    onSelectedNpcIdChange?: (npcId: string | null) => void;
    playerName?: string; // Add playerName prop to check for first time taker
    nsfwEnabled?: boolean;
    onToggleMajorRole?: (npcId: string, nextIsMajor: boolean) => void;
    onTogglePresence?: (npcId: string, nextIsPresent: boolean) => void;
    onDeleteNpc?: (npcId: string) => void;
}

const MobileSocial: React.FC<Props> = ({
    socialList,
    cultivationSystemEnabled = true,
    onClose,
    selectedNpcId,
    onSelectedNpcIdChange,
    playerName = "少侠",
    nsfwEnabled = false,
    onToggleMajorRole,
    onTogglePresence,
    onDeleteNpc
}) => {
    const [selectedId, setSelectedId] = useState<string | null>(
        socialList.length > 0 ? socialList[0].id : null
    );
    const 显示境界 = cultivationSystemEnabled !== false;
    const [香闺展示模式, set香闺展示模式] = useState<Record<string, 'text' | 'image'>>({});
    const [showFullBackground, setShowFullBackground] = useState<boolean>(false);
    const [imageViewer, setImageViewer] = useState<{ src: string; alt: string } | null>(null);

    useEffect(() => {
        if (socialList.length === 0) {
            setSelectedId(null);
            return;
        }
        if (!selectedId || !socialList.some(item => item.id === selectedId)) {
            setSelectedId(socialList[0].id);
        }
    }, [selectedId, socialList]);

    useEffect(() => {
        if (!selectedNpcId) return;
        if (!socialList.some(item => item.id === selectedNpcId)) return;
        setSelectedId(selectedNpcId);
    }, [selectedNpcId, socialList]);

    useEffect(() => {
        // 关闭或切换角色时折叠背景
        setShowFullBackground(false);
        setImageViewer(null);
    }, [selectedId]);

    const currentNPC = socialList.find(n => n.id === selectedId);
    const adjacentNPCs = React.useMemo(() => {
        if (!currentNPC) return [] as NPC结构[];
        const currentIndex = socialList.findIndex((npc) => npc.id === currentNPC.id);
        if (currentIndex < 0) return [currentNPC];
        return socialList.filter((_, index) => Math.abs(index - currentIndex) <= 1);
    }, [currentNPC, socialList]);
    use图片资源回源预取(currentNPC, adjacentNPCs);
    const 当前记忆展示 = React.useMemo(
        () => currentNPC ? 构建NPC记忆展示结果(currentNPC.总结记忆, currentNPC.记忆) : { 总结记忆: [], 记忆: [], 原始总数: 0 },
        [currentNPC]
    );
    const 展示女性扩展 = currentNPC?.性别 === '女' && Boolean(currentNPC?.是否主要角色);
    const 展示女性私密档案 = 展示女性扩展 && nsfwEnabled;
    const 取首个非空文本 = (...values: unknown[]): string => {
        for (const value of values) {
            if (typeof value === 'string' && value.trim().length > 0) return value.trim();
        }
        return '';
    };
    const 读取外貌 = (npc: NPC结构): string => 取首个非空文本(
        (npc as any).外貌描写,
        (npc as any).外貌,
        (npc as any).档案?.外貌要点,
        (npc as any).档案?.外貌描写
    );
    const 读取身材 = (npc: NPC结构): string => 取首个非空文本(
        (npc as any).身材描写,
        (npc as any).身材,
        (npc as any).档案?.身材要点,
        (npc as any).档案?.身材描写
    );
    const 读取衣着 = (npc: NPC结构): string => 取首个非空文本(
        (npc as any).衣着风格,
        (npc as any).衣着,
        (npc as any).档案?.衣着风格,
        (npc as any).档案?.衣着要点
    );
    const 读取生日 = (npc: NPC结构): string => 取首个非空文本(
        (npc as any).生日,
        (npc as any).出生日期,
        (npc as any).档案?.生日
    );
    const 读取对主角称呼 = (npc: NPC结构): string => 取首个非空文本(
        (npc as any).对主角称呼,
        (npc as any).档案?.对主角称呼
    );
    const 读取胸部描述 = (npc: NPC结构): string => {
        return 取首个非空文本((npc as any).胸部描述);
    };
    const 读取小穴描述 = (npc: NPC结构): string => {
        return 取首个非空文本((npc as any).小穴描述);
    };
    const 读取屁穴描述 = (npc: NPC结构): string => {
        return 取首个非空文本((npc as any).屁穴描述);
    };
    const 读取性癖 = (npc: NPC结构): string => 取首个非空文本(
        (npc as any).性癖
    );
    const 读取敏感点 = (npc: NPC结构): string => 取首个非空文本((npc as any).敏感点);
    const 读取香闺秘档图片结果 = (npc: NPC结构, part: 香闺秘档部位类型) => {
        const source = (npc as any)?.图片档案?.香闺秘档部位档案?.[part];
        return source && typeof source === 'object' ? source : undefined;
    };
    const 读取关系网 = (npc: NPC结构): Array<{ 对象姓名: string; 关系: string; 备注?: string }> => {
        if (!Array.isArray(npc?.关系网变量)) return [];
        return npc.关系网变量
            .map((item: any) => ({
                对象姓名: typeof item?.对象姓名 === 'string' ? item.对象姓名.trim() : '',
                关系: typeof item?.关系 === 'string' ? item.关系.trim() : '',
                备注: typeof item?.备注 === 'string' ? item.备注.trim() : undefined
            }))
            .filter(item => item.对象姓名 && item.关系);
    };
    const 读取当前子宫档案 = (npc: NPC结构) => {
        const source = (npc as any)?.子宫;
        if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
        const 内射记录 = Array.isArray((source as any)?.内射记录)
            ? (source as any).内射记录.map((rec: any) => ({
                日期: typeof rec?.日期 === 'string' ? rec.日期 : '未知时间',
                描述: typeof rec?.描述 === 'string' ? rec.描述 : '',
                怀孕判定日: typeof rec?.怀孕判定日 === 'string' ? rec.怀孕判定日 : '未知时间'
            }))
            : [];
        return {
            状态: typeof (source as any)?.状态 === 'string' ? (source as any).状态 : '未知',
            宫口状态: typeof (source as any)?.宫口状态 === 'string' ? (source as any).宫口状态 : '紧闭',
            内射记录
        };
    };
    const 展示关系驱动面板 = 展示女性扩展;
    const 当前关系网 = currentNPC ? 读取关系网(currentNPC) : [];
    const 当前子宫档案 = currentNPC ? 读取当前子宫档案(currentNPC) : undefined;
    const 切换重要角色状态 = (npc: NPC结构) => {
        if (!onToggleMajorRole) return;
        onToggleMajorRole(npc.id, !Boolean(npc.是否主要角色));
    };
    const 切换在场状态 = (npc: NPC结构) => {
        if (!onTogglePresence) return;
        onTogglePresence(npc.id, !Boolean(npc.是否在场));
    };
    const 删除角色 = (npc: NPC结构) => {
        if (!onDeleteNpc) return;
        if (npc.是否主要角色) return;
        const confirmed = window.confirm(`确认删除角色「${npc.姓名}」？此操作不可撤销。`);
        if (!confirmed) return;
        onDeleteNpc(npc.id);
    };
    const 获取NPC图片历史 = (npc: any) => {
        if (!npc) return [];
        const archive = npc?.图片档案;
        const history = Array.isArray(archive?.生图历史)
            ? archive.生图历史.filter((item: any) => item && typeof item === 'object')
            : [];
        const recent = archive?.最近生图结果 && typeof archive.最近生图结果 === 'object'
            ? archive.最近生图结果
            : (npc?.最近生图结果 && typeof npc.最近生图结果 === 'object' ? npc.最近生图结果 : undefined);
        const merged = recent ? [recent, ...history] : history;
        return merged
            .filter((item: any, index: number, list: any[]) => {
                const itemId = typeof item?.id === 'string' ? item.id : '';
                return !itemId || list.findIndex((candidate: any) => candidate?.id === itemId) === index;
            })
            .sort((a: any, b: any) => (b?.生成时间 || 0) - (a?.生成时间 || 0));
    };

    const 提取符合条件图片记录 = (
        npc: any,
        predicate: (item: any) => boolean,
        selectedImageId?: string
    ) => {
        const history = 获取NPC图片历史(npc);
        const normalizedSelectedId = typeof selectedImageId === 'string' ? selectedImageId.trim() : '';
        if (normalizedSelectedId) {
            const selected = history.find((item: any) => (
                item?.id === normalizedSelectedId
                && item?.状态 === 'success'
                && 获取图片展示地址(item)
                && predicate(item)
            ));
            if (selected) return selected;
        }
        return history.find((item: any) => item?.状态 === 'success' && 获取图片展示地址(item) && predicate(item));
    };

    const 提取头像图片地址 = (npc: any) => 获取图片展示地址(提取符合条件图片记录(
        npc,
        (item) => item?.构图 === '头像',
        npc?.图片档案?.已选头像图片ID
    ));
    const 提取立绘图片地址 = (npc: any) => 获取图片展示地址(提取符合条件图片记录(
        npc,
        (item) => item?.构图 === '立绘' || item?.构图 === '半身',
        npc?.图片档案?.已选立绘图片ID
    ));
    const 提取背景图片地址 = (npc: any) => 获取图片展示地址(提取符合条件图片记录(
        npc,
        (item) => item?.构图 !== '部位特写',
        npc?.图片档案?.已选背景图片ID
    ));

    const 当前头像 = 提取头像图片地址(currentNPC);
    const 当前立绘 = 提取立绘图片地址(currentNPC);
    const 当前详情主图 = 当前立绘 || 当前头像;
    const 当前背景 = 提取背景图片地址(currentNPC) || 当前立绘 || 当前头像;
    const 打开图片查看器 = (src?: string, alt?: string) => {
        const normalizedSrc = typeof src === 'string' ? src.trim() : '';
        if (!normalizedSrc) return;
        setImageViewer({ src: normalizedSrc, alt: (alt || '图片预览').trim() || '图片预览' });
    };
    const 香闺部位列表: Array<{ key: 香闺秘档部位类型; label: string; text: string }> = currentNPC ? [
        { key: '胸部', label: '胸部描述', text: 读取胸部描述(currentNPC) || '暂无记录' },
        { key: '小穴', label: '小穴描述', text: 读取小穴描述(currentNPC) || '暂无记录' },
        { key: '屁穴', label: '屁穴描述', text: 读取屁穴描述(currentNPC) || '暂无记录' }
    ] : [];
    const 生成香闺部位键 = (npcId: string, part: 香闺秘档部位类型) => `${npcId}_${part}`;

    // Helper for Privacy Tags
    const PrivateTag: React.FC<{ label: string; value?: string; color?: string }> = ({ label, value, color = "text-pink-300" }) => (
        <div className="flex flex-col bg-black/40 border border-gray-800 p-2 rounded relative group active:border-pink-500/50 transition-colors">
            <span className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">{label}</span>
            <span className={`font-serif text-[11px] ${color} drop-shadow-sm`}>{value || "???"}</span>
        </div>
    );
    const RelationTag: React.FC<{ label: string; value?: string; accent?: string }> = ({ label, value, accent = "text-cyan-300" }) => (
        <div className="bg-black/30 border border-gray-800 rounded p-2.5 h-full">
            <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-1.5">{label}</div>
            <div className={`text-[11px] font-serif leading-relaxed ${accent}`}>{value?.trim() || "暂无记录"}</div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-0 sm:p-4 md:hidden animate-fadeIn">
            <div className="bg-ink-black/95 w-full h-full sm:h-[90vh] sm:rounded-2xl border-0 sm:border border-wuxia-gold/20 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 flex flex-col relative overflow-hidden">
                
                {/* Header */}
                <div className="h-14 shrink-0 border-b border-white/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-4 relative z-[100]">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-wuxia-gold animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>
                        <h3 className="text-wuxia-gold font-serif font-bold text-lg tracking-[0.2em] drop-shadow-md">江湖谱<span className="text-[8px] text-wuxia-gold/50 ml-1.5 font-mono tracking-widest border border-wuxia-gold/20 px-1 py-0.5 rounded-full">SOCIAL</span></h3>
                    </div>
                    <button 
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 active:text-red-400 active:border-red-400 active:bg-red-400/10 transition-all active:rotate-90"
                        title="关闭"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden relative z-0">
                    {/* Top: Horizontal Party Selection */}
                    <div className="h-[100px] shrink-0 border-b border-white/5 bg-gradient-to-b from-black/80 to-black/90 relative z-[90] pt-1 pb-2 shadow-[0_10px_20px_rgba(0,0,0,0.8)]">
                        <div className="text-[9px] text-wuxia-gold/50 tracking-[0.2em] uppercase mb-1 px-3 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded bg-wuxia-gold/30 rotate-45"></span>
                                Roster
                            </div>
                            <span className="text-[9px] text-wuxia-cyan/80 bg-wuxia-cyan/10 px-1.5 py-0.5 rounded border border-wuxia-cyan/30">{socialList.length} 人</span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 pb-2 h-full items-center">
                            {socialList.map(npc => (
                                <button
                                    key={npc.id}
                                    onClick={() => {
                                        setSelectedId(npc.id);
                                        onSelectedNpcIdChange?.(npc.id);
                                    }}
                                    className={`w-[140px] shrink-0 p-1.5 rounded-xl transition-all relative group overflow-hidden flex items-center gap-2 ${
                                        selectedId === npc.id 
                                        ? 'bg-gradient-to-r from-wuxia-gold/20 to-wuxia-gold/5 border border-wuxia-gold/40 shadow-[0_0_15px_rgba(212,175,55,0.15)]' 
                                        : 'border border-transparent bg-white/[0.03] active:bg-white/[0.05]'
                                    }`}
                                >
                                    {selectedId === npc.id && (
                                        <div className="absolute top-0 bottom-0 left-0 w-0.5 bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.8)] z-10"></div>
                                    )}
                                    
                                    <div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-white/10 bg-black/50">
                                        {提取头像图片地址(npc) ? (
                                            <img src={提取头像图片地址(npc)} alt={npc.姓名} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className={`w-full h-full flex items-center justify-center font-serif font-bold text-sm ${npc.性别 === '女' ? 'text-pink-500/50' : 'text-blue-500/50'}`}>
                                                {npc.姓名[0]}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0 text-left">
                                        <div className={`font-serif font-bold text-sm truncate ${selectedId === npc.id ? 'text-wuxia-gold drop-shadow-sm' : 'text-gray-200'}`}>
                                            {npc.姓名}
                                        </div>
                                        <div className="flex items-center mt-0.5 gap-2">
                                            {显示境界 && npc.境界 && (
                                                <div className="text-[9px] text-gray-500 truncate flex-1">
                                                    {npc.境界}
                                                </div>
                                            )}
                                            <div className={`text-[9px] font-mono text-wuxia-red drop-shadow-[0_0_5px_rgba(220,38,38,0.3)] inline-flex items-center gap-1 ${显示境界 && npc.境界 ? 'shrink-0 ml-1' : 'ml-auto'}`}>
                                                <IconHeart size={10} /> {npc.好感度}
                                            </div>
                                        </div>
                                        <div className="text-[9px] text-pink-400/80 mt-0.5 truncate max-w-full">
                                            {npc.关系状态 || '萍水相逢'}
                                        </div>
                                    </div>
                                    {npc.是否主要角色 && (
                                        <div className="absolute top-0 right-0 w-0 h-0 border-t-[20px] border-t-wuxia-gold/60 border-l-[20px] border-l-transparent select-none shadow-[0_0_5px_rgba(212,175,55,0.5)]">
                                            <span className="absolute -top-[18px] -left-[9px] text-[7px] font-bold text-black rotate-45 transform origin-center font-serif leading-none shadow-sm">主</span>
                                        </div>
                                    )}
                                </button>
                            ))}
                            {socialList.length === 0 && (
                                 <div className="text-center text-gray-600 text-xs w-full py-4 font-serif flex flex-col items-center gap-1">
                                    <IconBeads size={20} className="opacity-50" />
                                    暂无结识之人
                                 </div>
                            )}
                        </div>
                    </div>

                    {/* Bottom: JRPG Detail Screen */}
                    <div className="flex-1 overflow-y-auto no-scrollbar bg-black z-10 flex flex-col relative">
                        {/* Global Background for Detail Area */}
                        <div className={`w-full transition-[height] duration-500 overflow-hidden relative z-0 shrink-0 ${showFullBackground ? 'h-[45vh]' : 'h-0'}`}>
                            {当前背景 ? (
                                <div 
                                    className="w-full h-full bg-cover transition-opacity duration-500 opacity-90 opacity-100 bg-no-repeat"
                                    style={{ 
                                        backgroundImage: `url(${当前背景})`,
                                        backgroundPosition: 'center 10%'
                                    }}
                                    onClick={() => 打开图片查看器(当前背景, `${currentNPC?.姓名 || '角色'} 背景`)}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20 pointer-events-none"></div>
                                </div>
                            ) : (
                                <div className="w-full h-full bg-ink-wash/5 bg-cover bg-center opacity-70"></div>
                            )}
                            <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-wuxia-gold/20 to-transparent pointer-events-none"></div>
                        </div>

                        {/* Detail Content Wrapping */}
                        <div className="relative z-10 -mt-1 rounded-t-xl bg-black min-h-full">
                            {currentNPC ? (
                                <div className="p-4 flex flex-col gap-4 pb-12">
                                {/* Toggle Background Button */}
                                {(当前背景 || 当前详情主图) && (
                                    <button 
                                        onClick={() => setShowFullBackground(!showFullBackground)}
                                        className="w-full py-2 bg-gradient-to-r from-transparent via-wuxia-gold/10 to-transparent border-y border-wuxia-gold/20 flex items-center justify-center gap-2 text-[10px] text-wuxia-gold/70 tracking-widest font-serif active:bg-wuxia-gold/20 transition-all mb-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-3 h-3 transition-transform duration-300 ${showFullBackground ? 'rotate-180' : ''}`}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                        </svg>
                                        {showFullBackground ? '收起背景卷轴' : '展开背景卷轴'}
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-3 h-3 transition-transform duration-300 ${showFullBackground ? 'rotate-180' : ''}`}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                        </svg>
                                    </button>
                                )}

                                {/* JRPG Style Header (Mobile) */}
                                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-black/60 to-black/80 backdrop-blur-md p-4 flex flex-col shadow-xl origin-top animate-fadeIn">
                                    <div className="absolute top-0 right-0 w-48 h-48 bg-wuxia-gold/5 rounded-full filter blur-3xl pointer-events-none"></div>
                                    
                                    <div className="flex gap-4 relative z-10 items-start">
                                        {/* Portrait Thumbnail */}
                                        <button
                                            type="button"
                                            className="w-20 h-28 rounded-lg border border-wuxia-gold/30 overflow-hidden relative shadow-[0_0_15px_rgba(212,175,55,0.2)] bg-black/50 shrink-0"
                                            onClick={() => 打开图片查看器(当前详情主图, `${currentNPC.姓名}${当前立绘 ? ' 立绘' : ' 头像'}`)}
                                            title={当前详情主图 ? '点击查看图片大图' : ''}
                                        >
                                            {当前详情主图 ? (
                                                <img src={当前详情主图} alt={currentNPC.姓名} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center font-serif text-2xl text-wuxia-gold/30">{currentNPC.姓名[0]}</div>
                                            )}
                                        </button>
                                        
                                        <div className="flex-1 flex flex-col min-w-0">
                                            <div className="flex items-end justify-between gap-2 mb-1">
                                                <h2 className="text-2xl font-black font-serif text-wuxia-gold drop-shadow-[0_0_8px_rgba(212,175,55,0.4)] tracking-wider truncate">{currentNPC.姓名}</h2>
                                                <div className="text-right shrink-0 flex flex-col items-end">
                                                    <div className="text-xl font-serif text-wuxia-red drop-shadow-[0_0_10px_rgba(220,38,38,0.5)] font-bold flex items-center gap-1">
                                                        <IconHeart size={14} />{currentNPC.好感度}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="text-[10px] text-wuxia-gold/80 tracking-widest uppercase mb-2 bg-black/40 px-2 py-0.5 rounded border border-wuxia-gold/20 shadow-inner w-fit font-bold">
                                                {currentNPC.关系状态}
                                            </div>

                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded border border-white/10 font-serif tracking-widest ${currentNPC.性别 === '女' ? 'bg-pink-900/20 text-pink-300' : 'bg-blue-900/20 text-blue-300'}`}>
                                                    {currentNPC.性别} | {currentNPC.年龄}岁
                                                </span>
                                                {显示境界 && currentNPC.境界 && (
                                                    <span className="text-[9px] bg-black/60 border border-wuxia-gold/20 px-1.5 py-0.5 rounded text-wuxia-gold/80 shadow-inner">LV.{currentNPC.境界}</span>
                                                )}
                                                <span className="text-[9px] bg-black/60 border border-white/10 px-1.5 py-0.5 rounded text-gray-300">{currentNPC.身份}</span>
                                                <span className={`text-[9px] px-1.5 py-0.5 flex items-center gap-1 rounded border border-white/10 bg-black/60 ${currentNPC.是否在场 ? 'text-emerald-400' : 'text-gray-500'}`}>
                                                    <span className={`w-1 h-1 rounded-full ${currentNPC.是否在场 ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`}></span>
                                                    {currentNPC.是否在场 ? '在场' : '离场'}
                                                </span>
                                                {currentNPC.是否队友 && (
                                                    <span className="text-[9px] bg-wuxia-gold/10 border border-wuxia-gold/30 px-1.5 py-0.5 rounded text-wuxia-gold flex items-center gap-0.5 shadow-[0_0_8px_rgba(212,175,55,0.2)]">
                                                        队友
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div className="flex flex-wrap gap-1.5 mt-auto">
                                                <button
                                                    type="button"
                                                    onClick={() => 切换在场状态(currentNPC)}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-black/50 border border-white/10 active:bg-emerald-500/10 active:border-emerald-500/30 active:text-emerald-400 transition-all text-[9px] text-gray-300"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-2.5 h-2.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                                                    </svg>
                                                    开关在场
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => 切换重要角色状态(currentNPC)}
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded bg-black/50 border transition-all text-[9px] ${
                                                        currentNPC.是否主要角色 ? 'border-wuxia-gold/50 text-wuxia-gold bg-wuxia-gold/10' : 'border-white/10 text-gray-300'
                                                    }`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
                                                        <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                                                    </svg>
                                                    {currentNPC.是否主要角色 ? '已设重要' : '设为重要'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => 删除角色(currentNPC)}
                                                    disabled={Boolean(currentNPC.是否主要角色)}
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded border transition-colors text-[9px] ${
                                                        currentNPC.是否主要角色
                                                            ? 'border-gray-800 text-gray-700 cursor-not-allowed bg-black/50'
                                                            : 'border-red-900/40 text-red-500/80 active:border-red-500 active:text-red-400 active:bg-red-500/10'
                                                    }`}
                                                >
                                                    忘却此人
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Shared Bio Section */}
                                <div className="bg-black/40 p-4 border border-white/10 rounded-xl relative overflow-hidden active:border-wuxia-gold/30 transition-colors shadow-lg">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full filter blur-xl pointer-events-none"></div>
                                    <h4 className="flex items-center gap-1.5 text-wuxia-gold/80 font-serif font-bold mb-2 uppercase tracking-[0.2em] text-xs">
                                        <span className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/50"></span>
                                        人物生平
                                    </h4>
                                    <p className="text-gray-300 font-serif leading-relaxed text-xs relative z-10">
                                        {currentNPC.简介 || "暂无详细生平记录。"}
                                    </p>
                                </div>

                                {展示关系驱动面板 && (
                                    <div className="bg-cyan-950/10 p-4 border border-cyan-900/40 rounded-xl shadow-lg relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-900/50 via-cyan-500/20 to-transparent"></div>
                                        <div className="flex items-center justify-between mb-3 relative z-10">
                                            <h4 className="flex items-center gap-1.5 text-cyan-400/90 font-serif font-bold uppercase tracking-widest text-xs">
                                                <span className="w-1 h-3 bg-cyan-500/50"></span>
                                                关系驱动面板
                                            </h4>
                                            <span className="text-[8px] text-cyan-500/50 tracking-widest border border-cyan-900/50 px-1 py-0.5 rounded font-mono">DYNAMIC</span>
                                        </div>
                                        <div className="flex flex-col gap-2 relative z-10">
                                            <RelationTag label="核心性格特征" value={currentNPC.核心性格特征} accent="text-cyan-200" />
                                            <RelationTag label="好感突破条件" value={currentNPC.好感度突破条件} accent="text-emerald-200" />
                                            <RelationTag label="关系突破条件" value={currentNPC.关系突破条件} accent="text-amber-200" />
                                        </div>
                                        <div className="mt-3 p-3 border border-pink-900/30 bg-black/40 rounded-lg relative z-10">
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="text-[9px] text-pink-400 uppercase tracking-widest flex items-center gap-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
                                                        <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                                                    </svg>
                                                    女性关系网
                                                </div>
                                                <div className="text-[9px] text-gray-500 font-mono text-center">共 {当前关系网.length} 名记录</div>
                                            </div>
                                            {当前关系网.length > 0 ? (
                                                <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar pr-1">
                                                    {当前关系网.map((edge, idx) => (
                                                        <div key={`${edge.对象姓名}_${edge.关系}_${idx}`} className="bg-pink-950/10 border-l-2 border-pink-900/40 rounded-r p-1.5 active:bg-pink-900/20 transition-colors">
                                                            <div className="flex justify-between items-start mb-0.5">
                                                                <div className="text-[10px] text-pink-100 font-bold truncate">
                                                                    <span className="text-pink-400/60 font-normal mr-1">对象:</span>{edge.对象姓名}
                                                                </div>
                                                                <div className="text-[9px] bg-pink-900/30 px-1 py-0.5 rounded text-pink-300 whitespace-nowrap ml-1 shrink-0">
                                                                    {edge.关系}
                                                                </div>
                                                            </div>
                                                            {edge.备注 && (
                                                                <div className="text-[9px] text-pink-200/60 mt-1 leading-relaxed border-t border-pink-900/20 pt-1">{edge.备注}</div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center py-2 opacity-50">
                                                    <div className="text-[9px] font-mono text-pink-300">NO CONNECTIONS DETECTED</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Memory Lane */}
                                <div className="bg-black/40 p-4 border border-white/10 rounded-xl relative overflow-hidden shadow-lg">
                                    <h4 className="flex items-center gap-1.5 text-gray-400 font-serif font-bold mb-3 uppercase tracking-[0.2em] text-xs">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-gray-500">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                        </svg>
                                        共同记忆
                                    </h4>
                                    <div className="space-y-4 max-h-60 overflow-y-auto no-scrollbar pr-1">
                                        {当前记忆展示.总结记忆.length > 0 && (
                                            <div>
                                                <div className="mb-2 text-[9px] uppercase tracking-[0.24em] text-wuxia-gold/70">总结记忆</div>
                                                <div className="space-y-2">
                                                    {当前记忆展示.总结记忆.map((mem) => (
                                                        <div key={`summary-${mem.标签}`} className="rounded-xl border border-wuxia-gold/20 bg-wuxia-gold/5 p-2.5">
                                                            <div className="flex flex-wrap items-center gap-1.5 text-[8px] text-wuxia-gold/80 font-mono">
                                                                <span>{mem.标签}</span>
                                                                <span>{mem.索引范围}</span>
                                                                <span>{mem.时间}</span>
                                                            </div>
                                                            <div className="mt-1.5 text-[11px] text-gray-300 leading-relaxed font-serif">{mem.内容}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {当前记忆展示.记忆.length > 0 && (
                                            <div>
                                                <div className="mb-2 text-[9px] uppercase tracking-[0.24em] text-gray-500">原始记忆</div>
                                                <div className="space-y-3 relative before:absolute before:inset-0 before:ml-[5px] before:-translate-x-px before:h-full before:w-px before:bg-gradient-to-b before:from-transparent before:via-gray-800 before:to-transparent">
                                                    {当前记忆展示.记忆.slice().reverse().map((mem) => (
                                                        <div key={`memory-${mem.原始索引}`} className="relative flex items-start group is-active">
                                                            <div className="flex items-center justify-center w-2.5 h-2.5 rounded-full border border-gray-600 bg-gray-800 mt-[7px] shrink-0 z-10"></div>
                                                            <div className="w-[calc(100%-1rem)] ml-3 p-2 rounded-lg border border-white/5 bg-black/50 shadow-sm">
                                                                <div className="flex flex-wrap items-center justify-between gap-1 mb-0.5">
                                                                    <div className="text-[8px] text-gray-500 font-mono tracking-wider">{mem.时间}</div>
                                                                    <div className="text-[8px] text-wuxia-gold/70 font-mono">{mem.标签}</div>
                                                                </div>
                                                                <div className="text-[11px] text-gray-300 leading-relaxed font-serif">{mem.内容}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {当前记忆展示.原始总数 === 0 && (
                                            <div className="text-center text-[10px] text-gray-600 py-4 uppercase tracking-widest font-mono">NO MEMORIES</div>
                                        )}
                                    </div>
                                </div>

                                {/* Female Expansions */}
                                {展示女性扩展 ? (
                                    <div className="space-y-4 animate-fadeIn">
                                        {/* Appearance Section */}
                                        <div className="bg-gradient-to-br from-pink-950/10 to-black/60 p-4 border border-pink-900/30 rounded-xl relative overflow-hidden shadow-lg group">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/5 rounded-full filter blur-xl transition-colors pointer-events-none"></div>
                                            <div className="absolute -bottom-2 -right-2 text-[60px] text-pink-500/5 font-serif pointer-events-none select-none">颜</div>
                                            
                                            <h4 className="flex items-center gap-1.5 text-pink-300/80 font-serif font-bold mb-2.5 uppercase tracking-widest text-xs relative z-10">
                                                <span className="w-1.5 h-1.5 rounded-full bg-pink-400/50"></span>
                                                绝世容颜
                                            </h4>
                                            
                                            <div className="relative z-10">
                                                <div className="mb-3 pl-2.5 border-l-2 border-pink-500/30">
                                                    <p className="text-gray-200 font-serif leading-relaxed italic text-[11px]">“{读取外貌(currentNPC) || '暂无外貌描写'}”</p>
                                                </div>
                                                <div className="flex flex-col gap-1.5 text-[10px] text-gray-400 bg-black/40 p-2.5 rounded-lg border border-white/5">
                                                    <div className="grid grid-cols-2 gap-1.5">
                                                        <div className="flex items-start gap-1.5">
                                                            <span className="text-pink-400/70 shrink-0 mt-px">生日</span>
                                                            <span className="text-gray-300 leading-relaxed">{读取生日(currentNPC) || '暂无记录'}</span>
                                                        </div>
                                                        <div className="flex items-start gap-1.5">
                                                            <span className="text-pink-400/70 shrink-0 mt-px">称呼</span>
                                                            <span className="text-gray-300 leading-relaxed">{读取对主角称呼(currentNPC) || '暂无记录'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-start gap-1.5">
                                                        <span className="text-pink-400/70 shrink-0 mt-px">身材</span>
                                                        <span className="text-gray-300 leading-relaxed">{读取身材(currentNPC) || '暂无记录'}</span>
                                                    </div>
                                                    <div className="flex items-start gap-1.5">
                                                        <span className="text-pink-400/70 shrink-0 mt-px">衣着</span>
                                                        <span className="text-gray-300 leading-relaxed">{读取衣着(currentNPC) || '暂无记录'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {展示女性私密档案 && (
                                        <div className="relative bg-black/40 border border-pink-900/40 rounded-xl p-4 shadow-lg active:border-pink-900/60 transition-colors">
                                            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-pink-900/50 via-pink-500/20 to-transparent"></div>
                                            <div className="flex items-center justify-between mb-4 relative z-10">
                                                <h4 className="text-pink-400 font-serif font-bold text-xs flex items-center gap-1.5 tracking-widest">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                                        <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                                                    </svg>
                                                    香闺秘档
                                                    <span className="text-[7px] bg-pink-950/50 border border-pink-500/30 px-1 py-0.5 rounded text-pink-300/80 font-mono ml-1">TOP SECRET</span>
                                                </h4>
                                                {currentNPC.是否处女 && (
                                                    <span className="text-[8px] bg-pink-500/10 text-pink-300 px-1.5 py-0.5 rounded border border-pink-500/30 flex items-center gap-1">
                                                        <span className="w-1 h-1 rounded-full bg-pink-400 animate-pulse"></span>
                                                        守身如玉
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {/* SPECIAL EVENT: FIRST TIME TAKEN BY PLAYER */}
                                            {!currentNPC.是否处女 && currentNPC.初夜夺取者 === playerName && (
                                                <div className="mb-4 p-3 bg-gradient-to-r from-pink-950/80 to-black border border-pink-500/40 rounded-lg relative overflow-hidden">
                                                    <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-wuxia-gold/5 blur-xl"></div>
                                                    <div className="relative z-10 flex flex-col">
                                                        <div className="flex items-center gap-1.5 mb-1.5">
                                                            <div className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/80"></div>
                                                            <div className="text-[9px] text-pink-300/80 tracking-widest uppercase">铭心刻骨 · 初夜</div>
                                                        </div>
                                                        <div className="font-serif text-pink-100 text-[11px] flex items-end gap-1.5 flex-wrap">
                                                            <span className="text-wuxia-gold/80 text-[10px] font-mono bg-wuxia-gold/10 px-1 rounded border border-wuxia-gold/20 mr-1">{currentNPC.初夜时间}</span>
                                                            <span>交给</span>
                                                            <span className="text-wuxia-gold font-bold text-base drop-shadow-[0_0_5px_rgba(212,175,55,0.5)]">{currentNPC.初夜夺取者}</span>
                                                        </div>
                                                        {currentNPC.初夜描述 && (
                                                            <div className="mt-2 text-[10px] text-pink-200/80 italic border-t border-pink-500/20 pt-2 leading-relaxed">
                                                                "{currentNPC.初夜描述}"
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex flex-col gap-2 mb-4">
                                                {香闺部位列表.map((item) => {
                                                    const result = 读取香闺秘档图片结果(currentNPC, item.key);
                                                    const imageUrl = 获取图片展示地址(result);
                                                    const modeKey = 生成香闺部位键(currentNPC.id, item.key);
                                                    const mode = 香闺展示模式[modeKey] || 'text';
                                                    const canShowImage = Boolean(imageUrl);
                                                    const handleToggleMode = () => {
                                                        if (!canShowImage) return;
                                                        set香闺展示模式(prev => ({ ...prev, [modeKey]: mode === 'image' ? 'text' : 'image' }));
                                                    };
                                                    return (
                                                        <div key={item.key} className="p-2.5 rounded-lg border bg-black/60 border-pink-900/30 active:border-pink-700/50 transition-colors flex gap-3">
                                                            <div className="flex flex-col items-center gap-1.5 shrink-0 justify-center min-w-[3.5rem] border-r border-pink-900/30 pr-3 mr-1">
                                                                <div className="text-[10px] text-pink-400 tracking-widest font-bold whitespace-nowrap">{item.label}</div>
                                                                <button
                                                                    type="button"
                                                                    disabled={!canShowImage}
                                                                    onClick={handleToggleMode}
                                                                    className={`text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap ${canShowImage ? 'border-pink-500/50 text-pink-300 active:bg-pink-500/20' : 'border-gray-800 text-gray-600'}`}
                                                                >
                                                                    {canShowImage ? (mode === 'image' ? '看文' : '看图') : '无图'}
                                                                </button>
                                                            </div>
                                                            <div className={`flex-1 overflow-hidden rounded bg-black/40 border border-white/5 relative ${mode === 'image' && canShowImage ? 'aspect-[4/3]' : ''}`}>
                                                                {mode === 'image' && canShowImage ? (
                                                                    <button
                                                                        type="button"
                                                                        className="absolute inset-0 block w-full h-full"
                                                                        onClick={() => 打开图片查看器(imageUrl, `${currentNPC.姓名}${item.label}特写`)}
                                                                    >
                                                                        <img src={imageUrl} alt={`${currentNPC.姓名}${item.label}特写`} className="absolute inset-0 w-full h-full object-cover" />
                                                                    </button>
                                                                ) : (
                                                                    <div className="p-2 py-1 max-h-24 overflow-y-auto no-scrollbar">
                                                                        <p className="font-serif leading-relaxed text-[11px] text-pink-100/90 italic">
                                                                            {item.text}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 mb-4">
                                                <PrivateTag label="性癖" value={读取性癖(currentNPC) || '暂无记录'} color="text-pink-400" />
                                                <PrivateTag label="敏感点" value={读取敏感点(currentNPC) || '暂无记录'} color="text-red-400" />
                                            </div>

                                            {/* Womb & Pregnancy Records */}
                                            <div className="bg-gradient-to-br from-pink-950/20 to-black/80 border border-pink-900/30 rounded-lg p-3.5 relative overflow-hidden group">
                                                <div className="absolute -top-6 -right-6 w-20 h-20 bg-pink-600/5 rounded-full filter blur-xl pointer-events-none"></div>
                                                <div className="flex items-center justify-between mb-2.5 relative z-10">
                                                    <h5 className="text-[11px] text-pink-400/90 font-bold uppercase tracking-[0.2em] flex items-center gap-1.5">
                                                        <span className="w-1 h-3 bg-pink-500/70 rounded-full"></span>
                                                        子宫档案
                                                    </h5>
                                                    <span className="text-[8px] bg-black/60 border border-pink-900/50 px-1 py-0.5 rounded text-pink-300 font-mono shadow-inner tracking-wider">
                                                        ST: {当前子宫档案?.状态 || 'UKN'}
                                                    </span>
                                                </div>
                                                
                                                <div className="mb-3 text-[10px] text-gray-400/80 flex items-center gap-2 bg-black/40 p-2 rounded border border-white/5 relative z-10">
                                                    <span className="shrink-0 text-pink-500/50">宫口状态</span>
                                                    <span className="text-pink-200 font-serif">{当前子宫档案?.宫口状态 || '紧闭'}</span>
                                                </div>

                                                <div className="relative z-10">
                                                    <h6 className="text-[8px] text-pink-500/60 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                                        <span className="h-px flex-1 bg-pink-900/30"></span>
                                                        内射记录
                                                        <span className="h-px flex-1 bg-pink-900/30"></span>
                                                    </h6>
                                                    <div className="space-y-1.5 max-h-32 overflow-y-auto no-scrollbar pr-1">
                                                        {Array.isArray(当前子宫档案?.内射记录) && 当前子宫档案!.内射记录.length > 0 ? (
                                                            当前子宫档案!.内射记录.map((rec, idx) => (
                                                                <div key={idx} className="bg-black/60 p-2.5 rounded border border-pink-900/20 text-[10px] relative overflow-hidden">
                                                                    <div className="text-wuxia-gold/80 font-mono text-[9px] mb-1">[{rec.日期}]</div>
                                                                    <div className="text-pink-100/90 font-serif leading-relaxed mb-1.5">{rec.描述}</div>
                                                                    <div className="text-[8px] text-pink-400/60 flex items-center gap-1 pt-1 border-t border-pink-900/20">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-2.5 h-2.5">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                                                        </svg>
                                                                        孕检期: {rec.怀孕判定日}
                                                                    </div>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="flex flex-col items-center justify-center py-4 bg-black/20 rounded border border-dashed border-white/5">
                                                                <span className="text-[9px] text-gray-600 font-mono tracking-widest">NO RECORDS</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center opacity-30 bg-black/20 rounded-xl border border-dashed border-white/10 p-6 text-center mt-4">
                                        <div className="text-3xl mb-3 font-serif text-wuxia-gold/50 inline-flex"><IconMars size={30} /></div>
                                        <div className="text-xs font-serif text-gray-500 tracking-widest uppercase">资料封存</div>
                                        <div className="text-[8px] text-gray-600 mt-1 font-mono">CONFIDENTIAL INFO NOT AVAILABLE</div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 font-serif w-full absolute inset-0 z-10 pt-20">
                                <IconScroll size={52} className="mb-4 opacity-20 text-wuxia-gold filter drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]" />
                                <span className="text-lg tracking-[0.4em] text-wuxia-gold/80 uppercase">请选择人物档案</span>
                                <span className="text-[8px] font-mono mt-3 opacity-50 border border-white/10 px-2 py-0.5 rounded">SELECT ROSTER PROFILE</span>
                            </div>
                        )}
                        </div>
                    </div>
                </div>
            </div>
            {imageViewer && (
                <div
                    className="fixed inset-0 z-[260] bg-black/95 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn"
                    onClick={() => setImageViewer(null)}
                >
                    <div
                        className="relative max-w-[94vw] max-h-[92vh] rounded-lg overflow-hidden border border-wuxia-gold/20 shadow-[0_0_40px_rgba(212,175,55,0.18)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <img src={imageViewer.src} alt={imageViewer.alt} className="max-w-[94vw] max-h-[92vh] object-contain bg-black" />
                        <button
                            type="button"
                            className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 border border-gray-700 text-gray-300"
                            onClick={() => setImageViewer(null)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MobileSocial;
