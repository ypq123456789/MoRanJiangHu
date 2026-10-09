import React from 'react';
import InlineSelect from '../../ui/InlineSelect';
import { 供应商标签 } from '../../../utils/apiConfig';
import { DEFAULT_VARIABLE_REVIEW_PROMPT } from '../../../prompts/runtime/variableReview';
import type { VariableReviewActions } from '../../../hooks/useGame/variableReviewActions';
import type { VariableReviewConfiguration, VariableReviewSettings, VariableReviewModelOption } from '../../../utils/variableReviewSettings';
import { supportsVariableReviewTopP, variableReviewSamplingLimits } from '../../../utils/variableReviewSampling';
import { DEFAULT_REVIEW_CONTEXT_WINDOW, MIN_REVIEW_CONTEXT_WINDOW, MAX_REVIEW_CONTEXT_WINDOW } from '../../../utils/variableReviewBudget';

const NumericInput: React.FC<{ id: string; value?: number; min: number; max: number; step?: number; placeholder: string; disabled?: boolean; onChange: (value?: number) => void }> = ({ value, onChange, ...props }) => {
    const [draft, setDraft] = React.useState(value === undefined ? '' : String(value));
    const [warning, setWarning] = React.useState('');
    React.useEffect(() => { setDraft(value === undefined ? '' : String(value)); }, [value]);
    const commit = () => {
        const raw = Number(draft);
        const bounded = Math.max(props.min, Math.min(props.max, raw));
        const next = !draft || !Number.isFinite(raw) ? undefined : props.step === undefined ? Math.floor(bounded) : bounded;
        setDraft(next === undefined ? '' : String(next));
        setWarning(draft && next !== raw ? `已调整为有效值：${next ?? '默认值'}` : '');
        onChange(next);
    };
    return <div><input {...props} type="number" value={draft} onChange={event => { setDraft(event.target.value); setWarning(''); }} onBlur={commit} />{warning && <p role="status" className="variable-review-muted">{warning}</p>}</div>;
};

