import React, { useState } from 'react';
import { 任务结构, 任务类型 } from '../../../models/task';
import { IconBackpack, IconTarget, IconCoins, IconScroll } from '../../ui/Icons';

interface Props {
    tasks: 任务结构[];
    onDeleteTask?: (taskIndex: number) => void;
    onClose: () => void;
}

const TaskModal: React.FC<Props> = ({ tasks, onDeleteTask, onClose }) => {
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
    const currentRewards = Array.isArray(currentTask?.奖励描述) ? currentTask.奖励描述 : [];

    const getStatusTheme = (status: string) => {
        switch(status) {
            case '进行中': return { text: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' };
            case '可提交': return { text: 'text-wuxia-gold', border: 'border-wuxia-gold/50', bg: 'bg-wuxia-gold/20' };
            case '已完成': return { text: 'text-emerald-500', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' };
            case '已失败': return { text: 'text-red-500', border: 'border-red-500/30', bg: 'bg-red-500/10' };
            default: return { text: 'text-gray-500', border: 'border-gray-500/30', bg: 'bg-gray-500/10' };
        }
    };

    const getTypeTheme = (type: string) => {
        switch(type) {
            case '主线': return { text: 'text-red-400', border: 'border-red-900/50', bg: 'bg-red-950/40', shadow: 'shadow-[0_0_10px_rgba(220,38,38,0.2)]' };
            case '支线': return { text: 'text-blue-300', border: 'border-blue-900/50', bg: 'bg-blue-900/20', shadow: 'shadow-[0_0_10px_rgba(59,130,246,0.1)]' };
            case '门派': return { text: 'text-emerald-300', border: 'border-emerald-900/50', bg: 'bg-emerald-900/20', shadow: 'shadow-[0_0_10px_rgba(16,185,129,0.1)]' };
            case '奇遇': return { text: 'text-purple-300', border: 'border-purple-900/50', bg: 'bg-purple-900/20', shadow: 'shadow-[0_0_10px_rgba(168,85,247,0.1)]' };
            default: return { text: 'text-gray-400', border: 'border-gray-700/50', bg: 'bg-gray-800/40', shadow: '' };
        }
    };

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[200] hidden md:flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-ink-black/95 w-full max-w-7xl max-h-[90vh] h-[90vh] flex flex-col rounded-2xl border border-wuxia-gold/20 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 relative overflow-hidden">
                
                {/* 背景装饰 */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[url('/assets/images/ui/paper-texture.png')] opacity-[0.03] mix-blend-overlay"></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-red-900/5 via-transparent to-black"></div>
                </div>

                {/* 顶栏 */}
                <div className="h-14 shrink-0 border-b border-wuxia-gold/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-6 relative z-50">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.8)]"></div>
                        <h3 className="text-wuxia-gold font-serif font-bold text-xl tracking-[0.4em] drop-shadow-md">
                            江湖传书
                            <span className="text-[10px] text-wuxia-gold/50 ml-2 font-mono tracking-widest border border-wuxia-gold/20 px-2 py-0.5 rounded-full">MISSIONS & LETTERS</span>
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

                <div className="flex-1 flex overflow-hidden relative z-10">
                    {/* 左侧：委派任务列表 */}
                    <div className="w-[340px] shrink-0 border-r border-wuxia-gold/10 bg-black/40 backdrop-blur-sm flex flex-col relative overflow-hidden">
                        
                        {/* 过滤分类 */}
                        <div className="p-3 border-b border-wuxia-gold/10 bg-black/60 shadow-md">
                            <div className="flex flex-wrap gap-1.5 pb-1">
                                {['全部', '主线', '支线', '门派', '奇遇'].map(t => (
                                    <button
                                        key={t}
                                        onClick={() => { setFilter(t as any); setSelectedIdx(0); }}
                                        className={`px-3 py-1.5 text-xs whitespace-nowrap rounded font-serif tracking-widest transition-all ${
                                            filter === t 
                                            ? 'bg-wuxia-gold/20 text-wuxia-gold border border-wuxia-gold/40 shadow-inner' 
                                            : 'text-gray-500 hover:text-gray-300 border border-transparent hover:border-white/10'
                                        }`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 列表项 */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            {filteredTaskEntries.map(({ task }, idx) => {
                                const isSelected = idx === selectedIdx;
                                const statusTheme = getStatusTheme(task.当前状态);
                                const typeTheme = getTypeTheme(task.类型);

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedIdx(idx)}
                                        className={`w-full text-left p-4 rounded-xl transition-all duration-300 relative group overflow-hidden border flex flex-col gap-2 ${
                                            isSelected 
                                            ? 'border-wuxia-gold/40 bg-gradient-to-r from-wuxia-gold/10 to-black shadow-[0_0_15px_rgba(212,175,55,0.1)]' 
                                            : 'border-white/5 bg-black/40 hover:border-wuxia-gold/20 hover:bg-white/5'
                                        }`}
                                    >
                                        {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>}
                                        
                                        <div className="flex justify-between items-start mb-1 w-full gap-2 relative z-10">
                                            <div className="flex-1 min-w-0">
                                                <div className={`font-serif text-lg truncate ${isSelected ? 'text-wuxia-gold font-bold drop-shadow-sm' : 'text-gray-200'}`}>
                                                    {task.标题}
                                                </div>
                                            </div>
                                            <div className={`shrink-0 text-[10px] px-2 py-0.5 rounded font-serif shadow-inner border ${statusTheme.text} ${statusTheme.bg} ${statusTheme.border}`}>
                                                {task.当前状态}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 w-full relative z-10 mt-1">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-serif tracking-widest ${typeTheme.text} ${typeTheme.bg} ${typeTheme.border} ${typeTheme.shadow}`}>
                                                {task.类型}
                                            </span>
                                            <div className="text-xs text-gray-500 truncate font-serif">
                                                <span className="text-gray-400">{task.发布人}</span> <span className="opacity-50 mx-1">·</span> {task.发布地点}
                                            </div>
                                        </div>
                                        
                                        {/* 信封/卷宗背影装饰 */}
                                        <div className="absolute right-0 bottom-0 text-6xl text-wuxia-gold opacity-[0.02] transform translate-y-3 translate-x-2 select-none pointer-events-none group-hover:opacity-[0.05] transition-opacity font-serif">
                                            令
                                        </div>
                                    </button>
                                );
                            })}
                            {filteredTaskEntries.length === 0 && (
                                <div className="text-center text-wuxia-gold/40 font-serif text-lg py-20 tracking-widest border border-dashed border-wuxia-gold/10 rounded-xl bg-black/20 m-2 flex flex-col items-center">
                                    <IconBackpack size={48} className="mb-4 opacity-50" />
                                    天下太平，并无琐事
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右侧：任务详情内容区 */}
                    <div className="flex-1 p-8 overflow-y-auto relative" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {/* 页面装饰底纹 */}
                        <div className="absolute right-0 top-0 text-[400px] text-red-900 opacity-[0.02] font-serif select-none pointer-events-none leading-none -mt-10 -mr-10">
                            急
                        </div>

                        {currentTask ? (
                            <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn relative z-10">

                                {/* 标题与状态 */}
                                <div className="border-b-2 border-red-900/30 pb-6 relative">
                                    <div className="absolute right-0 top-0 bottom-0 flex items-center pr-4">
                                        <div className={`text-5xl font-serif font-bold opacity-30 select-none transform rotate-12 drop-shadow-2xl ${getStatusTheme(currentTask.当前状态).text}`}>
                                            {currentTask.当前状态}
                                            <div className="absolute inset-0 border-4 rounded-[50%] opacity-50 transform scale-125 border-current"></div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-5 h-5 bg-gradient-to-br from-red-600 to-red-900 rounded-sm shadow-[0_0_15px_rgba(220,38,38,0.5)] border border-red-400/50 rotate-45 flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                                        </div>
                                        <h2 className="text-4xl font-black font-serif text-gray-100 tracking-wider drop-shadow-lg">{currentTask.标题}</h2>
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-4 text-sm font-serif mt-6">
                                        <div className="flex bg-black/40 border border-gray-800 rounded shadow-inner overflow-hidden">
                                            <div className="bg-gray-900/50 px-3 py-1.5 border-r border-gray-800 text-gray-500">飞鸽传书</div>
                                            <div className="px-3 py-1.5 text-gray-200">{currentTask.发布人}</div>
                                        </div>
                                        <div className="flex bg-black/40 border border-gray-800 rounded shadow-inner overflow-hidden">
                                            <div className="bg-gray-900/50 px-3 py-1.5 border-r border-gray-800 text-gray-500">事发之地</div>
                                            <div className="px-3 py-1.5 text-gray-200">{currentTask.发布地点}</div>
                                        </div>
                                        <div className="flex bg-black/40 border border-gray-800 rounded shadow-inner overflow-hidden">
                                            <div className="bg-gray-900/50 px-3 py-1.5 border-r border-gray-800 text-gray-500">建议修为</div>
                                            <div className="px-3 py-1.5 text-amber-200">{currentTask.推荐境界 || '随缘而去'}</div>
                                        </div>
                                        
                                        <div className="flex-1 text-right">
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
                                                    className="px-4 py-1.5 rounded border border-red-900/50 bg-red-950/20 text-xs text-red-400 font-serif tracking-widest hover:border-red-500 hover:text-red-300 hover:bg-red-900/40 transition-colors shadow-sm"
                                                >
                                                    撕毁传书
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* 任务详情 */}
                                <div className="bg-gradient-to-b from-black/20 to-black/40 p-6 rounded-xl border border-wuxia-gold/10 relative shadow-inner">
                                    <div className="absolute -left-3 -top-3 text-3xl text-wuxia-gold/30 font-serif pointer-events-none">❝</div>
                                    <h4 className="flex items-center gap-2 text-wuxia-gold/60 font-serif text-sm tracking-widest font-bold mb-4 border-b border-wuxia-gold/10 pb-2">
                                        <span className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/50"></span>
                                        细则始末
                                    </h4>
                                    <p className="text-gray-300 font-serif leading-loose text-base tracking-wide indent-8 px-2 relative z-10">
                                        {currentTask.描述}
                                    </p>
                                    <div className="absolute -right-3 -bottom-5 text-3xl text-wuxia-gold/30 font-serif pointer-events-none">❞</div>
                                </div>

                                {/* 行动目标 */}
                                <div className="bg-gradient-to-br from-black/60 to-black/30 p-6 rounded-2xl border border-gray-800 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                                    <h4 className="flex items-center gap-2 text-gray-400 font-serif text-sm tracking-widest font-bold mb-5 border-b border-gray-800 pb-2">
                                        <IconTarget size={20} className="text-wuxia-gold/80" />
                                        前路指引
                                        <div className="h-px bg-gradient-to-r from-gray-800 to-transparent flex-1 ml-4"></div>
                                    </h4>
                                    <div className="space-y-4 px-2">
                                        {currentObjectives.map((obj, i) => {
                                            const isComplete = obj.完成状态;
                                            const progressPct = Math.min((obj.当前进度 / (obj.总需进度 || 1)) * 100, 100);
                                            return (
                                                <div key={i} className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                                                    isComplete 
                                                    ? 'bg-emerald-950/10 border-emerald-900/20 opacity-80' 
                                                    : 'bg-black/50 border-gray-800 shadow-inner'
                                                }`}>
                                                    <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center border-2 shrink-0 ${
                                                        isComplete 
                                                        ? 'bg-emerald-600 border-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                                                        : 'border-gray-600 text-transparent'
                                                    }`}>
                                                        {isComplete && <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className={`text-base font-serif leading-relaxed mb-2 ${isComplete ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                                                            {obj.描述}
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-1.5 flex-1 bg-black rounded-full overflow-hidden border border-white/5">
                                                                <div 
                                                                    className={`h-full transition-all duration-1000 ease-out ${isComplete ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]' : 'bg-wuxia-gold shadow-[0_0_5px_rgba(212,175,55,0.8)]'}`} 
                                                                    style={{ width: `${progressPct}%` }}
                                                                ></div>
                                                            </div>
                                                            <div className={`text-xs font-mono w-16 text-right ${isComplete ? 'text-emerald-500' : 'text-wuxia-gold'}`}>
                                                                {obj.当前进度} / {obj.总需进度}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 酬劳奖励 */}
                                <div className="bg-black/40 p-6 rounded-2xl border border-wuxia-gold/10">
                                    <h4 className="flex items-center gap-2 text-wuxia-gold/80 font-serif text-sm tracking-widest font-bold mb-4 border-b border-wuxia-gold/10 pb-2">
                                        <IconCoins size={20} />
                                        论功行赏
                                        <div className="h-px bg-gradient-to-r from-wuxia-gold/20 to-transparent flex-1 ml-4"></div>
                                    </h4>
                                    <div className="flex flex-wrap gap-3 px-2">
                                        {currentRewards.map((reward, i) => (
                                            <div key={i} className="flex items-center gap-2 bg-gradient-to-r from-wuxia-gold/20 to-wuxia-gold/5 border border-wuxia-gold/30 px-4 py-2 rounded-lg text-wuxia-gold text-sm font-serif shadow-sm hover:border-wuxia-gold/60 transition-colors">
                                                <span className="w-1.5 h-1.5 bg-wuxia-gold rounded-sm rotate-45 shadow-[0_0_5px_rgba(212,175,55,0.8)]"></span>
                                                {reward}
                                            </div>
                                        ))}
                                        {currentRewards.length === 0 && (
                                            <div className="text-sm font-serif text-gray-500 italic px-2 py-1 border border-dashed border-gray-700 rounded w-full text-center">
                                                此事全凭义气，并无俗物相赠
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 截止日期印章 */}
                                {currentTask.截止时间 && (
                                    <div className="mt-8 pt-6 border-t border-gray-800 flex justify-end relative z-10">
                                        <div className="inline-flex items-center gap-3 border-2 border-red-900/50 bg-red-950/10 px-6 py-2 rounded shadow-sm transform -rotate-2">
                                            <span className="text-red-500 text-xl font-serif">印</span>
                                            <div className="flex flex-col text-red-500/80 font-serif">
                                                <span className="text-[10px] uppercase tracking-widest mb-0.5">大限将至</span>
                                                <span className="font-mono text-sm">{currentTask.截止时间}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div className="h-10"></div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-wuxia-gold/30 font-serif gap-6 relative z-10">
                                <IconScroll size={120} className="opacity-20 drop-shadow-2xl" />
                                <span className="text-2xl tracking-[0.3em] font-bold">天下风云，尽在此案</span>
                                <span className="text-sm text-gray-500 tracking-widest">请在左侧拣选密函卷宗</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaskModal;
