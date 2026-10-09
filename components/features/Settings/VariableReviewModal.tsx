import React from 'react';
import { createPortal } from 'react-dom';
import type { VariableReviewResult } from '../../../hooks/useGame/variableReviewWorkflow';
import { variableReviewErrorMessage, type VariableReviewActions, type VariableReviewProgress } from '../../../hooks/useGame/variableReviewActions';
import VariableReviewSettingsPanel from './VariableReviewSettingsPanel';
import { normalizeVariableReviewSettings, type VariableReviewConfiguration, type VariableReviewSettings } from '../../../utils/variableReviewSettings';
import type { VariableReviewCapacity } from '../../../utils/variableReviewBudget';

export interface VariableReviewModalProps { actions: VariableReviewActions; revision?: unknown; onClose: () => void }
const stages: Record<VariableReviewProgress, string> = { prepare: '准备最近回合与变量上下文', generate: 'AI 正在审查正文与变量', validate: '校验修复命令与保护规则', simulate: '模拟执行并计算实际变化' };
const format = (value: unknown): string => value === undefined ? '（不存在）' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const Value: React.FC<{ value: unknown }> = ({ value }) => {
    const text = format(value);
    return text.length > 180 || (value !== null && typeof value === 'object')
        ? <details className="variable-review-value"><summary>展开对象 / 长内容</summary><pre>{text}</pre></details>
        : <pre className="variable-review-value">{text}</pre>;
};
const commandText = (cmd: VariableReviewResult['acceptedCommands'][number]) => `${cmd.action} ${cmd.key}${cmd.action === 'delete' ? '' : ` = ${JSON.stringify(cmd.value)}`}`;

