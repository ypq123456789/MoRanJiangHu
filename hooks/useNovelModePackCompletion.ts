import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeRuntimeProfile, 题材模式类型 } from '../models/system';
import type { 小说拆分数据集结构 } from '../models/novelDecomposition';
import type { 小说模式包完善记录 } from '../models/novelModePackCompletion';
import type { 当前可用接口结构 } from '../utils/apiConfig';
import {
    删除小说模式包完善记录,
    构建小说模式包数据集指纹,
    读取小说模式包完善记录,
    保存小说模式包完善记录
} from '../services/novelModePackCompletionStore';
import { 执行小说模式包逐段完善 } from '../services/novelModePackCompletionWorkflow';
import { generateNovelModePackFinalization, generateNovelModePackSegmentCompletion } from '../services/ai/storyTasks';
import { 清洗小说模式包累积草稿 } from '../services/novelDecompositionWorkshopBridge';

type Toast = { title: string; message: string; tone?: 'info' | 'success' | 'error' };

export interface 小说模式包完善界面状态 {
    primaryAction: 'start' | 'resume' | 'cancel' | 'retry' | 'none';
    showRestart: boolean;
    canUseDraft: boolean;
    canEditDraft: boolean;
    /** 允许跳过当前失败分段：仅在暂停且有失败段时可用。 */
    canSkipSegment: boolean;
    skippedCount: number;
    statusText: string;
    truncationText: string;
    progressPercent: number;
}

export const 是否允许模式包完善运行回写 = (
    activeTargetKey: string,
    runTargetKey: string,
    activeToken: number,
    runToken: number
): boolean => activeTargetKey === runTargetKey && activeToken === runToken;

/**
 * 解析当前生效的模式包完善记录。
 * [修复] 历史写法为 `record?.数据集ID === dataset?.id && record.题材 === baseMode`：
 * 当工作台刚打开、尚未选中小说时 record 与 dataset 同时为 null，
 * 前半段会退化成 `undefined === undefined` 判定为真，继续读取 `record.题材`
 * 抛出 "Cannot read properties of null (reading '题材')" 导致工作台白屏。
 * 这里显式要求 record 与 dataset 均非空后再比对，杜绝空值穿透。
 */
export const 解析当前小说模式包激活记录 = (
    targetReady: boolean,
    record: 小说模式包完善记录 | null | undefined,
    dataset: 小说拆分数据集结构 | null | undefined,
    baseMode: 题材模式类型
): 小说模式包完善记录 | null => (
    targetReady
        && record != null
        && dataset != null
        && record.数据集ID === dataset.id
        && record.题材 === baseMode
        ? record
        : null
);

export const 计算小说模式包完善界面状态 = (
    record: 小说模式包完善记录 | null,
    running: boolean,
    fingerprintMatches: boolean,
    targetReady = true,
    loadFailed = false
): 小说模式包完善界面状态 => {
    const total = record?.总分段数 || 0;
    const current = Math.min((record?.下一个分段索引 || 0) + 1, total);
    const latestInput = record?.当前分段ID
        ? record.分段输入记录.find((item) => item.分段ID === record.当前分段ID)
        : undefined;
    const statusText = loadFailed
        ? '模式包完善进度加载失败，请重试'
        : !targetReady
        ? '正在加载模式包完善进度…'
        : !record
        ? '尚未开始逐分段完善'
        : record.状态 === 'completed'
            ? `全部分段和最终一致性整理已完成${record.跳过分段ID列表.length > 0 ? `（其中 ${record.跳过分段ID列表.length} 段为手动跳过）` : ''}`
        : record.当前阶段 === 'finalize'
            ? (record.状态 === 'finalizing' || running ? '正在进行最终一致性整理' : '最终一致性整理已暂停，可继续完善')
            : `正在完善第 ${current} / ${total} 分段${record.当前分段标题 ? `：${record.当前分段标题}` : ''}`;
    return {
        primaryAction: loadFailed
            ? 'retry'
            : !targetReady
            ? 'none'
            : running
            ? 'cancel'
            : !record
                ? 'start'
                : record.状态 === 'completed'
                    ? 'none'
                    : 'resume',
        showRestart: Boolean(record),
        canUseDraft: record?.状态 === 'completed' && fingerprintMatches,
        canEditDraft: targetReady && Boolean(record) && !running,
        canSkipSegment: Boolean(record) && !running && record?.状态 !== 'completed' && record?.最近失败分段索引 != null,
        skippedCount: record?.跳过分段ID列表.length || 0,
        statusText,
        truncationText: latestInput && !latestInput.是否完整输入 ? '本段输入已按上限截断' : '',
        progressPercent: total > 0 ? Math.round(((record?.已完成分段数 || 0) / total) * 100) : 0
    };
};

