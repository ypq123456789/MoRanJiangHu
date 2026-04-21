
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

const SocialModal: React.FC<Props> = ({
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
    use图片资源回源预取(socialList);
    const 显示境界 = cultivationSystemEnabled !== false;
    const [selectedId, setSelectedId] = useState<string | null>(
        socialList.length > 0 ? socialList[0].id : null
    );
    const [香闺展示模式, set香闺展示模式] = useState<Record<string, 'text' | 'image'>>({});
    const [showFullBackground, setShowFullBackground] = useState(false);
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
        setShowFullBackground(false);
        setImageViewer(null);
    }, [selectedId]);

    const currentNPC = socialList.find(n => n.id === selectedId);
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
        <div className="flex flex-col bg-black/40 border border-gray-800 p-2 rounded relative group hover:border-pink-500/50 transition-colors">
            <span className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">{label}</span>
            <span className={`font-serif text-sm ${color} drop-shadow-sm`}>{value || "???"}</span>
        </div>
    );
    const RelationTag: React.FC<{ label: string; value?: string; accent?: string }> = ({ label, value, accent = "text-cyan-300" }) => (
        <div className="bg-black/30 border border-gray-800 rounded p-3 h-full">
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">{label}</div>
            <div className={`text-sm font-serif leading-relaxed ${accent}`}>{value?.trim() || "暂无记录"}</div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-ink-black/95 w-full max-w-7xl max-h-[90vh] flex flex-col rounded-2xl border border-wuxia-gold/20 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 relative overflow-hidden">

                {/* Header */}
                <div className="h-14 shrink-0 border-b border-white/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-6 relative z-50">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-wuxia-gold animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>
                        <h3 className="text-wuxia-gold font-serif font-bold text-xl tracking-[0.4em] drop-shadow-md">江湖谱<span className="text-[10px] text-wuxia-gold/50 ml-2 font-mono tracking-widest border border-wuxia-gold/20 px-2 py-0.5 rounded-full">SOCIAL LINK SYSTEM</span></h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-400 hover:bg-red-400/10 transition-all hover:rotate-90"
                        title="关闭"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden relative">
                    {/* Left: Party Selection */}
                    <div className="w-[300px] shrink-0 border-r border-white/5 bg-gradient-to-b from-black/80 to-black/90 overflow-y-auto custom-scrollbar p-3 space-y-2 relative z-10 z-[60]">
                        <div className="text-[10px] text-wuxia-gold/50 tracking-[0.3em] uppercase mb-4 px-2 flex items-center gap-2">
                            <span className="w-2 h-2 rounded bg-wuxia-gold/30 rotate-45"></span>
                            Character Roster
                        </div>
                        {socialList.map(npc => (
                            <button
                                key={npc.id}
                                onClick={() => {
                                    setSelectedId(npc.id);
                                    onSelectedNpcIdChange?.(npc.id);
                                }}
                                className={`w-full text-left p-2 rounded-xl transition-all relative group overflow-hidden flex items-center gap-3 ${selectedId === npc.id
                                    ? 'bg-gradient-to-r from-wuxia-gold/20 to-wuxia-gold/5 border border-wuxia-gold/40 shadow-[0_0_15px_rgba(212,175,55,0.15)]'
                                    : 'border border-transparent hover:border-white/10 hover:bg-white/[0.03]'
                                    }`}
                            >
                                {selectedId === npc.id && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.8)] z-10"></div>
                                )}

                                <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-white/10 bg-black/50 group-hover:border-white/30 transition-colors">
                                    {提取头像图片地址(npc) ? (
                                        <img src={提取头像图片地址(npc)} alt={npc.姓名} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className={`w-full h-full flex items-center justify-center font-serif font-bold text-lg ${npc.性别 === '女' ? 'text-pink-500/50' : 'text-blue-500/50'}`}>
                                            {npc.姓名[0]}
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className={`font-serif font-bold text-base truncate ${selectedId === npc.id ? 'text-wuxia-gold drop-shadow-sm' : 'text-gray-200'}`}>
                                        {npc.姓名}
                                    </div>
                                    <div className="text-[10px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                                        {显示境界 && npc.境界 && (
                                            <>
                                                <span className="truncate">{npc.境界}</span>
                                                <span className="w-1 h-1 rounded-full bg-gray-700 shrink-0"></span>
                                            </>
                                        )}
                                        <span className={npc.是否在场 ? 'text-emerald-400/90' : 'text-gray-600'}>
                                            {npc.是否在场 ? '在场' : '离线'}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-pink-400/80 mt-1 truncate">
                                        {npc.关系状态 || '萍水相逢'}
                                    </div>
                                </div>
                                <div className="text-right shrink-0 flex flex-col items-end justify-center">
                                    <div className="text-xs font-mono text-wuxia-red drop-shadow-[0_0_5px_rgba(220,38,38,0.3)] inline-flex items-center gap-1">
                                        <IconHeart size={12} /> {npc.好感度}
                                    </div>
                                    {npc.是否主要角色 && (
                                        <div className="text-[8px] tracking-widest text-wuxia-gold/80 bg-wuxia-gold/10 px-1 py-0.5 rounded border border-wuxia-gold/20 mt-1">MAIN</div>
                                    )}
                                </div>
                            </button>
                        ))}
                        {socialList.length === 0 && (
                            <div className="text-center text-gray-600 text-xs py-10 font-serif flex flex-col items-center gap-2">
                                <IconBeads size={24} className="opacity-50" />
                                暂无结识之人
                            </div>
                        )}
                    </div>

                    {/* Right: JRPG Detail Screen */}
                    <div className="flex-1 flex flex-col relative bg-black shrink-0 w-0 z-[50]">
                        {/* Global Background for Right Area */}
                        <div className="absolute inset-0 z-0">
                            {当前背景 ? (
                                <div className="absolute inset-0">
                                    <img
                                        src={当前背景}
                                        className="absolute inset-0 w-full h-full object-cover opacity-25 filter blur-sm select-none pointer-events-none mix-blend-luminosity"
                                        style={{ objectPosition: 'center 20%' }}
                                        alt="bg"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent"></div>
                                    <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-black/90"></div>
                                </div>
                            ) : (
                                <div className="absolute inset-0 bg-ink-wash/5 bg-cover bg-center opacity-40 mix-blend-luminosity filter blur-sm"></div>
                            )}
                            <div className="absolute inset-0 border-[1px] border-white/5"></div>
                            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-wuxia-gold/20 to-transparent"></div>
                        </div>

                        {/* Expandable Button Fixed at Top */}
                        {currentNPC && (当前背景 || 当前详情主图) && (
                            <button
                                type="button"
                                onClick={() => setShowFullBackground(!showFullBackground)}
                                className="w-full py-2 bg-gradient-to-r from-transparent via-wuxia-gold/10 to-transparent border-b border-wuxia-gold/20 flex items-center justify-center gap-2 text-[11px] text-wuxia-gold/70 tracking-[0.2em] font-serif hover:bg-wuxia-gold/10 transition-all relative z-[60] bg-black/80 backdrop-blur shrink-0"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-4 h-4 transition-transform duration-300 ${showFullBackground ? 'rotate-180' : ''}`}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                                {showFullBackground ? '收起背景卷轴' : '展开背景卷轴'}
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-4 h-4 transition-transform duration-300 ${showFullBackground ? 'rotate-180' : ''}`}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                            </button>
                        )}

                        {/* Expandable Background Scroll */}
                        <div className={`relative z-[20] w-full transition-[height] duration-500 overflow-hidden shrink-0 ${showFullBackground ? 'h-[100vh]' : 'h-0'}`}>
                            {当前背景 ? (
                                <div
                                    className="absolute inset-0 w-full h-full bg-center opacity-90 bg-no-repeat"
                                    style={{ backgroundImage: `url(${当前背景})`, backgroundPosition: 'center 10%', backgroundSize: '100% auto' }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10"></div>
                                </div>
                            ) : (
                                <div className="absolute inset-0 bg-ink-wash/5 bg-cover bg-center opacity-70"></div>
                            )}
                            <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-wuxia-gold/25 to-transparent"></div>
                        </div>

                        {currentNPC ? (
                            <div className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar relative z-10 flex flex-col transition-all duration-500 ${showFullBackground ? 'p-0 gap-0 opacity-0 pointer-events-none' : 'p-6 gap-6 opacity-100'}`}>
                                {/* JRPG Style Header */}
                                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-r from-black/80 via-black/60 to-black/80 backdrop-blur-md p-6 flex items-start justify-between shadow-2xl group shrink-0">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-wuxia-gold/5 rounded-full filter blur-3xl group-hover:bg-wuxia-gold/10 transition-colors"></div>

                                    <div className="flex gap-6 relative z-10">
                                        {/* Portrait Thumbnail */}
                                        <div
                                            className="w-24 h-32 rounded-lg border-2 border-wuxia-gold/30 overflow-hidden relative shadow-[0_0_20px_rgba(212,175,55,0.2)] bg-black/50 shrink-0 group-hover:border-wuxia-gold/60 transition-all cursor-pointer group/portrait"
                                            onClick={() => 打开图片查看器(当前详情主图, `${currentNPC.姓名}${当前立绘 ? ' 立绘' : ' 头像'}`)}
                                            title={当前详情主图 ? "点击查看图片大图" : ""}
                                        >
                                            {当前详情主图 ? (
                                                <>
                                                    <img src={当前详情主图} alt={currentNPC.姓名} className="w-full h-full object-cover group-hover/portrait:scale-110 transition-transform duration-500" />
                                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/portrait:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-wuxia-gold drop-shadow-[0_0_5px_rgba(212,175,55,0.8)]">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                                                        </svg>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center font-serif text-3xl text-wuxia-gold/30">{currentNPC.姓名[0]}</div>
                                            )}
                                        </div>

                                        <div className="flex flex-col justify-center">
                                            <div className="flex items-end gap-4 mb-2">
                                                <h2 className="text-4xl font-black font-serif text-wuxia-gold drop-shadow-[0_0_8px_rgba(212,175,55,0.4)] tracking-wider">{currentNPC.姓名}</h2>
                                                <span className={`text-sm px-2 py-0.5 rounded border border-white/10 font-serif tracking-widest ${currentNPC.性别 === '女' ? 'bg-pink-900/20 text-pink-300' : 'bg-blue-900/20 text-blue-300'}`}>
                                                    {currentNPC.性别} | {currentNPC.年龄}岁
                                                </span>
                                            </div>

                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {显示境界 && currentNPC.境界 && (
                                                    <span className="text-xs bg-black/60 border border-wuxia-gold/20 px-2 py-1 rounded text-wuxia-gold/80 shadow-inner">LV.{currentNPC.境界}</span>
                                                )}
                                                <span className="text-xs bg-black/60 border border-white/10 px-2 py-1 rounded text-gray-300">{currentNPC.身份}</span>
                                                <span className={`text-xs px-2 py-1 flex items-center gap-1 rounded border border-white/10 bg-black/60 ${currentNPC.是否在场 ? 'text-emerald-400' : 'text-gray-500'}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${currentNPC.是否在场 ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`}></span>
                                                    {currentNPC.是否在场 ? '在场中' : '离场'}
                                                </span>
                                                {currentNPC?.图片档案?.已选立绘图片ID && (
                                                    <span className="text-xs bg-sky-950/30 border border-sky-500/30 px-2 py-1 rounded text-sky-200">已设立绘</span>
                                                )}
                                                {currentNPC?.图片档案?.已选背景图片ID && (
                                                    <span className="text-xs bg-fuchsia-950/30 border border-fuchsia-500/30 px-2 py-1 rounded text-fuchsia-200">已设背景</span>
                                                )}
                                                {currentNPC.是否队友 && (
                                                    <span className="text-xs bg-wuxia-gold/10 border border-wuxia-gold/30 px-2 py-1 rounded text-wuxia-gold flex items-center gap-1 shadow-[0_0_8px_rgba(212,175,55,0.2)]">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                                            <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.735c0 5.936 2.302 11.332 6.136 15.166a.75.75 0 001.03 0 11.209 11.209 0 017.878-3.08.75.75 0 00.72-.514 12.74 12.74 0 00.635-3.971 12.74 12.74 0 00-.635-3.971.75.75 0 00-.72-.514 11.209 11.209 0 01-7.878 3.08.75.75 0 00-1.03 0C5.553 14.168 3.25 8.773 3.25 2.836A12.74 12.74 0 013.886 6.8c.189.923.473 1.83.844 2.71a.75.75 0 00.72.514 11.209 11.209 0 017.878-3.08.75.75 0 001.03 0z" clipRule="evenodd" />
                                                        </svg>
                                                        队伍成员
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => 切换在场状态(currentNPC)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-black/50 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400 transition-all text-xs text-gray-300"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                                                    </svg>
                                                    随缘/召唤
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => 切换重要角色状态(currentNPC)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-black/50 border border-white/10 hover:bg-wuxia-gold/10 hover:border-wuxia-gold/30 hover:text-wuxia-gold transition-all text-xs text-gray-300"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                                                    </svg>
                                                    设为重要
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end relative z-10">
                                        <div className="flex items-center gap-1 mb-1">
                                            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Affection Point</div>
                                        </div>
                                        <div className="text-5xl font-serif text-wuxia-red drop-shadow-[0_0_10px_rgba(220,38,38,0.5)]">
                                            <IconHeart size={20} className="mr-1" />{currentNPC.好感度}
                                        </div>
                                        <div className="text-xs text-wuxia-gold/80 tracking-widest uppercase mt-2 bg-black/40 px-3 py-1 rounded border border-wuxia-gold/20 shadow-inner">
                                            {currentNPC.关系状态}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => 删除角色(currentNPC)}
                                            disabled={Boolean(currentNPC.是否主要角色)}
                                            className={`mt-4 px-3 py-1 text-[10px] rounded border transition-colors ${currentNPC.是否主要角色
                                                ? 'border-gray-800 text-gray-700 cursor-not-allowed bg-black/50'
                                                : 'border-red-900/40 text-red-500/50 hover:border-red-500 hover:text-red-400 hover:bg-red-500/10'
                                                }`}
                                        >
                                            {currentNPC.是否主要角色 ? '主线人物不可忘却' : '忘却此人'}
                                        </button>
                                    </div>
                                </div>

                                {/* Two Column Layout for Details */}
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">

                                    {/* Left Column: Stats & Relationships (7/12 width) */}
                                    <div className="lg:col-span-7 space-y-6">
                                        {/* Shared Bio Section (For both Male and Female) */}
                                        <div className="bg-black/40 p-5 border border-white/10 rounded-xl relative overflow-hidden group hover:border-wuxia-gold/30 transition-colors shadow-lg">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full filter blur-2xl group-hover:bg-wuxia-gold/5 transition-colors"></div>
                                            <h4 className="flex items-center gap-2 text-wuxia-gold/80 font-serif font-bold mb-3 uppercase tracking-[0.2em] text-sm">
                                                <span className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/50"></span>
                                                人物生平
                                            </h4>
                                            <p className="text-gray-300 font-serif leading-relaxed text-sm relative z-10">
                                                {currentNPC.简介 || "暂无详细生平记录。"}
                                            </p>
                                        </div>

                                        {展示关系驱动面板 && (
                                            <div className="bg-cyan-950/10 p-5 border border-cyan-900/40 rounded-xl shadow-lg relative overflow-hidden group">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-900/50 via-cyan-500/20 to-transparent"></div>
                                                <div className="flex items-center justify-between mb-4 relative z-10">
                                                    <h4 className="flex items-center gap-2 text-cyan-400/90 font-serif font-bold uppercase tracking-widest text-sm">
                                                        <span className="w-1.5 h-1.5 bg-cyan-500/50"></span>
                                                        关系驱动面板
                                                    </h4>
                                                    <span className="text-[10px] text-cyan-500/50 tracking-widest border border-cyan-900/50 px-2 py-0.5 rounded font-mono">DYNAMIC VARIABLES</span>
                                                </div>
                                                <div className="grid sm:grid-cols-2 gap-3 relative z-10">
                                                    <RelationTag label="核心性格特征" value={currentNPC.核心性格特征} accent="text-cyan-200" />
                                                    <RelationTag label="好感突破条件" value={currentNPC.好感度突破条件} accent="text-emerald-200" />
                                                    <div className="sm:col-span-2">
                                                        <RelationTag label="关系突破条件" value={currentNPC.关系突破条件} accent="text-amber-200" />
                                                    </div>
                                                </div>
                                                <div className="mt-4 p-4 border border-pink-900/30 bg-black/40 rounded-lg relative z-10">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <div className="text-[10px] text-pink-400 uppercase tracking-widest flex items-center gap-1.5">
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                                                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                                                            </svg>
                                                            重要女性关系网变量
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 font-mono">Count: {当前关系网.length}</div>
                                                    </div>
                                                    {当前关系网.length > 0 ? (
                                                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                                            {当前关系网.map((edge, idx) => (
                                                                <div key={`${edge.对象姓名}_${edge.关系}_${idx}`} className="bg-pink-950/10 border-l-2 border-pink-900/40 rounded-r p-2 hover:bg-pink-900/20 transition-colors">
                                                                    <div className="flex justify-between items-start mb-1">
                                                                        <div className="text-xs text-pink-100 font-bold">
                                                                            <span className="text-pink-400/60 font-normal mr-1">对象:</span>{edge.对象姓名}
                                                                        </div>
                                                                        <div className="text-[10px] bg-pink-900/30 px-1.5 py-0.5 rounded text-pink-300">
                                                                            {edge.关系}
                                                                        </div>
                                                                    </div>
                                                                    {edge.备注 && (
                                                                        <div className="text-[10px] text-pink-200/60 mt-1 leading-relaxed border-t border-pink-900/20 pt-1">{edge.备注}</div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center py-4 opacity-50">
                                                            <div className="text-[10px] font-mono text-pink-300">NO CONNECTIONS DETECTED</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Memory Lane */}
                                        <div className="bg-black/40 p-5 border border-white/10 rounded-xl relative overflow-hidden shadow-lg">
                                            <h4 className="flex items-center gap-2 text-gray-400 font-serif font-bold mb-4 uppercase tracking-[0.2em] text-sm">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-500">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                                </svg>
                                                共同记忆
                                            </h4>
                                            <div className="space-y-5 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                                                {当前记忆展示.总结记忆.length > 0 && (
                                                    <div>
                                                        <div className="mb-3 text-[10px] uppercase tracking-[0.28em] text-wuxia-gold/70">总结记忆</div>
                                                        <div className="space-y-3">
                                                            {当前记忆展示.总结记忆.map((mem) => (
                                                                <div key={`summary-${mem.标签}`} className="rounded-xl border border-wuxia-gold/20 bg-wuxia-gold/5 p-3">
                                                                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-wuxia-gold/80 font-mono">
                                                                        <span>{mem.标签}</span>
                                                                        <span>{mem.索引范围}</span>
                                                                        <span>{mem.时间}</span>
                                                                        <span className="text-gray-500">共 {mem.条数} 条</span>
                                                                    </div>
                                                                    <div className="mt-2 text-xs text-gray-300 leading-relaxed font-serif">{mem.内容}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {当前记忆展示.记忆.length > 0 && (
                                                    <div>
                                                        <div className="mb-3 text-[10px] uppercase tracking-[0.28em] text-gray-500">原始记忆</div>
                                                        <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[5px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-800 before:to-transparent">
                                                            {当前记忆展示.记忆.slice().reverse().map((mem) => (
                                                                <div key={`memory-${mem.原始索引}`} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                                                    <div className="flex items-center justify-center w-3 h-3 rounded-full border border-gray-600 bg-gray-800 text-gray-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 group-hover:border-wuxia-gold/50 group-hover:bg-wuxia-gold/20 transition-colors z-10"></div>
                                                                    <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-lg border border-white/5 bg-black/50 shadow-sm group-hover:border-white/10 transition-colors">
                                                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                                                            <div className="text-[9px] text-gray-500 font-mono tracking-wider">{mem.时间}</div>
                                                                            <div className="text-[9px] text-wuxia-gold/70 font-mono">{mem.标签}</div>
                                                                        </div>
                                                                        <div className="text-xs text-gray-300 leading-relaxed font-serif">{mem.内容}</div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {当前记忆展示.原始总数 === 0 && (
                                                    <div className="text-center text-xs text-gray-600 py-6 uppercase tracking-widest font-mono">NO MEMORIES</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Intimate Details & Female Expansions (5/12 width) */}
                                    <div className="lg:col-span-5 space-y-6">
                                        {/* Female Main Role Extension */}
                                        {展示女性扩展 ? (
                                            <div className="space-y-6 animate-fadeIn">

                                                {/* Appearance Section */}
                                                <div className="bg-gradient-to-br from-pink-950/10 to-black/60 p-5 border border-pink-900/30 rounded-xl relative overflow-hidden shadow-lg group">
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/5 rounded-full filter blur-2xl group-hover:bg-pink-500/10 transition-colors"></div>
                                                    <div className="absolute -bottom-4 -right-4 text-[80px] text-pink-500/5 font-serif pointer-events-none select-none">颜</div>

                                                    <h4 className="flex items-center gap-2 text-pink-300/80 font-serif font-bold mb-3 uppercase tracking-widest text-sm relative z-10">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-pink-400/50"></span>
                                                        绝世容颜
                                                    </h4>

                                                    <div className="relative z-10">
                                                        <div className="mb-4 pl-3 border-l-2 border-pink-500/30">
                                                            <p className="text-gray-200 font-serif leading-relaxed italic text-sm">“{读取外貌(currentNPC) || '暂无外貌描写'}”</p>
                                                        </div>
                                                        <div className="flex flex-col gap-2 text-xs text-gray-400 bg-black/40 p-3 rounded-lg border border-white/5">
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div className="flex items-start gap-2">
                                                                    <span className="text-pink-400/70 shrink-0 mt-0.5">生日</span>
                                                                    <span className="text-gray-300 leading-relaxed">{读取生日(currentNPC) || '暂无记录'}</span>
                                                                </div>
                                                                <div className="flex items-start gap-2">
                                                                    <span className="text-pink-400/70 shrink-0 mt-0.5">称呼</span>
                                                                    <span className="text-gray-300 leading-relaxed">{读取对主角称呼(currentNPC) || '暂无记录'}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-start gap-2">
                                                                <span className="text-pink-400/70 shrink-0 mt-0.5">身材</span>
                                                                <span className="text-gray-300 leading-relaxed">{读取身材(currentNPC) || '暂无记录'}</span>
                                                            </div>
                                                            <div className="flex items-start gap-2">
                                                                <span className="text-pink-400/70 shrink-0 mt-0.5">衣着</span>
                                                                <span className="text-gray-300 leading-relaxed">{读取衣着(currentNPC) || '暂无记录'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {展示女性私密档案 && (
                                                    <div className="relative bg-black/40 border border-pink-900/40 rounded-xl p-5 shadow-lg group hover:border-pink-900/60 transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-900/50 via-pink-500/20 to-transparent"></div>
                                                        <div className="flex items-center justify-between mb-5 relative z-10">
                                                            <h4 className="text-pink-400 font-serif font-bold text-sm flex items-center gap-2 tracking-widest">
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                                                    <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                                                                </svg>
                                                                香闺秘档
                                                                <span className="text-[8px] bg-pink-950/50 border border-pink-500/30 px-1.5 py-0.5 rounded text-pink-300/80 font-mono ml-1">TOP SECRET</span>
                                                            </h4>
                                                            {currentNPC.是否处女 && (
                                                                <span className="text-[10px] bg-pink-500/10 text-pink-300 px-2 py-0.5 rounded border border-pink-500/30 flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse"></span>
                                                                    守身如玉
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* SPECIAL EVENT: FIRST TIME TAKEN BY PLAYER */}
                                                        {!currentNPC.是否处女 && currentNPC.初夜夺取者 === playerName && (
                                                            <div className="mb-5 p-4 bg-gradient-to-r from-pink-950/80 to-black border border-pink-500/40 rounded-lg relative overflow-hidden">
                                                                <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-wuxia-gold/5 blur-xl"></div>
                                                                <div className="relative z-10 flex flex-col">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <div className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/80"></div>
                                                                        <div className="text-[10px] text-pink-300/80 tracking-widest uppercase">铭心刻骨 · 初夜</div>
                                                                    </div>
                                                                    <div className="font-serif text-pink-100 text-sm flex items-end gap-2 flex-wrap">
                                                                        <span className="text-wuxia-gold/80 text-xs font-mono bg-wuxia-gold/10 px-1 rounded border border-wuxia-gold/20 mr-1">{currentNPC.初夜时间}</span>
                                                                        <span>交给</span>
                                                                        <span className="text-wuxia-gold font-bold text-lg drop-shadow-[0_0_5px_rgba(212,175,55,0.5)]">{currentNPC.初夜夺取者}</span>
                                                                    </div>
                                                                    {currentNPC.初夜描述 && (
                                                                        <div className="mt-3 text-[11px] text-pink-200/80 italic border-t border-pink-500/20 pt-2 leading-relaxed">
                                                                            "{currentNPC.初夜描述}"
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-3 gap-2 mb-5">
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
                                                                    <div key={item.key} className="p-2 rounded-lg border bg-black/60 border-pink-900/30 hover:border-pink-700/50 transition-colors flex flex-col">
                                                                        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-1 mb-2">
                                                                            <div className="text-[10px] text-pink-400 tracking-widest font-bold whitespace-nowrap">{item.label}</div>
                                                                            <button
                                                                                type="button"
                                                                                disabled={!canShowImage}
                                                                                onClick={handleToggleMode}
                                                                                className={`text-[8px] sm:text-[9px] px-1 py-0.5 rounded border whitespace-nowrap ${canShowImage ? 'border-pink-500/50 text-pink-300 hover:bg-pink-500/20 cursor-pointer' : 'border-gray-800 text-gray-600 cursor-default'}`}
                                                                            >
                                                                                {canShowImage ? (mode === 'image' ? '看文' : '看图') : '无图'}
                                                                            </button>
                                                                        </div>
                                                                        <div className={`w-full overflow-hidden rounded bg-black/40 border border-white/5 relative ${mode === 'image' && canShowImage ? 'aspect-square' : ''}`}>
                                                                            {mode === 'image' && canShowImage ? (
                                                                                <button
                                                                                    type="button"
                                                                                    className="absolute inset-0 block w-full h-full"
                                                                                    onClick={() => 打开图片查看器(imageUrl, `${currentNPC.姓名}${item.label}特写`)}
                                                                                    title="点击查看大图"
                                                                                >
                                                                                    <img src={imageUrl} alt={`${currentNPC.姓名}${item.label}特写`} className="absolute inset-0 w-full h-full object-cover" />
                                                                                </button>
                                                                            ) : (
                                                                                <div className="p-3">
                                                                                    <p className="font-serif leading-relaxed text-xs text-pink-100/90 italic">
                                                                                        {item.text}
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-3 mb-5">
                                                            <PrivateTag label="性癖" value={读取性癖(currentNPC) || '暂无记录'} color="text-pink-400" />
                                                            <PrivateTag label="敏感点" value={读取敏感点(currentNPC) || '暂无记录'} color="text-red-400" />
                                                        </div>

                                                        {/* Womb & Pregnancy Records (New Section) */}
                                                        <div className="bg-gradient-to-br from-pink-950/20 to-black/80 border border-pink-900/30 rounded-lg p-4 relative overflow-hidden group">
                                                            <div className="absolute -top-6 -right-6 w-24 h-24 bg-pink-600/5 rounded-full filter blur-xl group-hover:bg-pink-600/10 transition-colors"></div>
                                                            <div className="flex items-center justify-between mb-3 relative z-10">
                                                                <h5 className="text-xs text-pink-400/90 font-bold uppercase tracking-[0.2em] flex items-center gap-1.5">
                                                                    <span className="w-1 h-3 bg-pink-500/70 rounded-full"></span>
                                                                    子宫档案
                                                                </h5>
                                                                <span className="text-[10px] bg-black/60 border border-pink-900/50 px-1.5 py-0.5 rounded text-pink-300 font-mono shadow-inner tracking-wider">
                                                                    STATUS: {当前子宫档案?.状态 || 'UNKNOWN'}
                                                                </span>
                                                            </div>

                                                            <div className="mb-4 text-xs text-gray-400/80 flex items-center gap-2 bg-black/40 p-2 rounded border border-white/5 relative z-10">
                                                                <span className="shrink-0 text-pink-500/50">宫口状态</span>
                                                                <span className="text-pink-200 font-serif">{当前子宫档案?.宫口状态 || '紧闭'}</span>
                                                            </div>

                                                            <div className="relative z-10">
                                                                <h6 className="text-[9px] text-pink-500/60 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                                    <span className="h-px flex-1 bg-pink-900/30"></span>
                                                                    内射记录
                                                                    <span className="h-px flex-1 bg-pink-900/30"></span>
                                                                </h6>
                                                                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                                                    {Array.isArray(当前子宫档案?.内射记录) && 当前子宫档案!.内射记录.length > 0 ? (
                                                                        当前子宫档案!.内射记录.map((rec, idx) => (
                                                                            <div key={idx} className="bg-black/60 p-2.5 rounded border border-pink-900/20 text-xs hover:border-pink-900/40 transition-colors">
                                                                                <div className="text-wuxia-gold/80 font-mono text-[10px] mb-1">[{rec.日期}]</div>
                                                                                <div className="text-pink-100/90 font-serif leading-relaxed mb-1.5">{rec.描述}</div>
                                                                                <div className="text-[9px] text-pink-400/60 flex items-center gap-1 pt-1 border-t border-pink-900/20">
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                                                                    </svg>
                                                                                    孕检期: {rec.怀孕判定日}
                                                                                </div>
                                                                            </div>
                                                                        ))
                                                                    ) : (
                                                                        <div className="flex flex-col items-center justify-center py-4 bg-black/20 rounded border border-dashed border-white/5 disabled">
                                                                            <span className="text-[10px] text-gray-600 font-mono tracking-widest">NO RECORDS</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center opacity-30 bg-black/20 rounded-xl border border-dashed border-white/10 p-8 text-center min-h-[300px]">
                                                <div className="text-4xl mb-4 font-serif text-wuxia-gold/50 inline-flex"><IconMars size={36} /></div>
                                                <div className="text-sm font-serif text-gray-500 tracking-widest uppercase">男性同伴档案已折叠</div>
                                                <div className="text-[10px] text-gray-600 mt-2 font-mono">CONFIDENTIAL INFO NOT AVAILABLE</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 font-serif w-full absolute inset-0 z-10 bg-black/80">
                                <IconScroll size={64} className="mb-6 opacity-20 text-wuxia-gold filter drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]" />
                                <span className="text-xl tracking-[0.5em] text-wuxia-gold/80 uppercase">请选择人物档案</span>
                                <span className="text-[10px] font-mono mt-4 opacity-50 border border-white/10 px-3 py-1 rounded">SELECT A CHARACTER FROM THE ROSTER</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {imageViewer && (
                <div
                    className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn cursor-pointer"
                    onClick={() => setImageViewer(null)}
                >
                    <div className="relative max-w-[90vw] max-h-[95vh] rounded-lg shadow-[0_0_50px_rgba(212,175,55,0.15)] overflow-hidden cursor-default group" onClick={e => e.stopPropagation()}>
                        <img
                            src={imageViewer.src}
                            alt={imageViewer.alt}
                            className="max-w-full max-h-[95vh] object-contain rounded-lg"
                        />
                        <button
                            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-400 hover:bg-red-400/10 transition-all hover:rotate-90 z-10 opacity-0 group-hover:opacity-100 backdrop-blur-md"
                            onClick={(e) => {
                                e.stopPropagation();
                                setImageViewer(null);
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SocialModal;
