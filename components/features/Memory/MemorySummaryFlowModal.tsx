import React from 'react';

type 阶段类型 = 'remind' | 'processing' | 'review';

interface 任务快照 {
    来源层: '短期' | '中期';
    目标层: '中期' | '长期';
    批次条数: number;
    起始索引?: number;
    结束索引?: number;
    起始时间: string;
    结束时间: string;
    触发方式?: 'auto' | 'manual';
}

interface Props {
    open: boolean;
    stage: 阶段类型;
    task: 任务快照 | null;
    draft: string;
    error?: string;
    onStart: () => void;
    onCancel: () => void;
    onBack: () => void;
    onDraftChange: (next: string) => void;
    onApply: () => void;
}

const 记忆层标签 = (layer: '短期' | '中期' | '长期') => {
    if (layer === '短期') return '短期记忆';
    if (layer === '中期') return '中期记忆';
    return '长期记忆';
};

const MemorySummaryFlowModal: React.FC<Props> = ({
    open,
    stage,
    task,
    draft,
    error,
    onStart,
    onCancel,
    onBack,
    onDraftChange,
    onApply
}) => {
    if (!open || !task) return null;

    const source = 记忆层标签(task.来源层);
    const target = 记忆层标签(task.目标层);

    return (
        <div className="fixed inset-0 z-[230] bg-black/75 backdrop-blur-sm hidden md:flex items-center justify-center p-3">
            <div className="w-full max-w-3xl rounded-2xl border border-wuxia-gold/30 bg-ink-black/95 shadow-[0_20px_60px_rgba(0,0,0,0.7)] overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800/80 bg-black/40 flex items-center justify-between">
                    <div className="text-wuxia-gold font-serif font-bold tracking-widest text-sm md:text-base">
                        记忆总结流程
                    </div>
                    {stage !== 'processing' && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-2 py-1 text-[11px] rounded border border-gray-700 text-gray-400 hover:text-white"
                        >
                            关闭
                        </button>
                    )}
                </div>

                <div className="p-4 md:p-5 space-y-4">
                    <div className="text-xs text-gray-400 leading-relaxed">
                        当前任务：{source} {'->'} {target}，共 {task.批次条数} 条，时间范围 {task.起始时间} - {task.结束时间}
                        {task.触发方式 === 'manual' && typeof task.起始索引 === 'number' && typeof task.结束索引 === 'number'
                            ? `，手动区间 ${task.起始索引 + 1} - ${task.结束索引 + 1}`
                            : ''}
                    </div>

                    {stage === 'remind' && (
                        <div className="space-y-4">
                            <div className="rounded-lg border border-wuxia-cyan/30 bg-wuxia-cyan/5 p-3 text-sm text-gray-200 leading-relaxed">
                                检测到记忆达到压缩阈值，需要先执行总结，再写入下一层记忆。
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="px-4 py-2 text-xs rounded border border-gray-700 text-gray-300 hover:bg-white/5"
                                >
                                    稍后处理
                                </button>
                                <button
                                    type="button"
                                    onClick={onStart}
                                    className="px-4 py-2 text-xs rounded border border-wuxia-gold/50 text-wuxia-gold hover:bg-wuxia-gold/10"
                                >
                                    确认并开始总结
                                </button>
                            </div>
                        </div>
                    )}

                    {stage === 'processing' && (
                        <div className="py-8 flex flex-col items-center justify-center gap-3">
                            <div className="w-9 h-9 border-2 border-wuxia-gold/40 border-t-wuxia-gold rounded-full animate-spin" />
                            <div className="text-sm text-gray-300">正在生成记忆总结，请稍候...</div>
                            <div className="text-[11px] text-gray-500">完成后将进入确认与修改阶段</div>
                        </div>
                    )}

                    {stage === 'review' && (
                        <div className="space-y-3">
                            {error && (
                                <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200 whitespace-pre-wrap">
                                    {error}
                                </div>
                            )}

                            <textarea
                                value={draft}
                                onChange={(e) => onDraftChange(e.target.value)}
                                className="w-full h-56 md:h-64 bg-black/70 border border-gray-700 rounded-lg p-3 text-xs text-gray-200 leading-relaxed font-mono resize-none outline-none focus:border-wuxia-gold/50 no-scrollbar"
                                placeholder="这里是总结结果。你可以直接修改，然后点击“确认写入”。"
                            />

                            {!draft.trim() && !error && (
                                <div className="text-[11px] text-gray-500">
                                    本次无可写入摘要；确认写入后将只清理来源记忆批次，不新增目标层条目。
                                </div>
                            )}

                            <div className="flex flex-wrap justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={onBack}
                                    className="px-3 py-2 text-xs rounded border border-gray-700 text-gray-300 hover:bg-white/5"
                                >
                                    返回提醒
                                </button>
                                <button
                                    type="button"
                                    onClick={onStart}
                                    className="px-3 py-2 text-xs rounded border border-wuxia-cyan/50 text-wuxia-cyan hover:bg-wuxia-cyan/10"
                                >
                                    重新生成
                                </button>
                                <button
                                    type="button"
                                    onClick={onApply}
                                    className="px-3 py-2 text-xs rounded border border-wuxia-gold/50 text-wuxia-gold hover:bg-wuxia-gold/10"
                                >
                                    确认写入
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MemorySummaryFlowModal;
