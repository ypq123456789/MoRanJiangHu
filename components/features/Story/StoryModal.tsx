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

const 字段块: React.FC<{ 标题: string; 内容: string[]; empty?: string }> = ({ 标题, 内容, empty = '暂无内容' }) => (
    <section className="rounded-2xl border border-gray-800 bg-black/35 p-4">
        <div className="text-[11px] tracking-[0.3em] text-wuxia-gold/70 mb-3">{标题}</div>
        {内容.length > 0 ? (
            <div className="space-y-2">
                {内容.map((item, idx) => (
                    <div key={`${标题}-${idx}`} className="text-sm text-gray-300 leading-7 border-l border-gray-700 pl-3">
                        {item}
                    </div>
                ))}
            </div>
        ) : (
            <div className="text-xs text-gray-600 italic">{empty}</div>
        )}
    </section>
);

const StoryModal: React.FC<Props> = ({ story, storyPlan, isFandomMode = false, onClose }) => {
    const [revealNext, setRevealNext] = React.useState(false);
    const timerRef = React.useRef<number | null>(null);

    const 当前章节 = story?.当前章节;
    const 下一章预告 = story?.下一章预告;
    const 历史卷宗 = Array.isArray(story?.历史卷宗) ? story.历史卷宗 : [];
    const 当前章任务 = Array.isArray((storyPlan as any)?.当前章任务) ? (storyPlan as any).当前章任务 : [];
    const 待触发事件 = Array.isArray((storyPlan as any)?.待触发事件) ? (storyPlan as any).待触发事件 : [];
    const 镜头规划 = Array.isArray((storyPlan as any)?.镜头规划) ? (storyPlan as any).镜头规划 : [];
    const 跨章延续事项 = Array.isArray((storyPlan as any)?.跨章延续事项) ? (storyPlan as any).跨章延续事项 : [];
    const 分歧线 = Array.isArray((storyPlan as any)?.分歧线) ? (storyPlan as any).分歧线 : [];
    const 换章规则 = (storyPlan as any)?.换章规则 || (storyPlan as any)?.换组规则;
    const 对齐信息 = (storyPlan as any)?.当前对齐信息;

    const 清理长按 = () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        setRevealNext(false);
    };

    if (!当前章节) {
        return (
            <div className="fixed inset-0 bg-black/90 z-[200] hidden md:flex items-center justify-center p-4">
                <div className="w-full max-w-3xl rounded-3xl border border-wuxia-gold/20 bg-black/90 p-8 text-center">
                    <div className="text-2xl font-serif tracking-[0.35em] text-wuxia-gold">江湖卷宗</div>
                    <div className="mt-6 text-gray-500">当前没有可展示的剧情卷宗。</div>
                    <button onClick={onClose} className="mt-6 rounded-full border border-gray-700 px-4 py-2 text-sm text-gray-300">关闭</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[200] hidden md:flex items-center justify-center p-4 animate-fadeIn">
            <div className="w-full max-w-7xl h-[90vh] rounded-3xl border border-wuxia-gold/20 bg-ink-black/95 overflow-hidden flex flex-col">
                <div className="shrink-0 border-b border-wuxia-gold/10 bg-black/50 px-6 py-4 flex items-center justify-between">
                    <div>
                        <div className="text-xl font-serif font-bold tracking-[0.35em] text-wuxia-gold">江湖卷宗</div>
                        <div className="mt-2 text-xs text-gray-400">
                            第 {当前章节.当前分解组} 组
                            <span className="mx-2 text-gray-600">|</span>
                            {isFandomMode ? '同人规划视图' : '原创规划视图'}
                        </div>
                    </div>
                    <button onClick={onClose} className="h-9 w-9 rounded-full border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-400">×</button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    <section className="rounded-3xl border border-wuxia-gold/20 bg-gradient-to-br from-black/70 to-black/35 p-6">
                        <div className="text-3xl font-serif font-bold text-wuxia-gold">{当前章节.标题}</div>
                        <div className="mt-3 grid grid-cols-2 gap-4 text-sm text-gray-400">
                            <div>当前分解组：第 {当前章节.当前分解组} 组</div>
                            <div>原著章节标题：{当前章节.原著章节标题 || '未记录'}</div>
                            <div>原著推进状态：{当前章节.原著推进状态 || '未记录'}</div>
                            <div>切章后沉淀要点：{取数组(当前章节.切章后沉淀要点).join('；') || '暂无'}</div>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <字段块 标题="已完成摘要" 内容={取数组(当前章节.已完成摘要)} />
                        <字段块 标题="当前待解问题" 内容={取数组(当前章节.当前待解问题)} />
                        <字段块 标题="原著换章条件" 内容={取数组(当前章节.原著换章条件)} />
                    </div>

                    {storyPlan && (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            <字段块 标题="当前章目标" 内容={取数组((storyPlan as any)?.当前章目标)} />
                            <字段块
                                标题={isFandomMode ? '同人对齐信息' : '换章规则'}
                                内容={
                                    isFandomMode
                                        ? [
                                            `章节范围：${对齐信息?.当前章节范围 || '未记录'}`,
                                            `承接方式：${对齐信息?.当前承接方式 || '未记录'}`,
                                            `已形成偏转：${取数组(对齐信息?.当前已形成偏转).join('；') || '暂无'}`
                                        ]
                                        : [
                                            `本章完成判定：${取数组((换章规则 as any)?.本章完成判定).join('；') || '未设定'}`,
                                            `允许切章条件：${取数组((换章规则 as any)?.允许切章条件).join('；') || '未设定'}`,
                                            `禁止切章条件：${取数组((换章规则 as any)?.禁止切章条件).join('；') || '未设定'}`
                                        ]
                                }
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <section className="rounded-2xl border border-gray-800 bg-black/35 p-4">
                            <div className="text-[11px] tracking-[0.3em] text-cyan-300/70 mb-3">任务与事件</div>
                            <div className="space-y-3">
                                {当前章任务.map((task: any, idx: number) => (
                                    <div key={`task-${idx}`} className="rounded-xl border border-gray-800 bg-black/30 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm text-gray-200 font-semibold">{task?.标题 || `任务 ${idx + 1}`}</div>
                                            <div className="text-[10px] text-gray-400">{task?.当前状态 || '未定'}</div>
                                        </div>
                                        <div className="mt-2 text-xs text-gray-400 leading-6">{task?.任务说明 || '暂无说明'}</div>
                                        <div className="mt-2 text-[10px] text-gray-500">计划执行：{task?.计划执行时间 || '未设定'}</div>
                                        <div className="mt-1 text-[10px] text-gray-500">触发条件：{取数组(task?.触发条件).join('；') || '无'}</div>
                                    </div>
                                ))}
                                {待触发事件.map((event: any, idx: number) => (
                                    <div key={`event-${idx}`} className="rounded-xl border border-cyan-900/20 bg-cyan-950/10 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm text-cyan-100 font-semibold">{event?.事件名 || `事件 ${idx + 1}`}</div>
                                            <div className="text-[10px] text-gray-400">{event?.当前状态 || '待触发'}</div>
                                        </div>
                                        <div className="mt-2 text-xs text-gray-400 leading-6">{event?.事件说明 || '暂无说明'}</div>
                                        <div className="mt-2 text-[10px] text-gray-500">时间：{event?.计划触发时间 || '未设定'} / {event?.最晚触发时间 || '未设定'}</div>
                                    </div>
                                ))}
                                {当前章任务.length === 0 && 待触发事件.length === 0 && <div className="text-xs text-gray-600 italic">暂无任务与待触发事件。</div>}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-gray-800 bg-black/35 p-4">
                            <div className="text-[11px] tracking-[0.3em] text-purple-300/70 mb-3">镜头与延续</div>
                            <div className="space-y-3">
                                {镜头规划.map((shot: any, idx: number) => (
                                    <div key={`shot-${idx}`} className="rounded-xl border border-gray-800 bg-black/30 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm text-gray-200 font-semibold">{shot?.镜头标题 || `镜头 ${idx + 1}`}</div>
                                            <div className="text-[10px] text-gray-400">{shot?.当前状态 || '待触发'}</div>
                                        </div>
                                        <div className="mt-2 text-xs text-gray-400 leading-6">{shot?.镜头内容 || '暂无内容'}</div>
                                        <div className="mt-2 text-[10px] text-gray-500">触发时间：{shot?.触发时间 || '未设定'}</div>
                                    </div>
                                ))}
                                {!isFandomMode && 跨章延续事项.map((item: any, idx: number) => (
                                    <div key={`carry-${idx}`} className="rounded-xl border border-amber-900/20 bg-amber-950/10 p-4">
                                        <div className="text-sm text-amber-100 font-semibold">{item?.标题 || `延续事项 ${idx + 1}`}</div>
                                        <div className="mt-2 text-[10px] text-gray-500">延续到何时：{item?.延续到何时 || '未定'}</div>
                                        <div className="mt-1 text-xs text-gray-400">{取数组(item?.后续接续条件).join('；') || '暂无接续条件'}</div>
                                    </div>
                                ))}
                                {isFandomMode && 分歧线.map((line: any, idx: number) => (
                                    <div key={`branch-${idx}`} className="rounded-xl border border-purple-900/20 bg-purple-950/10 p-4">
                                        <div className="text-sm text-purple-100 font-semibold">{line?.分歧线名 || `分歧线 ${idx + 1}`}</div>
                                        <div className="mt-2 text-xs text-gray-400 leading-6">
                                            与原著不同：{取数组(line?.与原著不同之处).join('；') || '暂无'}
                                        </div>
                                    </div>
                                ))}
                                {镜头规划.length === 0 && 跨章延续事项.length === 0 && 分歧线.length === 0 && <div className="text-xs text-gray-600 italic">暂无镜头与延续内容。</div>}
                            </div>
                        </section>
                    </div>

                    <section
                        className="rounded-3xl border border-red-900/25 bg-gradient-to-br from-black/70 to-red-950/10 p-6 relative select-none"
                        onMouseDown={() => {
                            if (timerRef.current) window.clearTimeout(timerRef.current);
                            timerRef.current = window.setTimeout(() => setRevealNext(true), 400);
                        }}
                        onMouseUp={清理长按}
                        onMouseLeave={清理长按}
                        onTouchStart={() => {
                            if (timerRef.current) window.clearTimeout(timerRef.current);
                            timerRef.current = window.setTimeout(() => setRevealNext(true), 400);
                        }}
                        onTouchEnd={清理长按}
                        onTouchCancel={清理长按}
                    >
                        {!revealNext && (
                            <div className="absolute inset-0 rounded-3xl backdrop-blur-[8px] bg-black/70 flex flex-col items-center justify-center z-10">
                                <div className="text-sm tracking-[0.35em] text-gray-400">天机不可泄露</div>
                                <div className="mt-2 text-[10px] text-gray-600">长按查看下一章内容</div>
                            </div>
                        )}
                        <div className={revealNext ? 'opacity-100' : 'opacity-40 blur-[3px]'}>
                            <div className="text-2xl font-serif font-bold text-red-300">{下一章预告?.标题 || '未卜先知'}</div>
                            <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <字段块 标题="大纲" 内容={取数组(下一章预告?.大纲)} empty="暂无大纲" />
                                <字段块 标题="进入条件" 内容={取数组(下一章预告?.进入条件)} empty="暂无进入条件" />
                                <字段块 标题="风险提示" 内容={取数组(下一章预告?.风险提示)} empty="暂无风险提示" />
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-gray-800 bg-black/35 p-4">
                        <div className="text-[11px] tracking-[0.3em] text-gray-400 mb-3">历史卷宗</div>
                        {历史卷宗.length > 0 ? (
                            <div className="space-y-3">
                                {[...历史卷宗].reverse().map((item, idx) => (
                                    <div key={`arc-${idx}`} className="rounded-xl border border-gray-800 bg-black/30 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm text-gray-200 font-semibold">{item.标题}</div>
                                            <div className="text-[10px] text-gray-500">{item.记录时间 || '未知时间'}</div>
                                        </div>
                                        <div className="mt-2 text-xs text-gray-400 leading-6">{取数组(item.章节总结).join('；') || '暂无总结'}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-gray-600 italic">尚无历史卷宗。</div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};

export default StoryModal;
