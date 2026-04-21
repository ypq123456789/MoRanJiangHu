
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type QuickRestartMode = 'world_only' | 'opening_only' | 'all';

type SendResult = {
    cancelled?: boolean;
    attachedRecallPreview?: string;
    preparedRecallTag?: string;
    needRecallConfirm?: boolean;
    recallFailed?: boolean;
    needRerollConfirm?: boolean;
    parseErrorMessage?: string;
    parseErrorDetail?: string;
    parseErrorRawText?: string;
    errorDetail?: string;
    errorTitle?: string;
};

type RecallProgress = {
    phase: 'start' | 'stream' | 'done' | 'error';
    text?: string;
};

type PolishProgress = {
    phase: 'start' | 'done' | 'error' | 'skipped';
    text?: string;
    rawText?: string;
};

type WorldEvolutionProgress = {
    phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
};

type PlanningProgress = {
    phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
};

type VariableGenerationProgress = {
    phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
};

type IndependentStageId = 'polish' | 'world' | 'planning' | 'variable';
type IndependentStageFailureDecision = 'retry' | 'skip';
type IndependentStageFailureParams = {
    stageId: IndependentStageId;
    stageLabel: string;
    errorText: string;
};

interface Props {
    onSend: (
        content: string,
        isStreaming: boolean,
        options?: {
            onRecallProgress?: (progress: RecallProgress) => void;
            onPolishProgress?: (progress: PolishProgress) => void;
            onWorldEvolutionProgress?: (progress: WorldEvolutionProgress) => void;
            onPlanningProgress?: (progress: PlanningProgress) => void;
            onVariableGenerationProgress?: (progress: VariableGenerationProgress) => void;
            onStageFailureDecision?: (params: IndependentStageFailureParams) => Promise<IndependentStageFailureDecision> | IndependentStageFailureDecision;
        }
    ) => Promise<SendResult> | SendResult;
    onStop: () => void;
    onCancelVariableGeneration?: () => void;
    onRetryLatestVariableGeneration?: () => Promise<string | null> | string | null;
    onRegenerate: () => Promise<string | null> | string | null;
    onRecoverParseErrorRaw?: (rawText: string, forceRepair?: boolean) => Promise<string | null> | string | null;
    onQuickRestart?: (mode: QuickRestartMode) => void | Promise<void>;
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
    loading: boolean;
    variableGenerationRunning?: boolean;
    postStoryQueueRunning?: boolean;
    canReroll?: boolean;
    canRetryLatestVariableGeneration?: boolean;
    canQuickRestart?: boolean;
    options?: unknown[]; // Quick actions from the last turn
    openingWorldEvolutionProgress?: WorldEvolutionProgress | null;
    openingPlanningProgress?: PlanningProgress | null;
    openingVariableGenerationProgress?: VariableGenerationProgress | null;
}

