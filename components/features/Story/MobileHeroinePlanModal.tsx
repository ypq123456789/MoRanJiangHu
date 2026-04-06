import React, { useMemo, useState } from 'react';
import type { 女主剧情规划结构 } from '../../../models/heroinePlan';
import type { 同人女主剧情规划结构 } from '../../../models/fandomPlanning/heroinePlan';

interface Props {
    plan?: 女主剧情规划结构 | 同人女主剧情规划结构;
    isFandomMode?: boolean;
    onClose: () => void;
}

const 取状态样式 = (status?: string) => {
    switch (status) {
        case '可触发':
        case '推进中':
            return 'text-rose-300 border-rose-700/50 bg-rose-950/30';
        case '已登场':
        case '已触发':
        case '已结算':
            return 'text-emerald-300 border-emerald-700/50 bg-emerald-950/30';
        case '待触发':
        case '可推进':
            return 'text-amber-300 border-amber-700/50 bg-amber-950/30';
        default:
            return 'text-gray-300 border-gray-700 bg-black/30';
    }
};

const 取数组 = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const MobileHeroinePlanModal: React.FC<Props> = ({ plan, isFandomMode = false, onClose }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'heroines' | 'events' | 'shots'>('overview');

    const heroines = useMemo(() => Array.isArray(plan?.女主条目) ? plan.女主条目 : [], [plan]);
    const events = useMemo(() => Array.isArray(plan?.女主互动事件) ? plan.女主互动事件 : [], [plan]);
    const shots = useMemo(() => Array.isArray(plan?.女主镜头规划) ? plan.女主镜头规划 : [], [plan]);
    const stages = useMemo(() => Array.isArray(plan?.阶段推进) ? plan.阶段推进 : [], [plan]);

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[200] flex flex-col md:hidden animate-fadeIn">
            {/* Header */}
            <div className="h-14 shrink-0 bg-gradient-to-r from-rose-950/80 via-black to-black flex items-center justify-between px-4 border-b border-rose-900/30 relative z-20">
                <div className="flex items-center gap-3">
                    <div className="text-rose-400 font-serif font-bold text-lg tracking-[0.2em] drop-shadow-md">红颜卷宗</div>
                    <div className="text-[10px] text-rose-300/60 font-mono tracking-widest bg-rose-950/50 px-2 py-0.5 rounded border border-rose-900/30">
                        {isFandomMode ? '同人' : '原创'}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-800 text-gray-400 hover:text-rose-400 hover:border-rose-500/50 transition-all"
                >
                    ×
                </button>
            </div>

            {/* Tabs */}
            <div className="shrink-0 border-b border-rose-900/20 bg-black/60 px-2 py-2 backdrop-blur-sm relative z-20">
                <div className="flex overflow-x-auto custom-scrollbar hide-scrollbar gap-2 px-2 pb-1">
                    {[
                        { id: 'overview' as const, label: '概览', count: null },
                        { id: 'heroines' as const, label: '红颜录', count: heroines.length },
                        { id: 'events' as const, label: '缘分', count: events.length },
                        { id: 'shots' as const, label: '掠影', count: shots.length }
                    ].map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition-all shadow-sm ${
                                activeTab === item.id ? 'border-rose-500/50 bg-rose-500/10 text-rose-300 shadow-[0_0_10px_rgba(225,29,72,0.2)]' : 'border-gray-800/80 bg-black/40 text-gray-500'
                            }`}
                        >
                            {item.label} {item.count !== null && <span className="ml-1.5 font-mono opacity-60 text-[10px]">{item.count}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-gradient-to-b from-black to-rose-950/10 relative">
                <div className="absolute inset-0 bg-[url('/assets/images/ui/paper-texture.png')] opacity-[0.03] mix-blend-overlay pointer-events-none z-0"></div>
                
                <div className="p-4 space-y-6 relative z-10 pb-20">
                    {!plan ? (
                        <div className="py-20 flex flex-col items-center justify-center text-rose-900/50 gap-4 font-serif">
                            <span className="text-4xl opacity-50">🌸</span>
                            <span className="text-sm tracking-widest">卷宗尚未记载</span>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'overview' && (
                                <div className="space-y-6 animate-fadeIn">
                                    {/* Stats */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-gradient-to-br from-rose-950/40 to-black border border-rose-900/30 rounded-2xl p-4 flex flex-col items-center justify-center">
                                            <div className="text-[10px] text-rose-400/70 tracking-widest mb-1">已记载红颜</div>
                                            <div className="text-2xl font-mono text-rose-300 drop-shadow-md">{heroines.length}</div>
                                        </div>
                                        <div className="bg-gradient-to-br from-amber-950/40 to-black border border-amber-900/30 rounded-2xl p-4 flex flex-col items-center justify-center">
                                            <div className="text-[10px] text-amber-400/70 tracking-widest mb-1">推演中缘分</div>
                                            <div className="text-2xl font-mono text-amber-300 drop-shadow-md">{events.length}</div>
                                        </div>
                                    </div>

                                    {/* Stages */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 opacity-80">
                                            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-rose-900/50"></div>
                                            <div className="text-[10px] tracking-[0.3em] text-rose-300 font-bold uppercase">阶段演进</div>
                                            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-rose-900/50"></div>
                                        </div>
                                        
                                        <div className="space-y-0 relative before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-gradient-to-b before:from-rose-900/50 before:to-transparent ml-1">
                                            {stages.length > 0 ? stages.map((stage: any, idx) => (
                                                <div key={`stage-${idx}`} className="relative pl-8 pb-6 last:pb-0">
                                                    <div className={`absolute left-[7.5px] top-[4px] w-2 h-2 rounded-full border-2 ${idx === 0 ? 'bg-rose-500 border-rose-200 shadow-[0_0_8px_rgba(225,29,72,0.8)]' : 'bg-black border-rose-900/50'}`}></div>
                                                    <div className="bg-black/60 border border-rose-900/20 rounded-xl p-4 shadow-sm backdrop-blur-sm">
                                                        <div className={`text-sm font-serif font-bold ${idx === 0 ? 'text-rose-300' : 'text-gray-300'}`}>{stage?.阶段名 || `阶段 ${idx + 1}`}</div>
                                                        <div className="mt-2 space-y-1.5">
                                                            <div className="text-[11px] text-gray-400 leading-relaxed"><span className="text-rose-400/60 mr-1.5">主推</span>{取数组(stage?.主推女主).join('、') || '暂无'}</div>
                                                            <div className="text-[11px] text-gray-400 leading-relaxed"><span className="text-amber-400/60 mr-1.5">目标</span>{取数组(stage?.阶段目标).join('；') || '暂无'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )) : <div className="pl-8 text-xs text-gray-600 italic">暂无阶段推进。</div>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'heroines' && (
                                <div className="space-y-4 animate-fadeIn">
                                    {heroines.length > 0 ? heroines.map((item: any, idx) => (
                                        <div key={`heroine-${idx}`} className="bg-gradient-to-br from-black/90 to-rose-950/20 border border-rose-900/30 rounded-2xl p-4 shadow-lg relative overflow-hidden">
                                            <div className="flex items-start justify-between gap-3 mb-4">
                                                <div>
                                                    <div className="flex items-baseline gap-2">
                                                        <div className="text-xl font-serif font-bold text-rose-300 drop-shadow-sm">{item?.女主姓名 || `角色 ${idx + 1}`}</div>
                                                        <span className="text-[10px] text-rose-400/60 font-mono">{item?.类型 || '未分类'}</span>
                                                    </div>
                                                    <div className="mt-1.5 text-[10px] text-gray-500">当前阶段：<span className="text-rose-200/80">{item?.当前阶段 || '未定'}</span></div>
                                                </div>
                                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border shadow-sm ${取状态样式(item?.当前关系状态)}`}>
                                                    {item?.当前关系状态 || '未定'}
                                                </span>
                                            </div>
                                            
                                            <div className="space-y-2 text-[11px]">
                                                {取数组(item?.已成立事实).length > 0 && (
                                                    <div className="bg-black/40 border border-rose-900/20 rounded-xl p-3">
                                                        <div className="text-[10px] text-rose-500/70 mb-1">已成立事实</div>
                                                        <div className="text-gray-300 leading-5">{取数组(item?.已成立事实).join('；')}</div>
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="bg-black/40 border border-amber-900/20 rounded-xl p-3">
                                                        <div className="text-[10px] text-amber-500/70 mb-1">阶段目标</div>
                                                        <div className="text-gray-300 leading-5">{取数组(item?.阶段目标).join('；') || '暂无'}</div>
                                                    </div>
                                                    <div className="bg-black/40 border border-cyan-900/20 rounded-xl p-3">
                                                        <div className="text-[10px] text-cyan-500/70 mb-1">推进方式</div>
                                                        <div className="text-gray-300 leading-5">{取数组(item?.推进方式).join('；') || '暂无'}</div>
                                                    </div>
                                                </div>
                                                <div className="bg-black/40 border border-rose-900/20 rounded-xl p-3">
                                                    <div className="text-[10px] text-rose-500/70 mb-1">阻断 / 突破</div>
                                                    <div className="text-gray-300 leading-5"><span className="text-rose-400/50">阻断：</span>{取数组(item?.阻断因素).join('；') || '无'}</div>
                                                    <div className="text-gray-300 leading-5 mt-1"><span className="text-emerald-400/50">突破：</span>{取数组(item?.允许突破条件).join('；') || '无'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )) : <div className="text-center text-gray-500 text-sm py-10 font-serif">红颜录中尚无记载</div>}
                                </div>
                            )}

                            {activeTab === 'events' && (
                                <div className="space-y-4 animate-fadeIn">
                                    {events.length > 0 ? events.map((item: any, idx) => (
                                        <div key={`event-${idx}`} className="bg-gradient-to-br from-black/90 to-amber-950/20 border border-amber-900/30 rounded-2xl p-4 shadow-lg relative overflow-hidden">
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div>
                                                    <div className="text-lg font-serif font-bold text-amber-300 drop-shadow-sm">{item?.事件名 || `事件 ${idx + 1}`}</div>
                                                    <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                                                        <span className="text-rose-300 bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-900/30">{item?.女主姓名 || '未知女主'}</span>
                                                        <span className="text-gray-500">{item?.计划触发时间 || '未设时间'}</span>
                                                    </div>
                                                </div>
                                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border shadow-sm ${取状态样式(item?.当前状态)}`}>
                                                    {item?.当前状态 || '待触发'}
                                                </span>
                                            </div>
                                            
                                            <div className="mb-3 bg-black/40 border border-gray-800/50 rounded-lg p-3 text-[11px] text-gray-300 leading-relaxed shadow-inner">
                                                {item?.事件说明 || '暂无说明'}
                                            </div>
                                            
                                            <div className="space-y-2 text-[11px]">
                                                <div className="bg-black/40 border border-cyan-900/20 rounded-xl p-3">
                                                    <div className="text-[10px] text-cyan-500/70 mb-1">触发条件</div>
                                                    <div className="text-gray-300 leading-5">{取数组(item?.触发条件).join('；') || '暂无'}</div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="bg-black/40 border border-emerald-900/20 rounded-xl p-3">
                                                        <div className="text-[10px] text-emerald-500/70 mb-1">成功结果</div>
                                                        <div className="text-gray-300 leading-5">{取数组(item?.成功结果).join('；') || '暂无'}</div>
                                                    </div>
                                                    <div className="bg-black/40 border border-rose-900/20 rounded-xl p-3">
                                                        <div className="text-[10px] text-rose-500/70 mb-1">失败结果</div>
                                                        <div className="text-gray-300 leading-5">{取数组(item?.失败结果).join('；') || '暂无'}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )) : <div className="text-center text-gray-500 text-sm py-10 font-serif">缘分尚未推演</div>}
                                </div>
                            )}

                            {activeTab === 'shots' && (
                                <div className="space-y-4 animate-fadeIn">
                                    {shots.length > 0 ? shots.map((item: any, idx) => (
                                        <div key={`shot-${idx}`} className="bg-gradient-to-br from-black/90 to-purple-950/20 border border-purple-900/30 rounded-2xl p-4 shadow-lg relative overflow-hidden">
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm opacity-80">🎬</span>
                                                        <div className="text-lg font-serif font-bold text-purple-300 drop-shadow-sm">{item?.镜头标题 || `镜头 ${idx + 1}`}</div>
                                                    </div>
                                                    <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                                                        <span className="text-rose-300 bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-900/30">{item?.女主姓名 || '未知女主'}</span>
                                                        <span className="text-gray-500">{item?.触发时间 || '未设时间'}</span>
                                                    </div>
                                                </div>
                                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border shadow-sm ${取状态样式(item?.当前状态)}`}>
                                                    {item?.当前状态 || '待触发'}
                                                </span>
                                            </div>
                                            
                                            <div className="mb-3 bg-black/40 border border-gray-800/50 rounded-lg p-3 text-[11px] text-gray-300 leading-relaxed shadow-inner">
                                                {item?.镜头内容 || '暂无镜头内容'}
                                            </div>
                                            
                                            <div className="space-y-2 text-[11px]">
                                                <div className="bg-black/40 border border-cyan-900/20 rounded-xl p-3">
                                                    <div className="text-[10px] text-cyan-500/70 mb-1">触发与沉淀</div>
                                                    <div className="text-gray-300 leading-5"><span className="text-cyan-400/50">条件：</span>{取数组(item?.触发条件).join('；') || '暂无'}</div>
                                                    <div className="text-gray-300 leading-5 mt-1"><span className="text-rose-400/50">沉淀：</span>{取数组(item?.沉淀内容).join('；') || '暂无'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )) : <div className="text-center text-gray-500 text-sm py-10 font-serif">掠影集尚为空白</div>}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MobileHeroinePlanModal;
