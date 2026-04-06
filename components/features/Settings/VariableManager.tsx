import React from 'react';
import type { TavernCommand } from '../../../types';

type 变量根键 = '角色' | '环境' | '社交' | '世界' | '战斗' | '剧情' | '女主剧情规划' | '玩家门派' | '任务列表' | '约定列表' | '记忆系统';

interface Props {
    runtimeState: Record<变量根键, unknown>;
    onReplaceSection: (section: 变量根键, value: unknown) => void;
    onApplyCommand: (command: TavernCommand) => void;
}

const 区块样式 = 'rounded-2xl border border-gray-800/80 bg-black/25 p-4 md:p-5';
const 输入框样式 = 'w-full rounded-xl border border-gray-700/80 bg-black/40 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-wuxia-gold/50';
const 按钮样式 = 'rounded-lg border border-wuxia-gold/50 bg-wuxia-gold/10 px-3 py-2 text-xs text-wuxia-gold transition-colors hover:bg-wuxia-gold/20';
const 次级按钮样式 = 'rounded-lg border border-gray-700/80 px-3 py-2 text-xs text-gray-300 transition-colors hover:border-wuxia-gold/40 hover:text-wuxia-gold';

const 分区列表: Array<{ key: 变量根键; label: string; description: string }> = [
    { key: '角色', label: '角色', description: '主角角色档案、属性、装备和状态。' },
    { key: '环境', label: '环境', description: '时间、地点、天气与环境变量。' },
    { key: '社交', label: '社交', description: 'NPC 列表与其动态状态。' },
    { key: '世界', label: '世界', description: '地图、活跃事件、江湖史册等。' },
    { key: '战斗', label: '战斗', description: '当前战斗态势。' },
    { key: '剧情', label: '剧情', description: '章节、剧情规划、关键剧情变量组。' },
    { key: '女主剧情规划', label: '女主剧情规划', description: '女主排期与推进指引。' },
    { key: '玩家门派', label: '玩家门派', description: '门派结构、职位和门派资源。' },
    { key: '任务列表', label: '任务列表', description: '全部任务条目。' },
    { key: '约定列表', label: '约定列表', description: '全部约定条目。' },
    { key: '记忆系统', label: '记忆系统', description: '回忆档案、即时/短期/中期/长期记忆。' }
];

const 深拷贝 = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const 格式化JSON = (value: unknown): string => JSON.stringify(value, null, 2);

const 解析JSON输入 = (raw: string): unknown => {
    const text = raw.trim();
    if (!text) return '';
    return JSON.parse(text);
};

const 树节点编辑器: React.FC<{
    label: string;
    value: any;
    depth?: number;
    onChange: (value: any) => void;
    onDelete?: () => void;
}> = ({ label, value, depth = 0, onChange, onDelete }) => {
    const isArray = Array.isArray(value);
    const isObject = value && typeof value === 'object' && !isArray;
    const title = `${label}${isArray ? ` [${value.length}]` : ''}${isObject ? ` {${Object.keys(value).length}}` : ''}`;

    if (!isArray && !isObject) {
        if (typeof value === 'boolean') {
            return (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-800/70 bg-black/20 px-3 py-2">
                    <div className="text-sm text-gray-300">{label}</div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
                        {onDelete && <button type="button" onClick={onDelete} className={次级按钮样式}>删除</button>}
                    </div>
                </div>
            );
        }
        return (
            <div className="flex flex-col gap-2 rounded-xl border border-gray-800/70 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-gray-300">{label}</div>
                    {onDelete && <button type="button" onClick={onDelete} className={次级按钮样式}>删除</button>}
                </div>
                <input
                    type={typeof value === 'number' ? 'number' : 'text'}
                    value={value ?? ''}
                    onChange={(e) => onChange(typeof value === 'number' ? Number(e.target.value) : e.target.value)}
                    className={输入框样式}
                />
            </div>
        );
    }

    const handleAdd = () => {
        if (isArray) {
            const raw = window.prompt(`为 ${label} 新增数组项，输入 JSON：`, '""');
            if (raw === null) return;
            try {
                onChange([...(value || []), 解析JSON输入(raw)]);
            } catch {
                window.alert('数组项 JSON 无法解析。');
            }
            return;
        }
        const key = window.prompt(`为 ${label} 输入新字段名：`, '');
        if (!key) return;
        const raw = window.prompt(`为字段 ${key} 输入 JSON 值：`, '""');
        if (raw === null) return;
        try {
            onChange({
                ...(value || {}),
                [key]: 解析JSON输入(raw)
            });
        } catch {
            window.alert('字段值 JSON 无法解析。');
        }
    };

    return (
        <details open={depth < 1} className="rounded-xl border border-gray-800/70 bg-black/20 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-gray-200">
                <span>{title}</span>
                <span className="flex items-center gap-2">
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAdd(); }} className={次级按钮样式}>
                        新增
                    </button>
                    {onDelete && (
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }} className={次级按钮样式}>
                            删除
                        </button>
                    )}
                </span>
            </summary>
            <div className="mt-3 space-y-3">
                {isArray && value.map((item: any, index: number) => (
                    <树节点编辑器
                        key={`${label}-${index}`}
                        label={`[${index}]`}
                        value={item}
                        depth={depth + 1}
                        onChange={(nextItem) => {
                            const nextArray = [...value];
                            nextArray[index] = nextItem;
                            onChange(nextArray);
                        }}
                        onDelete={() => {
                            const nextArray = [...value];
                            nextArray.splice(index, 1);
                            onChange(nextArray);
                        }}
                    />
                ))}
                {isObject && Object.keys(value).map((key) => (
                    <树节点编辑器
                        key={`${label}-${key}`}
                        label={key}
                        value={value[key]}
                        depth={depth + 1}
                        onChange={(nextChild) => onChange({ ...value, [key]: nextChild })}
                        onDelete={() => {
                            const nextObject = { ...value };
                            delete nextObject[key];
                            onChange(nextObject);
                        }}
                    />
                ))}
            </div>
        </details>
    );
};