const VariableReviewModal: React.FC<VariableReviewModalProps> = ({ actions, revision, onClose }) => {
    const [notes, setNotes] = React.useState('');
    const [configuration, setConfiguration] = React.useState<VariableReviewConfiguration | null>(null);
    const [configurationLoading, setConfigurationLoading] = React.useState(!!actions.getVariableReviewConfiguration);
    const [configurationRetry, setConfigurationRetry] = React.useState(0);
    const [phase, setPhase] = React.useState<'input' | 'reviewing' | 'result' | 'applying' | 'applied'>('input');
    const [stage, setStage] = React.useState<VariableReviewProgress>('prepare');
    const [result, setResult] = React.useState<VariableReviewResult | null>(null);
    const [capacity, setCapacity] = React.useState<VariableReviewCapacity | undefined>();
    const [error, setError] = React.useState<ReturnType<typeof variableReviewErrorMessage> | null>(null);
    const [expired, setExpired] = React.useState(false);
    const [success, setSuccess] = React.useState('');
    const busy = React.useRef(false);
    const alive = React.useRef(true);
    const sequence = React.useRef(0);
    const panel = React.useRef<HTMLDivElement>(null);
    const backdrop = React.useRef<HTMLDivElement>(null);
    const actionsRef = React.useRef(actions);
    actionsRef.current = actions;
    React.useEffect(() => {
        let cancelled = false;
        setConfigurationLoading(!!actions.getVariableReviewConfiguration);
        if (actions.getVariableReviewConfiguration) actions.getVariableReviewConfiguration().then(next => {
            if (!cancelled) { setConfiguration(next); setConfigurationLoading(false); }
        }).catch(cause => { if (!cancelled) { setConfigurationLoading(false); setError({ code: 'apiConfig', message: `审查配置加载失败：${cause?.message || '请重试。'}`, applied: false }); } });
        return () => { cancelled = true; };
    }, [actions, configurationRetry]);
    const updateConfiguration = (settings: VariableReviewSettings) => {
        setConfiguration(previous => previous ? { ...previous, settings } : null);
        actions.saveVariableReviewSettings?.(settings).catch(cause => { if (alive.current) setError(variableReviewErrorMessage(cause)); });
    };
    const close = () => {
        if (phase === 'applying') return;
        sequence.current++;
        actionsRef.current.cancelVariableReview();
        onClose();
    };
    const closeRef = React.useRef(close);
    closeRef.current = close;
    React.useEffect(() => {
        alive.current = true;
        const previousFocus = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
        const viewport = window.visualViewport;
        const resize = () => {
            if (backdrop.current) {
                backdrop.current.style.height = `${viewport?.height || window.innerHeight}px`;
                backdrop.current.style.top = `${viewport?.offsetTop || 0}px`;
                if (['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName || '') && panel.current?.contains(document.activeElement)) {
                    (document.activeElement as HTMLElement).scrollIntoView?.({ block: 'nearest' });
                }
            }
        };
        resize();
        viewport?.addEventListener('resize', resize);
        viewport?.addEventListener('scroll', resize);
        const keydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
            if (event.key === 'Tab') {
                const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea, summary, [tabindex="0"]') || []).filter(node => node.getClientRects().length > 0);
                const first = nodes[0], last = nodes[nodes.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        document.addEventListener('keydown', keydown, true);
        return () => {
            alive.current = false;
            sequence.current++;
            actionsRef.current.cancelVariableReview();
            viewport?.removeEventListener('resize', resize);
            viewport?.removeEventListener('scroll', resize);
            document.removeEventListener('keydown', keydown, true);
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus();
        };
    }, []);
    React.useEffect(() => {
        if (!result || phase !== 'result' || busy.current || expired) return;
        let cancelled = false;
        actions.checkVariableReviewCurrent(result).catch(cause => {
            if (!cancelled && !busy.current && alive.current) { setExpired(true); setError(variableReviewErrorMessage(cause)); }
        });
        return () => { cancelled = true; };
    }, [actions, revision, result, phase, expired]);
    const start = async () => {
        if (busy.current || configurationLoading || (actions.getVariableReviewConfiguration && !configuration)) return;
        busy.current = true;
        const request = ++sequence.current;
        setError(null); setSuccess(''); setResult(null); setCapacity(undefined); setExpired(false); setPhase('reviewing'); setStage('prepare');
        try {
            const settings = configuration ? normalizeVariableReviewSettings(configuration.settings) : undefined;
            const next = await actions.reviewVariables({ settings, reviewNotes: notes, onCapacity: nextCapacity => { if (alive.current && sequence.current === request) setCapacity(nextCapacity); }, onProgress: nextStage => { if (alive.current && sequence.current === request) setStage(nextStage); } });
            if (alive.current && sequence.current === request) { setResult(next); setPhase('result'); }
        } catch (cause) {
            if (alive.current && sequence.current === request) { const detail = variableReviewErrorMessage(cause); setError(detail); if (detail.capacity) setCapacity(detail.capacity); setPhase('input'); }
        } finally { if (sequence.current === request) busy.current = false; }
    };
    const apply = async () => {
        if (busy.current || !result || expired || !result.changes.length || !result.acceptedCommands.length || phase !== 'result') return;
        busy.current = true;
        const request = ++sequence.current;
        setPhase('applying'); setError(null);
        try {
            const applied = await actions.applyVariableReview(result);
            if (alive.current && sequence.current === request) { setSuccess(`变量修复已应用，共修改 ${applied.changesCount} 项。`); setPhase('applied'); }
        } catch (cause) {
            if (alive.current && sequence.current === request) {
                const detail = variableReviewErrorMessage(cause);
                setError(detail); setExpired(detail.code === 'stale'); setPhase(detail.applied ? 'applied' : 'result');
            }
        } finally { if (sequence.current === request) busy.current = false; }
    };
    const reset = () => { setResult(null); setCapacity(undefined); setError(null); setExpired(false); setSuccess(''); setPhase('input'); };
    const canApply = phase === 'result' && !expired && !!result?.changes.length && !!result?.acceptedCommands.length;
    const presentation = result?.reconciled;
    return createPortal(
        <div className="variable-review-backdrop" ref={backdrop} onClick={event => { if (event.target === event.currentTarget) close(); }}>
            <div className="variable-review-modal" role="dialog" aria-modal="true" aria-labelledby="variable-review-title" ref={panel}>
                <header className="variable-review-header"><h2 id="variable-review-title">变量审查</h2><button type="button" className="variable-review-secondary" onClick={close} disabled={phase === 'applying'} aria-label="关闭变量审查">×</button></header>
                <div className="variable-review-body">
                    {error && <div role="alert" className="variable-review-error"><strong>{({ capacity: '上下文容量不足', apiConfig: '未配置 API', request: '请求失败', api: 'API 返回错误', truncated: '响应截断', parse: '响应解析失败', stale: '预览已过期', applyValidation: '应用重新校验失败', saveFailed: '保存失败', consumed: '结果已消费', busy: '操作进行中', cancelled: '已取消' } as const)[error.code]}</strong><p>{error.message}</p></div>}
                    {(capacity || result?.capacity) && (() => { const value = capacity || result!.capacity!; return <section aria-label="审查容量诊断" className={value.withinBudget ? 'variable-review-change' : 'variable-review-warning'}>
                        <h3>容量诊断（估算）</h3><p>预计输入：{value.estimatedInputTokens.toLocaleString()} tokens · 模型上下文：{value.contextWindowTokens.toLocaleString()} tokens</p>
                        <p>最大输出预算：{value.maxOutputTokens.toLocaleString()} · 安全预留：{value.safetyReserveTokens.toLocaleString()} · 可用输入：{Math.max(0, value.inputBudgetTokens).toLocaleString()}</p>
                        <p>{value.withinBudget ? '安全预算内，预计剩余：' : '超出安全预算：'}{Math.abs(value.remainingTokens).toLocaleString()} tokens</p>
                        <p className="variable-review-muted">容量来源：{({ manual: '手动设置', 'metadata-context': '当前接口模型metadata', 'metadata-input': '模型输入上限（保守）', fallback: 'metadata缺失，默认128K' })[value.source]}。token数为估算，已保留误差余量。</p>
                    </section>; })()}
                    {success && <div role="status" className="variable-review-success">{success}</div>}
                    {phase === 'input' && <>
                        <p>AI 会根据最近完成回合的正文与当前变量检查遗漏和不一致。备注仅用于指定审查重点，不会被当作已经发生的事实。</p>
                        <p className="variable-review-muted">本次审查范围：最近完成回合正文 + 当前主要变量状态。包括角色、环境、世界、社交、战斗、门派、任务和约定；不包含整章历史、图片或缓存。数据过多时会明确提示裁剪。</p>
                        {configurationLoading && <p role="status">正在加载审查设置…</p>}
                        {!configurationLoading && !configuration && actions.getVariableReviewConfiguration && <button type="button" className="variable-review-secondary" onClick={() => { setError(null); setConfigurationRetry(value => value + 1); }}>重试加载配置</button>}
                        {configuration && <VariableReviewSettingsPanel configuration={configuration} actions={actions} onChange={updateConfiguration} />}
                        <label className="variable-review-label" htmlFor="variable-review-notes">本次审查备注（可选）</label>
                        <textarea id="variable-review-notes" rows={4} value={notes} onChange={event => setNotes(event.target.value)} placeholder="例如：重点检查当前人物的服装和装备，或检查正文中新出现但未记录的 NPC。" />
                        <p className="variable-review-muted">备注仅用于指定本次审查重点，不会被直接视为已经发生的剧情事实。</p>
                    </>}
                    {(phase === 'reviewing' || phase === 'applying') && <div className="variable-review-loading" role="status" aria-live="polite"><span className="animate-pulse">{phase === 'applying' ? '应用中：重新校验、写入并保存…' : `审查中：${stages[stage]}…`}</span><p>确认应用前不会修改真实变量。</p></div>}
                    {result && <>
                        <div className={result.coverage.truncated ? 'variable-review-warning' : 'variable-review-muted'}>{result.coverage.truncated ? '本次审查未覆盖全部变量数据，结果可能不完整。' : '本次审查范围：最近完成回合正文 + 当前主要变量状态'}
                            {!!result.coverage.warnings.length && <details><summary>查看范围说明</summary><ul>{result.coverage.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
                        </div>
                        <section><h3>审查摘要</h3><p className="variable-review-wrap">{result.summary}</p>
                            {!result.changes.length && <p>{result.status === 'noChanges' ? '在本次审查范围内，未发现需要修改的变量。' : result.status === 'insufficientEvidence' ? '存在疑点，但证据不足，未生成修复命令。' : '没有可应用的合法变化；建议已被保护规则拦截，未修复变量。'}</p>}
                        </section>
                        {presentation && <section aria-label="本次审查统计"><h3>本次审查</h3><div className="variable-review-counts">
                            <span>补齐：{presentation.counts.supplement} 项</span><span>修正：{presentation.counts.correction} 项</span><span>清理：{presentation.counts.cleanup} 项</span><span>待确认：{presentation.counts.unresolved} 项</span>
                        </div><p className="variable-review-muted">按实际变更字段／实体统计；数组清理按减少的条目数统计，不按AI说明或命令条数计数。</p></section>}
                        <section aria-label="实际修改"><h3>{phase === 'applied' ? '本次已应用的修改' : '本次将应用的修改'}</h3><p className="variable-review-muted">{phase === 'applied' ? '以下为本次实际应用的变量变化。' : '以下为程序模拟确认的真实变化。点击“应用修复”后系统自动写入，无需手动编辑变量；应用前仍会重新校验。'}</p>
                            {presentation ? (['supplement', 'correction', 'cleanup'] as const).map(category => <section key={category} aria-label={({ supplement: '补齐', correction: '修正', cleanup: '清理' })[category]}>
                                <h4>{({ supplement: '补齐', correction: '修正', cleanup: '清理' })[category]}（{presentation.counts[category]} 项）</h4>
                                {presentation.changes.filter(change => change.category === category).map((change, i) => <article className="variable-review-change" key={i}>
                                    <strong className="variable-review-wrap">{change.label}</strong>{change.reason && <p className="variable-review-wrap">{change.reason}</p>}
                                    <Value value={change.before} /><div aria-label="变更为">→</div><Value value={change.after} />
                                </article>)}
                            </section>) : result.changes.map((change, i) => <article className="variable-review-change" key={i}><strong>{change.path}</strong><Value value={change.before} /><div>→</div><Value value={change.after} /></article>)}
                        </section>
                        <section aria-label="仍需确认的疑点"><h3>仍需确认的疑点</h3><p className="variable-review-muted">这里只有 AI 无法安全自动处理的问题。这里的内容不会自动修改变量。</p>
                            {result.issues.length ? <ul>{result.issues.map((issue, i) => <li className="variable-review-wrap" key={i}>{issue.description}</li>)}</ul> : <p>未发现需要玩家额外确认的问题。</p>}
                        </section>
                        <details className="variable-review-diagnostics"><summary>技术详情 · 提出 {result.proposedCommands.length} / Accepted {result.acceptedCommands.length} / Rejected {result.rejectedCommands.length}</summary>
                            <h4>AI 提出的命令</h4>{result.proposedCommands.map((cmd, i) => <pre key={i}>{commandText(cmd)}</pre>)}
                            <h4>Accepted · 已接受</h4>{result.acceptedCommands.map((cmd, i) => <pre key={i}>✓ {commandText(cmd)}</pre>)}
                            <h4>Rejected · 已拦截</h4>{result.rejectedCommands.map((item, i) => <div key={i}><pre>✗ {commandText(item.command)}</pre><p className="variable-review-wrap">原因：{item.reason}</p></div>)}
                            <h4>AI 原始说明（不代表已修改）</h4><pre>{(result.rawDiagnostics || []).join('\n')}</pre>
                            <h4>原始模拟差异</h4><pre>{format(result.changes)}</pre>
                        </details>
                    </>}
                </div>
                <footer className="variable-review-footer">
                    <button type="button" className="variable-review-secondary" onClick={close} disabled={phase === 'applying'}>{phase === 'applied' ? '关闭' : '取消'}</button>
                    {phase === 'input' && <button type="button" className="variable-review-primary" disabled={configurationLoading || (!!actions.getVariableReviewConfiguration && !configuration)} onClick={start}>开始变量审查</button>}
                    {phase === 'reviewing' && <span>等待 AI 返回…</span>}
                    {result && phase !== 'reviewing' && <>
                        {phase !== 'applying' && <button type="button" className="variable-review-secondary" onClick={reset}>{expired ? '重新审查' : '再次审查'}</button>}
                        {phase !== 'applied' && <button type="button" className="variable-review-primary" disabled={!canApply} onClick={apply}>{phase === 'applying' ? '应用中…' : '应用修复'}</button>}
                    </>}
                </footer>
            </div>
        </div>, document.body
    );
};
export default VariableReviewModal;