const InputArea: React.FC<Props> = ({
    onSend,
    onStop,
    onCancelVariableGeneration,
    onRetryLatestVariableGeneration,
    onRegenerate,
    onRecoverParseErrorRaw,
    onQuickRestart,
    requestConfirm,
    loading,
    variableGenerationRunning = false,
    postStoryQueueRunning = false,
    canReroll = true,
    canRetryLatestVariableGeneration = false,
    canQuickRestart = false,
    options = [],
    openingWorldEvolutionProgress = null,
    openingPlanningProgress = null,
    openingVariableGenerationProgress = null
}) => {
    const [content, setContent] = useState('');
    const [isStreaming, setIsStreaming] = useState(true);
    const [lastSentContent, setLastSentContent] = useState('');
    const [isPreparing, setIsPreparing] = useState(false);
    const [attachedRecallPreview, setAttachedRecallPreview] = useState('');
    const [showAttachedRecall, setShowAttachedRecall] = useState(false);
    const [pendingRecallTag, setPendingRecallTag] = useState('');
    const [recallProgress, setRecallProgress] = useState<RecallProgress | null>(null);
    const [polishProgress, setPolishProgress] = useState<PolishProgress | null>(null);
    const [worldEvolutionProgress, setWorldEvolutionProgress] = useState<WorldEvolutionProgress | null>(null);
    const [planningProgress, setPlanningProgress] = useState<PlanningProgress | null>(null);
    const [variableGenerationProgress, setVariableGenerationProgress] = useState<VariableGenerationProgress | null>(null);
    const [expandedRawStageId, setExpandedRawStageId] = useState<string | null>(null);
    const [expandedCommandStageId, setExpandedCommandStageId] = useState<string | null>(null);
    const [queueCollapsed, setQueueCollapsed] = useState(true);
    const [showQuickRestartMenu, setShowQuickRestartMenu] = useState(false);
    const [errorModal, setErrorModal] = useState<{ open: boolean; title: string; content: string }>({
        open: false,
        title: '',
        content: ''
    });
    const [parseRepairModal, setParseRepairModal] = useState<{
        open: boolean;
        detail: string;
        originalRaw: string;
        editedRaw: string;
        error: string;
    }>({
        open: false,
        detail: '',
        originalRaw: '',
        editedRaw: '',
        error: ''
    });
    const quickActionsRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef({ active: false, startX: 0, startScrollLeft: 0, moved: false });
    const suppressClickUntilRef = useRef(0);

    const handleSend = async () => {
        if (!content.trim()) return;
        if (loading || isPreparing) return;
        if (postStoryQueueRunning) {
            setErrorModal({
                open: true,
                title: '后台队列仍在处理',
                content: '上一轮的后台队列还没结束，暂时不能继续下一次正文生成。请等待变量、世界和规划处理完成后再发送。'
            });
            return;
        }
        setIsPreparing(true);
        setErrorModal(prev => ({ ...prev, open: false }));
        setParseRepairModal(prev => ({ ...prev, open: false, error: '' }));
        setRecallProgress(null);
        setPolishProgress(null);
        setWorldEvolutionProgress(null);
        setPlanningProgress(null);
        setVariableGenerationProgress(null);
        setExpandedRawStageId(null);
        setExpandedCommandStageId(null);
        setQueueCollapsed(true);
        try {
            let recallAutoRetried = false;
            const payload = pendingRecallTag
                ? `${content}\n<剧情回忆>\n${pendingRecallTag}\n</剧情回忆>`
                : content;
            let result = await onSend(payload, isStreaming, {
                onRecallProgress: (progress) => setRecallProgress(progress),
                onPolishProgress: (progress) => setPolishProgress(progress),
                onWorldEvolutionProgress: (progress) => setWorldEvolutionProgress(progress),
                onPlanningProgress: (progress) => setPlanningProgress(progress),
                onVariableGenerationProgress: (progress) => setVariableGenerationProgress(progress),
                onStageFailureDecision: async (params) => {
                    const message = `${params.stageLabel}请求失败：\n\n${params.errorText || '未知错误'}\n\n选择“重试”会重新执行当前阶段；选择“跳过”会继续后续阶段。`;
                    if (requestConfirm) {
                        const accepted = await requestConfirm({
                            title: `${params.stageLabel}失败`,
                            message,
                            confirmText: '重试',
                            cancelText: '跳过'
                        });
                        return accepted ? 'retry' : 'skip';
                    }
                    if (typeof window !== 'undefined') {
                        return window.confirm(`${message}\n\n按“确定”重试，按“取消”跳过。`) ? 'retry' : 'skip';
                    }
                    return 'skip';
                }
            });
            if (result?.cancelled && result.needRecallConfirm && result.preparedRecallTag) {
                recallAutoRetried = true;
                setPendingRecallTag(result.preparedRecallTag);
                if (result.attachedRecallPreview) {
                    setAttachedRecallPreview(result.attachedRecallPreview);
                    setShowAttachedRecall(false);
                }
                const retryPayload = `${content}\n<剧情回忆>\n${result.preparedRecallTag}\n</剧情回忆>`;
                result = await onSend(retryPayload, isStreaming, {
                    onRecallProgress: (progress) => setRecallProgress(progress),
                    onPolishProgress: (progress) => setPolishProgress(progress),
                    onWorldEvolutionProgress: (progress) => setWorldEvolutionProgress(progress),
                    onPlanningProgress: (progress) => setPlanningProgress(progress),
                    onVariableGenerationProgress: (progress) => setVariableGenerationProgress(progress),
                    onStageFailureDecision: async (params) => {
                        const message = `${params.stageLabel}请求失败：\n\n${params.errorText || '未知错误'}\n\n选择“重试”会重新执行当前阶段；选择“跳过”会继续后续阶段。`;
                        if (requestConfirm) {
                            const accepted = await requestConfirm({
                                title: `${params.stageLabel}失败`,
                                message,
                                confirmText: '重试',
                                cancelText: '跳过'
                            });
                            return accepted ? 'retry' : 'skip';
                        }
                        if (typeof window !== 'undefined') {
                            return window.confirm(`${message}\n\n按“确定”重试，按“取消”跳过。`) ? 'retry' : 'skip';
                        }
                        return 'skip';
                    }
                });
            }
            if (result?.cancelled) {
                if (result.needRerollConfirm) {
                    const parseErrorText = result.parseErrorDetail || result.parseErrorMessage || '模型返回了不符合标签协议的内容。';
                    const raw = typeof result.parseErrorRawText === 'string' ? result.parseErrorRawText : '';
                    setParseRepairModal({
                        open: true,
                        detail: parseErrorText,
                        originalRaw: raw,
                        editedRaw: raw,
                        error: ''
                    });
                    return;
                }
                if (result.needRecallConfirm && result.preparedRecallTag && !recallAutoRetried) {
                    const confirmed = requestConfirm
                        ? await requestConfirm({
                            title: '确认剧情回忆',
                            message: `以下回忆将回填到输入附件中：\n\n${result.attachedRecallPreview || '强回忆:无\n弱回忆:无'}`,
                            confirmText: '确认回填',
                            cancelText: '取消'
                        })
                        : false;
                    if (confirmed) {
                        setPendingRecallTag(result.preparedRecallTag);
                        if (result.attachedRecallPreview) {
                            setAttachedRecallPreview(result.attachedRecallPreview);
                            setShowAttachedRecall(false);
                        }
                    } else if (result.attachedRecallPreview) {
                        setAttachedRecallPreview(result.attachedRecallPreview);
                        setShowAttachedRecall(false);
                    }
                    return;
                }
                if (result.preparedRecallTag) {
                    setPendingRecallTag(result.preparedRecallTag);
                }
                if (result.attachedRecallPreview) {
                    setAttachedRecallPreview(result.attachedRecallPreview);
                    setShowAttachedRecall(false);
                }
                if (result.errorDetail) {
                    setErrorModal({
                        open: true,
                        title: result.errorTitle || '请求失败',
                        content: result.errorDetail
                    });
                }
                return;
            }
            setLastSentContent(content);
            setContent('');
            setPendingRecallTag('');
            if (result?.attachedRecallPreview) {
                setAttachedRecallPreview(result.attachedRecallPreview);
                setShowAttachedRecall(false);
            } else {
                setAttachedRecallPreview('');
                setShowAttachedRecall(false);
            }
            setRecallProgress(null);
        } finally {
            setIsPreparing(false);
        }
    };

    const handleStop = () => {
        onStop();
        setContent(lastSentContent);
    };

    const 追加行动选项到输入 = (current: string, option: string): string => {
        const normalizedCurrent = current.trim();
        const normalizedOption = option.trim();
        if (!normalizedOption) return normalizedCurrent;
        if (!normalizedCurrent) return normalizedOption;
        if (/[，,、；;。！？!?\s]$/.test(normalizedCurrent)) {
            return `${normalizedCurrent} ${normalizedOption}`.trim();
        }
        return `${normalizedCurrent}；${normalizedOption}`;
    };

    const handleOptionClick = (opt: string) => {
        if (Date.now() < suppressClickUntilRef.current) return;
        setContent((current) => 追加行动选项到输入(current, opt));
    };

    const handleReroll = async () => {
        const restoredInput = await Promise.resolve(onRegenerate());
        if (!restoredInput) return;
        setContent(restoredInput);
        setLastSentContent(restoredInput);
    };

    const handleRetryVariableGeneration = async () => {
        if (!onRetryLatestVariableGeneration) return;
        const retryError = await Promise.resolve(onRetryLatestVariableGeneration());
        if (typeof retryError === 'string' && retryError.trim().length > 0) {
            setErrorModal({
                open: true,
                title: '继续变量生成失败',
                content: retryError
            });
        }
    };

    const handleApplyParseRepair = async (mode: 'auto' | 'manual') => {
        if (!onRecoverParseErrorRaw) {
            setParseRepairModal(prev => ({ ...prev, error: '当前版本未接入解析失败恢复能力。' }));
            return;
        }
        const rawToUse = mode === 'auto' ? parseRepairModal.originalRaw : parseRepairModal.editedRaw;
        if (!rawToUse || !rawToUse.trim()) {
            setParseRepairModal(prev => ({ ...prev, error: '没有可恢复的原文内容。' }));
            return;
        }
        const recoverError = await Promise.resolve(onRecoverParseErrorRaw(rawToUse, mode === 'auto'));
        if (typeof recoverError === 'string' && recoverError.trim().length > 0) {
            setParseRepairModal(prev => ({ ...prev, error: recoverError }));
            return;
        }
        setParseRepairModal({
            open: false,
            detail: '',
            originalRaw: '',
            editedRaw: '',
            error: ''
        });
        setContent('');
        setLastSentContent('');
    };

    const handleQuickRestartSelect = async (mode: QuickRestartMode) => {
        if (!onQuickRestart) return;
        const optionsMap: Record<QuickRestartMode, { title: string; message: string }> = {
            world_only: {
                title: '重新生成世界观',
                message: '将仅重新生成世界观提示词，不自动生成开局剧情。是否继续？'
            },
            opening_only: {
                title: '重新生成开局剧情',
                message: '将使用当前世界观重新生成开局剧情（含变量命令）。是否继续？'
            },
            all: {
                title: '重生成世界观+开局剧情',
                message: '将完整重跑世界观与开局剧情。是否继续？'
            }
        };
        const option = optionsMap[mode];
        const confirmed = requestConfirm
            ? await requestConfirm({
                title: option.title,
                message: option.message,
                confirmText: '立即执行',
                cancelText: '取消',
                danger: true
            })
            : true;
        if (!confirmed) return;
        await Promise.resolve(onQuickRestart(mode));
        setShowQuickRestartMenu(false);
    };

    const handleQuickActionsPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType !== 'mouse') return;
        const el = quickActionsRef.current;
        if (!el) return;
        if (el.scrollWidth <= el.clientWidth) return;
        dragRef.current = {
            active: true,
            startX: e.clientX,
            startScrollLeft: el.scrollLeft,
            moved: false
        };
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };

    const handleQuickActionsPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType !== 'mouse') return;
        if (!dragRef.current.active) return;
        const el = quickActionsRef.current;
        if (!el) return;
        const delta = e.clientX - dragRef.current.startX;
        if (Math.abs(delta) > 4) {
            dragRef.current.moved = true;
        }
        el.scrollLeft = dragRef.current.startScrollLeft - delta;
        if (dragRef.current.moved) {
            e.preventDefault();
        }
    };

    const endQuickActionsDrag = () => {
        if (!dragRef.current.active) return;
        if (dragRef.current.moved) {
            suppressClickUntilRef.current = Date.now() + 120;
        }
        dragRef.current.active = false;
    };

    const normalizeOptionText = (opt: unknown): string => {
        if (typeof opt === 'string') return opt.trim();
        if (typeof opt === 'number' || typeof opt === 'boolean') return String(opt);
        if (opt && typeof opt === 'object') {
            const obj = opt as Record<string, unknown>;
            const candidate = obj.text ?? obj.label ?? obj.action ?? obj.name ?? obj.id;
            if (typeof candidate === 'string') return candidate.trim();
        }
        return '';
    };

    const normalizedOptions = options
        .map(normalizeOptionText)
        .filter(item => item.length > 0);

    const busy = loading || isPreparing || variableGenerationRunning || postStoryQueueRunning;
    const recallRunning = isPreparing && !loading;
    const effectiveWorldEvolutionProgress = worldEvolutionProgress || openingWorldEvolutionProgress;
    const effectivePlanningProgress = planningProgress || openingPlanningProgress;
    const effectiveVariableGenerationProgress = variableGenerationProgress || openingVariableGenerationProgress;
    const pipelineStages = [
        { id: 'polish', label: '文章优化', progress: polishProgress },
        { id: 'variable', label: '变量生成', progress: effectiveVariableGenerationProgress },
        { id: 'world', label: '动态世界', progress: effectiveWorldEvolutionProgress },
        { id: 'planning', label: '规划分析', progress: effectivePlanningProgress }
    ];
    const queueVisible = pipelineStages.some((stage) => Boolean(stage.progress));
    const historyStages = pipelineStages.filter((stage) => {
        const commandTexts = (stage.progress as { commandTexts?: string[] } | null)?.commandTexts;
        return Array.isArray(commandTexts) && commandTexts.length > 0;
    });
    const currentRunningStage = pipelineStages.find((stage) => stage.progress?.phase === 'start');
    const latestFinishedStage = [...pipelineStages].reverse().find((stage) => stage.progress && stage.progress.phase !== 'start');
    const queueRunning = Boolean(currentRunningStage);
    const queueBadgeClass = queueRunning
        ? 'border-wuxia-cyan/60 bg-gradient-to-r from-wuxia-cyan/20 via-wuxia-gold/15 to-wuxia-cyan/20 text-wuxia-cyan animate-pulse shadow-[0_0_18px_rgba(34,211,238,0.2)]'
        : 'border-wuxia-gold/35 bg-black text-wuxia-gold/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)]';
    const 取阶段状态文案 = (phase?: string): string => {
        if (!phase) return '待命';
        if (phase === 'start') return '处理中';
        if (phase === 'done') return '完成';
        if (phase === 'error') return '失败';
        if (phase === 'skipped') return '已跳过';
        if (phase === 'cancelled') return '已取消';
        return '待命';
    };
    const 取阶段状态色 = (phase?: string): string => {
        if (phase === 'done') return 'text-green-400';
        if (phase === 'error') return 'text-red-400';
        if (phase === 'skipped' || phase === 'cancelled') return 'text-gray-400';
        if (phase === 'start') return 'text-wuxia-cyan';
        return 'text-gray-500';
    };

    useEffect(() => {
        const hasOpeningQueueProgress = [openingWorldEvolutionProgress, openingPlanningProgress]
            .some((item) => item?.phase === 'start' || item?.phase === 'done' || item?.phase === 'error' || item?.phase === 'skipped' || item?.phase === 'cancelled');
        if (hasOpeningQueueProgress) {
            setQueueCollapsed(false);
        }
    }, [openingWorldEvolutionProgress, openingPlanningProgress]);

    useEffect(() => {
        const hasMainQueueError = [polishProgress, worldEvolutionProgress, planningProgress]
            .some((item) => item?.phase === 'error');
        if (hasMainQueueError) {
            setQueueCollapsed(false);
        }
    }, [polishProgress, worldEvolutionProgress, planningProgress]);

    return (
        <div className="shrink-0 relative z-20 bg-gradient-to-t from-ink-black/90 via-ink-black/75 to-transparent pb-4 px-4 flex flex-col gap-1 backdrop-blur-[2px]">
            {/* Quick Actions Chips (Fixed Box Size, Scrolling Text) */}
            {normalizedOptions.length > 0 && (
                <div
                    ref={quickActionsRef}
                    className="w-full px-2 md:px-4 pb-0 overflow-x-auto no-scrollbar select-none cursor-grab active:cursor-grabbing"
                    style={{ touchAction: 'pan-x' }}
                    onPointerDown={handleQuickActionsPointerDown}
                    onPointerMove={handleQuickActionsPointerMove}
                    onPointerUp={endQuickActionsDrag}
                    onPointerCancel={endQuickActionsDrag}
                    onPointerLeave={endQuickActionsDrag}
                >
                    <div className="flex flex-nowrap md:flex-wrap md:justify-center gap-3 min-w-max md:min-w-0">
                        {normalizedOptions.map((opt, idx) => (
                            <button 
                                key={idx}
                                onClick={() => handleOptionClick(opt)}
                                disabled={loading}
                                className="shrink-0 whitespace-nowrap px-6 py-2.5 bg-white/5 border border-wuxia-gold/30 text-gray-300 rounded hover:bg-wuxia-gold hover:text-ink-black hover:border-wuxia-gold transition-all text-sm tracking-wider shadow-sm min-w-[132px] text-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                 {opt}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="h-px w-full bg-gradient-to-r from-transparent via-wuxia-gold/30 to-transparent my-0.5 opacity-50"></div>

            {recallProgress && (
                <div className="rounded-lg border border-wuxia-cyan/30 bg-wuxia-cyan/5 p-2 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-wuxia-cyan">
                        {recallProgress.phase === 'done' ? (
                            <span className="text-green-400">●</span>
                        ) : recallProgress.phase === 'error' ? (
                            <span className="text-red-400">●</span>
                        ) : (
                            <span className="inline-block w-3 h-3 border-2 border-wuxia-cyan/40 border-t-wuxia-cyan rounded-full animate-spin" />
                        )}
                        <span>
                            {recallProgress.phase === 'start' && '剧情回忆检索中...'}
                            {recallProgress.phase === 'stream' && '剧情回忆流式解析中...'}
                            {recallProgress.phase === 'done' && '剧情回忆检索完成'}
                            {recallProgress.phase === 'error' && '剧情回忆检索失败'}
                        </span>
                    </div>
                    {recallProgress.text && (
                        <pre className="text-[11px] whitespace-pre-wrap text-gray-300 leading-relaxed max-h-28 overflow-y-auto custom-scrollbar">
                            {recallProgress.text}
                        </pre>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                        {recallRunning && (
                            <button
                                type="button"
                                onClick={handleStop}
                                className="px-2.5 py-1 rounded border border-red-700/60 text-[11px] text-red-200 hover:bg-red-900/20"
                            >
                                取消检索
                            </button>
                        )}
                        {!busy && recallProgress.phase === 'error' && content.trim() && (
                            <button
                                type="button"
                                onClick={() => { void handleSend(); }}
                                className="px-2.5 py-1 rounded border border-wuxia-cyan/50 text-[11px] text-wuxia-cyan hover:bg-wuxia-cyan/10"
                            >
                                重试检索
                            </button>
                        )}
                    </div>
                </div>
            )}

            {attachedRecallPreview && (
                <div className="rounded-lg border border-wuxia-cyan/30 bg-wuxia-cyan/5 p-2">
                    <div className="flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={() => setShowAttachedRecall(prev => !prev)}
                            className="flex-1 flex items-center justify-between text-xs text-wuxia-cyan"
                        >
                            <span>{pendingRecallTag ? '剧情回忆已回填（待发送）' : '剧情回忆已附加'}（点击{showAttachedRecall ? '收起' : '展开'}）</span>
                            <span>{showAttachedRecall ? '▲' : '▼'}</span>
                        </button>
                        {pendingRecallTag && (
                            <button
                                type="button"
                                onClick={() => {
                                    setPendingRecallTag('');
                                    setAttachedRecallPreview('');
                                    setShowAttachedRecall(false);
                                }}
                                className="text-[10px] px-2 py-1 border border-red-800/60 text-red-300 rounded hover:bg-red-900/20"
                            >
                                移除
                            </button>
                        )}
                    </div>
                    {showAttachedRecall && (
                        <pre className="mt-2 text-[11px] whitespace-pre-wrap text-gray-300 leading-relaxed max-h-40 overflow-y-auto custom-scrollbar">
                            {attachedRecallPreview}
                        </pre>
                    )}
                </div>
            )}

            {showQuickRestartMenu && canQuickRestart && (
                <div className="rounded-lg border border-teal-400/30 bg-black/70 p-2 space-y-2">
                    <div className="text-xs text-teal-300 font-bold tracking-wider">快速重开选项</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <button
                            type="button"
                            onClick={() => { void handleQuickRestartSelect('world_only'); }}
                            disabled={busy}
                            className="text-xs px-3 py-2 rounded border border-gray-700 text-gray-200 hover:border-teal-300 hover:text-teal-200 disabled:opacity-40"
                        >
                            仅重生世界观
                        </button>
                        <button
                            type="button"
                            onClick={() => { void handleQuickRestartSelect('opening_only'); }}
                            disabled={busy}
                            className="text-xs px-3 py-2 rounded border border-gray-700 text-gray-200 hover:border-teal-300 hover:text-teal-200 disabled:opacity-40"
                        >
                            仅重生开局剧情
                        </button>
                        <button
                            type="button"
                            onClick={() => { void handleQuickRestartSelect('all'); }}
                            disabled={busy}
                            className="text-xs px-3 py-2 rounded border border-gray-700 text-gray-200 hover:border-teal-300 hover:text-teal-200 disabled:opacity-40"
                        >
                            世界观 + 开局剧情
                        </button>
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => setShowQuickRestartMenu(false)}
                            className="text-[11px] px-2 py-1 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
                        >
                            收起
                        </button>
                    </div>
                </div>
            )}
            
            {/* Main Control Bar */}
            <div className="flex items-center gap-1.5 sm:gap-2">
                
                {/* Left Controls Group */}
                <div className="flex shrink-0 items-center gap-0.5 bg-black/40 border border-gray-700/50 rounded-lg p-0.5 h-10 sm:gap-1 sm:rounded-xl sm:p-1 sm:h-12">
                    {/* Stream Toggle */}
                    <button 
                        onClick={() => setIsStreaming(!isStreaming)}
                        className={`w-8 sm:w-10 h-full rounded-md sm:rounded-lg flex items-center justify-center transition-all ${isStreaming ? 'text-wuxia-cyan bg-wuxia-cyan/10' : 'text-gray-600 hover:text-gray-400'}`}
                        title={isStreaming ? "流式传输开启" : "流式传输关闭"}
                        disabled={busy}
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                    </button>

                    <div className="w-px h-5 sm:h-6 bg-gray-800"></div>

                    {/* Quick Restart */}
                    {canQuickRestart && (
                        <>
                            <button 
                                onClick={() => setShowQuickRestartMenu(prev => !prev)}
                                disabled={busy}
                                className="w-8 sm:w-10 h-full rounded-md sm:rounded-lg flex items-center justify-center text-teal-300 hover:text-teal-100 hover:bg-teal-900/20 transition-all disabled:opacity-30"
                                title="快速重开"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
                                </svg>
                            </button>
                            <div className="w-px h-5 sm:h-6 bg-gray-800"></div>
                        </>
                    )}

                    {/* Re-roll */}
                    <button
                        onClick={() => { void handleReroll(); }}
                        disabled={busy || !canReroll}
                        className="w-8 sm:w-10 h-full rounded-md sm:rounded-lg flex items-center justify-center text-gray-400 hover:text-wuxia-gold hover:bg-white/5 transition-all disabled:opacity-30"
                        title={canReroll ? "重ROLL：回档到上一轮并回填输入" : "暂无可重ROLL回合"}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                             <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                    </button>
                    <div className="w-px h-5 sm:h-6 bg-gray-800"></div>
                    <button
                        onClick={() => { void handleRetryVariableGeneration(); }}
                        disabled={loading || isPreparing || !canRetryLatestVariableGeneration}
                        className="w-8 sm:w-10 h-full rounded-md sm:rounded-lg flex items-center justify-center text-cyan-300 hover:text-cyan-100 hover:bg-cyan-900/20 transition-all disabled:opacity-30"
                        title={canRetryLatestVariableGeneration ? "基于当前正文继续变量生成" : "当前没有可继续变量生成的最新回合"}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-3.22-6.92" />
                        </svg>
                    </button>
                </div>

                {/* Input Field */}
                <div className={`flex-1 min-w-0 bg-black/40 border border-gray-700/50 rounded-lg h-10 flex items-center px-3 transition-all shadow-inner sm:rounded-xl sm:h-12 sm:px-4 ${busy ? 'opacity-50 cursor-not-allowed' : 'focus-within:border-wuxia-gold/50 focus-within:bg-black/60'}`}>
                    <input
                        type="text"
                        className="w-full bg-transparent text-[14px] sm:text-[16px] text-paper-white font-serif placeholder-gray-600 focus:outline-none"
                        placeholder={busy ? "等待处理中..." : "输入你的行动..."}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !busy && handleSend()}
                        disabled={busy}
                    />
                </div>

                {/* Send / Stop Button */}
                {loading || isPreparing || variableGenerationRunning ? (
                    <button 
                        onClick={variableGenerationRunning && onCancelVariableGeneration ? onCancelVariableGeneration : handleStop}
                        className="w-11 sm:w-14 h-10 sm:h-12 shrink-0 bg-wuxia-red text-white rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(163,24,24,0.3)] hover:bg-red-600 hover:scale-105 active:scale-95 transition-all"
                        title={variableGenerationRunning ? "取消变量生成" : (recallRunning ? "取消检索" : "停止生成")}
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 sm:w-6 sm:h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                ) : (
                    <button 
                        onClick={() => { void handleSend(); }} 
                        disabled={!content.trim() || busy} 
                        className="w-11 sm:w-14 h-10 sm:h-12 shrink-0 bg-wuxia-gold text-ink-black rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(230,200,110,0.3)] hover:bg-white hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
                        title="发送"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 sm:w-6 sm:h-6">
                             <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l6-6m0 0l6 6m-6-6v12a6 6 0 01-12 0v-3" />
                        </svg>
                    </button>
                )}

            </div>

            {parseRepairModal.open && typeof document !== 'undefined' && createPortal((
                <div
                    className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
                >
                    <div
                        className="mx-auto w-full max-w-4xl rounded-lg border border-wuxia-cyan/35 bg-black/95 p-5 shadow-[0_0_36px_rgba(0,0,0,0.85)]"
                    >
                        <div className="flex items-center justify-between gap-4 mb-4">
                            <h4 className="text-lg font-serif font-bold text-wuxia-cyan">
                                标签结构不完整
                            </h4>
                            <button
                                type="button"
                                onClick={() => setParseRepairModal(prev => ({ ...prev, open: false }))}
                                className="text-gray-400 hover:text-white transition-colors"
                                aria-label="关闭解析修复弹窗"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="text-xs text-gray-300 whitespace-pre-wrap border border-gray-800 rounded-md bg-black/50 p-3 mb-3">
                            {parseRepairModal.detail}
                        </div>
                        <div className="text-[11px] text-gray-500 mb-2">可直接手动改标签后恢复，或尝试自动修复恢复。</div>
                        <textarea
                            value={parseRepairModal.editedRaw}
                            onChange={(e) => setParseRepairModal(prev => ({ ...prev, editedRaw: e.target.value, error: '' }))}
                            className="w-full h-56 bg-black/80 border border-gray-700 rounded-md p-3 text-xs text-green-300 font-mono whitespace-pre resize-y outline-none focus:border-wuxia-cyan/60"
                        />
                        {parseRepairModal.error && (
                            <div className="mt-3 text-xs text-red-300 border border-red-500/30 bg-red-950/20 rounded p-2 whitespace-pre-wrap">
                                {parseRepairModal.error}
                            </div>
                        )}
                        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => { void handleApplyParseRepair('auto'); }}
                                className="px-4 py-2 text-xs font-bold rounded border border-wuxia-cyan/50 text-wuxia-cyan hover:bg-wuxia-cyan/10"
                            >
                                自动修复并应用
                            </button>
                            <button
                                type="button"
                                onClick={() => { void handleApplyParseRepair('manual'); }}
                                className="px-4 py-2 text-xs font-bold rounded border border-wuxia-gold/50 text-wuxia-gold hover:bg-wuxia-gold/10"
                            >
                                手动编辑后应用
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void handleReroll();
                                    setParseRepairModal({
                                        open: false,
                                        detail: '',
                                        originalRaw: '',
                                        editedRaw: '',
                                        error: ''
                                    });
                                }}
                                className="px-4 py-2 text-xs font-bold rounded border border-red-900/60 text-red-300 hover:bg-red-900/20"
                            >
                                重ROLL
                            </button>
                        </div>
                    </div>
                </div>
            ), document.body)}

            {errorModal.open && typeof document !== 'undefined' && createPortal((
                <div
                    className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                    onClick={() => setErrorModal(prev => ({ ...prev, open: false }))}
                >
                    <div
                        className="mx-auto w-full max-w-3xl rounded-lg border border-wuxia-gold/30 bg-black/90 p-5 shadow-[0_0_30px_rgba(0,0,0,0.8)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-4 mb-4">
                            <h4 className="text-lg font-serif font-bold text-wuxia-gold">
                                {errorModal.title || '请求失败'}
                            </h4>
                            <button
                                type="button"
                                onClick={() => setErrorModal(prev => ({ ...prev, open: false }))}
                                className="text-gray-400 hover:text-white transition-colors"
                                aria-label="关闭错误详情"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar rounded-md border border-gray-700/80 bg-black/60 p-3 text-xs text-gray-200 whitespace-pre-wrap">
                            {errorModal.content}
                        </div>
                        <div className="pt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setErrorModal(prev => ({ ...prev, open: false }))}
                                className="px-6 py-2 text-xs font-bold bg-wuxia-gold text-ink-black rounded hover:bg-white transition-colors"
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            ), document.body)}

            {queueVisible && (
                <div className="pointer-events-none absolute left-2 right-2 bottom-full mb-2 z-40 sm:left-4 sm:right-4">
                    <div className="mx-auto w-full max-w-5xl pointer-events-auto space-y-1">
                        {queueVisible && (
                            <>
                        {!queueCollapsed && (
                            <div className="flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setQueueCollapsed(true)}
                                    className={`h-6 w-36 border text-[10px] tracking-[0.35em] transition hover:bg-neutral-950 ${queueBadgeClass}`}
                                    style={{ clipPath: 'polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)' }}
                                    title="收起独立更新阶段队列"
                                >
                                    {queueRunning ? '运行中' : '收起队列'}
                                </button>
                            </div>
                        )}
                        {queueCollapsed ? (
                            <div className="flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setQueueCollapsed(false)}
                                    className={`h-7 w-28 border text-[11px] tracking-[0.3em] transition hover:bg-neutral-950 ${queueBadgeClass}`}
                                    style={{ clipPath: 'polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)' }}
                                    title="展开独立更新阶段队列"
                                >
                                    {queueRunning ? '队列中' : '队列'}
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-wuxia-gold/25 bg-black p-2 space-y-2 shadow-[0_18px_60px_rgba(0,0,0,0.45)] max-h-[34svh] sm:max-h-[42vh] md:max-h-[55vh] overflow-y-auto no-scrollbar">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                    <div className="text-wuxia-gold">独立更新阶段队列</div>
                                    <div className="text-gray-400">
                                        当前阶段：{currentRunningStage?.label || '无'}
                                        {' | '}
                                        上一阶段结果：{latestFinishedStage ? `${latestFinishedStage.label} ${取阶段状态文案(latestFinishedStage.progress?.phase)}` : '无'}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                    {pipelineStages.map((stage, index) => {
                                        const phase = stage.progress?.phase;
                                        const rawText = stage.progress?.rawText;
                                        const commandTexts = Array.isArray((stage.progress as { commandTexts?: string[] } | null)?.commandTexts)
                                            ? ((stage.progress as { commandTexts?: string[] }).commandTexts || [])
                                            : [];
                                        const rawExpanded = expandedRawStageId === stage.id;
                                        const commandExpanded = expandedCommandStageId === stage.id;
                                        const isVariableStage = stage.id === 'variable';
                                        return (
                                            <div key={stage.id} className="rounded border border-gray-800/80 bg-neutral-950 p-2">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-gray-500 text-[10px]">{index + 1}.</span>
                                                        {phase === 'start' ? (
                                                            <span className="inline-block w-3 h-3 border-2 border-wuxia-cyan/40 border-t-wuxia-cyan rounded-full animate-spin" />
                                                        ) : (
                                                            <span className={取阶段状态色(phase)}>●</span>
                                                        )}
                                                        <span className="text-xs text-gray-100">{stage.label}</span>
                                                        <span className={`text-[11px] ${取阶段状态色(phase)}`}>
                                                            {取阶段状态文案(phase)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {isVariableStage && phase === 'start' && variableGenerationRunning && onCancelVariableGeneration && (
                                                            <button
                                                                type="button"
                                                                onClick={onCancelVariableGeneration}
                                                                className="text-[10px] px-2 py-1 border border-teal-400/40 text-teal-100 rounded hover:bg-teal-500/10"
                                                            >
                                                                取消生成
                                                            </button>
                                                        )}
                                                        {isVariableStage && phase !== 'start' && !variableGenerationRunning && onRetryLatestVariableGeneration && (
                                                            <button
                                                                type="button"
                                                                onClick={() => { void handleRetryVariableGeneration(); }}
                                                                className="text-[10px] px-2 py-1 border border-cyan-400/40 text-cyan-100 rounded hover:bg-cyan-500/10"
                                                            >
                                                                继续生成
                                                            </button>
                                                        )}
                                                        {commandTexts.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedCommandStageId(commandExpanded ? null : stage.id)}
                                                                className="text-[10px] px-2 py-1 border border-gray-700 text-gray-300 rounded hover:border-wuxia-gold/40 hover:text-white"
                                                            >
                                                                {commandExpanded ? '收起命令' : '查看命令'}
                                                            </button>
                                                        )}
                                                        {rawText && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedRawStageId(rawExpanded ? null : stage.id)}
                                                                className="text-[10px] px-2 py-1 border border-gray-700 text-gray-300 rounded hover:border-wuxia-gold/40 hover:text-white"
                                                            >
                                                                {rawExpanded ? '收起原始回复' : '查看原始回复'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                {stage.progress?.text && (
                                                    <pre className="mt-2 text-[11px] whitespace-pre-wrap text-gray-300 leading-relaxed max-h-20 sm:max-h-28 overflow-y-auto no-scrollbar">
                                                        {stage.progress.text}
                                                    </pre>
                                                )}
                                                {commandExpanded && commandTexts.length > 0 && (
                                                    <div className="mt-2 rounded border border-wuxia-gold/20 bg-black/55 p-2">
                                                        <div className="text-[10px] text-wuxia-gold/80 mb-1">本回合命令列表</div>
                                                        <pre className="text-[11px] whitespace-pre-wrap text-sky-100 leading-relaxed max-h-28 sm:max-h-40 overflow-y-auto no-scrollbar">
                                                            {commandTexts.join('\n')}
                                                        </pre>
                                                    </div>
                                                )}
                                                {rawExpanded && rawText && (
                                                    <pre className="mt-2 text-[11px] whitespace-pre-wrap text-emerald-200 leading-relaxed max-h-32 sm:max-h-52 overflow-y-auto no-scrollbar border border-emerald-500/20 bg-black/60 rounded p-2">
                                                        {rawText}
                                                    </pre>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {historyStages.length > 0 && (
                                    <div className="rounded border border-wuxia-gold/20 bg-neutral-950 p-2 space-y-2 max-h-36 sm:max-h-64 overflow-y-auto no-scrollbar">
                                        <div className="text-[11px] text-wuxia-gold">独立链命令历史面板</div>
                                        <div className="grid grid-cols-1 gap-2">
                                            {historyStages.map((stage) => (
                                                <div key={`history_${stage.id}`} className="rounded border border-gray-800/80 bg-black/50 p-2">
                                                    <div className="text-[11px] text-gray-100 mb-1">{stage.label}</div>
                                                    <pre className="text-[11px] whitespace-pre-wrap text-sky-100 leading-relaxed max-h-24 sm:max-h-36 overflow-y-auto no-scrollbar">
                                                        {(((stage.progress as { commandTexts?: string[] } | null)?.commandTexts) || []).join('\n')}
                                                    </pre>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default InputArea;
