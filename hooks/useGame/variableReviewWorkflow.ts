import type { GameResponse, TavernCommand, 聊天记录结构, OpeningConfig, 提示词结构 } from '../../types';
import { generateVariableCalibrationUpdate } from '../../services/ai/text';
import { buildNpcTemplateNameContext } from '../../services/npcTemplateNameContext';
import { 获取变量计算接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { normalizeStateCommandKey } from '../../utils/stateHelpers';
import { normalizeNpcNameKey } from '../../utils/npcName';
import { 构建变量路径登记表 } from '../../utils/variableRegistry';
import { 默认提示词 } from '../../prompts';
import { 获取境界配置 } from '../../utils/realmConfig';
import { 检测NPC死亡判定风险命令 } from '../../utils/npcDeathGuard';
import { 获取游玩请求超时毫秒 } from '../../utils/gameRequestTimeouts';
import { buildVariableReviewMessages, type VariableReviewTaskContext } from '../../prompts/runtime/variableReview';
import { buildVariableReviewRules } from '../../prompts/runtime/variableReviewRules';
import { assertReviewAbsoluteSize, calculateVariableReviewCapacity, assertVariableReviewCapacity, validReviewContextTokens, VariableReviewCapacityError, type VariableReviewCapacity, type ReviewModelCapacity } from '../../utils/variableReviewBudget';
import { 执行响应命令处理, type 响应命令处理状态, type 响应命令处理依赖 } from './responseCommandProcessor';
import { 校验变量命令角色安全, validateVariableCommandBasics, readVariableCommandValue, variableCommandProtectionCode, type VariableCommandRejectionCode } from './variableCommandValidation';
import { 执行带完整性校验的请求, 流式结果疑似被上游掐断 } from './streamIntegrity';
import { 规范化环境信息, 规范化角色物品容器映射, 规范化社交列表 } from './stateTransforms';
import { 规范化世界状态, 规范化战斗状态, 规范化门派状态, 规范化剧情状态, 规范化剧情规划状态, 规范化女主剧情规划状态, 规范化同人剧情规划状态, 规范化同人女主剧情规划状态, 战斗结束自动清空 } from './storyState';
import { compareReviewEconomicChange, expectedReviewWealth, reviewNarratorFacts, extractReviewEconomicSnapshot } from './variableReviewEconomy';
import { createVariableReviewBusinessSnapshot, stableVariableReviewJson, variableReviewRoots, isVariableReviewExcludedField, variableReviewCommandTouchesExcludedData, extractVariableReviewBusinessState } from './variableReviewSnapshot';
import { resolveVariableReviewApi, type VariableReviewSettings } from '../../utils/variableReviewSettings';
import { reconcileVariableReviewResult, type ReconciledVariableReviewResult } from './variableReviewResult';

const reviewRoots = variableReviewRoots;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export interface VariableReviewChange { path: string; before: unknown; after: unknown }
export interface VariableReviewRejectedCommand { command: TavernCommand; code: VariableCommandRejectionCode | 'alreadySettled' | 'ineffective'; reason: string }
export interface VariableReviewResult {
    status: 'noChanges' | 'insufficientEvidence' | 'changesProposed' | 'blocked';
    summary: string;
    issues: Array<{ description: string; code?: string }>;
    proposedCommands: TavernCommand[];
    acceptedCommands: TavernCommand[];
    rejectedCommands: VariableReviewRejectedCommand[];
    previewState: 响应命令处理状态;
    changes: VariableReviewChange[];
    stateFingerprint: string;
    sourceTurnId: string;
    coverage: { roots: readonly string[]; truncated: boolean; warnings: string[]; excluded: string[] };
    rawText: string;
    model: string;
    capacity?: VariableReviewCapacity;
    reconciled?: ReconciledVariableReviewResult;
    rawDiagnostics?: string[];
}
export interface VariableReviewInput {
    currentState: 响应命令处理状态;
    history: 聊天记录结构[];
    beforeTurn?: { sourceTurnId: string; provenance?: 'live-before-turn'; state: 响应命令处理状态 };
    originalPlayerInput?: string;
    reviewNotes?: string;
    stateVersion?: string | number;
    turnInProgress?: boolean;
    maxArrayItems?: number;
    absoluteCharacterCap?: number;
}
export interface VariableReviewDependencies {
    apiConfig: any;
    reviewApi?: ReturnType<typeof resolveVariableReviewApi>;
    reviewSettings?: VariableReviewSettings;
    reviewModelMetadata?: ReviewModelCapacity;
    onCapacity?: (capacity: VariableReviewCapacity) => void;
    gameConfig: any;
    openingConfig?: OpeningConfig;
    promptPool?: 提示词结构[];
    signal?: AbortSignal;
    onStreamDelta?: (delta: string, text: string) => void;
    onStage?: (stage: 'prepare' | 'generate' | 'validate' | 'simulate') => void;
}

const stableJson = stableVariableReviewJson;
const fingerprintSnapshot = async (snapshot: ReturnType<typeof createVariableReviewBusinessSnapshot>): Promise<string> => {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(snapshot)));
    return `sha256:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}`;
};
export const createVariableReviewFingerprint = (input: VariableReviewInput): Promise<string> => fingerprintSnapshot(createVariableReviewBusinessSnapshot(input));
export const assertVariableReviewPreviewCurrent = async (result: VariableReviewResult, input: VariableReviewInput): Promise<void> => {
    if (await createVariableReviewFingerprint(input) !== result.stateFingerprint) throw new Error('游戏状态或正文已发生变化，请重新运行变量审查。');
};

