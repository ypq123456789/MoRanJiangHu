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

const MobileMemory: React.FC<Props> = ({
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
            rawDate: msg.gameTime || currentTime || '未知时间',
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
            timeStart: item.timeStart || '',
            timeEnd: item.timeEnd || '',
            error: ''
        });
    };

    const 保存条目编辑 = () => {
        if (!onSaveMemory) return;
        const targetId = Number(editItem.id);
        if (!Number.isFinite(targetId) || targetId < 0) {
            setEditItem((prev) => ({ ...prev, error: '条目索引无效，无法保存。' }));
            return;
        }

        const nextMemory = 复制记忆系统(memorySystem || 创建空记忆系统());
        if (editItem.tab === 'context') {
            if (targetId >= nextMemory.即时记忆.length) {
                setEditItem((prev) => ({ ...prev, error: '条目不存在，无法保存。' }));
                return;
            }
            const main = 构建即时主文本(editItem.main, editItem.timeStart, editItem.timeEnd);
            const syncedShort = 构建带时间戳的记忆条目(editItem.syncedShort, editItem.timeStart, editItem.timeEnd);
            nextMemory.即时记忆[targetId] = syncedShort
                ? (main ? `${main}${即时短期分隔标记}${syncedShort}` : syncedShort)
                : main;
        } else if (editItem.tab === 'short') {
            if (targetId >= nextMemory.短期记忆.length) {
                setEditItem((prev) => ({ ...prev, error: '条目不存在，无法保存。' }));
                return;
            }
            nextMemory.短期记忆[targetId] = 构建带时间戳的记忆条目(editItem.main, editItem.timeStart, editItem.timeEnd);
        } else if (editItem.tab === 'medium') {
            if (targetId >= nextMemory.中期记忆.length) {
                setEditItem((prev) => ({ ...prev, error: '条目不存在，无法保存。' }));
                return;
            }
            nextMemory.中期记忆[targetId] = 构建带时间戳的记忆条目(editItem.main, editItem.timeStart, editItem.timeEnd);
        } else {
            if (targetId >= nextMemory.长期记忆.length) {
                setEditItem((prev) => ({ ...prev, error: '条目不存在，无法保存。' }));
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
            setSummaryRange((prev) => ({ ...prev, error: '请输入整数区间。' }));
            return;
        }
        if (start < 1 || end < 1 || start > currentLayerLength || end > currentLayerLength) {
            setSummaryRange((prev) => ({ ...prev, error: `区间需介于 1 到 ${currentLayerLength}。` }));
            return;
        }
        setSummaryRange((prev) => ({ ...prev, error: '' }));
        onStartMemorySummary(activeTab === 'short' ? '短期' : '中期', start - 1, end - 1);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:hidden animate-fadeIn">
            <div className="bg-ink-black/95 border border-wuxia-gold/30 w-full max-w-[600px] h-[86vh] flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden rounded-2xl">
                <div className="h-12 shrink-0 border-b border-gray-800/60 bg-black/40 flex items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full border border-wuxia-gold/50 bg-wuxia-gold/10 flex items-center justify-center text-wuxia-gold font-serif font-bold">
                            忆
                        </div>
                        <div className="text-wuxia-gold font-serif font-bold text-base tracking-[0.2em]">记忆宫殿</div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-wuxia-red hover:border-wuxia-red transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="border-b border-gray-800/60 bg-black/30 px-3 py-2 overflow-x-auto no-scrollbar">
                    <div className="flex gap-2">
                        {[
                            { id: 'context', label: '即时' },
                            { id: 'short', label: '短期' },
                            { id: 'medium', label: '中期' },
                            { id: 'long', label: '长期' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabType)}
                                className={`px-3 py-1.5 text-[11px] rounded-full border transition-all ${
                                    activeTab === tab.id
                                        ? 'bg-wuxia-gold/15 text-wuxia-gold border-wuxia-gold'
                                        : 'border-gray-800 text-gray-500'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {(activeTab === 'short' || activeTab === 'medium') && onStartMemorySummary && (
                    <div className="shrink-0 border-b border-gray-800/60 bg-black/25 p-3 space-y-2">
                        <div className="text-[10px] text-gray-500">手动重总结区间，按原始顺序填写，1 = 最早。</div>
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                value={summaryRange.start}
                                onChange={(e) => setSummaryRange((prev) => ({ ...prev, start: e.target.value, error: '' }))}
                                placeholder="起始条目"
                                className="rounded border border-gray-700 bg-black/60 px-3 py-2 text-[11px] text-gray-200 outline-none"
                            />
                            <input
                                value={summaryRange.end}
                                onChange={(e) => setSummaryRange((prev) => ({ ...prev, end: e.target.value, error: '' }))}
                                placeholder="结束条目"
                                className="rounded border border-gray-700 bg-black/60 px-3 py-2 text-[11px] text-gray-200 outline-none"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={提交区间总结}
                            className="w-full px-3 py-2 text-[11px] rounded border border-wuxia-cyan/50 text-wuxia-cyan"
                        >
                            重新总结并转入{activeTab === 'short' ? '中期' : '长期'}记忆
                        </button>
                        <div className="text-[10px] text-gray-500">当前共 {currentLayerLength} 条。</div>
                        {summaryRange.error && <div className="text-[11px] text-red-300">{summaryRange.error}</div>}
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-ink-wash/5">
                    {currentData.length > 0 ? currentData.map((mem, idx) => (
                        <div key={`${activeTab}-${mem.id}-${idx}`} className="bg-black/40 border border-gray-800 rounded-xl p-4 relative">
                            {mem.rawDate && (
                                <div className="text-[9px] text-gray-500 font-mono mb-2 border-b border-gray-800/50 pb-1">
                                    {mem.rawDate}
                                </div>
                            )}
                            <p className="text-gray-300 font-serif leading-relaxed text-sm whitespace-pre-wrap">
                                {mem.content || mem.rawContent}
                            </p>
                            {activeTab === 'context' && mem.syncedShort && (
                                <div className="mt-2 border-t border-gray-800/70 pt-2">
                                    <div className="text-[10px] text-wuxia-cyan/80 mb-1">短期摘要（待转入）</div>
                                    <p className="text-[11px] text-gray-400 leading-relaxed whitespace-pre-wrap">
                                        {mem.syncedShort}
                                    </p>
                                </div>
                            )}
                            {onSaveMemory && mem.fromMemory && (
                                <button
                                    type="button"
                                    onClick={() => 打开条目编辑(mem)}
                                    className="absolute top-2 right-2 px-2 py-1 text-[10px] rounded border border-wuxia-cyan/40 text-wuxia-cyan"
                                >
                                    编辑
                                </button>
                            )}
                        </div>
                    )) : (
                        <div className="text-center py-16 text-gray-600 italic font-serif">
                            此记忆层暂无内容。
                        </div>
                    )}
                </div>

                {editItem.open && (
                    <div className="absolute inset-0 z-[80] bg-black/90 backdrop-blur-sm p-3 flex flex-col">
                        <div className="rounded-xl border border-wuxia-cyan/40 bg-black/95 flex-1 min-h-0 flex flex-col">
                            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
                                <div className="text-wuxia-cyan text-xs font-bold">编辑记忆条目</div>
                                <button
                                    type="button"
                                    onClick={() => setEditItem((prev) => ({ ...prev, open: false }))}
                                    className="px-2 py-1 text-[10px] rounded border border-gray-700 text-gray-400"
                                >
                                    关闭
                                </button>
                            </div>
                            <div className="p-3 space-y-2 flex-1 min-h-0 flex flex-col">
                                <input
                                    value={editItem.timeStart}
                                    onChange={(e) => setEditItem((prev) => ({ ...prev, timeStart: e.target.value, error: '' }))}
                                    placeholder="开始时间戳 YYYY:MM:DD:HH:MM"
                                    className="w-full rounded border border-gray-700 bg-black/80 px-3 py-2 text-[11px] text-gray-200 outline-none"
                                />
                                <input
                                    value={editItem.timeEnd}
                                    onChange={(e) => setEditItem((prev) => ({ ...prev, timeEnd: e.target.value, error: '' }))}
                                    placeholder="结束时间戳（可选）"
                                    className="w-full rounded border border-gray-700 bg-black/80 px-3 py-2 text-[11px] text-gray-200 outline-none"
                                />
                                <textarea
                                    value={editItem.main}
                                    onChange={(e) => setEditItem((prev) => ({ ...prev, main: e.target.value, error: '' }))}
                                    className="w-full flex-1 min-h-0 bg-black/80 border border-gray-700 rounded-md p-2 text-[11px] text-green-300 font-mono whitespace-pre resize-none outline-none no-scrollbar"
                                />
                                {editItem.tab === 'context' && (
                                    <textarea
                                        value={editItem.syncedShort}
                                        onChange={(e) => setEditItem((prev) => ({ ...prev, syncedShort: e.target.value, error: '' }))}
                                        className="w-full h-24 bg-black/80 border border-gray-700 rounded-md p-2 text-[11px] text-gray-300 font-mono whitespace-pre resize-none outline-none no-scrollbar"
                                        placeholder="短期摘要（将自动附加同一时间戳）"
                                    />
                                )}
                                {editItem.error && (
                                    <div className="text-[11px] text-red-300 border border-red-500/30 bg-red-950/20 rounded p-2">
                                        {editItem.error}
                                    </div>
                                )}
                                <div className="flex justify-end gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setEditItem((prev) => ({ ...prev, open: false }))}
                                        className="px-3 py-1.5 text-[11px] rounded border border-gray-700 text-gray-300"
                                    >
                                        取消
                                    </button>
                                    <button
                                        type="button"
                                        onClick={保存条目编辑}
                                        className="px-3 py-1.5 text-[11px] rounded border border-wuxia-cyan/50 text-wuxia-cyan"
                                    >
                                        保存
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MobileMemory;
