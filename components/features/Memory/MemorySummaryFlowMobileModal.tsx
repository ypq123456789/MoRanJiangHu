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

const MemorySummaryFlowMobileModal: React.FC<Props> = ({
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
        <div className="fixed inset-0 z-[231] bg-black/85 backdrop-blur-sm flex md:hidden">
            <div className="w-full h-full flex flex-col bg-ink-black/95">
                <div className="shrink-0 px-4 py-3 border-b border-gray-800/80 bg-black/50 flex items-center justify-between">
                    <div className="text-wuxia-gold font-bold tracking-wider text-sm">记忆总结流程（移动端）</div>
                    {stage !== 'processing' && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-2 py-1 text-[11px] rounded border border-gray-700 text-gray-400"
                        >
                            关闭
                        </button>
                    )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                    <div className="text-[11px] text-gray-400 leading-relaxed">
                        当前任务：{source} {'->'} {target}，共 {task.批次条数} 条，时间范围 {task.起始时间} - {task.结束时间}
                        {task.触发方式 === 'manual' && typeof task.起始索引 === 'number' && typeof task.结束索引 === 'number'
                            ? `，手动区间 ${task.起始索引 + 1} - ${task.结束索引 + 1}`
                            : ''}
                    </div>

                    {stage === 'remind' && (
                        <div className="rounded-lg border border-wuxia-cyan/30 bg-wuxia-cyan/5 p-3 text-sm text-gray-200 leading-relaxed">
                            检测到记忆达到压缩阈值，需要先执行总结，再写入下一层记忆。
                        </div>
                    )}

                    {stage === 'processing' && (
                        <div className="h-full min-h-[220px] flex flex-col items-center justify-center gap-3">
                            <div className="w-10 h-10 border-2 border-wuxia-gold/40 border-t-wuxia-gold rounded-full animate-spin" />
                            <div className="text-sm text-gray-300">正在生成记忆总结，请稍候...</div>
                            <div className="text-[11px] text-gray-500">完成后将进入确认与修改阶段</div>
                        </div>
                    )}

                    {stage === 'review' && (
                        <>
                            {error && (
                                <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-[11px] text-red-200 whitespace-pre-wrap">
                                    {error}
                                </div>
                            )}
                            <textarea
                                value={draft}
                                onChange={(e) => onDraftChange(e.target.value)}
                                className="w-full h-[46vh] bg-black/70 border border-gray-700 rounded-lg p-3 text-[11px] text-gray-200 leading-relaxed font-mono resize-none outline-none focus:border-wuxia-gold/50 no-scrollbar"
                                placeholder="这里是总结结果。你可以直接修改，然后点击“确认写入”。"
                            />
                            {!draft.trim() && !error && (
                                <div className="text-[11px] text-gray-500">
                                    本次无可写入摘要；确认写入后将只清理来源记忆批次，不新增目标层条目。
                                </div>
                            )}
                        </>
                    )}
                </div>

                {stage !== 'processing' && (
                    <div className="shrink-0 border-t border-gray-800/80 bg-black/60 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
                        {stage === 'remind' && (
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="px-3 py-2 text-xs rounded border border-gray-700 text-gray-300"
                                >
                                    稍后处理
                                </button>
                                <button
                                    type="button"
                                    onClick={onStart}
                                    className="px-3 py-2 text-xs rounded border border-wuxia-gold/50 text-wuxia-gold"
                                >
                                    确认并开始
                                </button>
                            </div>
                        )}

                        {stage === 'review' && (
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={onBack}
                                    className="px-2 py-2 text-[11px] rounded border border-gray-700 text-gray-300"
                                >
                                    返回
                                </button>
                                <button
                                    type="button"
                                    onClick={onStart}
                                    className="px-2 py-2 text-[11px] rounded border border-wuxia-cyan/50 text-wuxia-cyan"
                                >
                                    重新生成
                                </button>
                                <button
                                    type="button"
                                    onClick={onApply}
                                    className="px-2 py-2 text-[11px] rounded border border-wuxia-gold/50 text-wuxia-gold"
                                >
                                    确认写入
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MemorySummaryFlowMobileModal;
