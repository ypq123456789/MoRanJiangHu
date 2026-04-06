import React, { useState } from 'react';
import { 任务结构, 任务类型 } from '../../../models/task';

interface Props {
    tasks: 任务结构[];
    onDeleteTask?: (taskIndex: number) => void;
    onClose: () => void;
}

const MobileTask: React.FC<Props> = ({ tasks, onDeleteTask, onClose }) => {
    const [filter, setFilter] = useState<任务类型 | '全部'>('全部');
    const [selectedIdx, setSelectedIdx] = useState<number>(0);
    const safeTasks = Array.isArray(tasks) ? tasks : [];

    const filteredTaskEntries = safeTasks
        .map((task, index) => ({ task, originalIndex: index }))
        .filter(({ task }) => filter === '全部' || task.类型 === filter);

    const currentTaskEntry = filteredTaskEntries[selectedIdx];
    const currentTask = currentTaskEntry?.task;
    const currentTaskOriginalIndex = currentTaskEntry?.originalIndex ?? -1;
    const currentObjectives = Array.isArray(currentTask?.目标列表) ? currentTask.目标列表 : [];

    const getStatusColor = (status: string) => {
        switch (status) {
            case '进行中': return 'text-wuxia-gold';
            case '可提交': return 'text-green-400';
            case '已完成': return 'text-gray-400';
            case '已失败': return 'text-red-500';
            default: return 'text-gray-500';
        }
    };

    const getTypeLabelColor = (type: string) => {
        switch (type) {
            case '主线': return 'bg-wuxia-red/20 text-wuxia-red border-wuxia-red/50';
            case '支线': return 'bg-blue-900/20 text-blue-300 border-blue-900/50';
            case '门派': return 'bg-green-900/20 text-green-300 border-green-900/50';
            default: return 'bg-gray-800 text-gray-400 border-gray-700';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:hidden animate-fadeIn">
            <div className="bg-ink-black/95 border border-wuxia-gold/30 w-full max-w-[620px] h-[86vh] flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden rounded-2xl">
                <div className="h-12 shrink-0 border-b border-gray-800/60 bg-black/40 flex items-center justify-between px-4">
                    <h3 className="text-wuxia-gold font-serif font-bold text-base tracking-[0.3em]">江湖传书</h3>
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
                        {['全部', '主线', '支线', '门派', '奇遇'].map(t => (
                            <button
                                key={t}
                                onClick={() => { setFilter(t as any); setSelectedIdx(0); }}
                                className={`px-3 py-1.5 text-[11px] rounded-full border transition-colors ${
                                    filter === t
                                        ? 'bg-wuxia-gold/15 text-wuxia-gold border-wuxia-gold'
                                        : 'text-gray-500 border-gray-800'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-ink-wash/5">
                    {currentTask ? (
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-lg text-wuxia-gold font-serif font-bold">{currentTask.标题}</div>
                                    <div className="text-[10px] text-gray-500 mt-1">发布人 {currentTask.发布人} · {currentTask.发布地点}</div>
                                </div>
                                <div className="flex items-start gap-2">
                                    {onDeleteTask && currentTaskOriginalIndex >= 0 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onDeleteTask(currentTaskOriginalIndex);
                                                setSelectedIdx(prev => {
                                                    if (filteredTaskEntries.length <= 1) return 0;
                                                    return Math.max(0, Math.min(prev, filteredTaskEntries.length - 2));
                                                });
                                            }}
                                            className="px-2 py-1 rounded border border-red-900/50 bg-red-950/20 text-[10px] text-red-300"
                                        >
                                            删除
                                        </button>
                                    )}
                                    <div className={`text-[11px] ${getStatusColor(currentTask.当前状态)}`}>{currentTask.当前状态}</div>
                                </div>
                            </div>
                            <div className="text-[10px] text-gray-500">
                                推荐境界 <span className="text-wuxia-cyan">{currentTask.推荐境界}</span>
                            </div>
                            <p className="text-sm text-gray-300 font-serif leading-relaxed">“{currentTask.描述}”</p>
                            <div className="flex gap-2 flex-wrap">
                                <span className={`text-[9px] px-2 py-0.5 rounded border ${getTypeLabelColor(currentTask.类型)}`}>{currentTask.类型}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-gray-600 text-sm">暂无选中任务</div>
                    )}

                    {currentTask && (
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-4 space-y-3">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest">当前目标</div>
                            {currentObjectives.map((obj, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                                        obj.完成状态 ? 'bg-wuxia-gold border-wuxia-gold text-black' : 'border-gray-600 text-transparent'
                                    }`}>
                                        ✓
                                    </div>
                                    <div className="flex-1">
                                        <div className={`text-[11px] ${obj.完成状态 ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                                            {obj.描述}
                                        </div>
                                        <div className="mt-1 h-1.5 w-full bg-gray-900 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-500 ${obj.完成状态 ? 'bg-green-500' : 'bg-wuxia-gold'}`}
                                                style={{ width: `${Math.min((obj.当前进度 / (obj.总需进度 || 1)) * 100, 100)}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-mono text-gray-500 min-w-[46px] text-right">
                                        {obj.当前进度}/{obj.总需进度}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-2">
                        {filteredTaskEntries.map(({ task }, idx) => {
                            const isSelected = idx === selectedIdx;
                            return (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedIdx(idx)}
                                    className={`w-full text-left p-3 border rounded-lg transition-all ${
                                        isSelected ? 'border-wuxia-gold/50 bg-wuxia-gold/5' : 'border-gray-800 bg-white/[0.02] hover:bg-white/[0.05]'
                                    }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`font-bold font-serif text-sm ${isSelected ? 'text-wuxia-gold' : 'text-gray-300'}`}>
                                            {task.标题}
                                        </span>
                                        <span className={`text-[10px] ${getStatusColor(task.当前状态)}`}>{task.当前状态}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] px-1.5 rounded border ${getTypeLabelColor(task.类型)}`}>
                                            {task.类型}
                                        </span>
                                        <span className="text-[10px] text-gray-500 truncate">
                                            {task.发布人} · {task.发布地点}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                        {filteredTaskEntries.length === 0 && (
                            <div className="text-center text-gray-600 text-xs py-10">暂无此类任务</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MobileTask;
