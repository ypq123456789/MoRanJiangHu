import type { 聊天记录结构 } from '../../types';
import type { 回合快照结构 } from './turnSnapshot';
import type { 响应命令处理状态 } from './responseCommandProcessor';
import { variableReviewBusinessSeal, mergeVariableReviewBusinessState } from './variableReviewSnapshot';
import { prepareVariableReview, runVariableReview, assertVariableReviewPreviewCurrent, validateVariableReviewCommands, executeVariableReviewCommands, type VariableReviewInput, type VariableReviewResult, type VariableReviewDependencies, type VariableReviewChange } from './variableReviewWorkflow';
import type { VariableReviewConfiguration, VariableReviewSettings, VariableReviewModelOption } from '../../utils/variableReviewSettings';
import { normalizeVariableReviewSettings, resolveVariableReviewApi } from '../../utils/variableReviewSettings';
import type { VariableReviewCapacity, ReviewModelCapacity } from '../../utils/variableReviewBudget';

export type VariableReviewErrorCode = 'capacity' | 'apiConfig' | 'request' | 'api' | 'truncated' | 'parse' | 'stale' | 'applyValidation' | 'saveFailed' | 'consumed' | 'busy' | 'cancelled';
export class VariableReviewError extends Error {
    constructor(public code: VariableReviewErrorCode, message: string, public applied = false) { super(message); this.name = 'VariableReviewError'; }
}
export const variableReviewErrorMessage = (error: any): { code: VariableReviewErrorCode; message: string; applied: boolean; capacity?: VariableReviewCapacity } => {
    if (error instanceof VariableReviewError) return error;
    const message = error?.message || '请求失败，请重试。';
    const code: VariableReviewErrorCode = error?.name === 'AbortError' ? 'cancelled'
        : error?.name === 'VariableReviewCapacityError' ? 'capacity'
        : error?.name === 'VariableReviewApiConfigurationError' || /配置.*API|API.*配置/.test(message) ? 'apiConfig'
        : /掐断|截断|流式.*完整/.test(message) ? 'truncated'
        : /解析失败|协议/.test(message) ? 'parse'
        : /API Error|HTTP|API failed/.test(message) ? 'api' : 'request';
    return { code, message: code === 'apiConfig' && error?.name !== 'VariableReviewApiConfigurationError' ? '请先配置变量计算 API。' : code === 'cancelled' ? '审查已取消。' : message, applied: false, capacity: error?.capacity };
};
export type VariableReviewProgress = 'prepare' | 'generate' | 'validate' | 'simulate';
export interface VariableReviewOptions { settings?: VariableReviewSettings; reviewNotes?: string; onProgress?: (stage: VariableReviewProgress) => void; onCapacity?: (capacity: VariableReviewCapacity) => void }
export interface VariableReviewApplyResult { changesCount: number; saved: true }
export interface VariableReviewActions {
    getVariableReviewConfiguration?: () => Promise<VariableReviewConfiguration>;
    saveVariableReviewSettings?: (settings: VariableReviewSettings) => Promise<void>;
    refreshVariableReviewModels?: (settings: VariableReviewSettings) => Promise<VariableReviewModelOption[]>;
    reviewVariables: (options?: VariableReviewOptions) => Promise<VariableReviewResult>;
    applyVariableReview: (result: VariableReviewResult) => Promise<VariableReviewApplyResult>;
    cancelVariableReview: () => void;
    checkVariableReviewCurrent: (result: VariableReviewResult) => Promise<void>;
}

