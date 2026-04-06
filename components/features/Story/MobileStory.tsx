import React from 'react';
import { 剧情系统结构 } from '../../../models/story';
import { 剧情规划结构 } from '../../../models/storyPlan';
import { 同人剧情规划结构 } from '../../../models/fandomPlanning/story';

interface Props {
    story: 剧情系统结构;
    storyPlan?: 剧情规划结构 | 同人剧情规划结构;
    isFandomMode?: boolean;
    onClose: () => void;
}

const 取数组 = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const MobileStory: React.FC<Props> = ({ story, storyPlan, isFandomMode = false, onClose }) => {
    const [revealNext, setRevealNext] = React.useState(false);
    const pressTimerRef = React.useRef<number | null>(null);

    const 当前章节 = story?.当前章节;
    const 历史卷宗 = Array.isArray(story?.历史卷宗) ? story.历史卷宗 : [];
    const 下一章预告 = story?.下一章预告;
    const 当前章任务 = Array.isArray((storyPlan as any)?.当前章任务) ? (storyPlan as any).当前章任务 : [];
    const 待触发事件 = Array.isArray((storyPlan as any)?.待触发事件) ? (storyPlan as any).待触发事件 : [];
    const 镜头规划 = Array.isArray((storyPlan as any)?.镜头规划) ? (storyPlan as any).镜头规划 : [];
    const 跨章延续事项 = Array.isArray((storyPlan as any)?.跨章延续事项) ? (storyPlan as any).跨章延续事项 : [];
    const 分歧线 = Array.isArray((storyPlan as any)?.分歧线) ? (storyPlan as any).分歧线 : [];

    const 清理长按状态 = () => {
        if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
        setRevealNext(false);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:hidden animate-fadeIn">
            <div className="bg-ink-black/95 border border-wuxia-gold/30 w-full max-w-[640px] h-[86vh] flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden rounded-2xl">
                <div className="h-12 shrink-0 border-b border-gray-800/60 bg-black/40 flex items-center justify-between px-4">
                    <div>
                        <div className="text-wuxia-gold font-serif font-bold text-base tracking-[0.2em]">江湖卷宗</div>
                        <div className="text-[9px] text-gray-500 font-mono mt-0.5">
                            {isFandomMode ? '同人规划' : '原创规划'} · {当前章节?.标题 || '未开启'}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-wuxia-red hover:border-wuxia-red transition-all"
                    >
                        ×
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-ink-wash/5">
                    {当前章节 ? (
                        <>
                            <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
                                <div className="text-xl text-wuxia-gold font-serif font-bold mb-2">{当前章节.标题}</div>
                                <div className="space-y-2 text-[11px] text-gray-400">
                                    <div>当前分解组：第 {当前章节.当前分解组} 组</div>
                                    <div>原著章节标题：{当前章节.原著章节标题 || '未记录'}</div>
                                    <div>原著推进状态：{当前章节.原著推进状态 || '未记录'}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
                                    <div className="text-[10px] text-wuxia-cyan/70 tracking-[0.3em] mb-2">已完成摘要 / 待解问题</div>
                                    <div className="space-y-3">
                                        <div>
                                            <div className="text-[10px] text-gray-500 mb-1">已完成摘要</div>
                                            <div className="text-[11px] text-gray-300 leading-6">{取数组(当前章节.已完成摘要).join('；') || '暂无'}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-gray-500 mb-1">当前待解问题</div>
                                            <div className="text-[11px] text-gray-300 leading-6">{取数组(当前章节.当前待解问题).join('；') || '暂无'}</div>
                                        </div>
                                    </div>
                                </div>

                                {storyPlan && (
                                    <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
                                        <div className="text-[10px] text-wuxia-gold/70 tracking-[0.3em] mb-2">当前章目标</div>
                                        <div className="text-[11px] text-gray-300 leading-6">{取数组((storyPlan as any)?.当前章目标).join('；') || '暂无目标'}</div>
                                    </div>
                                )}

                                <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
                                    <div className="text-[10px] text-wuxia-cyan/80 tracking-[0.3em] mb-2">任务与待触发</div>
                                    <div className="space-y-2">
                                        {当前章任务.map((task: any, idx: number) => (
                                            <div key={`task-${idx}`} className="bg-black/30 border border-gray-800 rounded-lg p-3">
                                                <div className="text-[12px] text-gray-200 font-serif font-bold">{task?.标题 || `任务 ${idx + 1}`}</div>
                                                <div className="text-[10px] text-gray-500 mt-1">计划执行：{task?.计划执行时间 || '未设定'} · {task?.当前状态 || '未定'}</div>
                                                <div className="text-[11px] text-gray-400 mt-1">{task?.任务说明 || '暂无说明'}</div>
                                            </div>
                                        ))}
                                        {待触发事件.map((event: any, idx: number) => (
                                            <div key={`event-${idx}`} className="bg-cyan-950/20 border border-cyan-900/30 rounded-lg p-3">
                                                <div className="text-[12px] text-cyan-100 font-serif font-bold">{event?.事件名 || `事件 ${idx + 1}`}</div>
                                                <div className="text-[10px] text-gray-500 mt-1">触发时间：{event?.计划触发时间 || '未设定'} · {event?.当前状态 || '待触发'}</div>
                                                <div className="text-[11px] text-gray-400 mt-1">{event?.事件说明 || '暂无说明'}</div>
                                            </div>
                                        ))}
                                        {当前章任务.length === 0 && 待触发事件.length === 0 && (
                                            <div className="text-[11px] text-gray-600 italic">暂无任务与待触发事件。</div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
                                    <div className="text-[10px] text-purple-300/80 tracking-[0.3em] mb-2">镜头与延续</div>
                                    <div className="space-y-2">
                                        {镜头规划.map((shot: any, idx: number) => (
                                            <div key={`shot-${idx}`} className="bg-black/30 border border-gray-800 rounded-lg p-3">
                                                <div className="text-[12px] text-gray-200 font-serif font-bold">{shot?.镜头标题 || `镜头 ${idx + 1}`}</div>
                                                <div className="text-[10px] text-gray-500 mt-1">触发时间：{shot?.触发时间 || '未设定'} · {shot?.当前状态 || '待触发'}</div>
                                                <div className="text-[11px] text-gray-400 mt-1">{shot?.镜头内容 || '暂无内容'}</div>
                                            </div>
                                        ))}
                                        {!isFandomMode && 跨章延续事项.map((item: any, idx: number) => (
                                            <div key={`carry-${idx}`} className="bg-amber-950/20 border border-amber-900/30 rounded-lg p-3">
                                                <div className="text-[12px] text-amber-100 font-serif font-bold">{item?.标题 || `延续事项 ${idx + 1}`}</div>
                                                <div className="text-[10px] text-gray-500 mt-1">延续到何时：{item?.延续到何时 || '未定'}</div>
                                            </div>
                                        ))}
                                        {isFandomMode && 分歧线.map((item: any, idx: number) => (
                                            <div key={`branch-${idx}`} className="bg-purple-950/20 border border-purple-900/30 rounded-lg p-3">
                                                <div className="text-[12px] text-purple-100 font-serif font-bold">{item?.分歧线名 || `分歧线 ${idx + 1}`}</div>
                                                <div className="text-[11px] text-gray-400 mt-1">{取数组(item?.与原著不同之处).join('；') || '暂无差异说明'}</div>
                                            </div>
                                        ))}
                                        {镜头规划.length === 0 && 跨章延续事项.length === 0 && 分歧线.length === 0 && (
                                            <div className="text-[11px] text-gray-600 italic">暂无镜头与延续内容。</div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
                                    <div className="text-[10px] text-wuxia-gold/70 tracking-[0.3em] mb-2">历史卷宗</div>
                                    <div className="space-y-2">
                                        {历史卷宗.length > 0 ? [...历史卷宗].reverse().map((arc, idx) => (
                                            <div key={`arc-${idx}`} className="border-l border-gray-800 pl-3">
                                                <div className="text-[11px] text-gray-200 font-serif font-bold">{arc.标题}</div>
                                                <div className="text-[10px] text-gray-500">{取数组(arc.章节总结).join('；') || '暂无总结'}</div>
                                            </div>
                                        )) : <div className="text-[11px] text-gray-600 italic">尚无过往之事。</div>}
                                    </div>
                                </div>

                                <div className="bg-black/40 border border-gray-800 rounded-xl p-4 text-center">
                                    <div className="text-[10px] text-gray-500 tracking-[0.3em] mb-2">下一章预告</div>
                                    <div
                                        className="relative overflow-hidden rounded-lg border border-gray-800 bg-black/30 px-3 py-4 select-none"
                                        onMouseDown={() => {
                                            if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
                                            pressTimerRef.current = window.setTimeout(() => setRevealNext(true), 450);
                                        }}
                                        onMouseUp={清理长按状态}
                                        onMouseLeave={清理长按状态}
                                        onTouchStart={() => {
                                            if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
                                            pressTimerRef.current = window.setTimeout(() => setRevealNext(true), 450);
                                        }}
                                        onTouchEnd={清理长按状态}
                                        onTouchCancel={清理长按状态}
                                    >
                                        {!revealNext && (
                                            <div className="absolute inset-0 backdrop-blur-[6px] bg-black/40 flex flex-col items-center justify-center text-center">
                                                <div className="text-[9px] text-gray-400 tracking-[0.35em] border border-gray-700 px-3 py-1 rounded">天机不可泄露</div>
                                                <div className="mt-1 text-[9px] text-gray-500">长按查看原文</div>
                                            </div>
                                        )}
                                        <div className={`transition-all ${revealNext ? 'blur-0 opacity-100' : 'blur-[2px] opacity-60'}`}>
                                            <div className="text-sm text-gray-200 font-serif font-bold mb-1">{下一章预告?.标题 || '未卜先知'}</div>
                                            <div className="text-[11px] text-gray-500 leading-6">{取数组(下一章预告?.大纲).join('；') || '暂无预告大纲'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-black/40 border border-gray-800 rounded-xl px-4 py-10 text-center text-gray-600 text-sm">
                            当前无剧情卷宗数据
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MobileStory;