export interface UseNovelModePackCompletionResult {
    record: 小说模式包完善记录 | null;
    draft: Partial<ModeRuntimeProfile> | null;
    running: boolean;
    log: string;
    fingerprintMatches: boolean;
    uiState: 小说模式包完善界面状态;
    start: () => Promise<void>;
    resume: () => Promise<void>;
    restart: () => Promise<void>;
    /** 跳过当前失败分段并继续后面的分段，避免同一段反复消耗额度。 */
    skipCurrentSegment: () => Promise<void>;
    retryLoad: () => void;
    updateDraft: (draft: Partial<ModeRuntimeProfile>, changedPaths: string[]) => Promise<void>;
    cancel: () => void;
}

export const useNovelModePackCompletion = (params: {
    dataset: 小说拆分数据集结构 | null;
    baseMode: 题材模式类型;
    apiConfig: 当前可用接口结构 | null | undefined;
    onNotify?: (toast: Toast) => void;
}): UseNovelModePackCompletionResult => {
    const { dataset, baseMode, apiConfig, onNotify } = params;
    const [record, setRecord] = useState<小说模式包完善记录 | null>(null);
    const [running, setRunning] = useState(false);
    const [log, setLog] = useState('');
    const [fingerprintMatches, setFingerprintMatches] = useState(true);
    const [targetReady, setTargetReady] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [reloadToken, setReloadToken] = useState(0);
    const abortRef = useRef<AbortController | null>(null);
    const targetKey = dataset ? `${dataset.id}::${baseMode}` : '';
    const targetKeyRef = useRef(targetKey);
    targetKeyRef.current = targetKey;
    const runTokenRef = useRef(0);
    const recordRef = useRef<小说模式包完善记录 | null>(null);
    const editSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
    const readyTargetKeyRef = useRef('');
    const readyDatasetSignatureRef = useRef('');

    // ⚠️ 不能把 dataset 对象直接当 effect 依赖：父组件每次 refreshBoard() 都会
    // 重新读出全新的数据集对象，引用一变就会 abort 正在跑的分段，玩家看到的就是
    // 「点继续完善没反应，过一会显示用户已取消」。这里只比对内容签名。
    const datasetSignature = useMemo(() => {
        if (!dataset) return '';
        const parts = (dataset.分段列表 || []).map((segment) => (
            `${segment.id}:${(segment.原文内容 || '').length}`
        ));
        return `${dataset.id}::${parts.join('|')}`;
    }, [dataset]);
    const datasetSignatureRef = useRef(datasetSignature);
    datasetSignatureRef.current = datasetSignature;
    const datasetRef = useRef<小说拆分数据集结构 | null>(dataset);
    datasetRef.current = dataset;
    const runPromiseRef = useRef<Promise<void> | null>(null);
    const applyRecord = useCallback((next: 小说模式包完善记录 | null) => {
        recordRef.current = next;
        setRecord(next);
    }, []);
    const currentTargetReady = targetReady
        && readyTargetKeyRef.current === targetKey
        && readyDatasetSignatureRef.current === datasetSignature;
    const activeRecord = 解析当前小说模式包激活记录(currentTargetReady, record, dataset, baseMode);

    useEffect(() => {
        let active = true;
        abortRef.current?.abort();
        runTokenRef.current += 1;
        setRunning(false);
        applyRecord(null);
        setFingerprintMatches(false);
        setTargetReady(false);
        setLoadFailed(false);
        readyTargetKeyRef.current = '';
        readyDatasetSignatureRef.current = '';
        const currentDataset = datasetRef.current;
        if (!currentDataset) {
            applyRecord(null);
            setFingerprintMatches(true);
            setTargetReady(true);
            return () => { active = false; };
        }
        void Promise.all([
            读取小说模式包完善记录(currentDataset.id, baseMode),
            构建小说模式包数据集指纹(currentDataset)
        ]).then(([stored, fingerprint]) => {
            if (!active) return;
            applyRecord(stored);
            setFingerprintMatches(!stored || stored.数据集指纹 === fingerprint);
            readyTargetKeyRef.current = `${currentDataset.id}::${baseMode}`;
            readyDatasetSignatureRef.current = datasetSignatureRef.current;
            setTargetReady(true);
            setLoadFailed(false);
            if (stored && stored.数据集指纹 !== fingerprint) {
                setLog('小说分段内容或顺序已变化，请从头重建模式包完善任务。');
            } else {
                setLog(stored?.最近错误 || '');
            }
        }).catch((error) => {
            if (!active) return;
            setLog(error instanceof Error ? error.message : String(error));
            setLoadFailed(true);
        });
        return () => { active = false; };
    }, [applyRecord, baseMode, datasetSignature, reloadToken]);

    const execute = useCallback((initialRecord: 小说模式包完善记录 | null): Promise<void> => {
        const task = (async () => {
            const currentDataset = datasetRef.current;
            if (!currentDataset || currentDataset.分段列表.length === 0) throw new Error('当前数据集没有可用于模式包完善的分段。');
            if (!apiConfig?.apiKey) throw new Error('请先配置小说分解 API。');
            const controller = new AbortController();
            const runTargetKey = targetKey;
            const runToken = ++runTokenRef.current;
            const canWrite = () => 是否允许模式包完善运行回写(
                targetKeyRef.current,
                runTargetKey,
                runTokenRef.current,
                runToken
            );
            abortRef.current = controller;
            setRunning(true);
            setLog(initialRecord ? '继续逐分段完善模式包…' : '开始逐分段完善模式包…');
            try {
                const next = await 执行小说模式包逐段完善({
                    dataset: currentDataset,
                    baseMode,
                    initialRecord,
                    signal: controller.signal,
                    completeSegment: ({ dataset: datasetForSegment, segmentIndex, baseMode: currentMode, currentDraft, confirmedFieldPaths, signal }) => (
                        generateNovelModePackSegmentCompletion({
                            dataset: datasetForSegment,
                            segmentIndex,
                            baseMode: currentMode,
                            currentDraft: currentDraft as Record<string, any>,
                            confirmedFieldPaths
                        }, apiConfig, {
                            stream: true,
                            onDelta: (_delta, accumulated) => { if (canWrite()) setLog(accumulated); }
                        }, signal)
                    ),
                    finalize: ({ dataset: datasetForFinalize, baseMode: currentMode, currentDraft, conflictHints, confirmedFieldPaths, signal }) => (
                        generateNovelModePackFinalization({
                            dataset: datasetForFinalize,
                            baseMode: currentMode,
                            currentDraft: currentDraft as Record<string, any>,
                            conflictHints,
                            confirmedFieldPaths
                        }, apiConfig, {
                            stream: true,
                            onDelta: (_delta, accumulated) => { if (canWrite()) setLog(accumulated); }
                        }, signal)
                    ),
                    sanitize: 清洗小说模式包累积草稿,
                    save: async (nextRecord) => {
                        // 令牌失效（被取消 / 已开新任务 / 数据集已变）后一律不落库：
                        // 否则被取消的旧任务会把「用户已取消 + 旧进度」写回去，盖掉新任务。
                        if (!canWrite()) return;
                        await 保存小说模式包完善记录(nextRecord);
                        if (canWrite()) applyRecord(nextRecord);
                    }
                });
                if (!canWrite()) return;
                applyRecord(next);
                setFingerprintMatches(true);
                const skipped = next.跳过分段ID列表?.length || 0;
                setLog(
                    next.状态 === 'completed'
                        ? `全部分段和最终一致性整理已完成。${skipped > 0 ? `其中 ${skipped} 段为手动跳过。` : ''}`
                        : (next.最近错误 || '任务已暂停。')
                );
                if (next.状态 === 'completed') {
                    onNotify?.({
                        title: '模式包完善完成',
                        message: skipped > 0
                            ? `已完成，但跳过了 ${skipped} 个分段，这些段对应的原著设定可能缺失。`
                            : '所有小说分段均已参与完善，可以生成或贡献模式包。',
                        tone: 'success'
                    });
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (canWrite()) {
                    setLog(message);
                    onNotify?.({ title: '模式包完善失败', message, tone: 'error' });
                }
            } finally {
                if (canWrite()) {
                    if (abortRef.current === controller) abortRef.current = null;
                    setRunning(false);
                }
            }
        })();
        runPromiseRef.current = task;
        void task
            .catch(() => undefined)
            .finally(() => {
                if (runPromiseRef.current === task) runPromiseRef.current = null;
            });
        return task;
    }, [apiConfig, applyRecord, baseMode, onNotify, targetKey]);

    const start = useCallback(async () => {
        if (!currentTargetReady) throw new Error('模式包完善进度仍在加载，请稍后重试。');
        return execute(null);
    }, [currentTargetReady, execute]);

    const resume = useCallback(async () => {
        if (!currentTargetReady) throw new Error('模式包完善进度仍在加载，请稍后重试。');
        if (!activeRecord) return execute(null);
        if (!fingerprintMatches) throw new Error('小说分段内容或顺序已变化，请从头重建。');
        if (activeRecord.状态 === 'completed') return;
        return execute(activeRecord);
    }, [activeRecord, currentTargetReady, execute, fingerprintMatches]);

    const restart = useCallback(async () => {
        const currentDataset = datasetRef.current;
        if (!currentDataset) return;
        abortRef.current?.abort();
        runTokenRef.current += 1;
        // 等旧任务真正退出再删记录：它是异步写库的，先删后写会把旧状态又写回来。
        await runPromiseRef.current?.catch(() => undefined);
        await 删除小说模式包完善记录(currentDataset.id, baseMode);
        applyRecord(null);
        setFingerprintMatches(true);
        await execute(null);
    }, [applyRecord, baseMode, execute]);

    /**
     * 跳过当前失败分段并继续后面的分段。
     * 存在的意义：某一段反复解析失败时，玩家此前只能一遍遍点「继续完善」重烧额度；
     * 跳过会把它记进 跳过分段ID列表，workflow 不再为它发请求，进度继续往前走。
     */
    const skipCurrentSegment = useCallback(async () => {
        const currentDataset = datasetRef.current;
        if (!currentDataset) return;
        if (running) abortRef.current?.abort();
        await runPromiseRef.current?.catch(() => undefined);
        const datasetNow = datasetRef.current;
        const recordNow = recordRef.current;
        if (!datasetNow || !recordNow) throw new Error('尚未开始逐分段完善，无法跳过。');
        const targetIndex = recordNow.最近失败分段索引 ?? recordNow.下一个分段索引;
        const segment = datasetNow.分段列表[targetIndex];
        if (!segment) throw new Error('没有可跳过的失败分段。');
        const nextIndex = Math.min(targetIndex + 1, datasetNow.分段列表.length);
        const next: 小说模式包完善记录 = {
            ...recordNow,
            状态: 'paused',
            当前阶段: 'segment',
            跳过分段ID列表: Array.from(new Set([...recordNow.跳过分段ID列表, segment.id])),
            下一个分段索引: nextIndex,
            已完成分段数: Math.max(recordNow.已完成分段数, nextIndex),
            最近失败分段索引: undefined,
            最近错误: `已跳过第 ${targetIndex + 1} 段「${segment.标题 || segment.id}」，这些设定不会进入模式包。`,
            updatedAt: Date.now()
        };
        await 保存小说模式包完善记录(next);
        applyRecord(next);
        await execute(next);
    }, [applyRecord, execute, running]);

    const updateDraft = useCallback(async (
        draft: Partial<ModeRuntimeProfile>,
        changedPaths: string[]
    ) => {
        if (running) throw new Error('AI 请求执行中不能编辑草稿，请先取消或等待当前分段完成。');
        const currentRecord = recordRef.current;
        if (!currentRecord) throw new Error('尚无可编辑的模式包草稿。');
        if (currentRecord.数据集ID !== dataset?.id || currentRecord.题材 !== baseMode) {
            throw new Error('当前模式包完善记录仍在加载，请稍后重试。');
        }
        const next = {
            ...currentRecord,
            当前草稿: draft,
            用户确认字段路径: Array.from(new Set([...currentRecord.用户确认字段路径, ...changedPaths.filter(Boolean)])),
            updatedAt: Date.now()
        };
        applyRecord(next);
        const saveTargetKey = `${next.数据集ID}::${next.题材}`;
        editSaveQueueRef.current = editSaveQueueRef.current
            .catch(() => undefined)
            .then(async () => {
                await 保存小说模式包完善记录(next);
                if (targetKeyRef.current !== saveTargetKey) return;
            });
        await editSaveQueueRef.current;
    }, [applyRecord, baseMode, dataset?.id, running]);

    const cancel = useCallback(() => abortRef.current?.abort(), []);
    const retryLoad = useCallback(() => setReloadToken((value) => value + 1), []);
    const uiState = useMemo(
        () => 计算小说模式包完善界面状态(activeRecord, running, fingerprintMatches, currentTargetReady, loadFailed),
        [activeRecord, currentTargetReady, fingerprintMatches, loadFailed, running]
    );

    return {
        record: activeRecord,
        draft: activeRecord?.当前草稿 || null,
        running,
        log,
        fingerprintMatches,
        uiState,
        start,
        resume,
        restart,
        skipCurrentSegment,
        retryLoad,
        updateDraft,
        cancel
    };
};
