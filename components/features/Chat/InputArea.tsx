
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { 获取队列阶段重新生成动作 } from '../../../utils/queueStageActions';

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
    recoveryHint?: string;
};

type RecallProgress = {
    phase: 'start' | 'stream' | 'done' | 'error';
    text?: string;
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

type PolishProgress = {
    phase: 'start' | 'stream' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

type WorldEvolutionProgress = {
    phase: 'start' | 'stream' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

type PlanningProgress = {
    phase: 'start' | 'stream' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

type VariableGenerationProgress = {
    phase: 'start' | 'stream' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

type MapUpdateProgress = {
    phase: 'start' | 'stream' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

type QueueProgressPayload = {
    phase?: string;
    text?: string;
    rawText?: string;
    commandTexts?: string[];
    channelName?: string;
    modelName?: string;
    startedAt?: number;
    finishedAt?: number;
    elapsedMs?: number;
};

const QUEUE_DEBUG_EVENT_LIMIT = 160;

const 获取性能时间 = (): number => (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
);

const 压缩队列进度用于渲染 = <T extends QueueProgressPayload>(progress: T): T => progress;

const 合并队列命令展示 = (commandTexts: string[]): string => (
    commandTexts.length > 0
        ? commandTexts.join('\n')
        : ''
);

const 格式化队列耗时 = (elapsedMs?: number): string => {
    if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) return '';
    if (elapsedMs < 1000) return `${Math.round(elapsedMs)}ms`;
    const seconds = elapsedMs / 1000;
    if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return `${minutes}m ${rest}s`;
};

const 队列阶段不调用AI = (progress?: QueueProgressPayload | null): boolean => (
    String(progress?.modelName || '').trim().toLowerCase() === '不调用 ai'
);

const 队列阶段运行中 = (phase?: string): boolean => phase === 'start' || phase === 'stream';

type IndependentStageId = 'polish' | 'world' | 'planning' | 'variable' | 'map';
type IndependentStageFailureDecision = 'retry' | 'skip';
type IndependentStageFailureParams = {
    stageId: IndependentStageId;
    stageLabel: string;
    errorText: string;
    manualAttempt?: number;
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
            onMapUpdateProgress?: (progress: MapUpdateProgress) => void;
            onStageFailureDecision?: (params: IndependentStageFailureParams) => Promise<IndependentStageFailureDecision> | IndependentStageFailureDecision;
        }
    ) => Promise<SendResult> | SendResult;
    onStop: () => void;
    onCancelVariableGeneration?: () => void;
    onRetryLatestVariableGeneration?: (options?: {
        onVariableGenerationProgress?: (progress: VariableGenerationProgress) => void;
    }) => Promise<string | null> | string | null;
    onRetryLatestStage?: (
        stageId: 'polish' | 'world' | 'planning' | 'map',
        options?: {
            onPolishProgress?: (progress: PolishProgress) => void;
            onWorldEvolutionProgress?: (progress: WorldEvolutionProgress) => void;
            onPlanningProgress?: (progress: PlanningProgress) => void;
            onMapUpdateProgress?: (progress: MapUpdateProgress) => void;
        }
    ) => Promise<string | null> | string | null;
    onRegenerate: () => Promise<string | null> | string | null;
    onRecoverParseErrorRaw?: (rawText: string, forceRepair?: boolean) => Promise<string | null> | string | null;
    onQuickRestart?: (mode: QuickRestartMode) => void | Promise<void>;
    onOpenRoleChat?: () => void;
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
    loading: boolean;
    variableGenerationRunning?: boolean;
    postStoryQueueRunning?: boolean;
    /** 正文后暂停：待玩家确认正文后再执行的后续阶段摘要 */
    pendingPostStoryQueue?: { 阶段摘要: string[]; 注册时间?: number } | null;
    onContinuePostStoryQueue?: () => void | Promise<void>;
    onAbandonPostStoryQueue?: () => void;
    canReroll?: boolean;
    reRollCount?: number;
    canRetryLatestVariableGeneration?: boolean;
    canQuickRestart?: boolean;
    options?: unknown[]; // Quick actions from the last turn
    externalDraft?: { text: string; token: number } | null;
    mainStoryModelInfo?: { channelName?: string; modelName?: string };
    openingMainStoryProgress?: QueueProgressPayload | null;
    openingPolishProgress?: PolishProgress | null;
    openingWorldEvolutionProgress?: WorldEvolutionProgress | null;
    openingPlanningProgress?: PlanningProgress | null;
    openingVariableGenerationProgress?: VariableGenerationProgress | null;
    openingMapUpdateProgress?: MapUpdateProgress | null;
    isStreamingDefault?: boolean;
    stageStreamMode?: Record<string, 'stream' | 'non-stream'>;
}

const InputArea: React.FC<Props> = ({
    onSend,
    onStop,
    onCancelVariableGeneration,
    onRetryLatestVariableGeneration,
    onRetryLatestStage,
    onRegenerate,
    onRecoverParseErrorRaw,
    onQuickRestart,
    onOpenRoleChat,
    requestConfirm,
    loading,
    variableGenerationRunning = false,
    postStoryQueueRunning = false,
    pendingPostStoryQueue = null,
    onContinuePostStoryQueue,
    onAbandonPostStoryQueue,
    canReroll = true,
    reRollCount = 0,
    canRetryLatestVariableGeneration = false,
    canQuickRestart = false,
    options = [],
    externalDraft = null,
    mainStoryModelInfo = undefined,
    openingMainStoryProgress = null,
    openingPolishProgress = null,
    openingWorldEvolutionProgress = null,
    openingPlanningProgress = null,
    openingVariableGenerationProgress = null,
    openingMapUpdateProgress = null,
    isStreamingDefault = true,
    stageStreamMode = {}
}) => {
    const [content, setContent] = useState('');
    const [isStreaming, setIsStreaming] = useState(isStreamingDefault);
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
    const [mapUpdateProgress, setMapUpdateProgress] = useState<MapUpdateProgress | null>(null);
    const [expandedRawStageId, setExpandedRawStageId] = useState<string | null>(null);
    const [mainStoryElapsed, setMainStoryElapsed] = useState(0);
    const mainStoryStartRef = useRef<number>(0);

    useEffect(() => {
        if (loading || postStoryQueueRunning) {
            if (!mainStoryStartRef.current) {
                mainStoryStartRef.current = Date.now();
            }
            const timer = setInterval(() => {
                setMainStoryElapsed(Date.now() - mainStoryStartRef.current);
            }, 200);
            return () => clearInterval(timer);
        } else {
            setMainStoryElapsed(0);
            mainStoryStartRef.current = 0;
        }
    }, [loading, postStoryQueueRunning]);

    useEffect(() => {
        setIsStreaming(isStreamingDefault);
    }, [isStreamingDefault]);
    const [expandedCommandStageId, setExpandedCommandStageId] = useState<string | null>(null);
    const [queueCollapsed, setQueueCollapsed] = useState(true);
    const [mobileInputExpanded, setMobileInputExpanded] = useState(false);
    const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
    const desktopTextareaRef = useRef<HTMLTextAreaElement>(null);
    const [showQuickRestartMenu, setShowQuickRestartMenu] = useState(false);
    // 重ROLL 一次性引导：玩家反馈过不知道输入栏旁的回档图标（只看到纯图标 tooltip）。
    // 首次出现可回档回合时展示；手动关闭或实际用过一次后写 localStorage，不再显示。
    const [rerollHintDismissed, setRerollHintDismissed] = useState<boolean>(() => {
        try {
            return localStorage.getItem('moranjianghu.rerollHintDismissed') === '1';
        } catch {
            return false;
        }
    });
    const 关闭重roll提示 = () => {
        setRerollHintDismissed(true);
        try {
            localStorage.setItem('moranjianghu.rerollHintDismissed', '1');
        } catch {
            // 隐私模式等写入失败时仅本次会话不再显示
        }
    };
    const [errorModal, setErrorModal] = useState<{ open: boolean; title: string; content: string }>({
        open: false,
        title: '',
        content: ''
    });
    const [parseRepairModal, setParseRepairModal] = useState<{
        open: boolean;
        title: string;
        detail: string;
        hint: string;
        originalRaw: string;
        editedRaw: string;
        error: string;
    }>({
        open: false,
        title: '',
        detail: '',
        hint: '',
        originalRaw: '',
        editedRaw: '',
        error: ''
    });
    const [parseRepairBusy, setParseRepairBusy] = useState(false);
    const parseRepairTextareaRef = useRef<HTMLTextAreaElement>(null);
    const parseRepairDidAutoScrollRef = useRef(false);
    const quickActionsRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef({ active: false, startX: 0, startScrollLeft: 0, moved: false });
    const suppressClickUntilRef = useRef(0);
    const queueProgressDebugRef = useRef<Record<string, { lastAt: number; phase?: string }>>({});

    const 从错误详情提取问题关键词 = (detail: string): string[] => {
        const keywords = new Set<string>();
        const tagPattern = /<\s*\/?\s*(\w+)[^>]*>/g;
        let match;
        while ((match = tagPattern.exec(detail)) !== null) {
            keywords.add(match[0]);
        }
        const phrasePatterns = [
            /缺少[：:]\s*(.+)/,
            /缺失[：:]\s*(.+)/,
            /未找到[：:]\s*(.+)/,
            /未闭合[：:]\s*(.+)/,
            /不匹配[：:]\s*(.+)/,
            /格式错误[：:]\s*(.+)/,
        ];
        for (const pattern of phrasePatterns) {
            const m = pattern.exec(detail);
            if (m?.[1]) {
                keywords.add(m[1].trim().split(/[,，。；;]/)[0].trim());
            }
        }
        return Array.from(keywords).filter(k => k.length > 1);
    };

    useEffect(() => {
        if (!parseRepairModal.open) {
            parseRepairDidAutoScrollRef.current = false;
            return;
        }
        if (parseRepairDidAutoScrollRef.current) return;
        if (!parseRepairModal.editedRaw) return;
        const keywords = 从错误详情提取问题关键词(parseRepairModal.detail);
        if (keywords.length === 0) return;
        const text = parseRepairModal.editedRaw;
        for (const kw of keywords) {
            const idx = text.indexOf(kw);
            if (idx >= 0) {
                const charIndex = idx;
                const linesBefore = text.substring(0, charIndex).split('\n').length - 1;
                const lineHeight = 27;
                const targetScroll = linesBefore * lineHeight - 60;
                parseRepairDidAutoScrollRef.current = true;
                requestAnimationFrame(() => {
                    const el = parseRepairTextareaRef.current;
                    if (el) el.scrollTop = Math.max(0, targetScroll);
                });
                return;
            }
        }
    }, [parseRepairModal.open, parseRepairModal.detail, parseRepairModal.editedRaw]);

    useEffect(() => {
        if (!externalDraft?.text) return;
        setContent((current) => {
            const draft = externalDraft.text.trim();
            if (!draft) return current;
            const prefix = current.trim();
            return prefix ? `${prefix}\n${draft}` : draft;
        });
    }, [externalDraft?.token]);

    const 记录并设置队列进度 = <T extends QueueProgressPayload>(
        stage: string,
        progress: T,
        setter: React.Dispatch<React.SetStateAction<T | null>>
    ) => {
        const now = 获取性能时间();
        const previous = queueProgressDebugRef.current[stage];
        const intervalMs = previous ? Math.round(now - previous.lastAt) : null;
        queueProgressDebugRef.current[stage] = { lastAt: now, phase: progress.phase };

        const rawTextLength = progress.rawText?.length || 0;
        const textLength = progress.text?.length || 0;
        const commandCount = Array.isArray(progress.commandTexts) ? progress.commandTexts.length : 0;
        const commandChars = Array.isArray(progress.commandTexts)
            ? progress.commandTexts.reduce((sum, item) => sum + item.length, 0)
            : 0;
        const blockingRisk = false;
        const shouldLog = blockingRisk
            || !previous
            || previous.phase !== progress.phase
            || (intervalMs !== null && intervalMs > 1000);

        if (shouldLog && typeof window !== 'undefined') {
            const event = {
                at: new Date().toISOString(),
                stage,
                phase: progress.phase || 'unknown',
                intervalMs,
                textLength,
                rawTextLength,
                commandCount,
                commandChars,
                blockingRisk
            };
            const target = window as typeof window & {
                __moranQueueDebug?: { events: (typeof event)[] };
            };
            const store = target.__moranQueueDebug || { events: [] };
            store.events.push(event);
            if (store.events.length > QUEUE_DEBUG_EVENT_LIMIT) {
                store.events.splice(0, store.events.length - QUEUE_DEBUG_EVENT_LIMIT);
            }
            target.__moranQueueDebug = store;
            const log = blockingRisk ? console.warn : console.debug;
            log('[MoRanQueueDebug] queue progress', event);
        }

        setter(压缩队列进度用于渲染(progress));
    };

    const 清空剧情回忆提示 = () => {
        setPendingRecallTag('');
        setAttachedRecallPreview('');
        setShowAttachedRecall(false);
        setRecallProgress(null);
    };

    const 显示剧情回忆附件 = (preview: string, tag?: string) => {
        if (tag) {
            setPendingRecallTag(tag);
        }
        setAttachedRecallPreview(preview);
        setShowAttachedRecall(false);
        setRecallProgress(prev => prev?.phase === 'done' ? null : prev);
    };

    const handleSend = async () => {
        if (!content.trim()) return;
        if (loading || isPreparing) return;
        setIsPreparing(true);
        setErrorModal(prev => ({ ...prev, open: false }));
        setParseRepairModal(prev => ({ ...prev, open: false, error: '' }));
        setRecallProgress(null);
        setPolishProgress(null);
        setWorldEvolutionProgress(null);
        setPlanningProgress(null);
        setVariableGenerationProgress(null);
        setMapUpdateProgress(null);
        setExpandedRawStageId(null);
        setExpandedCommandStageId(null);
        setQueueCollapsed(true);
        try {
            let recallAutoRetried = false;
            const payload = pendingRecallTag
                ? `${content}\n<剧情回忆>\n${pendingRecallTag}\n</剧情回忆>`
                : content;
            let result = await onSend(payload, isStreaming, {
                onRecallProgress: (progress) => 记录并设置队列进度('recall', progress, setRecallProgress),
                onPolishProgress: (progress) => 记录并设置队列进度('polish', progress, setPolishProgress),
                onWorldEvolutionProgress: (progress) => 记录并设置队列进度('world', progress, setWorldEvolutionProgress),
                onPlanningProgress: (progress) => 记录并设置队列进度('planning', progress, setPlanningProgress),
                onVariableGenerationProgress: (progress) => 记录并设置队列进度('variable', progress, setVariableGenerationProgress),
                onMapUpdateProgress: (progress) => 记录并设置队列进度('map', progress, setMapUpdateProgress),
                onStageFailureDecision: async (params) => {
                    if (params.stageId === 'planning' && (params.manualAttempt || 1) <= 1) {
                        return 'skip';
                    }
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
                const retryPayload = `${content}\n<剧情回忆>\n${result.preparedRecallTag}\n</剧情回忆>`;
                result = await onSend(retryPayload, isStreaming, {
                    onRecallProgress: (progress) => 记录并设置队列进度('recall.retry', progress, setRecallProgress),
                    onPolishProgress: (progress) => 记录并设置队列进度('polish.retry', progress, setPolishProgress),
                    onWorldEvolutionProgress: (progress) => 记录并设置队列进度('world.retry', progress, setWorldEvolutionProgress),
                    onPlanningProgress: (progress) => 记录并设置队列进度('planning.retry', progress, setPlanningProgress),
                    onVariableGenerationProgress: (progress) => 记录并设置队列进度('variable.retry', progress, setVariableGenerationProgress),
                    onMapUpdateProgress: (progress) => 记录并设置队列进度('map.retry', progress, setMapUpdateProgress),
                    onStageFailureDecision: async (params) => {
                        if (params.stageId === 'planning' && (params.manualAttempt || 1) <= 1) {
                            return 'skip';
                        }
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
                        title: result.errorTitle || '恢复本回合',
                        detail: parseErrorText,
                        hint: result.recoveryHint || '可直接手动补全文本后恢复，或尝试自动修复恢复；如果不想保留这版内容，也可以直接重ROLL。',
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
                        if (result.attachedRecallPreview) {
                            显示剧情回忆附件(result.attachedRecallPreview, result.preparedRecallTag);
                        } else {
                            setPendingRecallTag(result.preparedRecallTag);
                        }
                    } else if (result.attachedRecallPreview) {
                        显示剧情回忆附件(result.attachedRecallPreview);
                    }
                    return;
                }
                if (result.preparedRecallTag) {
                    setPendingRecallTag(result.preparedRecallTag);
                }
                if (result.attachedRecallPreview) {
                    显示剧情回忆附件(result.attachedRecallPreview);
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
            清空剧情回忆提示();
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
        if (reRollCount > 1 && requestConfirm) {
            const accepted = await requestConfirm({
                title: '确认回档',
                message: `当前有 ${reRollCount} 个可回档回合。连续回档可能导致进度丢失，确定要回档到上一轮吗？`,
                confirmText: '确定回档',
                cancelText: '取消',
                danger: true
            });
            if (!accepted) return;
        }
        const restoredInput = await Promise.resolve(onRegenerate());
        if (!restoredInput) return;
        setContent(restoredInput);
        setLastSentContent(restoredInput);
        关闭重roll提示();
    };

    const handleRetryVariableGeneration = async () => {
        if (!onRetryLatestVariableGeneration) return;
        setVariableGenerationProgress({
            phase: 'start',
            text: '正在基于当前正文继续变量生成...'
        });
        setQueueCollapsed(false);
        const retryError = await Promise.resolve(onRetryLatestVariableGeneration({
            onVariableGenerationProgress: (progress) => 记录并设置队列进度('variable.manual-retry', progress, setVariableGenerationProgress)
        }));
        if (typeof retryError === 'string' && retryError.trim().length > 0) {
            setVariableGenerationProgress({
                phase: 'error',
                text: `${retryError.trim()}\n已保留当前正文，可稍后继续生成。`
            });
            setErrorModal({
                open: true,
                title: '继续变量生成失败',
                content: retryError
            });
        }
    };

    const handleRetryStage = async (stageId: 'polish' | 'world' | 'planning' | 'map') => {
        if (!onRetryLatestStage) return;
        setQueueCollapsed(false);
        const retryError = await Promise.resolve(onRetryLatestStage(stageId, {
            onPolishProgress: (progress) => 记录并设置队列进度('polish.manual-retry', progress, setPolishProgress),
            onWorldEvolutionProgress: (progress) => 记录并设置队列进度('world.manual-retry', progress, setWorldEvolutionProgress),
            onPlanningProgress: (progress) => 记录并设置队列进度('planning.manual-retry', progress, setPlanningProgress),
            onMapUpdateProgress: (progress) => 记录并设置队列进度('map.manual-retry', progress, setMapUpdateProgress)
        }));
        if (typeof retryError === 'string' && retryError.trim().length > 0) {
            const message = retryError.trim();
            const setErrorProgress = {
                polish: setPolishProgress,
                world: setWorldEvolutionProgress,
                planning: setPlanningProgress,
                map: setMapUpdateProgress
            }[stageId];
            setErrorProgress({
                phase: 'error',
                text: `${message}\n可稍后再次重新生成该阶段。`
            } as never);
            setErrorModal({
                open: true,
                title: '重新生成失败',
                content: message
            });
        }
    };

    const 复制队列文本 = async (text: string, label: string) => {
        const content = (text || '').trim();
        if (!content) return;
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(content);
                return;
            }
        } catch {
            // 回退到 prompt，兼容不允许剪贴板写入的 WebView。
        }
        if (typeof window !== 'undefined') {
            window.prompt(`请手动复制${label}：`, content);
        }
    };

    const handleApplyParseRepair = async (mode: 'auto' | 'manual') => {
        setParseRepairBusy(true);
        setParseRepairModal(prev => ({ ...prev, error: '' }));
        try {
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
                title: '',
                detail: '',
                hint: '',
                originalRaw: '',
                editedRaw: '',
                error: ''
            });
            setContent('');
            setLastSentContent('');
        } catch (error: any) {
            setParseRepairModal(prev => ({ ...prev, error: error?.message || '恢复失败，请稍后再试。' }));
        } finally {
            setParseRepairBusy(false);
        }
    };

    const handleQuickRestartSelect = async (mode: QuickRestartMode) => {
        if (!onQuickRestart) return;
        const optionsMap: Record<QuickRestartMode, { title: string; message: string }> = {
            world_only: {
                title: '重新生成世界观设定',
                message: '将仅重新生成世界观/境界提示词，不会刷新动态世界，也不会自动生成开局剧情。是否继续？'
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
    const isProtocolTagOption = (value: string): boolean => (
        /^<\s*\/?\s*(?:thinking|think|正文|短期记忆|变量规划|剧情规划|行动选项|命令|动态世界|judge)\s*[\]>]\s*$/i.test(value.trim())
    );

    const normalizedOptions = options
        .map(normalizeOptionText)
        .filter(item => item.length > 0 && !isProtocolTagOption(item));

    const busy = loading || isPreparing || variableGenerationRunning || postStoryQueueRunning;
    const recallRunning = isPreparing && !loading;
    const effectivePolishProgress = polishProgress || openingPolishProgress;
    const effectiveVariableGenerationProgress = variableGenerationProgress || openingVariableGenerationProgress;
    const effectiveWorldEvolutionProgress = worldEvolutionProgress || openingWorldEvolutionProgress;
    const effectivePlanningProgress = planningProgress || openingPlanningProgress;
    const effectiveMapUpdateProgress = mapUpdateProgress || openingMapUpdateProgress;
    const openingProgressItems = [
        openingPolishProgress,
        openingVariableGenerationProgress,
        openingWorldEvolutionProgress,
        openingPlanningProgress,
        openingMapUpdateProgress
    ];
    const isOpeningQueue = openingProgressItems.some(Boolean);
    const openingQueueHasError = openingProgressItems
        .some((item) => item?.phase === 'error');
    const openingQueueRunning = openingProgressItems
        .some((item) => 队列阶段运行中(item?.phase));
    const openingFinalProgress = openingQueueHasError
        ? null
        : (openingQueueRunning
            ? { phase: undefined, text: '等待独立阶段完成后写入存档。', channelName: '本地状态处理', modelName: '不调用 AI' }
            : { phase: 'done', text: '开局独立阶段已结束，当前状态可落盘。', channelName: '本地状态处理', modelName: '不调用 AI' });
    const openingLocalProgress = { phase: 'done', text: '已完成开局建档与玩家设定。', channelName: '本地输入', modelName: '不调用 AI' };
    const openingStoryProgress = openingMainStoryProgress || {
        phase: 'done',
        text: '主剧情已生成，后续为独立初始化阶段。',
        channelName: mainStoryModelInfo?.channelName || '未配置渠道',
        modelName: mainStoryModelInfo?.modelName || '未选择模型'
    };
    const pipelineStages = (isOpeningQueue ? [
        { id: 'opening-input', label: '玩家建档输入', progress: openingLocalProgress },
        { id: 'opening-story', label: '开局主剧情', progress: openingStoryProgress },
        { id: 'opening-polish', label: '开局文章优化', progress: openingPolishProgress },
        { id: 'variable', label: '开局变量生成', progress: openingVariableGenerationProgress },
        { id: 'world', label: '开局动态世界', progress: openingWorldEvolutionProgress },
        { id: 'planning', label: '开局规划分析', progress: openingPlanningProgress },
        { id: 'opening-map', label: '开局地图更新', progress: openingMapUpdateProgress },
        { id: 'opening-save', label: '最终落盘', progress: openingFinalProgress }
    ] : [
        { id: 'polish', label: '文章优化', progress: effectivePolishProgress },
        { id: 'variable', label: '变量生成', progress: effectiveVariableGenerationProgress },
        { id: 'world', label: '动态世界', progress: effectiveWorldEvolutionProgress },
        { id: 'planning', label: '规划分析', progress: effectivePlanningProgress },
        { id: 'map', label: '地图更新', progress: effectiveMapUpdateProgress }
    ]);
    const queueVisible = pipelineStages.some((stage) => Boolean(stage.progress));
    const currentRunningStage = pipelineStages.find((stage) => 队列阶段运行中(stage.progress?.phase));
    const latestFinishedStage = [...pipelineStages].reverse().find((stage) => stage.progress && !队列阶段运行中(stage.progress.phase));
    const queueRunning = Boolean(currentRunningStage);
    const queueBadgeClass = queueRunning
        ? 'border-wuxia-cyan/60 bg-gradient-to-r from-wuxia-cyan/20 via-wuxia-gold/15 to-wuxia-cyan/20 text-wuxia-cyan animate-pulse shadow-[0_0_18px_rgba(34,211,238,0.2)]'
        : 'border-wuxia-gold/35 bg-black text-wuxia-gold/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)]';
    const RunningSpinner = ({ small = false }: { small?: boolean }) => (
        <span className={`relative inline-flex shrink-0 items-center justify-center ${small ? 'h-4 w-4' : 'h-5 w-5'}`} aria-hidden="true">
            <span className="absolute inset-0 rounded-full border border-wuxia-cyan/25 animate-ping" />
            <span className="absolute inset-0 rounded-full border-2 border-wuxia-cyan/25 border-t-wuxia-cyan border-r-wuxia-gold animate-spin" />
            <span className={`${small ? 'h-1 w-1' : 'h-1.5 w-1.5'} rounded-full bg-wuxia-cyan shadow-[0_0_10px_rgba(34,211,238,0.9)]`} />
        </span>
    );
    const 取阶段状态文案 = (phase?: string): string => {
        if (!phase) return '待命';
        if (phase === 'start' || phase === 'stream') return '处理中';
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
        if (phase === 'start' || phase === 'stream') return 'text-wuxia-cyan';
        return 'text-gray-500';
    };

    useEffect(() => {
        const hasMainQueueError = [
            polishProgress,
            openingPolishProgress,
            effectiveVariableGenerationProgress,
            effectiveWorldEvolutionProgress,
            effectivePlanningProgress,
            effectiveMapUpdateProgress
        ]
            .some((item) => item?.phase === 'error');
        if (hasMainQueueError) {
            // 错误时也不自动展开，保持收缩
        }
    }, [
        polishProgress?.phase,
        openingPolishProgress?.phase,
        effectiveVariableGenerationProgress?.phase,
        effectiveWorldEvolutionProgress?.phase,
        effectivePlanningProgress?.phase,
        effectiveMapUpdateProgress?.phase
    ]);

    useEffect(() => {
        if (!queueVisible || queueRunning) return;
        const hasQueueError = pipelineStages.some((stage) => stage.progress?.phase === 'error');
        if (hasQueueError) return;
        const timerId = window.setTimeout(() => {
            setQueueCollapsed(true);
            setExpandedRawStageId(null);
            setExpandedCommandStageId(null);
        }, 1200);
        return () => window.clearTimeout(timerId);
    }, [
        queueVisible,
        queueRunning,
        polishProgress?.phase,
        openingPolishProgress?.phase,
        effectiveVariableGenerationProgress?.phase,
        effectiveWorldEvolutionProgress?.phase,
        effectivePlanningProgress?.phase,
        effectiveMapUpdateProgress?.phase
    ]);

    return (
        <div className={`shrink-0 relative z-20 pb-2 px-2 sm:px-4 flex flex-col gap-1`}>
            {queueVisible && (
                <div className="w-full px-2 md:px-4">
                    <div className="mx-auto w-full max-w-5xl space-y-1">
                        {queueVisible && (
                            <>
                        {!queueCollapsed && (
                            <div className="flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setQueueCollapsed(true)}
                                    className={`h-8 min-w-[8rem] sm:min-w-[15rem] max-w-full rounded-full border px-4 text-sm tracking-[0.08em] transition hover:bg-neutral-950 ${queueBadgeClass}`}
                                    title="收起独立更新阶段队列"
                                >
                                    <span className="inline-flex min-w-0 items-center justify-center gap-2">
                                        {queueRunning && <RunningSpinner />}
                                        <span className="min-w-0 truncate">{queueRunning ? `${currentRunningStage?.label || ''}运行中` : '收起队列'}</span>
                                    </span>
                                </button>
                            </div>
                        )}
                        {queueCollapsed ? (
                            <div className="flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setQueueCollapsed(false)}
                                    className={`h-9 min-w-[8rem] sm:min-w-[15rem] max-w-[calc(100vw-2rem)] rounded-full border px-4 text-sm tracking-[0.08em] transition hover:bg-neutral-950 ${queueBadgeClass}`}
                                    title="展开独立更新阶段队列"
                                >
                                    <span className="inline-flex min-w-0 items-center justify-center gap-2">
                                        {queueRunning && <RunningSpinner />}
                                        <span className="min-w-0 truncate">{queueRunning ? `${currentRunningStage?.label || '队列'}运行中` : '队列'}</span>
                                    </span>
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                            <div className="flex-1 min-w-0 rounded-lg border border-wuxia-gold/25 bg-neutral-950/95 p-3 space-y-2 max-h-[32svh] sm:max-h-[40vh] md:max-h-[58vh] overflow-y-auto overscroll-contain no-scrollbar">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                    <div className="text-wuxia-gold">{isOpeningQueue ? '开局初始化队列' : '独立更新阶段队列'}</div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-400">
                                            当前阶段：{currentRunningStage?.label || '无'}
                                            {' | '}
                                            上一阶段结果：{latestFinishedStage ? `${latestFinishedStage.label} ${取阶段状态文案(latestFinishedStage.progress?.phase)}` : '无'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setQueueCollapsed(true)}
                                            className="w-6 h-6 flex items-center justify-center rounded-full border border-gray-600/50 text-gray-400 hover:text-red-400 hover:border-red-400/50 hover:bg-red-400/10 transition-colors shrink-0 sm:hidden"
                                            title="关闭队列面板"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                    {pipelineStages.map((stage, index) => {
                                        const progress = stage.progress;
                                        const phase = progress?.phase;
                                        const isRunningStage = Boolean(phase && 队列阶段运行中(phase));
                                        const rawText = progress?.rawText || '';
                                        const progressText = progress?.text;
                                        const originalCommandTexts = Array.isArray((progress as { commandTexts?: string[] } | null)?.commandTexts)
                                            ? ((progress as { commandTexts?: string[] }).commandTexts || [])
                                            : [];
                                        const commandTexts = originalCommandTexts;
                                        const commandDisplayText = 合并队列命令展示(commandTexts);
                                        const rawExpanded = expandedRawStageId === stage.id;
                                        const commandExpanded = expandedCommandStageId === stage.id;
                                        const isVariableStage = stage.id === 'variable';
                                        const hidesModel = 队列阶段不调用AI(stage.progress);
                                        const elapsedText = 格式化队列耗时(stage.progress?.elapsedMs);
                                        const hasVisibleProgressText = Boolean(
                                            typeof progressText === 'string'
                                            && progressText.trim().length > 0
                                            && isRunningStage
                                        );
                                        const rerunAction = !isRunningStage && !variableGenerationRunning
                                            ? 获取队列阶段重新生成动作({
                                                stageId: stage.id,
                                                phase,
                                                isOpeningQueue,
                                                hasReroll: canReroll,
                                                hasRetryLatestVariableGeneration: Boolean(canRetryLatestVariableGeneration && onRetryLatestVariableGeneration),
                                                hasRetryLatestStage: Boolean(onRetryLatestStage),
                                                hasQuickRestart: Boolean(canQuickRestart && onQuickRestart)
                                            })
                                            : null;
                                        return (
                                            <div key={stage.id} className="rounded border border-gray-800/80 bg-neutral-950 p-2">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-gray-500 text-xs">{index + 1}.</span>
                                                        {isRunningStage ? (
                                                            <RunningSpinner small />
                                                        ) : (
                                                            <span className={取阶段状态色(phase)}>●</span>
                                                        )}
                                                        <span className="text-sm text-gray-100">{stage.label}</span>
                                                        {elapsedText && <span className="text-[11px] text-gray-500 font-mono">{elapsedText}</span>}
                                                        {(() => {
                                                            const id = stage.id.replace(/^opening-/, '').replace(/^story$/, 'main');
                                                            const mode = stageStreamMode[id];
                                                            return mode ? (
                                                                <span
                                                                    className={`ml-1 inline-flex items-center rounded px-1 py-[1px] text-[10px] font-mono
                                                                    ${mode === 'non-stream'
                                                                        ? 'text-amber-500/80 bg-amber-500/10 [html[data-theme="day"]_&]:text-amber-800 [html[data-theme="day"]_&]:bg-amber-100'
                                                                        : 'text-cyan-400/90 bg-cyan-500/10 [html[data-theme="day"]_&]:text-cyan-800 [html[data-theme="day"]_&]:bg-cyan-100'
                                                                    }`}
                                                                >
                                                                    {mode === 'non-stream' ? '[非流式]' : '[流式]'}
                                                                </span>
                                                            ) : null;
                                                        })()}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {isVariableStage && isRunningStage && variableGenerationRunning && onCancelVariableGeneration && (
                                                            <button
                                                                type="button"
                                                                onClick={onCancelVariableGeneration}
                                                                className="text-xs px-2 py-1 border border-teal-400/40 text-teal-100 rounded hover:bg-teal-500/10"
                                                            >
                                                                取消生成
                                                            </button>
                                                        )}
                                                        {rerunAction && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (rerunAction === 'quick-opening-all') {
                                                                        void handleQuickRestartSelect('all');
                                                                    } else if (rerunAction === 'reroll') {
                                                                        void handleReroll();
                                                                    } else if (rerunAction === 'retry-variable') {
                                                                        void handleRetryVariableGeneration();
                                                                    } else if (rerunAction === 'retry-stage' && (stage.id === 'polish' || stage.id === 'world' || stage.id === 'planning' || stage.id === 'map')) {
                                                                        void handleRetryStage(stage.id);
                                                                    }
                                                                }}
                                                                className="text-xs px-2 py-1 border border-cyan-400/40 text-cyan-100 rounded hover:bg-cyan-500/10"
                                                            >
                                                                {rerunAction === 'quick-opening-all' ? '重跑世界观+开局' : '重新生成'}
                                                            </button>
                                                        )}
                                                        {commandTexts.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setExpandedCommandStageId(commandExpanded ? null : stage.id);
                                                                    if (!commandExpanded) setExpandedRawStageId(null);
                                                                }}
                                                                className="text-xs px-2 py-1 border border-gray-700 text-gray-300 rounded hover:border-wuxia-gold/40 hover:text-white"
                                                            >
                                                                {commandExpanded ? '收起命令' : '查看命令'}
                                                            </button>
                                                        )}
                                                        {rawText && (
                                                            <button
                                                                type="button"
                                                                onClick={() => { void 复制队列文本(rawText, `${stage.label}原始回复`); }}
                                                                className="text-xs px-2 py-1 border border-emerald-700/70 text-emerald-200 rounded hover:border-emerald-400/70 hover:text-white"
                                                            >
                                                                复制原始回复
                                                            </button>
                                                        )}
                                                        {rawText && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setExpandedRawStageId(rawExpanded ? null : stage.id);
                                                                    if (!rawExpanded) setExpandedCommandStageId(null);
                                                                }}
                                                                className="text-xs px-2 py-1 border border-gray-700 text-gray-300 rounded hover:border-wuxia-gold/40 hover:text-white"
                                                            >
                                                                {rawExpanded ? '收起原始回复' : '查看原始回复'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                {hasVisibleProgressText && (
                                                    <pre className="mt-2 text-sm whitespace-pre-wrap text-gray-300 leading-relaxed max-h-24 sm:max-h-32 overflow-y-auto no-scrollbar">
                                                        {progressText}
                                                    </pre>
                                                )}
                                                {(phase === 'error' && stage.progress?.text) && (
                                                    <pre className="mt-2 text-sm whitespace-pre-wrap text-red-300 leading-relaxed max-h-24 overflow-y-auto no-scrollbar">
                                                        {stage.progress.text}
                                                    </pre>
                                                )}
                                                {(stage.progress?.channelName || (!hidesModel && stage.progress?.modelName)) && (
                                                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] leading-5">
                                                        {stage.progress?.channelName && (
                                                            <span className="rounded border border-wuxia-cyan/25 bg-wuxia-cyan/10 px-2 py-0.5 text-wuxia-cyan">
                                                                渠道：{stage.progress.channelName}
                                                            </span>
                                                        )}
                                                        {!hidesModel && stage.progress?.modelName && (
                                                            <span className="rounded border border-wuxia-gold/25 bg-wuxia-gold/10 px-2 py-0.5 text-wuxia-gold">
                                                                模型：{stage.progress.modelName}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            {(expandedCommandStageId || expandedRawStageId) && (() => {
                                const expandedId = expandedCommandStageId || expandedRawStageId;
                                const stage = pipelineStages.find((s) => s.id === expandedId);
                                if (!stage) return null;
                                const isCommand = Boolean(expandedCommandStageId);
                                const commandTexts = Array.isArray((stage.progress as any)?.commandTexts) ? (stage.progress as any).commandTexts : [];
                                const rawText = stage.progress?.rawText || '';
                                const commandDisplayText = commandTexts.join('\n');
                                return (
                                    <div className="w-80 shrink-0 rounded-lg border border-wuxia-gold/25 bg-neutral-950/95 p-3 max-h-[32svh] sm:max-h-[40vh] md:max-h-[58vh] overflow-y-auto overscroll-contain no-scrollbar space-y-2">
                                        <div className="text-xs text-wuxia-gold font-bold mb-1">
                                            {stage.label} — {isCommand ? '命令列表' : '原始回复'}
                                        </div>
                                        {isCommand ? (
                                            <pre className="text-[11px] whitespace-pre-wrap text-sky-100 leading-relaxed">
                                                {commandDisplayText}
                                            </pre>
                                        ) : (
                                            <pre className="text-[11px] whitespace-pre-wrap text-emerald-200 leading-[1.8]">
                                                {rawText}
                                            </pre>
                                        )}
                                    </div>
                                );
                            })()}
                            </div>
                        )}
                            </>
                        )}
                    </div>
                </div>
            )}
            {/* Quick Actions Chips (Fixed Box Size, Scrolling Text) */}
            {normalizedOptions.length > 0 && (
                <div
                    ref={quickActionsRef}
                    className="desktop-quick-actions w-full px-2 md:px-4 pb-0 overflow-x-auto no-scrollbar select-none cursor-grab active:cursor-grabbing"
                    onPointerDown={handleQuickActionsPointerDown}
                    onPointerMove={handleQuickActionsPointerMove}
                    onPointerUp={endQuickActionsDrag}
                    onPointerCancel={endQuickActionsDrag}
                    onPointerLeave={endQuickActionsDrag}
                >
                    <div className="desktop-quick-actions-list flex flex-nowrap md:flex-wrap md:justify-center gap-2 min-w-max md:min-w-0">
                        {normalizedOptions.map((opt, idx) => (
                            <button 
                                key={idx}
                                onClick={() => handleOptionClick(opt)}
                                disabled={loading}
                                className="desktop-quick-action-button shrink-0 px-3 py-1.5 bg-black/55 border border-wuxia-gold/40 text-gray-100 rounded hover:bg-wuxia-gold hover:text-ink-black hover:border-wuxia-gold transition-all text-sm sm:text-base tracking-[0.08em] shadow-sm backdrop-blur-sm min-w-[96px] sm:min-w-[112px] max-w-[320px] text-center disabled:opacity-50 disabled:cursor-not-allowed"
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
                    {(recallProgress.channelName || (!队列阶段不调用AI(recallProgress) && recallProgress.modelName) || 格式化队列耗时(recallProgress.elapsedMs)) && (
                        <div className="flex flex-wrap gap-2 text-[11px] leading-5">
                            <span className="rounded border border-wuxia-cyan/25 bg-wuxia-cyan/10 px-2 py-0.5 text-wuxia-cyan">
                                渠道：{recallProgress.channelName || '未配置渠道'}
                            </span>
                            {!队列阶段不调用AI(recallProgress) && (
                                <span className="rounded border border-wuxia-gold/25 bg-wuxia-gold/10 px-2 py-0.5 text-wuxia-gold">
                                    模型：{recallProgress.modelName || '未选择模型'}
                                </span>
                            )}
                            {格式化队列耗时(recallProgress.elapsedMs) && (
                                <span className="rounded border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-emerald-200">
                                    耗时：{格式化队列耗时(recallProgress.elapsedMs)}
                                </span>
                            )}
                        </div>
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
                            仅重生世界观设定
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
            
            {pendingPostStoryQueue && pendingPostStoryQueue.阶段摘要.length > 0 && (
                <div className="space-y-2 rounded-lg border border-wuxia-gold/50 bg-wuxia-gold/10 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-bold tracking-wider text-wuxia-gold">
                            正文已生成 · 后续步骤待确认
                        </div>
                        <span className="shrink-0 rounded border border-wuxia-gold/30 bg-black/40 px-1.5 py-0.5 text-[10px] text-wuxia-gold/80">
                            省额度模式
                        </span>
                    </div>
                    <div className="text-[11px] leading-relaxed text-gray-300">
                        还没有执行：
                        <span className="text-wuxia-cyan">{pendingPostStoryQueue.阶段摘要.join(' / ')}</span>
                        。本回合尚未自动存档。
                    </div>
                    <div className="text-[11px] leading-relaxed text-gray-400">
                        对正文满意就点「继续执行后续步骤」；不满意可以直接重ROLL，不会消耗这些阶段的额度。
                    </div>
                    <div className="flex flex-wrap gap-2 pt-0.5">
                        {onContinuePostStoryQueue && (
                            <button
                                type="button"
                                onClick={() => { void Promise.resolve(onContinuePostStoryQueue()); }}
                                className="rounded border border-wuxia-gold/60 bg-wuxia-gold/20 px-3 py-1.5 text-[11px] font-bold text-wuxia-gold transition-colors hover:bg-wuxia-gold hover:text-ink-black"
                            >
                                继续执行后续步骤
                            </button>
                        )}
                        {onAbandonPostStoryQueue && (
                            <button
                                type="button"
                                onClick={() => onAbandonPostStoryQueue()}
                                className="rounded border border-gray-700 px-3 py-1.5 text-[11px] text-gray-300 transition-colors hover:border-gray-500 hover:text-gray-100"
                            >
                                放弃后续步骤
                            </button>
                        )}
                    </div>
                </div>
            )}

            {!rerollHintDismissed && canReroll && !busy && (
                <div className="flex items-start gap-2 rounded-lg border border-wuxia-gold/30 bg-wuxia-gold/5 px-3 py-2">
                    <span className="flex-1 text-[11px] leading-relaxed text-wuxia-gold/90">
                        对上一回合的「主剧情」回复不满意？点工具栏中的「重ROLL」回旋箭头图标，可回档到上一轮——你输入的行动会自动填回输入框，修改后重新发送即可。（「角色对话」面板里的对话另有一套「重ROLL」按钮，在对话框下方。）
                    </span>
                    <button
                        type="button"
                        onClick={关闭重roll提示}
                        className="shrink-0 rounded p-0.5 text-wuxia-gold/60 transition-colors hover:text-wuxia-gold"
                        title="不再显示"
                        aria-label="不再显示重roll提示"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-3.5 w-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Main Control Bar */}
            <div className="flex items-center gap-1 sm:gap-1.5">
                
                {/* Left Controls Group */}
                <div className="flex shrink-0 items-center gap-0.5 bg-black/40 border border-gray-700/50 rounded-lg p-0.5 h-9 sm:gap-1 sm:rounded-xl sm:p-1 sm:h-11">
                    {/* Role Chat (场外角色对话) */}
                    {onOpenRoleChat && (
                        <button
                            onClick={onOpenRoleChat}
                            className="w-7 sm:w-9 h-full rounded-md sm:rounded-lg flex items-center justify-center text-amber-200 hover:text-amber-100 hover:bg-amber-900/20 transition-all disabled:opacity-30"
                            title="角色对话：与在场角色场外私聊（暂存后随下次行动注入）"
                            disabled={busy}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                            </svg>
                        </button>
                    )}
                    {/* Stream Toggle */}
                    <button 
                        onClick={() => setIsStreaming(!isStreaming)}
                        className={`w-7 sm:w-9 h-full rounded-md sm:rounded-lg flex items-center justify-center transition-all ${isStreaming ? 'text-wuxia-cyan bg-wuxia-cyan/10' : 'text-gray-600 hover:text-gray-400'}`}
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
                                className="w-7 sm:w-9 h-full rounded-md sm:rounded-lg flex items-center justify-center text-teal-300 hover:text-teal-100 hover:bg-teal-900/20 transition-all disabled:opacity-30"
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
                        className="w-7 sm:w-9 h-full rounded-md sm:rounded-lg flex items-center justify-center text-gray-400 hover:text-wuxia-gold hover:bg-white/5 transition-all disabled:opacity-30"
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
                        className="w-7 sm:w-9 h-full rounded-md sm:rounded-lg flex items-center justify-center text-cyan-300 hover:text-cyan-100 hover:bg-cyan-900/20 transition-all disabled:opacity-30"
                        title={canRetryLatestVariableGeneration ? "基于当前正文继续变量生成" : "当前没有可继续变量生成的最新回合"}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-3.22-6.92" />
                        </svg>
                    </button>
                </div>

                {/* Input Field */}
                <div className={`flex-1 min-w-0 bg-black/40 border border-gray-700/50 rounded-lg transition-all shadow-inner sm:rounded-xl sm:px-4 sm:flex sm:items-center px-2.5 ${busy ? 'opacity-50 cursor-not-allowed' : 'focus-within:border-wuxia-gold/50 focus-within:bg-black/60'} ${mobileInputExpanded ? 'h-auto' : 'h-9'} sm:h-auto sm:min-h-[44px] sm:max-h-[160px] sm:overflow-hidden`}>
                    {/* Mobile: textarea with auto-grow */}
                    <textarea
                        ref={mobileTextareaRef}
                        className="sm:hidden w-full bg-transparent text-[13px] text-paper-white font-serif placeholder-gray-600 focus:outline-none resize-none py-2 leading-[1.4]"
                        placeholder={busy ? "等待处理中..." : "输入你的行动..."}
                        value={content}
                        onChange={(e) => {
                            setContent(e.target.value);
                            // Auto-grow: reset height then set to scrollHeight
                            const el = e.target;
                            el.style.height = 'auto';
                            const maxH = mobileInputExpanded ? 144 : 72; // max 5 lines expanded, 2.5 lines collapsed
                            el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !busy) {
                                e.preventDefault();
                                void handleSend();
                            }
                        }}
                        disabled={busy}
                        rows={1}
                        style={{ height: mobileInputExpanded ? undefined : 36, minHeight: 36, maxHeight: mobileInputExpanded ? 144 : 72 }}
                        onBlur={() => { if (!content.trim()) setMobileInputExpanded(false); }}
                    />
                    {/* Desktop: textarea with auto-grow (Enter sends, Shift+Enter newline) */}
                    <textarea
                        ref={desktopTextareaRef}
                        className="hidden sm:block w-full bg-transparent text-[15px] text-paper-white font-serif placeholder-gray-600 focus:outline-none resize-none py-2.5 leading-[1.5]"
                        placeholder={busy ? "等待处理中..." : "输入你的行动..."}
                        value={content}
                        onChange={(e) => {
                            setContent(e.target.value);
                            const el = e.target;
                            el.style.height = 'auto';
                            el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !busy) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        disabled={busy}
                        rows={1}
                        style={{ minHeight: 44, maxHeight: 160 }}
                    />
                </div>

                {/* Mobile: expand/collapse input toggle (hidden on desktop) */}
                <button
                    type="button"
                    onClick={() => {
                        setMobileInputExpanded(!mobileInputExpanded);
                        if (!mobileInputExpanded) {
                            setTimeout(() => mobileTextareaRef.current?.focus(), 50);
                        }
                    }}
                    className="sm:hidden w-8 h-9 shrink-0 flex items-center justify-center text-gray-400 hover:text-wuxia-gold transition-colors"
                    title={mobileInputExpanded ? "折叠输入框" : "展开输入框"}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform ${mobileInputExpanded ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                </button>

                {/* Send / Stop Button */}
                {loading || isPreparing || variableGenerationRunning || postStoryQueueRunning ? (
                    <div className="flex items-center gap-2 shrink-0">
                        {(loading || postStoryQueueRunning) && mainStoryElapsed > 0 && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-wuxia-cyan/30 bg-wuxia-cyan/10">
                                <span className="text-[11px] text-wuxia-cyan/70">{loading ? '生成中' : '队列中'}</span>
                                <span className="text-[12px] text-wuxia-cyan font-mono font-bold tabular-nums">
                                    {格式化队列耗时(mainStoryElapsed)}
                                </span>
                            </div>
                        )}
                    <button 
                        onClick={postStoryQueueRunning ? handleStop : (variableGenerationRunning && onCancelVariableGeneration ? onCancelVariableGeneration : handleStop)}
                        className="ml-1 w-10 sm:w-12 sm:ml-0 h-9 sm:h-11 shrink-0 bg-wuxia-red text-white rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(163,24,24,0.3)] hover:bg-red-600 hover:scale-105 active:scale-95 transition-all"
                        title={postStoryQueueRunning ? "强制终止AI推演" : (variableGenerationRunning ? "取消变量生成" : (recallRunning ? "取消检索" : "停止生成"))}
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 sm:w-6 sm:h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                         </svg>
                    </button>
                    </div>
                ) : (
                    <button 
                        onClick={() => { void handleSend(); }} 
                        disabled={!content.trim() || busy} 
                        className="ml-1 w-10 sm:w-12 sm:ml-0 h-9 sm:h-11 shrink-0 bg-wuxia-gold text-ink-black rounded-lg sm:rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(230,200,110,0.3)] hover:bg-white hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
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
                    className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                >
                    <div
                        className="mx-auto w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-lg border border-wuxia-cyan/35 bg-black/95 p-6 shadow-[0_0_36px_rgba(0,0,0,0.85)]"
                    >
                        <div className="flex items-center justify-between gap-4 mb-4">
                            <h4 className="text-xl font-serif font-bold text-wuxia-cyan">
                                {parseRepairModal.title || '恢复本回合'}
                            </h4>
                            <button
                                type="button"
                                onClick={() => setParseRepairModal(prev => ({ ...prev, open: false }))}
                                className="text-gray-400 hover:text-white transition-colors text-2xl leading-none px-2"
                                aria-label="关闭解析修复弹窗"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="text-sm text-gray-300 whitespace-pre-wrap border border-gray-800 rounded-md bg-black/50 p-4 mb-4 leading-relaxed">
                            {parseRepairModal.detail}
                        </div>
                        <div className="text-xs text-gray-500 mb-3">{parseRepairModal.hint || '可直接手动补全文本后恢复，或尝试自动修复恢复。'}</div>
                        <textarea
                            ref={parseRepairTextareaRef}
                            value={parseRepairModal.editedRaw}
                            onChange={(e) => setParseRepairModal(prev => ({ ...prev, editedRaw: e.target.value, error: '' }))}
                            className="w-full h-96 bg-black/80 border border-gray-700 rounded-md p-4 text-sm text-green-300 font-mono whitespace-pre resize-y outline-none focus:border-wuxia-cyan/60 leading-[1.7]"
                        />
                        {parseRepairModal.error && (
                            <div className="mt-3 text-sm text-red-300 border border-red-500/30 bg-red-950/20 rounded p-3 whitespace-pre-wrap">
                                {parseRepairModal.error}
                            </div>
                        )}
                        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => { void handleApplyParseRepair('auto'); }}
                                disabled={parseRepairBusy}
                                className="px-5 py-2.5 text-sm font-bold rounded border border-wuxia-cyan/50 text-wuxia-cyan hover:bg-wuxia-cyan/10 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {parseRepairBusy ? '自动修复中...' : '自动修复并应用'}
                            </button>
                            <button
                                type="button"
                                onClick={() => { void handleApplyParseRepair('manual'); }}
                                disabled={parseRepairBusy}
                                className="px-5 py-2.5 text-sm font-bold rounded border border-wuxia-gold/50 text-wuxia-gold hover:bg-wuxia-gold/10 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {parseRepairBusy ? '处理中...' : '手动编辑后应用'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void handleReroll();
                                    setParseRepairModal({
                                        open: false,
                                        title: '',
                                        detail: '',
                                        hint: '',
                                        originalRaw: '',
                                        editedRaw: '',
                                        error: ''
                                    });
                                }}
                                className="px-5 py-2.5 text-sm font-bold rounded border border-red-900/60 text-red-300 hover:bg-red-900/20"
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

        </div>
    );
};

export default InputArea;