const VariableManager: React.FC<Props> = ({ runtimeState, onReplaceSection, onApplyCommand }) => {
    const [activeSection, setActiveSection] = React.useState<变量根键>('角色');
    const [drafts, setDrafts] = React.useState<Record<string, any>>(() => 深拷贝(runtimeState));
    const [jsonDraft, setJsonDraft] = React.useState('');
    const [commandAction, setCommandAction] = React.useState<TavernCommand['action']>('set');
    const [commandKey, setCommandKey] = React.useState('剧情.关键剧情变量组');
    const [commandValue, setCommandValue] = React.useState('[]');
    const [commandError, setCommandError] = React.useState('');

    React.useEffect(() => {
        const nextDrafts = 深拷贝(runtimeState);
        setDrafts(nextDrafts);
        setJsonDraft(格式化JSON(nextDrafts[activeSection]));
    }, [runtimeState, activeSection]);

    const activeValue = drafts[activeSection];

    React.useEffect(() => {
        setJsonDraft(格式化JSON(activeValue));
    }, [activeValue]);

    const updateActiveDraft = (value: any) => {
        setDrafts((prev) => ({ ...prev, [activeSection]: value }));
    };

    const handleSaveSection = () => {
        try {
            const parsed = JSON.parse(jsonDraft);
            setDrafts((prev) => ({ ...prev, [activeSection]: parsed }));
            onReplaceSection(activeSection, parsed);
        } catch {
            window.alert('当前分区 JSON 无法解析。');
        }
    };

    const handleApplyCommand = () => {
        try {
            const parsedValue = commandAction === 'delete' ? null : 解析JSON输入(commandValue);
            onApplyCommand({
                action: commandAction,
                key: commandKey.trim(),
                value: parsedValue
            });
            setCommandError('');
        } catch (error: any) {
            setCommandError(error?.message || '高级命令 JSON 无法解析。');
        }
    };

    return (
        <div className="space-y-4">
            <div className={区块样式}>
                <div className="text-lg font-bold text-paper-white">存档变量管理</div>
                <div className="mt-1 text-sm text-gray-500">面向当前会话的变量可视化编辑。结构树适合修正现有字段，高级命令适合路径级补丁与复杂数组操作。</div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                <div className={区块样式}>
                    <div className="space-y-2">
                        {分区列表.map((section) => (
                            <button
                                key={section.key}
                                type="button"
                                onClick={() => setActiveSection(section.key)}
                                className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                                    activeSection === section.key
                                        ? 'border-wuxia-gold/60 bg-wuxia-gold/10'
                                        : 'border-gray-800/80 bg-black/20 hover:border-gray-600'
                                }`}
                            >
                                <div className="text-sm font-bold text-paper-white">{section.label}</div>
                                <div className="mt-1 text-xs text-gray-500">{section.description}</div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className={区块样式}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold text-paper-white">{activeSection}</div>
                                <div className="mt-1 text-xs text-gray-500">{分区列表.find((item) => item.key === activeSection)?.description}</div>
                            </div>
                            <button type="button" onClick={() => updateActiveDraft(深拷贝(runtimeState[activeSection]))} className={次级按钮样式}>
                                重置本分区
                            </button>
                        </div>
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                            <树节点编辑器 label={activeSection} value={activeValue} onChange={updateActiveDraft} />
                        </div>
                    </div>

                    <div className={区块样式}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold text-paper-white">原始 JSON 草稿</div>
                                <div className="mt-1 text-xs text-gray-500">新增复杂对象、批量修订数组或整体替换时，直接编辑此分区 JSON 更快。</div>
                            </div>
                            <button type="button" onClick={handleSaveSection} className={按钮样式}>
                                保存本分区
                            </button>
                        </div>
                        <textarea
                            value={jsonDraft}
                            onChange={(e) => setJsonDraft(e.target.value)}
                            rows={16}
                            className={`${输入框样式} font-mono text-[12px] leading-6`}
                        />
                    </div>

                    <div className={区块样式}>
                        <div className="mb-3">
                            <div className="text-sm font-bold text-paper-white">高级路径修订</div>
                            <div className="mt-1 text-xs text-gray-500">适合路径级 `set/add/push/delete`。示例：`社交[0].记忆`、`剧情.关键剧情变量组`、`记忆系统.短期记忆`。</div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                            <label className="space-y-2">
                                <div className="text-xs text-gray-500">动作</div>
                                <select value={commandAction} onChange={(e) => setCommandAction(e.target.value as TavernCommand['action'])} className={输入框样式}>
                                    <option value="set">set</option>
                                    <option value="add">add</option>
                                    <option value="push">push</option>
                                    <option value="delete">delete</option>
                                </select>
                            </label>
                            <label className="space-y-2">
                                <div className="text-xs text-gray-500">路径</div>
                                <input value={commandKey} onChange={(e) => setCommandKey(e.target.value)} className={输入框样式} />
                            </label>
                        </div>
                        <div className="mt-3 space-y-2">
                            <div className="text-xs text-gray-500">JSON 值</div>
                            <textarea
                                value={commandValue}
                                onChange={(e) => setCommandValue(e.target.value)}
                                rows={6}
                                className={`${输入框样式} font-mono text-[12px] leading-6`}
                                disabled={commandAction === 'delete'}
                            />
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                            <button type="button" onClick={handleApplyCommand} className={按钮样式}>
                                应用命令
                            </button>
                            {commandError && <div className="text-sm text-red-300">{commandError}</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VariableManager;