export const prepareVariableReview = async (input: VariableReviewInput) => {
    // 先定位目标回合，再冻结完整业务数据；不复制全历史和图片，AI裁剪不影响指纹。
    const snapshot = createVariableReviewBusinessSnapshot(input);
    assertReviewAbsoluteSize({ state: snapshot.state, before: snapshot.beforeTurn?.state, logs: snapshot.logs, commands: snapshot.originalCommands, originalInput: snapshot.originalPlayerInput, notes: input.reviewNotes }, input.absoluteCharacterCap);
    const frozen = { currentState: snapshot.state, maxArrayItems: input.maxArrayItems, absoluteCharacterCap: input.absoluteCharacterCap };
    const turn = { response: { logs: snapshot.logs, tavern_commands: [] } as GameResponse, sourceTurnId: snapshot.sourceTurnId, originalCommands: snapshot.originalCommands };
    const warnings: string[] = [];
    const pick = (state: any) => Object.fromEntries(reviewRoots.map(root => [root, state[root]]));
    // 默认保留完整业务数组，不继承普通变量生成的社交60/地图30等固定截取。
    const maxArrayItems = frozen.maxArrayItems === undefined ? Infinity : Math.max(1, Math.floor(frozen.maxArrayItems));
    const limitArrays = (value: any, path: string): any => {
        if (Array.isArray(value)) {
            if (value.length > maxArrayItems) warnings.push(`${path}：${value.length}项仅读取前${maxArrayItems}项`);
            return value.slice(0, maxArrayItems).map((item, i) => limitArrays(item, `${path}[${i}]`));
        }
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, limitArrays(item, `${path}.${key}`)]));
    };
    const clean = (state: any, label: string) => maxArrayItems === Infinity ? pick(state) : limitArrays(pick(state), label);
    const stateJson = JSON.stringify(clean(frozen.currentState, '当前状态'));
    const beforeState = snapshot.beforeTurn?.state;
    if (input.beforeTurn && !beforeState) warnings.push('回合前快照来源不可信或与正文不匹配，未使用该快照。');
    if (!beforeState) warnings.push('缺少可信真实回合前基准，金额及库存数量修复只报告疑点。');
    const beforeStateJson = beforeState ? JSON.stringify(clean(beforeState, '回合前状态')) : undefined;
    const originalCommands = turn.originalCommands;
    const registryTruncated = 构建变量路径登记表(frozen.currentState, { maxLines: 221 }).length > 220;
    if (registryTruncated) warnings.push('变量路径提示索引仅展示前220项；完整业务变量仍已发送，实际路径合法性按完整当前状态校验。');
    const reviewContext: VariableReviewTaskContext = { sourceTurnId: turn.sourceTurnId, beforeStateJson,
        originalCommands, originalPlayerInput: snapshot.originalPlayerInput,
        reviewNotes: input.reviewNotes, coverageWarnings: warnings };
    return { input: frozen, response: turn.response, sourceTurnId: turn.sourceTurnId, beforeState, stateJson, reviewContext,
        coverage: { roots: reviewRoots, truncated: warnings.some(w => w.includes('仅读取')), warnings,
            excluded: ['图片、base64、缓存、纯UI状态', '剧情、规划、记忆及非MVP变量域'] }, stateFingerprint: await fingerprintSnapshot(snapshot) };
};
type Prepared = Awaited<ReturnType<typeof prepareVariableReview>>;

