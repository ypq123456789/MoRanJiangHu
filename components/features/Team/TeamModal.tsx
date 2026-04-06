import React, { useState } from 'react';
import { 角色数据结构, NPC结构 } from '../../../types';
import { IconHeart, IconSwords, IconUsers, IconYinYang } from '../../ui/Icons';

interface Props {
    character: 角色数据结构;
    teammates: NPC结构[];
    onClose: () => void;
}

const TeamModal: React.FC<Props> = ({ character, teammates, onClose }) => {
    const activeTeammates = teammates.filter(n => n.是否队友 === true);
    // 默认选中第一个队友
    const [selectedTab, setSelectedTab] = useState<string>(activeTeammates.length > 0 ? activeTeammates[0].id : '');

    const pad2 = (n: number) => `${Math.trunc(n)}`.padStart(2, '0');
    const 规范化时间串 = (raw: string): string => {
        const match = raw.trim().match(/^(\d{1,6}):(\d{1,2}):(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
        if (!match) return '';
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const hour = Number(match[4]);
        const minute = Number(match[5]);
        if (![year, month, day, hour, minute].every(Number.isFinite)) return '';
        if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
        return `${Math.trunc(year)}:${pad2(month)}:${pad2(day)}:${pad2(hour)}:${pad2(minute)}`;
    };

    const 解析更新时间文本 = (raw: unknown): string => {
        if (typeof raw === 'string') return 规范化时间串(raw) || raw.trim();
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
        const data = raw as Record<string, unknown>;
        const year = Number(data.年 ?? data.year);
        const month = Number(data.月 ?? data.month);
        const day = Number(data.日 ?? data.day);
        const hour = Number(data.时 ?? data.hour ?? 0);
        const minute = Number(data.分 ?? data.minute ?? 0);
        if (![year, month, day, hour, minute].every(Number.isFinite)) return '';
        if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
        return `${Math.trunc(year)}:${pad2(month)}:${pad2(day)}:${pad2(hour)}:${pad2(minute)}`;
    };

    const 读取队员最后更新时间 = (npc: NPC结构): string => {
        const candidates: unknown[] = [
            npc.上次更新时间,
            (npc as any)?.最后更新时间,
            (npc as any)?.更新时间,
            (npc as any)?.队伍战斗状态?.上次更新时间,
            (npc as any)?.队伍战斗状态?.最后更新时间,
            (npc as any)?.战斗状态?.上次更新时间,
            (npc as any)?.战斗状态?.最后更新时间
        ];
        for (const candidate of candidates) {
            const parsed = 解析更新时间文本(candidate);
            if (parsed) return parsed;
        }
        return '';
    };

    const EquipItem: React.FC<{ label: string; value?: string; highlight?: boolean }> = ({ label, value, highlight }) => (
        <div className={`flex justify-between items-center text-sm border-b border-wuxia-gold/10 py-2.5 last:border-0 hover:bg-wuxia-gold/5 px-2 -mx-2 rounded transition-colors ${highlight ? 'hover:bg-pink-900/10' : ''}`}>
            <span className={`text-gray-400 font-serif ${highlight ? 'text-pink-400/80 tracking-widest' : ''}`}>{label}</span>
            <span className={`${value && value !== '无' ? 'text-gray-200 font-serif' : 'text-gray-600 italic'}`}>{value || '无'}</span>
        </div>
    );

    // Player detail removed

    const renderTeammateDetail = (npc: NPC结构) => {
        const safeHpMax = Math.max(1, npc.最大血量 || 0);
        const safeHpCur = Math.max(0, npc.当前血量 || 0);
        const safeSpMax = Math.max(1, npc.最大精力 || 0);
        const safeSpCur = Math.max(0, npc.当前精力 || 0);
        const safeQiMax = Math.max(1, (npc as any).最大内力 || 0);
        const safeQiCur = Math.max(0, (npc as any).当前内力 || 0);
        const hpPct = Math.max(0, Math.min(100, (safeHpCur / safeHpMax) * 100));
        const spPct = Math.max(0, Math.min(100, (safeSpCur / safeSpMax) * 100));
        const qiPct = Math.max(0, Math.min(100, (safeQiCur / safeQiMax) * 100));
        const lastUpdate = 读取队员最后更新时间(npc);
        
        const isFemale = npc.性别 === '女';
        const themeBorder = isFemale ? 'border-pink-900/40' : 'border-blue-900/40';
        const themeBg = isFemale ? 'bg-pink-900/10' : 'bg-blue-900/10';
        const themeText = isFemale ? 'text-pink-400' : 'text-blue-400';

        return (
            <div className="flex flex-col h-full animate-fadeIn relative z-10">
                {/* 头部信息 */}
                <div className="flex items-start justify-between border-b border-wuxia-gold/10 pb-6 mb-6">
                    <div className="flex items-center gap-5">
                        <div className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center text-3xl font-serif font-bold shadow-[0_0_20px_rgba(0,0,0,0.5)] ${themeBorder} ${themeBg} ${themeText}`}>
                            {npc.姓名[0]}
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-3xl text-gray-100 font-serif font-bold tracking-wider drop-shadow-md">{npc.姓名}</span>
                                <span className="px-3 py-1 bg-black/40 border border-gray-600 text-gray-300 text-xs rounded-full font-serif shadow-sm tracking-widest">{npc.身份 || '流莺'}</span>
                                <span className="text-[10px] bg-wuxia-gold/20 text-wuxia-gold px-2 py-0.5 rounded border border-wuxia-gold/30">{npc.境界 || '境界不明'}</span>
                            </div>
                            <div className="text-xs text-gray-500 font-mono">
                                {lastUpdate ? `前尘印记：${lastUpdate}` : '宛如初见，并无变故'}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto custom-scrollbar pb-6">
                    {/* 左侧：状态与属性 */}
                    <div className="space-y-6">
                        <div className="bg-gradient-to-br from-black/60 to-black/30 border border-wuxia-gold/10 rounded-2xl p-5 shadow-inner">
                            <div className="flex items-center gap-2 mb-4 border-b border-wuxia-gold/10 pb-2">
                                <IconHeart size={14} className="text-wuxia-gold/60" />
                                <div className="text-sm text-wuxia-gold/80 font-serif tracking-widest font-bold">气血精元</div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-xs mb-1 font-mono">
                                        <span className="text-red-400 font-serif tracking-widest">气血</span>
                                        <span className="text-gray-300">{safeHpCur} / {safeHpMax}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-black border border-white/5 overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_5px_rgba(220,38,38,0.5)]" style={{width: `${hpPct}%`}}></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1 font-mono">
                                        <span className="text-teal-400 font-serif tracking-widest">精力</span>
                                        <span className="text-gray-300">{safeSpCur} / {safeSpMax}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-black border border-white/5 overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-teal-600 to-teal-400 shadow-[0_0_5px_rgba(45,212,191,0.5)]" style={{width: `${spPct}%`}}></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1 font-mono">
                                        <span className="text-indigo-400 font-serif tracking-widest">内力</span>
                                        <span className="text-gray-300">{safeQiCur} / {safeQiMax}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-black border border-white/5 overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 shadow-[0_0_5px_rgba(99,102,241,0.5)]" style={{width: `${qiPct}%`}}></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-black/60 to-black/30 border border-wuxia-gold/10 rounded-2xl p-5 shadow-inner">
                            <div className="flex items-center gap-2 mb-4 border-b border-wuxia-gold/10 pb-2">
                                <IconSwords size={14} className="text-wuxia-gold/60" />
                                <div className="text-sm text-wuxia-gold/80 font-serif tracking-widest font-bold">武道根基</div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-black/50 border border-red-900/30 rounded-xl p-3 flex flex-col items-center justify-center hover:bg-red-950/30 transition-colors">
                                    <span className="text-xs text-red-500/70 font-serif tracking-widest mb-1">威能</span>
                                    <span className="text-2xl font-mono font-bold text-red-300 drop-shadow-[0_0_8px_rgba(220,38,38,0.5)]">{npc.攻击力 || 0}</span>
                                </div>
                                <div className="bg-black/50 border border-blue-900/30 rounded-xl p-3 flex flex-col items-center justify-center hover:bg-blue-950/30 transition-colors">
                                    <span className="text-xs text-blue-500/70 font-serif tracking-widest mb-1">护体</span>
                                    <span className="text-2xl font-mono font-bold text-blue-300 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]">{npc.防御力 || 0}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 右侧：着装与背包 */}
                    <div className="space-y-6">
                        <div className="bg-black/40 border border-wuxia-gold/10 rounded-2xl p-5 relative overflow-hidden">
                            <div className="absolute right-0 top-0 text-[100px] text-wuxia-gold opacity-[0.02] select-none pointer-events-none transform translate-x-4 -translate-y-4 font-serif">
                                兵
                            </div>
                            <div className="flex items-center gap-2 mb-4 border-b border-wuxia-gold/10 pb-2">
                                <span className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/50"></span>
                                <div className="text-sm text-wuxia-gold/80 font-serif tracking-widest font-bold">神兵利器</div>
                            </div>
                            <div className="px-1 relative z-10">
                                <EquipItem label="主手兵刃" value={npc.当前装备?.主武器} />
                                <EquipItem label="副手持物" value={npc.当前装备?.副武器} />
                                <EquipItem label="随身配饰" value={npc.当前装备?.饰品} />
                            </div>
                        </div>

                        {isFemale && (
                            <div className="bg-pink-950/10 border border-pink-900/20 rounded-2xl p-5 shadow-inner hover:border-pink-900/40 transition-colors">
                                <div className="flex items-center gap-2 mb-4 border-b border-pink-900/20 pb-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500/70"></span>
                                    <div className="text-sm text-pink-400/90 font-serif tracking-widest font-bold">裙衫装束</div>
                                </div>
                                <div className="px-1 relative z-10">
                                    <EquipItem label="外装罗裙" value={npc.当前装备?.服装} highlight />
                                    <EquipItem label="贴身亵衣" value={npc.当前装备?.内衣} highlight />
                                    <EquipItem label="贴身亵裤" value={npc.当前装备?.内裤} highlight />
                                    <EquipItem label="足下罗袜" value={npc.当前装备?.袜饰} highlight />
                                    <EquipItem label="足下绣鞋" value={npc.当前装备?.鞋履} highlight />
                                </div>
                            </div>
                        )}

                        <div className="bg-black/40 border border-wuxia-gold/10 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-4 border-b border-wuxia-gold/10 pb-2">
                                <span className="w-1.5 h-1.5 rotate-45 bg-gray-500"></span>
                                <div className="text-sm text-gray-400 font-serif tracking-widest font-bold">随身行囊</div>
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                                {npc.背包 && npc.背包.length > 0 ? (
                                    npc.背包.map((item, i) => (
                                        <span key={i} className="text-xs bg-gradient-to-b from-black/60 to-black/80 border border-gray-700 hover:border-wuxia-gold/40 hover:text-wuxia-gold transition-colors px-3 py-1.5 rounded shadow-sm text-gray-300 font-serif">
                                            {typeof item === 'string' ? item : item?.名称 || '未命名物品'}
                                        </span>
                                    ))
                                ) : (
                                    <div className="w-full text-center py-6 border-2 border-dashed border-gray-800 rounded-xl">
                                        <span className="text-xs text-gray-600 italic font-serif tracking-widest">囊空如洗，并无余物</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fadeIn">
            {/* 标准黑金修仙武侠主题大窗口 */}
            <div className="bg-ink-black/95 w-full max-w-7xl max-h-[90vh] h-[90vh] flex flex-col rounded-2xl border border-wuxia-gold/20 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 relative overflow-hidden">
                
                {/* 装饰类背景层 */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-ink-wash/5 bg-cover bg-center opacity-30 mix-blend-luminosity filter blur-sm"></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-wuxia-gold/5 via-transparent to-black"></div>
                </div>

                {/* 顶栏 */}
                <div className="h-14 shrink-0 border-b border-wuxia-gold/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-6 relative z-50">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-wuxia-gold animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>
                        <h3 className="text-wuxia-gold font-serif font-bold text-xl tracking-[0.4em] drop-shadow-md">
                            队伍预览
                            <span className="text-[10px] text-wuxia-gold/50 ml-2 font-mono tracking-widest border border-wuxia-gold/20 px-2 py-0.5 rounded-full">TEAM ROSTER</span>
                        </h3>
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

                {/* 主体布局：侧边栏 + 右侧详情 */}
                <div className="flex-1 flex overflow-hidden relative z-10">
                    
                    {/* 侧边栏：编队列表 */}
                    <div className="w-64 shrink-0 border-r border-wuxia-gold/10 bg-black/40 backdrop-blur-sm flex flex-col relative z-10 overflow-hidden">
                        <div className="p-4 border-b border-wuxia-gold/10 bg-black/60 shadow-md">
                            <div className="text-[10px] text-wuxia-gold/50 tracking-[0.3em] font-serif uppercase mb-2 flex items-center gap-2">
                                <span className="w-1 h-3 bg-wuxia-gold/50 rounded-full"></span>同行之人 ({activeTeammates.length + 1})
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                            {/* 队长选项被移除 */}

                            {/* 队员列表 */}
                            {activeTeammates.map(npc => (
                                <button
                                    key={npc.id}
                                    onClick={() => setSelectedTab(npc.id)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 relative overflow-hidden group ${
                                        selectedTab === npc.id
                                            ? 'border-wuxia-gold/40 bg-gradient-to-r from-wuxia-gold/10 to-transparent shadow-[0_0_15px_rgba(212,175,55,0.1)]'
                                            : 'border-transparent bg-black/20 hover:bg-white/5 hover:border-white/10'
                                    }`}
                                >
                                    {selectedTab === npc.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>}
                                    <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm font-serif font-bold bg-black/60 ${npc.性别 === '女' ? 'border-pink-900/50 text-pink-400' : 'border-blue-900/50 text-blue-400'}`}>
                                        {npc.姓名[0]}
                                    </div>
                                    <div className="text-left flex-1 min-w-0">
                                        <div className={`font-serif font-bold truncate ${selectedTab === npc.id ? 'text-wuxia-gold' : 'text-gray-200'}`}>{npc.姓名}</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5 truncate tracking-widest">{npc.身份 || '追随者'}</div>
                                    </div>
                                </button>
                            ))}
                            
                            {activeTeammates.length === 0 && (
                                <div className="text-center py-6 text-gray-600 text-[10px] italic font-serif tracking-widest border border-dashed border-gray-800 rounded-lg m-2">
                                    暂无其他同行之人
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右侧：详细内容面板 */}
                    <div className="flex-1 p-8 overflow-hidden relative">
                        {/* 装饰背图 */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 -translate-x-12 opacity-5 pointer-events-none filter blur-sm">
                            <IconYinYang size={300} className="text-wuxia-gold" />
                        </div>
                        
                        <div className="h-full relative z-10 w-full max-w-4xl mx-auto">
                            {(() => {
                                const selectedNpc = activeTeammates.find(n => n.id === selectedTab);
                                if (!selectedNpc) return (
                                    <div className="flex flex-col items-center justify-center h-full text-wuxia-gold/40 font-serif">
                                        <IconUsers size={64} className="mb-4" />
                                        <span className="text-xl tracking-widest">请选择同行之人</span>
                                    </div>
                                );
                                return renderTeammateDetail(selectedNpc);
                            })()}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default TeamModal;