// 从现有重Roll快照中绑定对应回合，不按栈顶位置或姓名猜测；无可靠匹配时不提供金额基准。
export const findVariableReviewBeforeTurn = (history: 聊天记录结构[], snapshots: 回合快照结构[]): VariableReviewInput['beforeTurn'] => {
    let index = history.length - 1;
    while (index >= 0 && history[index]?.role !== 'assistant') index--;
    let userIndex = index - 1;
    while (userIndex >= 0 && history[userIndex]?.role !== 'user') userIndex--;
    if (index < 0 || userIndex < 0) return undefined;
    const match = [...snapshots].reverse().find(snapshot => snapshot.审查基准来源 === '真实回合前' && snapshot.玩家输入 === history[userIndex].content
        && snapshot.回档前历史.length === userIndex && snapshot.回档前历史.every((row, i) => row.role === history[i].role && row.timestamp === history[i].timestamp && row.content === history[i].content));
    return match ? { sourceTurnId: `assistant:${history[index].timestamp}:${index}`, provenance: 'live-before-turn', state: match.回档前状态 } : undefined;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const staleMessage = '游戏状态或正文已发生变化，本次审查结果已经失效，请重新运行变量审查。';
export const createVariableReviewActions = (deps: {
    getInput: () => VariableReviewInput;
    getDependencies: () => VariableReviewDependencies;
    saveSettings?: (settings: VariableReviewSettings) => Promise<void>;
    getModelMetadata?: (settings: VariableReviewSettings) => ReviewModelCapacity | undefined;
    commitState: (state: 响应命令处理状态, changes: VariableReviewChange[]) => void;
    saveState: (state: 响应命令处理状态, history: 聊天记录结构[]) => Promise<unknown>;
}): VariableReviewActions => {
    // 控制器随useGame实例存活；锁不依赖React渲染，结果关闭后可由WeakMap自然回收。
    const issued = new WeakMap<VariableReviewResult, { fingerprint: string; commands: VariableReviewResult['acceptedCommands']; changes: VariableReviewChange[] }>();
    const consumed = new WeakSet<VariableReviewResult>();
    let active: AbortController | null = null;
    let applying = false;
    const ensureActive = (controller: AbortController) => { if (controller.signal.aborted) throw new DOMException('已取消变量审查', 'AbortError'); };
    const checkVariableReviewCurrent = async (result: VariableReviewResult) => {
        const record = issued.get(result);
        if (!record) throw new VariableReviewError('applyValidation', '审查结果不属于当前会话，请重新审查。');
        if (consumed.has(result)) throw new VariableReviewError('consumed', '本次审查结果已应用，不能重复执行。', true);
        try { await assertVariableReviewPreviewCurrent({ ...result, stateFingerprint: record.fingerprint }, deps.getInput()); }
        catch { throw new VariableReviewError('stale', staleMessage); }
    };
    return {
        cancelVariableReview: () => { active?.abort(); },
        checkVariableReviewCurrent,
        reviewVariables: async (options = {}) => {
            if (applying || active) throw new VariableReviewError('busy', '已有变量审查或应用正在进行，请稍候。');
            const controller = new AbortController();
            active = controller;
            try {
                // 第一个await前冻结设置和实际连接，主库对象后续变化不能改变本次请求。
                const dependencies = deps.getDependencies();
                const settings = options.settings ? normalizeVariableReviewSettings(options.settings) : dependencies.reviewSettings && clone(dependencies.reviewSettings);
                const frozenDependencies = { ...dependencies, apiConfig: clone(dependencies.apiConfig), reviewSettings: settings,
                    reviewModelMetadata: settings ? clone(deps.getModelMetadata?.(settings) || dependencies.reviewModelMetadata || {}) : dependencies.reviewModelMetadata,
                    reviewApi: settings ? resolveVariableReviewApi(settings, dependencies.apiConfig) : undefined };
                const input = { ...deps.getInput(), reviewNotes: options.reviewNotes };
                if (options.settings && deps.saveSettings) await deps.saveSettings(settings!);
                ensureActive(controller);
                const result = await runVariableReview(input, {
                    ...frozenDependencies, signal: controller.signal, onStage: options.onProgress, onCapacity: options.onCapacity,
                    onStreamDelta: () => options.onProgress?.('generate')
                });
                ensureActive(controller);
                issued.set(result, { fingerprint: result.stateFingerprint, commands: clone(result.acceptedCommands), changes: clone(result.changes) });
                return result;
            } finally { if (active === controller) active = null; }
        },
        applyVariableReview: async result => {
            if (applying || active) throw new VariableReviewError('busy', '正在应用修复，请勿重复点击。');
            applying = true; // 第一个await之前取得锁。
            const controller = new AbortController();
            active = controller;
            try {
                await checkVariableReviewCurrent(result);
                ensureActive(controller);
                const record = issued.get(result)!;
                if (!record.commands.length || !record.changes.length) throw new VariableReviewError('applyValidation', '没有可应用的合法变量变化。');
                const input = deps.getInput();
                const inputSeal = variableReviewBusinessSeal(input);
                const prepared = await prepareVariableReview(input);
                if (prepared.stateFingerprint !== record.fingerprint) throw new VariableReviewError('stale', staleMessage);
                const currentDeps = deps.getDependencies();
                const validation = await validateVariableReviewCommands(prepared, record.commands, currentDeps);
                ensureActive(controller);
                if (validation.rejectedCommands.length || validation.acceptedCommands.length !== record.commands.length) {
                    throw new VariableReviewError('applyValidation', `应用前重新校验失败：${validation.rejectedCommands.map(cmd => cmd.reason).join('；')}`);
                }
                // 重跑生产执行器，完全不读取result.previewState。
                const execution = executeVariableReviewCommands(prepared, validation, currentDeps, 'review-apply');
                if (execution.rejectedCommands.length || !execution.changes.length || JSON.stringify(execution.changes) !== JSON.stringify(record.changes)) {
                    throw new VariableReviewError('applyValidation', '应用前重新执行结果与已确认的变化不一致，请重新审查。');
                }
                await checkVariableReviewCurrent(result);
                ensureActive(controller);
                // digest和上下文读取含await；最后同步核对原始输入，消除检查等待期间的状态变化窗口。
                try { if (variableReviewBusinessSeal(deps.getInput()) !== inputSeal) throw new Error('changed'); }
                catch { throw new VariableReviewError('stale', staleMessage); }
                const nextState = mergeVariableReviewBusinessState(deps.getInput().currentState, execution.previewState);
                consumed.add(result);
                deps.commitState(nextState, execution.changes);
                try { await deps.saveState(nextState, input.history); }
                catch (error: any) { throw new VariableReviewError('saveFailed', `变量修复已应用，但保存失败：${error?.message || '未知错误'}。请使用正常保存入口重试保存，勿重复应用命令。`, true); }
                return { changesCount: execution.changes.length, saved: true };
            } finally { applying = false; if (active === controller) active = null; }
        }
    };
};
