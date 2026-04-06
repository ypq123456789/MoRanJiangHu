import React, { useEffect, useMemo, useState } from 'react';
import { 聊天记录结构, 记忆系统结构 } from '../../../types';
import { 构建带时间戳的记忆条目, 解析记忆条目时间信息 } from '../../../hooks/useGame/memoryUtils';

interface Props {
    history: 聊天记录结构[];
    memorySystem?: 记忆系统结构;
    onClose: () => void;
    currentTime?: string;
    onSaveMemory?: (nextMemory: 记忆系统结构) => void;
    onStartMemorySummary?: (source: '短期' | '中期', startIndex: number, endIndex: number) => void;
}

type TabType = 'context' | 'short' | 'medium' | 'long';
const 即时短期分隔标记 = '\n<<SHORT_TERM_SYNC>>\n';

type 编辑条目状态 = {
    open: boolean;
    tab: TabType;
    id: number;
    main: string;
    syncedShort: string;
    timeStart: string;
    timeEnd: string;
    error: string;
};

type 区间总结状态 = {
    start: string;
    end: string;
    error: string;
};

type 记忆展示条目 = {
    id: number;
    content: string;
    rawContent: string;
    fromMemory: boolean;
    rawDate?: string;
    syncedShort?: string;
    timeStart?: string;
    timeEnd?: string;
};

const 创建空记忆系统 = (): 记忆系统结构 => ({
    回忆档案: [],
    即时记忆: [],
    短期记忆: [],
    中期记忆: [],
    长期记忆: []
});

const 复制记忆系统 = (source?: 记忆系统结构): 记忆系统结构 => ({
    回忆档案: Array.isArray(source?.回忆档案) ? [...source!.回忆档案] : [],
    即时记忆: Array.isArray(source?.即时记忆) ? [...source!.即时记忆] : [],
    短期记忆: Array.isArray(source?.短期记忆) ? [...source!.短期记忆] : [],
    中期记忆: Array.isArray(source?.中期记忆) ? [...source!.中期记忆] : [],
    长期记忆: Array.isArray(source?.长期记忆) ? [...source!.长期记忆] : []
});

const 解析即时记忆 = (raw: string) => {
    const text = (raw || '').trim();
    const splitAt = text.lastIndexOf(即时短期分隔标记);
    if (splitAt < 0) return { main: text, syncedShort: '' };
    return {
        main: text.slice(0, splitAt).trim(),
        syncedShort: text.slice(splitAt + 即时短期分隔标记.length).trim()
    };
};

const 构建即时主文本 = (content: string, timeStart: string, timeEnd: string): string => {
    const main = (content || '').trim();
    const timedHeader = 构建带时间戳的记忆条目('', timeStart, timeEnd);
    if (!timedHeader) return main;
    return main ? `${timedHeader}\n${main}` : timedHeader;
};

const 格式化显示时间 = (timeStart?: string, timeEnd?: string): string => {
    const start = (timeStart || '').trim();
    const end = (timeEnd || '').trim();
    if (!start && !end) return '';
    if (start && end && start !== end) return `${start} - ${end}`;
    return start || end;
};