export const generateVariableReview = async (prepared: Prepared, deps: VariableReviewDependencies) => {
    const api = deps.reviewApi || (deps.reviewSettings ? resolveVariableReviewApi(deps.reviewSettings, deps.apiConfig) : 获取变量计算接口配置(deps.apiConfig, { manualReview: true }));
    const reviewContext = { ...prepared.reviewContext, reviewStrategy: deps.reviewSettings?.customPrompt };
    if (!接口配置是否可用(api)) throw new Error('请先配置可用的变量计算 API / 模型。');
    const manualWindow = deps.reviewSettings?.contextWindowMode === 'manual' || deps.reviewSettings?.contextWindowMode === 'custom';
    if (manualWindow && !validReviewContextTokens(deps.reviewSettings?.contextWindowTokens)) throw new VariableReviewCapacityError('请填写有效的上下文窗口：4096～16000000 的整数 tokens。');
    assertReviewAbsoluteSize({ stateJson: prepared.stateJson, reviewContext, logs: prepared.response.logs }, prepared.input.absoluteCharacterCap);
    const rules = buildVariableReviewRules(prepared.input.currentState, deps.promptPool?.length ? deps.promptPool : 默认提示词, deps.gameConfig);
    const capacity = calculateVariableReviewCapacity({ messages: buildVariableReviewMessages(prepared.stateJson, prepared.response, reviewContext, rules), model: api.model,
        maxOutputTokens: api.maxTokens ?? 32768, contextWindowTokens: manualWindow ? deps.reviewSettings?.contextWindowTokens : undefined,
        metadata: deps.reviewModelMetadata, absoluteCharacterCap: prepared.input.absoluteCharacterCap });
    deps.onCapacity?.(capacity);
    assertVariableReviewCapacity(capacity);
    const controller = new AbortController();
    let rejectAbort: (error: Error) => void;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const rejectOnAbort = () => rejectAbort(new DOMException('已取消变量审查', 'AbortError'));
    controller.signal.addEventListener('abort', rejectOnAbort, { once: true });
    const abort = () => controller.abort();
    if (deps.signal?.aborted) throw new DOMException('已取消变量审查', 'AbortError');
    deps.signal?.addEventListener('abort', abort, { once: true });
    const timeouts = 获取游玩请求超时毫秒(deps.gameConfig?.游玩请求超时设置);
    let timer: ReturnType<typeof setTimeout>;
    let timedOut = false;
    const resetTimer = (idle = false) => {
        clearTimeout(timer);
        timer = setTimeout(() => { timedOut = true; controller.abort(); }, idle ? timeouts.idleMs || 45000 : timeouts.firstResponseMs || 90000);
    };
    const request = (stream: boolean, onStreamEnd?: (info: any) => void) => generateVariableCalibrationUpdate({
        taskMode: 'review', stateJson: prepared.stateJson, response: prepared.response,
        reviewContext, calibrationRulesContext: rules
    }, api!, controller.signal, undefined, stream ? (delta, text) => { resetTimer(true); deps.onStreamDelta?.(delta, text); } : undefined, true, onStreamEnd);
    resetTimer();
    try {
        let end: any;
        const result = await Promise.race([aborted, 执行带完整性校验的请求({ 功能名: '变量审查', 强制非流式: !deps.onStreamDelta,
            重试失败处置: '抛出错误', 重试前重置超时: () => resetTimer(),
            发起流式请求: async options => {
                try { return await request(true, info => { end = info; options.onStreamEnd?.(info); }); }
                catch (error) {
                    if (controller.signal.aborted || !流式结果疑似被上游掐断(end)) throw error;
                    // 严格解析先于流完整性检查，半截协议不能作为部分合法命令返回。
                    resetTimer();
                    options.onStreamEnd?.({ sawDone: true, accumulatedLength: 0 });
                    return request(false);
                }
            }, 发起非流式请求: () => request(false)
        })]);
        if (controller.signal.aborted) throw new DOMException('已取消变量审查', 'AbortError');
        return { ...result.结果, model: api!.model, capacity };
    } catch (error) {
        if (timedOut) throw new Error('变量审查请求超时，未生成可应用预览。');
        throw error;
    } finally { clearTimeout(timer!); deps.signal?.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', rejectOnAbort); }
};

// 直接钱包命令提前诊断，最终仍以整批执行后的实际财富判断，覆盖实体货币路径。
const moneyEvidenceIssue = (cmd: TavernCommand, prepared: Prepared, openingConfig?: OpeningConfig): VariableReviewRejectedCommand | null => {
    if (!/^gameState\.角色\.金钱(?:\.|$)/.test(normalizeStateCommandKey(cmd.key))) return null;
    const check = expectedReviewWealth(prepared.input.currentState, prepared.beforeState, reviewNarratorFacts(prepared.response.logs), openingConfig);
    return check.issue ? { command: cmd, ...check.issue } : null;
};

const settledCollectionIssue = (cmd: TavernCommand, prepared: Prepared): VariableReviewRejectedCommand | null => {
    const key = normalizeStateCommandKey(cmd.key);
    if (cmd.action === 'push' && /^gameState\.角色\.(?:物品列表|功法列表|天赋列表|技艺|技能列表)$/.test(key)) {
        const current = readVariableCommandValue(prepared.input.currentState, key);
        const identity = (v: any) => [v?.ID, v?.id, v?.名称, v?.姓名, typeof v === 'string' ? v : ''].map(normalizeNpcNameKey).filter(Boolean);
        const keys = new Set(identity(cmd.value));
        if (Array.isArray(current) && current.some(item => identity(item).some(k => keys.has(k)))) {
            return { command: cmd, code: 'alreadySettled', reason: '同名/同ID物品或技能已经记录，不重复push；如需修正数量或字段，应提出有依据的字段命令' };
        }
    }
    if (/^gameState\.角色\.物品列表\[\d+\]\.(?:数量|堆叠数量)$/.test(key)) {
        const current = readVariableCommandValue(prepared.input.currentState, key);
        if (cmd.action === 'set' && current === cmd.value) return { command: cmd, code: 'alreadySettled', reason: '物品数量已经一致，无需重复修复' };

    }
    return null;
};

export const validateVariableReviewCommands = async (prepared: Prepared, commands: TavernCommand[], deps: VariableReviewDependencies) => {
    const nameContext = await buildNpcTemplateNameContext(prepared.input.currentState, deps.openingConfig, prepared.reviewContext.originalPlayerInput);
    const acceptedCommands: TavernCommand[] = [];
    const rejectedCommands: VariableReviewRejectedCommand[] = [];
    let moneyCommandAccepted = false;
    const params = { baseState: prepared.input.currentState, parsedResponse: prepared.response, openingConfig: deps.openingConfig, npcNameContext: nameContext };
    const deathBatchValid = 检测NPC死亡判定风险命令(commands, params.baseState.社交, params.parsedResponse).length === 0;
    for (const command of commands) {
        let issue = variableReviewCommandTouchesExcludedData(command) ? { code: 'safety' as const, reason: '审查不允许修改图片、缓存或UI数据' } : validateVariableCommandBasics(command, prepared.input.currentState, true);
        if (!issue) {
            try { 校验变量命令角色安全([command], params); }
            catch (error: any) {
                if (!(deathBatchValid && /判定为死亡/.test(error.message))) issue = { code: variableCommandProtectionCode(error.message), reason: error.message };
            }
        }
        const numericIssue = !issue ? settledCollectionIssue(command, prepared) || moneyEvidenceIssue(command, prepared, deps.openingConfig) : null;
        if (issue || numericIssue) rejectedCommands.push(numericIssue || { command, ...issue! });
        else if (/^gameState\.角色\.金钱(?:\.|$)/.test(normalizeStateCommandKey(command.key))) {
            if (moneyCommandAccepted) rejectedCommands.push({ command, code: 'insufficientEvidence', reason: '同次审查已接受金额修复，拒绝重复或别名重复记账' });
            else { moneyCommandAccepted = true; acceptedCommands.push(command); }
        } else acceptedCommands.push(command);
    }
    return { acceptedCommands, rejectedCommands, nameContext };
};

const processorDeps: 响应命令处理依赖 = { 规范化环境信息, 规范化角色物品容器映射, 规范化社交列表,
    规范化世界状态, 规范化战斗状态, 规范化门派状态, 规范化剧情状态, 规范化剧情规划状态,
    规范化女主剧情规划状态, 规范化同人剧情规划状态, 规范化同人女主剧情规划状态, 战斗结束自动清空 };
export const executeVariableReviewCommands = (prepared: Prepared, validation: Awaited<ReturnType<typeof validateVariableReviewCommands>>, deps: VariableReviewDependencies, executionMode: 'review-preview' | 'review-apply') => {
    const rejectedCommands = [...validation.rejectedCommands];
    const execute = (commands: TavernCommand[]) => {
        const acceptedCommands: TavernCommand[] = [];
        const previewState = 执行响应命令处理({ ...prepared.response, tavern_commands: commands }, prepared.input.currentState,
            { ...processorDeps, 境界配置: 获取境界配置(deps.openingConfig?.题材模式, deps.openingConfig?.modeRuntimeProfile), 角色规范化选项: { 题材模式: deps.openingConfig?.题材模式 } }, undefined,
            { executionMode, applyState: false, reviewTimeReference: prepared.beforeState?.环境?.时间, reviewNameContext: validation.nameContext, onCommandDiagnostic: diagnostic => {
                if (diagnostic.status === 'accepted') acceptedCommands.push(diagnostic.command);
                else rejectedCommands.push({ command: diagnostic.command, code: diagnostic.code || 'safety', reason: diagnostic.reason || '未通过执行保护' });
            } });
        return { acceptedCommands, previewState };
    };
    let execution = execute(validation.acceptedCommands);
    // 混合修复中即使NPC等域有diff，被实体货币同步吞回的钱包命令也不能继续显示accepted。
    if (extractReviewEconomicSnapshot(prepared.input.currentState, deps.openingConfig).total === extractReviewEconomicSnapshot(execution.previewState, deps.openingConfig).total) {
        const ineffectiveMoney = execution.acceptedCommands.filter(command => /^gameState\.角色\.金钱(?:\.|$)/.test(normalizeStateCommandKey(command.key)));
        if (ineffectiveMoney.length) {
            rejectedCommands.push(...ineffectiveMoney.map(command => ({ command, code: 'ineffective' as const, reason: '命令执行并规范化后未产生有效业务财富变化' })));
            execution = execute(execution.acceptedCommands.filter(command => !ineffectiveMoney.includes(command)));
        }
    }
    const issue = compareReviewEconomicChange(prepared.input.currentState, execution.previewState, prepared.beforeState, prepared.response.logs, deps.openingConfig);
    if (issue) {
        // 经济变化来自角色域；整批角色修复保守拒绝，独立NPC等安全修复可以继续。
        const role = execution.acceptedCommands.filter(command => /^gameState\.角色(?:\.|$)/.test(normalizeStateCommandKey(command.key)));
        rejectedCommands.push(...role.map(command => ({ command, ...issue })));
        execution = execute(execution.acceptedCommands.filter(command => !role.includes(command)));
    }
    const changes = diffVariableReviewStates(prepared.input.currentState, execution.previewState);
    if (!changes.length && execution.acceptedCommands.length) {
        rejectedCommands.push(...execution.acceptedCommands.map(command => ({ command, code: 'ineffective' as const, reason: '命令执行并规范化后未产生有效业务状态变化' })));
        execution.acceptedCommands = [];
    }
    return { ...execution, rejectedCommands, changes };
};
export const simulateVariableReview = (prepared: Prepared, validation: Awaited<ReturnType<typeof validateVariableReviewCommands>>, deps: VariableReviewDependencies) => executeVariableReviewCommands(prepared, validation, deps, 'review-preview');
export const diffVariableReviewStates = (before: any, after: any): VariableReviewChange[] => {
    const changes: VariableReviewChange[] = [];
    const walk = (a: any, b: any, path: string) => {
        if (stableJson(a) === stableJson(b)) return;
        if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
            for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], Array.isArray(a) ? `${path}[${key}]` : path ? `${path}.${key}` : key);
        } else changes.push({ path, before: a, after: b });
    };
    walk(extractVariableReviewBusinessState(before), extractVariableReviewBusinessState(after), '');
    return changes;
};
export const runVariableReview = async (input: VariableReviewInput, deps: VariableReviewDependencies): Promise<VariableReviewResult> => {
    deps.onStage?.('prepare');
    const prepared = await prepareVariableReview(input);
    deps.onStage?.('generate');
    const generated = await generateVariableReview(prepared, deps);
    if (!generated.reviewStatus) throw new Error('变量审查没有返回可识别的完整结果状态。');
    deps.onStage?.('validate');
    const validation = await validateVariableReviewCommands(prepared, generated.commands, deps);
    deps.onStage?.('simulate');
    const simulation = simulateVariableReview(prepared, validation, deps);
    const reconciled = reconcileVariableReviewResult({ ...simulation, reports: generated.reports, before: prepared.input.currentState, after: simulation.previewState,
        body: prepared.response.logs.map(log => log.text).join('\n') });
    const status = simulation.changes.length > 0 ? 'changesProposed' : simulation.rejectedCommands.some(cmd => cmd.code !== 'alreadySettled') ? 'blocked'
        : reconciled.issues.length ? 'insufficientEvidence' : 'noChanges';
    return { status, summary: reconciled.summary,
        issues: reconciled.issues, reconciled, rawDiagnostics: generated.reports,
        proposedCommands: clone(generated.commands), ...simulation, stateFingerprint: prepared.stateFingerprint,
        sourceTurnId: prepared.sourceTurnId, coverage: prepared.coverage, rawText: generated.rawText, model: generated.model, capacity: generated.capacity };
};
