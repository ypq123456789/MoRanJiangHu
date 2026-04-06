import React from 'react';

type 阶段类型 = 'remind' | 'processing' | 'review';

interface 任务快照 {
    npcId: string;
    npcName: string;
    批次条数: number;
    起始索引: number;
    结束索引: number;
    起始时间: string;
    结束时间: string;
    触发方式?: 'auto' | 'manual';
    预留原始条数: number;
}

interface Props {
    open: boolean;
    stage: 阶段类型;
    task: 任务快照 | null;
    queueLength: number;
    draft: string;
    error?: string;
    onStart: () => void;
    onCancel: () => void;
    onBack: () => void;
    onDraftChange: (next: string) => void;
    onApply: () => void;
}

const NpcMemorySummaryFlowMobileModal: React.FC<Props> = ({
    open,
    stage,
    task,
    queueLength,
    draft,
    error,
    onStart,
    onCancel,
    onBack,
    onDraftChange,
    onApply
}) => {
    if (!open || !task) return null;

    return (
        <div className="fixed inset-0 z-[233] bg-black/85 backdrop-blur-sm flex md:hidden">
            <div className="w-full h-full flex flex-col bg-ink-black/95">
                <div className="shrink-0 px-4 py-3 border-b border-gray-800/80 bg-black/50 flex items-center justify-between">
                    <div className="text-wuxia-gold font-bold tracking-wider text-sm">NPC记忆总结（移动端）</div>
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
                        当前任务：{task.npcName}，索引 {task.起始索引} - {task.结束索引}，共 {task.批次条数} 条，时间范围 {task.起始时间} - {task.结束时间}。
                        {' '}保留后续 {task.预留原始条数} 条原始记忆。
                        {queueLength > 1 ? ` 队列剩余 ${queueLength - 1} 个 NPC。` : ''}
                    </div>

                    {stage === 'remind' && (
                        <div className="rounded-lg border border-wuxia-cyan/30 bg-wuxia-cyan/5 p-3 text-sm text-gray-200 leading-relaxed">
                            检测到 NPC 原始记忆达到总结条件，需要先沉淀旧记忆。
                        </div>
                    )}

                    {stage === 'processing' && (
                        <div className="h-full min-h-[220px] flex flex-col items-center justify-center gap-3">
                            <div className="w-10 h-10 border-2 border-wuxia-gold/40 border-t-wuxia-gold rounded-full animate-spin" />
                            <div className="text-sm text-gray-300">正在生成 NPC 总结记忆，请稍候...</div>
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
                                placeholder="这里是 NPC 总结记忆结果。你可以直接修改，然后点击“确认写入”。"
                            />
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
                                    重生
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

export default NpcMemorySummaryFlowMobileModal;