const MemoryModal: React.FC<Props> = ({
    history,
    memorySystem,
    onClose,
    currentTime,
    onSaveMemory,
    onStartMemorySummary
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('context');
    const [editItem, setEditItem] = useState<编辑条目状态>({
        open: false,
        tab: 'context',
        id: -1,
        main: '',
        syncedShort: '',
        timeStart: '',
        timeEnd: '',
        error: ''
    });
    const [summaryRange, setSummaryRange] = useState<区间总结状态>({ start: '1', end: '1', error: '' });

    const fallbackImmediateData: 记忆展示条目[] = history
        .filter((msg) => msg.role === 'assistant' && msg.structuredResponse?.shortTerm)
        .map((msg, i) => ({
            content: msg.structuredResponse?.shortTerm || '',
            rawContent: msg.structuredResponse?.shortTerm || '',
            rawDate: msg.gameTime || currentTime || '未知岁月',
            id: i,
            fromMemory: false
        }))
        .reverse();

    const immediateData: 记忆展示条目[] = (memorySystem?.即时记忆 || []).map((m, i) => {
        const parsed = 解析即时记忆(m);
        const timedMain = 解析记忆条目时间信息(parsed.main);
        return {
            content: timedMain.内容,
            rawContent: parsed.main,
            syncedShort: parsed.syncedShort,
            rawDate: 格式化显示时间(timedMain.开始时间, timedMain.结束时间),
            timeStart: timedMain.开始时间,
            timeEnd: timedMain.结束时间,
            id: i,
            fromMemory: true
        };
    }).reverse();
    const contextData = immediateData.length > 0 ? immediateData : fallbackImmediateData;

    const shortData: 记忆展示条目[] = (memorySystem?.短期记忆 || []).map((m, i) => {
        const parsed = 解析记忆条目时间信息(m);
        return {
            content: parsed.内容,
            rawContent: m,
            id: i,
            fromMemory: true,
            rawDate: 格式化显示时间(parsed.开始时间, parsed.结束时间),
            timeStart: parsed.开始时间,
            timeEnd: parsed.结束时间
        };
    }).reverse();
    const mediumData: 记忆展示条目[] = (memorySystem?.中期记忆 || []).map((m, i) => {
        const parsed = 解析记忆条目时间信息(m);
        return {
            content: parsed.内容,
            rawContent: m,
            id: i,
            fromMemory: true,
            rawDate: 格式化显示时间(parsed.开始时间, parsed.结束时间),
            timeStart: parsed.开始时间,
            timeEnd: parsed.结束时间
        };
    }).reverse();
    const longData: 记忆展示条目[] = (memorySystem?.长期记忆 || []).map((m, i) => {
        const parsed = 解析记忆条目时间信息(m);
        return {
            content: parsed.内容,
            rawContent: m,
            id: i,
            fromMemory: true,
            rawDate: 格式化显示时间(parsed.开始时间, parsed.结束时间),
            timeStart: parsed.开始时间,
            timeEnd: parsed.结束时间
        };
    }).reverse();

    const currentData = useMemo(() => {
        if (activeTab === 'context') return contextData;
        if (activeTab === 'short') return shortData;
        if (activeTab === 'medium') return mediumData;
        return longData;
    }, [activeTab, contextData, longData, mediumData, shortData]);

    const currentLayerLength = activeTab === 'short'
        ? (memorySystem?.短期记忆?.length || 0)
        : activeTab === 'medium'
            ? (memorySystem?.中期记忆?.length || 0)
            : 0;

    useEffect(() => {
        if (activeTab !== 'short' && activeTab !== 'medium') return;
        const fallback = String(Math.max(1, currentLayerLength || 1));
        setSummaryRange({
            start: '1',
            end: fallback,
            error: ''
        });
    }, [activeTab, currentLayerLength]);

    const 打开条目编辑 = (item: 记忆展示条目) => {
        if (!onSaveMemory || !item?.fromMemory) return;
        const parsedSynced = activeTab === 'context'
            ? 解析记忆条目时间信息(typeof item.syncedShort === 'string' ? item.syncedShort : '')
            : null;
        setEditItem({
            open: true,
            tab: activeTab,
            id: Number(item.id),
            main: typeof item.content === 'string' ? item.content : '',
            syncedShort: activeTab === 'context' ? (parsedSynced?.内容 || '') : '',
            timeStart: activeTab === 'context'
                ? (item.timeStart || '')
                : (item.timeStart || ''),
            timeEnd: activeTab === 'context'
                ? (item.timeEnd || '')
                : (item.timeEnd || ''),
            error: ''
        });
    };

    const 保存条目编辑 = () => {
        if (!onSaveMemory) return;
        const targetId = Number(editItem.id);
        if (!Number.isFinite(targetId) || targetId < 0) {
            setEditItem((prev) => ({ ...prev, error: '神念紊乱，无法保存。' }));
            return;
        }

        const nextMemory = 复制记忆系统(memorySystem || 创建空记忆系统());
        if (editItem.tab === 'context') {
            if (targetId >= nextMemory.即时记忆.length) {
                setEditItem((prev) => ({ ...prev, error: '该记忆已消散。' }));
                return;
            }
            const main = 构建即时主文本(editItem.main, editItem.timeStart, editItem.timeEnd);
            const syncedShort = 构建带时间戳的记忆条目(editItem.syncedShort, editItem.timeStart, editItem.timeEnd);
            nextMemory.即时记忆[targetId] = syncedShort
                ? (main ? `${main}${即时短期分隔标记}${syncedShort}` : syncedShort)
                : main;
        } else if (editItem.tab === 'short') {
            if (targetId >= nextMemory.短期记忆.length) {
                setEditItem((prev) => ({ ...prev, error: '该记忆已消散。' }));
                return;
            }
            nextMemory.短期记忆[targetId] = 构建带时间戳的记忆条目(editItem.main, editItem.timeStart, editItem.timeEnd);
        } else if (editItem.tab === 'medium') {
            if (targetId >= nextMemory.中期记忆.length) {
                setEditItem((prev) => ({ ...prev, error: '该记忆已消散。' }));
                return;
            }
            nextMemory.中期记忆[targetId] = 构建带时间戳的记忆条目(editItem.main, editItem.timeStart, editItem.timeEnd);
        } else {
            if (targetId >= nextMemory.长期记忆.length) {
                setEditItem((prev) => ({ ...prev, error: '该记忆已消散。' }));
                return;
            }
            nextMemory.长期记忆[targetId] = 构建带时间戳的记忆条目(editItem.main, editItem.timeStart, editItem.timeEnd);
        }

        onSaveMemory(nextMemory);
        setEditItem({
            open: false,
            tab: activeTab,
            id: -1,
            main: '',
            syncedShort: '',
            timeStart: '',
            timeEnd: '',
            error: ''
        });
    };

    const 提交区间总结 = () => {
        if (!onStartMemorySummary || (activeTab !== 'short' && activeTab !== 'medium')) return;
        const start = Number(summaryRange.start);
        const end = Number(summaryRange.end);
        if (!Number.isInteger(start) || !Number.isInteger(end)) {
            setSummaryRange((prev) => ({ ...prev, error: '需指定整数区段。' }));
            return;
        }
        if (start < 1 || end < 1 || start > currentLayerLength || end > currentLayerLength) {
            setSummaryRange((prev) => ({ ...prev, error: `区段需介于 1 到 ${currentLayerLength} 之间。` }));
            return;
        }
        setSummaryRange((prev) => ({ ...prev, error: '' }));
        onStartMemorySummary(activeTab === 'short' ? '短期' : '中期', start - 1, end - 1);
    };

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[200] hidden md:flex items-center justify-center p-4 animate-fadeIn">
            {/* 窗口大小对齐 `w-full max-w-7xl max-h-[90vh] h-[90vh]` */}
            <div className="bg-ink-black/95 w-full max-w-7xl max-h-[90vh] h-[90vh] flex flex-col rounded-2xl border border-wuxia-cyan/30 shadow-[0_0_80px_rgba(0,100,100,0.3)] shadow-wuxia-cyan/10 relative overflow-hidden">
                
                {/* 装饰类背景层 */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[url('/assets/images/ui/paper-texture.png')] opacity-[0.03] mix-blend-overlay"></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-wuxia-cyan/10 via-transparent to-black"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[500px] font-serif text-wuxia-cyan opacity-[0.02] filter blur-[4px]">
                        识
                    </div>
                </div>

                {/* 顶栏 */}
                <div className="h-16 shrink-0 border-b border-wuxia-cyan/20 bg-gradient-to-r from-cyan-950/80 to-black/40 flex items-center justify-between px-6 relative z-50">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full border border-wuxia-cyan/50 bg-wuxia-cyan/10 flex items-center justify-center text-wuxia-cyan font-serif font-bold text-xl shadow-[0_0_15px_rgba(34,211,238,0.3)]">
                            忆
                        </div>
                        <div className="flex items-end gap-3">
                            <h3 className="text-wuxia-cyan/90 font-serif font-bold text-xl tracking-[0.4em] drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">
                                识海洞天
                            </h3>
                            <span className="text-[10px] text-cyan-500/50 tracking-widest border border-cyan-800/50 px-2 py-0.5 rounded-full mb-1">
                                神念汇聚之地
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-cyan-400 hover:border-cyan-400 hover:bg-cyan-400/10 transition-all shadow-sm hover:rotate-90 group"
                    >
                        <svg className="w-5 h-5 group-hover:drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex flex-col flex-1 overflow-hidden relative z-10">
                    <div className="flex border-b border-wuxia-cyan/20 bg-black/40 px-8 pt-6 gap-4 shrink-0 shadow-md relative z-20">
                        {[
                            { id: 'context', label: '浮光掠影', desc: '即刻之念', icon: '✦' },
                            { id: 'short', label: '浅层识海', desc: '近期之忆', icon: '❂' },
                            { id: 'medium', label: '深层识海', desc: '沉淀之思', icon: '🌀' },
                            { id: 'long', label: '神魂烙印', desc: '亘古之识', icon: '⚜' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabType)}
                                className={`px-8 py-3 rounded-t-xl transition-all outline-none font-serif relative group overflow-hidden ${
                                    activeTab === tab.id
                                        ? 'bg-gradient-to-t from-wuxia-cyan/20 to-transparent border-t border-x border-wuxia-cyan/40 shadow-[0_-5px_15px_rgba(34,211,238,0.1)] text-cyan-300'
                                        : 'text-gray-500 hover:text-cyan-200 hover:bg-wuxia-cyan/5 border border-transparent'
                                }`}
                            >
                                {activeTab === tab.id && <div className="absolute top-0 inset-x-0 h-[2px] bg-wuxia-cyan shadow-[0_0_10px_rgba(34,211,238,0.8)]"></div>}
                                <div className="flex flex-col items-center gap-1 relative z-10">
                                    <span className={`text-lg opacity-80 ${activeTab === tab.id ? 'text-wuxia-cyan' : 'group-hover:text-cyan-400 transition-colors'}`}>{tab.icon}</span>
                                    <span className="font-bold tracking-[0.2em]">{tab.label}</span>
                                    <span className={`text-[10px] tracking-widest ${activeTab === tab.id ? 'text-cyan-600' : 'opacity-0 h-0 group-hover:opacity-60 transition-all font-mono'}`}>{tab.desc}</span>
                                </div>
                            </button>
                        ))}
                    </div>

                    {(activeTab === 'short' || activeTab === 'medium') && onStartMemorySummary && (
                        <div className="shrink-0 border-b border-wuxia-cyan/10 bg-gradient-to-b from-cyan-950/20 to-black/60 px-8 py-4 flex items-center justify-between">
                            <div className="flex items-end gap-5">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl text-cyan-600/50">⟳</span>
                                    <div>
                                        <div className="text-[10px] text-cyan-600/80 mb-1 font-bold tracking-widest">提炼起点（壹 = 首念）</div>
                                        <input
                                            value={summaryRange.start}
                                            onChange={(e) => setSummaryRange((prev) => ({ ...prev, start: e.target.value, error: '' }))}
                                            className="w-24 rounded border border-cyan-800/80 bg-black/60 px-3 py-1.5 text-xs text-cyan-200 outline-none focus:border-cyan-400 font-mono text-center shadow-inner"
                                        />
                                    </div>
                                    <div className="text-cyan-800 font-bold px-2 mt-4">-</div>
                                    <div>
                                        <div className="text-[10px] text-cyan-600/80 mb-1 font-bold tracking-widest">提炼终点</div>
                                        <input
                                            value={summaryRange.end}
                                            onChange={(e) => setSummaryRange((prev) => ({ ...prev, end: e.target.value, error: '' }))}
                                            className="w-24 rounded border border-cyan-800/80 bg-black/60 px-3 py-1.5 text-xs text-cyan-200 outline-none focus:border-cyan-400 font-mono text-center shadow-inner"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={提交区间总结}
                                    className="px-6 py-2 h-[34px] text-[11px] rounded border border-wuxia-cyan/40 bg-wuxia-cyan/5 text-wuxia-cyan hover:bg-wuxia-cyan/20 hover:border-wuxia-cyan hover:shadow-[0_0_10px_rgba(34,211,238,0.3)] transition-all font-bold tracking-widest"
                                >
                                    熔金化元 · 重新提炼
                                </button>
                                {summaryRange.error && (
                                    <div className="text-xs text-wuxia-red bg-wuxia-red/10 border border-wuxia-red/30 px-3 py-1.5 rounded flex items-center gap-2">
                                        <span className="animate-pulse">⚠</span> {summaryRange.error}
                                    </div>
                                )}
                            </div>
                            <div className="text-xs tracking-widest font-serif text-cyan-500/60 bg-black/40 border border-cyan-900/30 px-4 py-2 rounded-lg">
                                此识境共存 <span className="text-wuxia-cyan font-bold font-mono">{currentLayerLength}</span> 道神念<br/>
                                <span className="text-[10px]">凝聚后将升入<span className="text-cyan-400 mx-1">{activeTab === 'short' ? '深层识海' : '神魂烙印'}</span></span>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 relative z-10 bg-gradient-to-b from-transparent to-black/40">
                        <div className="max-w-4xl mx-auto space-y-8 relative pb-10">
                            {/* 时间线轴 */}
                            <div className="absolute left-[24px] top-6 bottom-0 w-px bg-gradient-to-b from-wuxia-cyan/0 via-wuxia-cyan/20 to-wuxia-cyan/0"></div>

                            {currentData.length > 0 ? currentData.map((mem, idx) => (
                                <div key={`${activeTab}-${mem.id}-${idx}`} className="relative pl-14 group hover:z-20">
                                    <div className={`absolute left-[18px] top-3 w-3 h-3 rounded-full border-2 transition-all shadow-[0_0_10px_rgba(34,211,238,0.5)] z-10 ${
                                        activeTab === 'context' ? 'bg-wuxia-cyan border-white text-black group-hover:scale-125' :
                                            activeTab === 'long' ? 'bg-wuxia-gold border-white text-black group-hover:scale-125' :
                                                'bg-black border-cyan-500 group-hover:bg-wuxia-cyan group-hover:scale-125'
                                    }`}></div>

                                    <div className="bg-gradient-to-br from-black/80 to-black/60 border border-gray-800 p-6 rounded-xl group-hover:bg-black/80 group-hover:border-wuxia-cyan/40 transition-all relative shadow-lg hover:shadow-[0_0_20px_rgba(34,211,238,0.1)] overflow-hidden">
                                        
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-radial from-wuxia-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        
                                        {mem.rawDate && (
                                            <div className="text-xs text-cyan-500/70 font-mono mb-4 border-b border-gray-800/80 pb-2 flex items-center gap-2">
                                                <span className="text-base text-cyan-700">◷</span> {mem.rawDate}
                                            </div>
                                        )}
                                        <p className="text-gray-300 font-serif leading-[2.5] text-sm text-justify whitespace-pre-wrap relative z-10">
                                            {mem.content || mem.rawContent}
                                        </p>
                                        
                                        {activeTab === 'context' && mem.syncedShort && (
                                            <div className="mt-5 bg-gradient-to-r from-cyan-950/20 to-transparent p-4 rounded-lg border-l-2 border-cyan-800/50 relative z-10">
                                                <div className="text-[10px] text-cyan-400 mb-2 font-bold tracking-widest flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rotate-45 bg-cyan-500"></span> 
                                                    浅层映照（待沉淀）
                                                </div>
                                                <p className="text-sm text-cyan-100/70 leading-loose whitespace-pre-wrap font-serif">
                                                    {mem.syncedShort}
                                                </p>
                                            </div>
                                        )}
                                        {onSaveMemory && mem.fromMemory && (
                                            <button
                                                type="button"
                                                onClick={() => 打开条目编辑(mem)}
                                                className="absolute top-4 right-4 px-3 py-1.5 text-[10px] tracking-widest rounded border border-gray-700 bg-black/50 text-gray-400 hover:text-wuxia-cyan hover:border-wuxia-cyan hover:bg-wuxia-cyan/10 transition-colors z-20 shadow-sm opacity-0 group-hover:opacity-100"
                                            >
                                                点化神念
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )) : (
                                <div className="flex flex-col items-center justify-center pt-32 pb-20 text-cyan-600/30 font-serif gap-6">
                                    <div className="w-24 h-24 rounded-full border border-dashed border-cyan-800/50 flex items-center justify-center animate-[spin_20s_linear_infinite]">
                                        <span className="text-5xl opacity-30 transform rotate-45">☯</span>
                                    </div>
                                    <span className="text-2xl tracking-[0.4em] font-bold text-gray-600">灵台澄空，诸念不生</span>
                                    <span className="text-xs tracking-widest text-gray-500">需历练红尘，方能凝结神识</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {editItem.open && (
                    <div className="absolute inset-0 z-[250] bg-black/95 backdrop-blur-md flex items-center justify-center p-6 animate-fadeIn_fast">
                        <div className="w-full max-w-4xl bg-gradient-to-br from-[#0a0f12] to-black border border-wuxia-cyan/30 rounded-2xl shadow-[0_0_60px_rgba(34,211,238,0.15)] overflow-hidden flex flex-col max-h-full">
                            
                            <div className="px-6 py-4 border-b border-wuxia-cyan/20 flex items-center justify-between bg-black/60 relative">
                                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-wuxia-cyan/50 to-transparent"></div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xl text-wuxia-cyan animate-pulse">✧</span>
                                    <div className="text-wuxia-cyan text-base font-bold tracking-[0.3em] font-serif shadow-cyan-500/50 drop-shadow-md">重塑神念</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEditItem((prev) => ({ ...prev, open: false }))}
                                    className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            
                            <div className="p-6 space-y-5 overflow-y-auto relative custom-scrollbar">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-wuxia-cyan/5 rounded-full blur-[60px] pointer-events-none"></div>

                                <div className="grid grid-cols-2 gap-6 relative z-10">
                                    <div className="group">
                                        <div className="text-[10px] text-cyan-600/80 mb-2 font-bold tracking-widest uppercase flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-cyan-600 rotate-45"></span> 岁月起始 (开始时间戳)
                                        </div>
                                        <input
                                            value={editItem.timeStart}
                                            onChange={(e) => setEditItem((prev) => ({ ...prev, timeStart: e.target.value, error: '' }))}
                                            placeholder="例: 天宝元年:正月:初一:子时"
                                            className="w-full rounded-lg border border-gray-700 bg-black/60 px-4 py-3 text-sm text-cyan-100 font-mono outline-none focus:border-wuxia-cyan/60 focus:bg-cyan-950/20 transition-all shadow-inner"
                                        />
                                    </div>
                                    <div className="group">
                                        <div className="text-[10px] text-cyan-600/80 mb-2 font-bold tracking-widest uppercase flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-cyan-600 rotate-45"></span> 岁月终焉 (结束时间戳)
                                        </div>
                                        <input
                                            value={editItem.timeEnd}
                                            onChange={(e) => setEditItem((prev) => ({ ...prev, timeEnd: e.target.value, error: '' }))}
                                            placeholder="例: 天宝元年:正月:初三:午时"
                                            className="w-full rounded-lg border border-gray-700 bg-black/60 px-4 py-3 text-sm text-cyan-100 font-mono outline-none focus:border-wuxia-cyan/60 focus:bg-cyan-950/20 transition-all shadow-inner"
                                        />
                                    </div>
                                </div>

                                <div className="relative z-10 group">
                                    <div className="text-[10px] text-cyan-600/80 mb-2 font-bold tracking-widest uppercase flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-wuxia-gold rotate-45"></span> 神念真韵 (主要记忆体)
                                    </div>
                                    <textarea
                                        value={editItem.main}
                                        onChange={(e) => setEditItem((prev) => ({ ...prev, main: e.target.value, error: '' }))}
                                        className="w-full h-80 bg-black/60 border border-gray-700 rounded-lg p-5 text-sm leading-8 text-gray-200 font-serif whitespace-pre-wrap resize-y outline-none focus:border-wuxia-gold/50 focus:bg-wuxia-gold/5 transition-all shadow-inner custom-scrollbar"
                                    />
                                </div>

                                {editItem.tab === 'context' && (
                                    <div className="relative z-10 bg-cyan-950/10 p-4 rounded-xl border border-cyan-900/40">
                                        <div className="text-[10px] text-cyan-400 mb-2 font-bold tracking-widest flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-ping"></span> 浅层印记补充（与神念同源）
                                        </div>
                                        <textarea
                                            value={editItem.syncedShort}
                                            onChange={(e) => setEditItem((prev) => ({ ...prev, syncedShort: e.target.value, error: '' }))}
                                            className="w-full h-32 bg-black/80 border border-cyan-900/50 rounded-lg p-4 text-sm leading-7 text-cyan-100/80 font-serif whitespace-pre-wrap resize-y outline-none focus:border-cyan-500/60 focus:bg-cyan-950/30 transition-all custom-scrollbar"
                                        />
                                    </div>
                                )}

                                {editItem.error && (
                                    <div className="text-sm text-wuxia-red bg-wuxia-red/10 border border-wuxia-red/30 rounded-lg p-4 flex items-center gap-3 font-bold tracking-widest">
                                        <span className="text-xl animate-pulse">🈲</span> {editItem.error}
                                    </div>
                                )}
                            </div>

                            <div className="px-6 py-4 border-t border-gray-800 bg-black/60 flex justify-end gap-4 relative z-20">
                                <button
                                    type="button"
                                    onClick={() => setEditItem((prev) => ({ ...prev, open: false }))}
                                    className="px-8 py-2.5 text-xs tracking-widest rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                                >
                                    弃念
                                </button>
                                <button
                                    type="button"
                                    onClick={保存条目编辑}
                                    className="px-8 py-2.5 text-xs font-bold tracking-widest rounded-lg border border-wuxia-cyan/60 bg-wuxia-cyan/10 text-wuxia-cyan hover:bg-wuxia-cyan/20 hover:shadow-[0_0_15px_rgba(34,211,238,0.4)] transition-all flex items-center gap-2"
                                >
                                    铭刻 <span>✧</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MemoryModal;