interface Props { configuration: VariableReviewConfiguration; actions: VariableReviewActions; onChange: (next: VariableReviewSettings) => void }
const VariableReviewSettingsPanel: React.FC<Props> = ({ configuration, actions, onChange }) => {
    const { settings, library } = configuration;
    const topPSupported = supportsVariableReviewTopP({ model: settings.model, baseUrl: settings.apiMode === 'independent' ? settings.baseUrl : library.find(c => c.id === settings.mainConfigId)?.baseUrl });
    const limits = variableReviewSamplingLimits(settings.apiMode === 'independent' ? { baseUrl: settings.baseUrl, 供应商: settings.provider } : { baseUrl: library.find(c => c.id === settings.mainConfigId)?.baseUrl, 供应商: library.find(c => c.id === settings.mainConfigId)?.provider });
    const [models, setModels] = React.useState<VariableReviewModelOption[]>(configuration.modelMetadata || []);
    const [loading, setLoading] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [showKey, setShowKey] = React.useState(false);
    const [confirmReset, setConfirmReset] = React.useState(false);
    const sequence = React.useRef(0);
    const latest = React.useRef(settings); latest.current = settings;
    const source = JSON.stringify([settings.apiMode, settings.mainConfigId, settings.provider, settings.baseUrl, settings.apiKey]);
    const previousSource = React.useRef(source);
    React.useEffect(() => { if (previousSource.current !== source) { previousSource.current = source; sequence.current++; setModels([]); setMessage(''); setLoading(false); } }, [source]);
    React.useEffect(() => () => { sequence.current++; }, []);
    const update = <K extends keyof VariableReviewSettings>(key: K, value: VariableReviewSettings[K]) => onChange({ ...settings, [key]: value });
    const refresh = async () => {
        const request = ++sequence.current;
        setLoading(true); setMessage('');
        try {
            const next = await actions.refreshVariableReviewModels!(settings);
            if (request !== sequence.current) return;
            setModels(next);
            setMessage(next.some(m => m.id === latest.current.model) ? '审查模型列表已刷新。' : '当前审查模型不在最新模型列表中，请重新选择。');
        } catch (error: any) { if (request === sequence.current) setMessage(error.message || '模型列表获取失败。'); }
        finally { if (request === sequence.current) setLoading(false); }
    };
    const missing = settings.apiMode === 'main-library' && settings.mainConfigId && !library.some(c => c.id === settings.mainConfigId);
    const options = models.map(m => ({ value: m.id, label: m.label }));
    const metadata = models.find(model => model.id === settings.model);
    const autoWindow = metadata?.contextWindowTokens || metadata?.inputTokenLimit || DEFAULT_REVIEW_CONTEXT_WINDOW;
    const windowChoice = settings.contextWindowMode === 'custom' ? 'custom' : settings.contextWindowMode === 'manual' ? String(settings.contextWindowTokens || '') : 'auto';
    if (settings.model && !options.some(o => o.value === settings.model)) options.push({ value: settings.model, label: `${settings.model}（当前/自定义）` });
    return <section className="variable-review-settings">
        <h3>API 来源</h3>
        <div className="variable-review-settings-row">
            <label><input type="radio" name="review-api-mode" checked={settings.apiMode === 'main-library'} onChange={() => update('apiMode', 'main-library')} /> 使用主 API 库</label>
            <label><input type="radio" name="review-api-mode" checked={settings.apiMode === 'independent'} onChange={() => update('apiMode', 'independent')} /> 使用独立 API</label>
        </div>
        {settings.apiMode === 'main-library' ? <div role="group" aria-label="审查接口配置">
            <label className="variable-review-label">审查接口配置</label>
            <InlineSelect value={settings.mainConfigId} options={library.map(c => ({ value: c.id, label: c.name }))}
                onChange={id => onChange({ ...settings, mainConfigId: id, mainConfigName: library.find(c => c.id === id)?.name || id })}
                placeholder={missing ? `${settings.mainConfigName || settings.mainConfigId}（已失效）` : '请选择接口配置'} buttonClassName="variable-review-control" panelClassName="variable-review-select-panel" optionClassName="variable-review-select-option" />
            {missing && <p role="alert" className="variable-review-error">变量审查使用的接口配置“{settings.mainConfigName || settings.mainConfigId}”已不存在，请重新选择。</p>}
            <p className="variable-review-muted">复用选中接口的连接信息，审查模型独立选择；不会更改正文 API 或模型。</p>
        </div> : <>
            <div role="group" aria-label="审查供应商"><label className="variable-review-label">供应商</label>
                <InlineSelect value={settings.provider} options={Object.entries(供应商标签).map(([value, label]) => ({ value: value as VariableReviewSettings['provider'], label }))} onChange={value => update('provider', value)} buttonClassName="variable-review-control" panelClassName="variable-review-select-panel" optionClassName="variable-review-select-option" /></div>
            <label htmlFor="review-base-url">Base URL</label><input id="review-base-url" type="url" value={settings.baseUrl} onChange={e => update('baseUrl', e.target.value)} placeholder="https://example.com/v1" autoComplete="off" />
            <label htmlFor="review-api-key">API Key</label><div className="variable-review-settings-row"><input id="review-api-key" type={showKey ? 'text' : 'password'} value={settings.apiKey} onChange={e => update('apiKey', e.target.value)} autoComplete="off" />
                <button type="button" className="variable-review-secondary" onClick={() => setShowKey(!showKey)}>{showKey ? '隐藏密钥' : '显示密钥'}</button></div>
        </>}
        <div role="group" aria-label="审查模型列表"><label className="variable-review-label">审查模型</label><div className="variable-review-settings-row">
            <InlineSelect value={settings.model} options={options} onChange={id => update('model', id)} placeholder="刷新后选择模型" buttonClassName="variable-review-control" panelClassName="variable-review-select-panel" optionClassName="variable-review-select-option" />
            <button type="button" className="variable-review-secondary" disabled={loading} onClick={refresh}>{loading ? '刷新中…' : '刷新模型'}</button>
        </div></div>
        <label htmlFor="review-model-id">自定义审查 Model ID</label><input id="review-model-id" value={settings.model} onChange={e => update('model', e.target.value)} placeholder="也可手动填写实际 model ID" spellCheck={false} />
        {message && <p role="status" className="variable-review-muted">{message}</p>}
        <div role="group" aria-label="审查上下文窗口"><label className="variable-review-label">上下文窗口（tokens）</label>
            <InlineSelect value={windowChoice} options={[{ value: 'auto', label: '自动' }, ...[128000, 200000, 256000, 400000, 1000000].map(n => ({ value: String(n), label: n === 1000000 ? '1M' : `${n / 1000}K` })), { value: 'custom', label: '自定义' }]}
                onChange={value => onChange({ ...settings, contextWindowMode: value === 'auto' ? 'auto' : value === 'custom' ? 'custom' : 'manual', contextWindowTokens: value === 'auto' || value === 'custom' ? settings.contextWindowTokens : Number(value) })}
                buttonClassName="variable-review-control" panelClassName="variable-review-select-panel" optionClassName="variable-review-select-option" />
            {settings.contextWindowMode === 'custom' && <><label htmlFor="review-context-window">自定义上下文窗口 Token</label><NumericInput id="review-context-window" min={MIN_REVIEW_CONTEXT_WINDOW} max={MAX_REVIEW_CONTEXT_WINDOW} value={settings.contextWindowTokens} placeholder="例如 200000 / 400000 / 1000000" onChange={value => update('contextWindowTokens', value)} /></>}
            <p className="variable-review-muted">{settings.contextWindowMode === 'auto' || !settings.contextWindowMode ? `自动容量：${autoWindow.toLocaleString()} tokens（${metadata?.contextWindowTokens ? '当前接口模型metadata' : metadata?.inputTokenLimit ? '模型输入上限，保守作为上下文容量' : '未获得模型metadata，使用审查默认128K'}）。刷新模型可更新容量信息。` : '使用手动指定容量；刷新模型不会覆盖该值。'} 输入预算会扣除最大输出和安全预留；不会按容量偷偷删除业务数据。</p>
        </div>
        <label htmlFor="review-tokens">最大输出 Token</label><div className="variable-review-settings-row">
            {[8192, 32768, 65536].map(n => <button key={n} type="button" className="variable-review-secondary" aria-pressed={settings.maxOutputTokens === n} onClick={() => update('maxOutputTokens', n)}>{n / 1024}K</button>)}
            <NumericInput id="review-tokens" min={1024} max={262144} value={settings.maxOutputTokens} placeholder="默认32K / 自定义" onChange={value => update('maxOutputTokens', value)} />
        </div>
        <div className="variable-review-settings-grid"><div><label htmlFor="review-temperature">Temperature（可选）</label><NumericInput id="review-temperature" min={0} max={limits.temperatureMax} step={0.1} value={settings.temperature} placeholder="默认 0.2" onChange={value => update('temperature', value)} /></div>
            <div><label htmlFor="review-top-p">Top P（可选）</label><NumericInput id="review-top-p" min={limits.topPMin} max={1} step={0.05} value={settings.topP} disabled={!topPSupported} placeholder="留空不发送" onChange={value => update('topP', value)} />{!topPSupported && <p className="variable-review-muted">当前 Deep Research 协议不支持 Top P，本次请求不会发送该参数。</p>}</div></div>
        <label className="variable-review-label" htmlFor="review-strategy">审查提示词</label><textarea id="review-strategy" rows={10} value={settings.customPrompt} onChange={e => update('customPrompt', e.target.value)} />
        <p className="variable-review-muted">设置自动保存。可编辑检查策略；事实依据、删除保护和命令安全规则始终由程序保留。</p>
        <button type="button" className="variable-review-secondary" onClick={() => setConfirmReset(true)}>恢复默认审查提示词</button>
        {confirmReset && <div className="variable-review-warning" role="alertdialog" aria-label="恢复默认变量审查提示词">
            <p>确定恢复默认变量审查提示词吗？</p><p>当前自定义审查提示词将被替换。API 配置和本次审查备注不会受到影响。</p>
            <div className="variable-review-settings-row"><button type="button" className="variable-review-secondary" onClick={() => setConfirmReset(false)}>取消</button><button type="button" className="variable-review-primary" onClick={() => { update('customPrompt', DEFAULT_VARIABLE_REVIEW_PROMPT); setConfirmReset(false); }}>恢复默认</button></div>
        </div>}
    </section>;
};
export default VariableReviewSettingsPanel;
