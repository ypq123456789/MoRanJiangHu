import React from 'react';
import type { 世界书结构, 世界书条目结构, 世界书作用域, 世界书类型, 世界书条目形态, 世界书预设组结构, 内置提示词条目结构 } from '../../../types';
import { bundledDefaultWorldbookIds, bundledWorldbookPresets, loadAllBundledWorldbookPresets, loadBundledWorldbookPreset } from '../../../data/worldbookPresets';
import { 内置提示词分类顺序, 构建内置提示词导出数据, 解析内置提示词导入数据, 规范化内置提示词列表, 世界书本体槽位 } from '../../../utils/builtinPrompts';
import { 世界书作用域选项, 世界书类型选项, 世界书条目形态选项, 世界书注入模式选项, 世界书功能模块选项, 创建空世界书, 创建空世界书条目, 创建空世界书预设组, 获取世界书条目注入说明, 构建世界书导出数据, 构建世界书预设组导出数据, 应用世界书预设组到世界书列表, 解析世界书导入数据, 解析世界书预设组导入数据, 规范化世界书列表, 规范化世界书预设组列表 } from '../../../utils/worldbook';
import type { ConfirmOptions } from '../../ui/InAppConfirmModal';
import ToggleSwitch from '../../ui/ToggleSwitch';

type Props = {
    builtinPromptEntries: 内置提示词条目结构[];
    worldbooks: 世界书结构[];
    worldbookPresetGroups: 世界书预设组结构[];
    onSaveBuiltinPromptEntries: (entries: 内置提示词条目结构[]) => Promise<void> | void;
    onSaveWorldbooks: (books: 世界书结构[]) => Promise<void> | void;
    onSaveWorldbookPresetGroups: (groups: 世界书预设组结构[]) => Promise<void> | void;
    onClose: () => void;
    requestConfirm?: (options: ConfirmOptions) => Promise<boolean>;
};

const inputClass = 'w-full rounded-lg border border-wuxia-gold/20 bg-black/60 px-3 py-2 text-sm text-gray-200 outline-none focus:border-wuxia-gold/50';
const textareaClass = `${inputClass} min-h-[120px] resize-y`;
const largeTextareaClass = `${inputClass} min-h-[360px] resize-y`;
const fieldLabelClass = 'mb-1 text-[11px] font-serif uppercase tracking-[0.2em] text-wuxia-gold/70';
const sectionToggleClass = 'flex w-full items-center justify-between rounded-xl border border-wuxia-gold/10 bg-black/20 px-3 py-2 text-left transition-colors hover:border-wuxia-gold/25';
const hintBoxClass = 'rounded-2xl border border-wuxia-gold/15 bg-wuxia-gold/10 px-4 py-3 text-xs leading-6 text-gray-300';
const miniTagClass = 'inline-flex items-center rounded-full border border-wuxia-gold/15 bg-black/25 px-2 py-0.5 text-[10px] text-gray-300';

const 下载JSON文件 = (filename: string, payload: unknown) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

const 读取JSON文件 = async <T,>(file: File): Promise<T> => JSON.parse(await file.text()) as T;

const 内置分类说明 = (category: string): string => category === '主剧情' || category === '开局'
    ? '这里只管理固定模板，不包含世界观母本。'
    : category === '变量生成'
        ? '这里同时包含“独立变量生成 API”现行槽位，以及少量仅为旧档兼容保留的历史槽位。'
    : '当前分类下的固定接管提示词。';

type 内置提示词说明 = {
    摘要: string;
    何时生效: string;
    设置建议: string;
    注意事项?: string;
    标签: string[];
};

const 互斥主剧情COT槽位 = new Set<string>([
    世界书本体槽位.主剧情COT_常规,
    世界书本体槽位.主剧情COT_女主规划,
    世界书本体槽位.主剧情COT_NTL女主规划
]);

const 成对女主规划槽位 = new Set<string>([
    世界书本体槽位.主剧情女主规划_常规,
    世界书本体槽位.主剧情女主规划_NTL,
    世界书本体槽位.主剧情女主规划思考_常规,
    世界书本体槽位.主剧情女主规划思考_NTL
]);

const 兼容保留变量槽位 = new Set<string>([
    世界书本体槽位.主剧情变量校准_常规,
    世界书本体槽位.主剧情变量校准_世界演变
]);

const 获取内置提示词说明 = (entry: 内置提示词条目结构 | null): 内置提示词说明 | null => {
    if (!entry) return null;
    const slotId = entry.槽位ID;
    switch (slotId) {
        case 世界书本体槽位.主剧情输出协议:
            return {
                摘要: '这是主剧情输出格式本体，负责约束 `<thinking>`、`<正文>`、命令等整体输出骨架。',
                何时生效: '每次主剧情请求都会读取这一槽位。',
                设置建议: '一般只需要开这一条，不需要另外再开同类替代项。',
                标签: ['主剧情必经', '单槽位']
            };
        case 世界书本体槽位.主剧情COT_常规:
            return {
                摘要: '这是“不启用女主剧情规划”时的主剧情思维链版本。',
                何时生效: '仅在未启用女主剧情规划时自动选用；不会和女主规划版、NTL 版同时生效。',
                设置建议: '只改常规玩法时开这一条即可；另外两条主剧情思维链不用一起开。',
                标签: ['互斥备选', '主剧情COT']
            };
        case 世界书本体槽位.主剧情COT_女主规划:
            return {
                摘要: '这是“启用女主剧情规划，但不是 NTL 后宫风格”时的主剧情思维链版本。',
                何时生效: '仅在启用女主剧情规划、且剧情风格不是 `NTL后宫` 时自动选用。',
                设置建议: '如果你要改普通女主规划玩法，就开这一条；不需要再同时开常规版和 NTL 版。',
                标签: ['互斥备选', '主剧情COT']
            };
        case 世界书本体槽位.主剧情COT_NTL女主规划:
            return {
                摘要: '这是“启用女主剧情规划 + NTL 后宫风格”时的主剧情思维链版本。',
                何时生效: '仅在启用女主剧情规划、且剧情风格为 `NTL后宫` 时自动选用。',
                设置建议: '只改 NTL 女主玩法时开这一条即可，不需要和前两条一起开。',
                标签: ['互斥备选', '主剧情COT', 'NTL']
            };
        case 世界书本体槽位.主剧情女主规划_常规:
            return {
                摘要: '这是普通女主剧情规划协议正文，告诉主剧情如何写女主规划树。',
                何时生效: '仅在启用女主剧情规划、且当前不是 NTL 版本时读取。',
                设置建议: '通常要和“主剧情 · 女主剧情规划思考协议”常规版一起改，成对保持一致。',
                标签: ['成对启用', '女主规划']
            };
        case 世界书本体槽位.主剧情女主规划思考_常规:
            return {
                摘要: '这是普通女主剧情规划的思考协议，配合上面的常规女主规划协议一起使用。',
                何时生效: '仅在启用女主剧情规划、且当前不是 NTL 版本时读取。',
                设置建议: '建议和“主剧情 · 女主剧情规划协议”常规版一起改，不要只改其中一条。',
                标签: ['成对启用', '女主规划']
            };
        case 世界书本体槽位.主剧情女主规划_NTL:
            return {
                摘要: '这是 NTL 女主剧情规划协议正文。',
                何时生效: '仅在启用女主剧情规划、且剧情风格为 `NTL后宫` 时读取。',
                设置建议: '通常要和 NTL 版“女主剧情规划思考协议”一起改，成对保持一致。',
                标签: ['成对启用', '女主规划', 'NTL']
            };
        case 世界书本体槽位.主剧情女主规划思考_NTL:
            return {
                摘要: '这是 NTL 女主剧情规划的思考协议，配合上面的 NTL 女主规划协议一起使用。',
                何时生效: '仅在启用女主剧情规划、且剧情风格为 `NTL后宫` 时读取。',
                设置建议: '建议和“主剧情 · 女主剧情规划协议（NTL）”一起改，不要只改其中一条。',
                标签: ['成对启用', '女主规划', 'NTL']
            };
        case 世界书本体槽位.主剧情变量校准_常规:
            return {
                摘要: '这是旧版“主剧情内嵌变量协议”兼容槽位，保留主要为了读旧配置和旧导入数据。',
                何时生效: '当前独立变量生成链路已不再依赖这条主剧情内嵌协议。',
                设置建议: '新配置通常不用改这一条；优先改下面“独立变量生成API”那几条。',
                注意事项: '如果客户只是想改现在实际在跑的变量生成，请不要把精力放在这类历史兼容槽位上。',
                标签: ['兼容保留', '历史槽位']
            };
        case 世界书本体槽位.主剧情变量校准_世界演变:
            return {
                摘要: '这是旧版“世界演变分流后主剧情内嵌变量协议”兼容槽位。',
                何时生效: '当前独立变量生成链路已不再依赖这条主剧情内嵌协议。',
                设置建议: '新配置通常不用改这一条；优先改下面“独立变量生成API”那几条。',
                注意事项: '它和上面的常规版都更偏兼容保留，不是客户现在主要该调的入口。',
                标签: ['兼容保留', '历史槽位']
            };
        case 世界书本体槽位.变量模型系统_常规:
            return {
                摘要: '这是当前“独立变量生成 API”真正会读的系统补充常规版。',
                何时生效: '变量生成开启时使用；若本回合还没经过世界演变更新，则走常规版。',
                设置建议: '大多数客户只改这一条就够了；如果还想覆盖“世界演变已更新后再跑变量生成”的场景，再同步改另一条变体。',
                标签: ['当前生效', '独立变量API']
            };
        case 世界书本体槽位.变量模型系统_世界演变已更新:
            return {
                摘要: '这是当前“独立变量生成 API”在“世界演变已更新”分支下会读的系统补充版。',
                何时生效: '只有变量生成发生在世界演变更新之后时，才会自动改走这一条。',
                设置建议: '如果客户希望两个分支逻辑一致，建议把这一条和常规版一起同步改。',
                标签: ['条件生效', '独立变量API']
            };
        case 世界书本体槽位.变量模型用户_常规:
            return {
                摘要: '这是独立变量生成 API 的“附加变量规则”常规版。',
                何时生效: '变量生成开启、且没有进入“世界演变已更新”分支时使用。',
                设置建议: '通常与“独立变量生成API · 系统补充（常规）”一起看、一起改，避免一边改规则一边忘记补系统说明。',
                标签: ['当前生效', '独立变量API']
            };
        case 世界书本体槽位.变量模型用户_世界演变已更新:
            return {
                摘要: '这是独立变量生成 API 的“附加变量规则”世界演变后版本。',
                何时生效: '只有变量生成发生在世界演变更新之后时使用。',
                设置建议: '如果客户想要所有变量生成分支都统一规则，建议和常规版一起同步维护。',
                标签: ['条件生效', '独立变量API']
            };
        case 世界书本体槽位.变量模型COT:
            return {
                摘要: '这是独立变量生成 API 专用的 COT 思考协议。',
                何时生效: '只要独立变量生成链路在跑，就会读取这一条。',
                设置建议: '如果客户要改变量生成的思考步骤或输出纪律，这一条才是当前有效入口。',
                标签: ['当前生效', '独立变量API', 'COT']
            };
        default:
            return {
                摘要: '这是一个固定接管槽位。开启后只会替换这一槽位对应的默认模板，不会自动影响其他同名条目。',
                何时生效: '仅在对应流程与条件命中时生效。',
                设置建议: '如果看到多个名称很像的条目，先看这里的槽位说明，再决定要不要同步改成对项或互斥变体。',
                标签: []
            };
    }
};

const 更新条目注入说明 = (entry: 世界书条目结构): 世界书条目结构 => ({ ...entry, 注入说明: 获取世界书条目注入说明(entry), 更新时间: Date.now() });

const 获取条目形态标签 = (shape?: 世界书条目形态): string => (
    世界书条目形态选项.find((item) => item.value === shape)?.label || '普通条目'
);

const 获取条目类型标签 = (type: 世界书类型): string => (
    世界书类型选项.find((item) => item.value === type)?.label || type
);

const 勾选胶囊: React.FC<{
    checked: boolean;
    label: string;
    onChange: (next: boolean) => void;
    className?: string;
}> = ({ checked, label, onChange, className = '' }) => (
    <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
            checked
                ? 'border-wuxia-gold/40 bg-wuxia-gold/12 text-wuxia-gold'
                : 'border-wuxia-gold/10 bg-black/30 text-gray-300 hover:border-wuxia-gold/25'
        } ${className}`}
    >
        <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
            checked
                ? 'border-wuxia-gold/70 bg-wuxia-gold/20 text-wuxia-gold'
                : 'border-gray-600 bg-black/40 text-transparent'
        }`}>
            ✓
        </span>
        <span>{label}</span>
    </button>
);

const WorldbookManagerModal: React.FC<Props> = ({ builtinPromptEntries, worldbooks, worldbookPresetGroups, onSaveBuiltinPromptEntries, onSaveWorldbooks, onSaveWorldbookPresetGroups, onClose, requestConfirm }) => {
    const [tab, setTab] = React.useState<'builtin' | 'extra'>('builtin');
    const [builtinDraft, setBuiltinDraft] = React.useState(() => 规范化内置提示词列表(builtinPromptEntries));
    const [bookDraft, setBookDraft] = React.useState(() => 规范化世界书列表(worldbooks));
    const [groupDraft, setGroupDraft] = React.useState(() => 规范化世界书预设组列表(worldbookPresetGroups));
    const [selectedBuiltinId, setSelectedBuiltinId] = React.useState('');
    const [selectedBookId, setSelectedBookId] = React.useState('');
    const [selectedEntryId, setSelectedEntryId] = React.useState('');
    const [selectedGroupId, setSelectedGroupId] = React.useState('');
    const [selectedPackBookIds, setSelectedPackBookIds] = React.useState<string[]>([]);
    const [newEntryShape, setNewEntryShape] = React.useState<世界书条目形态>('normal');
    const [expandedBookSections, setExpandedBookSections] = React.useState<Record<string, boolean>>({});
    const [message, setMessage] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const builtinImportRef = React.useRef<HTMLInputElement | null>(null);
    const worldbookImportRef = React.useRef<HTMLInputElement | null>(null);
    const groupImportRef = React.useRef<HTMLInputElement | null>(null);

    React.useEffect(() => setBuiltinDraft(规范化内置提示词列表(builtinPromptEntries)), [builtinPromptEntries]);
    React.useEffect(() => setBookDraft(规范化世界书列表(worldbooks)), [worldbooks]);
    React.useEffect(() => setGroupDraft(规范化世界书预设组列表(worldbookPresetGroups)), [worldbookPresetGroups]);

    const selectedBuiltin = builtinDraft.find((item) => item.id === selectedBuiltinId) || builtinDraft[0] || null;
    const selectedBook = bookDraft.find((item) => item.id === selectedBookId) || bookDraft[0] || null;
    const selectedEntry = selectedBook?.条目.find((item) => item.id === selectedEntryId) || selectedBook?.条目[0] || null;
    const selectedGroup = groupDraft.find((item) => item.id === selectedGroupId) || groupDraft[0] || null;
    const isBundledDefaultWorldbook = !!selectedBook && bundledDefaultWorldbookIds.includes(selectedBook.id);
    const selectedBuiltinHint = 获取内置提示词说明(selectedBuiltin);

    React.useEffect(() => { if (!selectedBuiltin && builtinDraft[0]) setSelectedBuiltinId(builtinDraft[0].id); }, [builtinDraft, selectedBuiltin]);
    React.useEffect(() => { if (!selectedBook && bookDraft[0]) setSelectedBookId(bookDraft[0].id); }, [bookDraft, selectedBook]);
    React.useEffect(() => { if (!selectedEntry && selectedBook?.条目[0]) setSelectedEntryId(selectedBook.条目[0].id); }, [selectedBook, selectedEntry]);
    React.useEffect(() => { if (!selectedGroup && groupDraft[0]) setSelectedGroupId(groupDraft[0].id); }, [groupDraft, selectedGroup]);

    const saveAll = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await Promise.all([
                onSaveBuiltinPromptEntries(规范化内置提示词列表(builtinDraft)),
                onSaveWorldbooks(规范化世界书列表(bookDraft)),
                onSaveWorldbookPresetGroups(规范化世界书预设组列表(groupDraft))
            ]);
            setMessage('改动已保存。');
        } finally {
            setBusy(false);
        }
    };

    const confirmDelete = async (title: string, messageText: string): Promise<boolean> => (
        requestConfirm ? requestConfirm({ title, message: messageText, confirmText: '删除', danger: true }) : true
    );

    const handleImportBuiltin = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setBuiltinDraft(解析内置提示词导入数据(await 读取JSON文件(file)));
    };

    const handleImportWorldbooks = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const imported = 解析世界书导入数据(await 读取JSON文件(file));
        mergeImportedWorldbooks(imported, file.name || '外部世界书');
    };

    const handleImportGroups = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const imported = 解析世界书预设组导入数据(await 读取JSON文件(file));
        setGroupDraft((prev) => 规范化世界书预设组列表([...prev, ...imported]));
    };

    const mergeImportedWorldbooks = React.useCallback((imported: 世界书结构[], sourceLabel: string) => {
        if (!Array.isArray(imported) || imported.length <= 0) {
            setMessage(`${sourceLabel} 中没有可导入的世界书。`);
            return;
        }
        const firstBook = imported[0];
        setBookDraft((prev) => 规范化世界书列表([...prev, ...imported]));
        setSelectedBookId(firstBook?.id || '');
        setSelectedEntryId(firstBook?.条目?.[0]?.id || '');
        setMessage(`已导入 ${sourceLabel}（${imported.length} 本世界书）。`);
    }, []);

    const handleImportBundledWorldbookPreset = async (preset: (typeof bundledWorldbookPresets)[number]) => {
        try {
            mergeImportedWorldbooks(await loadBundledWorldbookPreset(preset), preset.title);
        } catch (error: any) {
            setMessage(error?.message || `${preset.title} 导入失败。`);
        }
    };

    const handleImportAllBundledWorldbooks = async () => {
        try {
            const payloads = await loadAllBundledWorldbookPresets();
            mergeImportedWorldbooks(
                payloads,
                `名器系列本地预置：${bundledWorldbookPresets.map((item) => item.title).join('、')}`
            );
        } catch (error: any) {
            setMessage(error?.message || '名器系列本地预置导入失败。');
        }
    };

    const renderBundledWorldbookPresetPanel = () => (
        <div className="rounded-2xl border border-wuxia-gold/10 bg-black/30 p-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-serif text-wuxia-gold">本地世界书预置</div>
                    <div className="mt-1 text-[11px] text-gray-500">这三本现已作为默认启用的附加世界书载入。这里保留恢复入口，方便你在手动改过内容后重新套回原始版本。</div>
                </div>
                <button
                    type="button"
                    onClick={() => { void handleImportAllBundledWorldbooks(); }}
                    className="rounded-lg border border-wuxia-gold/30 bg-wuxia-gold/10 px-3 py-1.5 text-xs text-wuxia-gold"
                >
                    恢复全部
                </button>
            </div>
            <div className="mt-3 space-y-2">
                {bundledWorldbookPresets.map((preset) => (
                    <div key={preset.id} className="flex items-center justify-between gap-3 rounded-xl border border-wuxia-gold/10 bg-black/20 px-3 py-2">
                        <div className="min-w-0">
                            <div className="truncate text-sm text-gray-200">{preset.title}</div>
                            <div className="mt-1 text-[10px] text-gray-500">{preset.description}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => { void handleImportBundledWorldbookPreset(preset); }}
                            className="shrink-0 rounded-lg border border-wuxia-gold/20 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-wuxia-gold/40 hover:text-wuxia-gold"
                        >
                            恢复
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );

    const 切换世界书区块展开 = (bookId: string, section: 'description' | 'outline') => {
        const key = `${bookId}:${section}`;
        setExpandedBookSections((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const 世界书区块已展开 = (bookId: string, section: 'description' | 'outline'): boolean => (
        expandedBookSections[`${bookId}:${section}`] === true
    );

    const 新增条目到当前世界书 = (shape: 世界书条目形态) => {
        if (!selectedBook) return;
        const nextEntry = 创建空世界书条目(shape);
        setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id
            ? { ...book, 条目: [nextEntry, ...book.条目], 更新时间: Date.now() }
            : book));
        setSelectedEntryId(nextEntry.id);
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4">
            <div className="flex h-[90vh] w-full max-w-[1600px] flex-col overflow-hidden rounded-3xl border border-wuxia-gold/25 bg-[#070707] shadow-2xl">
                <div className="flex items-center justify-between border-b border-wuxia-gold/10 px-6 py-4">
                    <div>
                        <h2 className="text-xl font-serif text-wuxia-gold">提示词与附加世界书管理</h2>
                        <div className="mt-1 text-xs text-gray-500">内置提示词接管与附加世界书注入已拆分。</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setTab('builtin')} className={`rounded-lg px-4 py-2 text-sm ${tab === 'builtin' ? 'bg-wuxia-gold/15 text-wuxia-gold' : 'text-gray-400'}`}>内置提示词</button>
                        <button type="button" onClick={() => setTab('extra')} className={`rounded-lg px-4 py-2 text-sm ${tab === 'extra' ? 'bg-wuxia-gold/15 text-wuxia-gold' : 'text-gray-400'}`}>附加世界书</button>
                        <button type="button" onClick={() => { void saveAll(); }} className="rounded-lg border border-wuxia-gold/35 bg-wuxia-gold/10 px-4 py-2 text-sm text-wuxia-gold">{busy ? '保存中...' : '保存全部'}</button>
                        <button type="button" onClick={onClose} className="rounded-lg border border-wuxia-gold/15 px-4 py-2 text-sm text-gray-300">关闭</button>
                    </div>
                </div>
                <input ref={builtinImportRef} type="file" accept="application/json" className="hidden" onChange={(e) => { void handleImportBuiltin(e); }} />
                <input ref={worldbookImportRef} type="file" accept="application/json" className="hidden" onChange={(e) => { void handleImportWorldbooks(e); }} />
                <input ref={groupImportRef} type="file" accept="application/json" className="hidden" onChange={(e) => { void handleImportGroups(e); }} />
                {message && <div className="border-b border-wuxia-gold/10 bg-wuxia-gold/5 px-6 py-2 text-sm text-wuxia-gold/90">{message}</div>}
                <div className="min-h-0 flex-1 overflow-hidden p-4">
                    {tab === 'builtin' ? (
                        <div className="grid h-full gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                            <div className="min-h-0 overflow-auto rounded-2xl border border-wuxia-gold/15 bg-black/35 p-3">
                                <div className="mb-3 flex items-center justify-between">
                                    <div className="text-base font-serif text-wuxia-gold">固定接管条目</div>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => 下载JSON文件('builtin-prompts.json', 构建内置提示词导出数据(builtinDraft))} className="rounded-lg border border-wuxia-gold/20 px-3 py-1.5 text-xs text-gray-300">导出</button>
                                        <button type="button" onClick={() => builtinImportRef.current?.click()} className="rounded-lg border border-wuxia-gold/20 px-3 py-1.5 text-xs text-gray-300">导入</button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    {内置提示词分类顺序.map((category) => {
                                        const entries = builtinDraft.filter((entry) => entry.分类 === category);
                                        if (entries.length === 0) return null;
                                        return <div key={category}><div className="mb-1 text-sm font-serif text-wuxia-gold">{category}</div><div className="mb-2 text-[11px] text-gray-500">{内置分类说明(category)}</div><div className="space-y-2">{entries.map((entry) => {
                                            const hint = 获取内置提示词说明(entry);
                                            return <button key={entry.id} type="button" onClick={() => setSelectedBuiltinId(entry.id)} className={`w-full rounded-xl border p-3 text-left ${selectedBuiltin?.id === entry.id ? 'border-wuxia-gold/60 bg-wuxia-gold/10' : 'border-wuxia-gold/10 bg-black/30'}`}><div className={`text-sm font-serif ${selectedBuiltin?.id === entry.id ? 'text-wuxia-gold' : 'text-gray-200'}`}>{entry.标题}</div><div className="mt-1 text-[10px] text-gray-500">{entry.启用 !== false ? '接管启用' : '接管关闭'}</div>{hint && hint.标签.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{hint.标签.map((label) => <span key={`${entry.id}:${label}`} className={miniTagClass}>{label}</span>)}</div>}</button>;
                                        })}</div></div>;
                                    })}
                                </div>
                            </div>
                            <div className="min-h-0 overflow-auto rounded-2xl border border-wuxia-gold/15 bg-black/35 p-4">
                                {selectedBuiltin ? <>
                                    <div className="flex items-center justify-between gap-3"><div><div className="text-lg font-serif text-wuxia-gold">{selectedBuiltin.标题}</div><div className="mt-1 text-xs text-gray-500">{selectedBuiltin.槽位ID}</div></div><div className="flex items-center gap-3 text-sm text-gray-300"><span>启用接管</span><ToggleSwitch checked={selectedBuiltin.启用 !== false} onChange={(next) => setBuiltinDraft((prev) => 规范化内置提示词列表(prev.map((entry) => entry.id === selectedBuiltin.id ? { ...entry, 启用: next, 更新时间: Date.now() } : entry)))} ariaLabel={`切换${selectedBuiltin.标题}接管状态`} /></div></div>
                                    <div className="my-4 rounded-2xl border border-wuxia-gold/10 bg-black/30 px-4 py-3 text-sm text-gray-400">默认关闭接管。开启后只会替换该槽位的默认模板，不会自动改动消息角色、上下文顺序或本回合状态骨架。</div>
                                    {selectedBuiltinHint && <div className={`${hintBoxClass} mb-4 space-y-2`}>
                                        {selectedBuiltinHint.标签.length > 0 && <div className="flex flex-wrap gap-1.5">{selectedBuiltinHint.标签.map((label) => <span key={`selected:${label}`} className={miniTagClass}>{label}</span>)}</div>}
                                        <div><span className="text-wuxia-gold/90">这条是做什么的：</span>{selectedBuiltinHint.摘要}</div>
                                        <div><span className="text-wuxia-gold/90">什么时候真的会用到：</span>{selectedBuiltinHint.何时生效}</div>
                                        <div><span className="text-wuxia-gold/90">推荐怎么配：</span>{selectedBuiltinHint.设置建议}</div>
                                        {selectedBuiltinHint.注意事项 && <div><span className="text-amber-200">注意：</span>{selectedBuiltinHint.注意事项}</div>}
                                    </div>}
                                    {(selectedBuiltin.分类 === '主剧情' || selectedBuiltin.分类 === '变量生成') && <div className="mb-4 rounded-2xl border border-wuxia-gold/10 bg-wuxia-gold/5 px-4 py-3 text-xs leading-6 text-gray-300">
                                        这里不是“同名条目全开一起叠加”的配置方式，而是“程序按当前玩法自动挑一个槽位来读”。
                                        主剧情思维链三条属于互斥备选；女主剧情规划协议与思考协议通常要成对维护；变量生成下方标了“兼容保留”的条目更偏旧配置兼容，客户现在真正常改的是“独立变量生成API”那几条。
                                    </div>}
                                    <textarea className={largeTextareaClass} value={selectedBuiltin.内容} onChange={(e) => setBuiltinDraft((prev) => 规范化内置提示词列表(prev.map((entry) => entry.id === selectedBuiltin.id ? { ...entry, 内容: e.target.value, 更新时间: Date.now() } : entry)))} />
                                </> : <div className="text-sm text-gray-500">当前没有可编辑的内置提示词。</div>}
                            </div>
                        </div>
                    ) : (
                        <div className="grid h-full gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                            <div className="min-h-0 overflow-auto rounded-2xl border border-wuxia-gold/15 bg-black/35 p-3 space-y-4">
                                {renderBundledWorldbookPresetPanel()}
                                <div><div className="mb-3 flex items-center justify-between"><div><div className="text-base font-serif text-wuxia-gold">附加世界书</div><div className="text-xs text-gray-500">这里只做追加注入，不再承载内置提示词。</div></div><div className="flex items-center gap-2"><button type="button" onClick={() => { const nextBook = 创建空世界书(); setBookDraft((prev) => [nextBook, ...prev]); setSelectedBookId(nextBook.id); setSelectedEntryId(nextBook.条目[0]?.id || ''); }} className="rounded-lg border border-wuxia-gold/30 px-3 py-1.5 text-xs text-wuxia-gold">新建</button><button type="button" onClick={() => 下载JSON文件('extra-worldbooks.json', 构建世界书导出数据(bookDraft))} className="rounded-lg border border-wuxia-gold/20 px-3 py-1.5 text-xs text-gray-300">导出</button><button type="button" onClick={() => worldbookImportRef.current?.click()} className="rounded-lg border border-wuxia-gold/20 px-3 py-1.5 text-xs text-gray-300">导入</button></div></div><div className={`${hintBoxClass} mb-3`}>导入后请点击右上角“保存全部”才会长期生效。自己的世界书建议先用“始终注入 + 全部流程”；如果选择“关键词命中”，必须填写关键词，并且当前剧情、地点、NPC 或历史里命中后才会注入。</div><div className="space-y-2">{bookDraft.map((book) => <div key={book.id} className={`rounded-xl border p-3 ${selectedBook?.id === book.id ? 'border-wuxia-gold/60 bg-wuxia-gold/10' : 'border-wuxia-gold/10 bg-black/30'}`}><div className="flex items-start justify-between gap-3"><button type="button" onClick={() => setSelectedBookId(book.id)} className="flex-1 text-left"><div className={`font-serif ${selectedBook?.id === book.id ? 'text-wuxia-gold' : 'text-gray-200'}`}>{book.标题}</div><div className="mt-1 text-[11px] text-gray-500">{book.启用 === false ? '未启用' : `已启用 · ${book.条目.filter((entry) => entry.启用 !== false).length}/${book.条目.length} 条`}</div><div className="mt-1 text-[11px] text-gray-500">{book.描述 || '无描述'}</div></button><勾选胶囊 checked={selectedPackBookIds.includes(book.id)} onChange={() => setSelectedPackBookIds((prev) => prev.includes(book.id) ? prev.filter((id) => id !== book.id) : [...prev, book.id])} label="打包" /></div></div>)}</div></div>
                                <div className="rounded-2xl border border-wuxia-gold/10 bg-black/30 p-3"><div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-serif text-wuxia-gold">附加世界书预设组</div><div className="text-[11px] text-gray-500">只保存附加世界书启用状态。</div></div><div className="flex items-center gap-2"><button type="button" onClick={() => { const nextGroup = 创建空世界书预设组(bookDraft.filter((book) => selectedPackBookIds.includes(book.id))); setGroupDraft((prev) => [nextGroup, ...prev]); setSelectedGroupId(nextGroup.id); }} className="rounded-lg border border-wuxia-gold/30 px-3 py-1.5 text-xs text-wuxia-gold">建组</button><button type="button" onClick={() => 下载JSON文件('extra-worldbook-preset-groups.json', 构建世界书预设组导出数据(groupDraft))} className="rounded-lg border border-wuxia-gold/20 px-3 py-1.5 text-xs text-gray-300">导出</button><button type="button" onClick={() => groupImportRef.current?.click()} className="rounded-lg border border-wuxia-gold/20 px-3 py-1.5 text-xs text-gray-300">导入</button></div></div><div className="space-y-2">{groupDraft.map((group) => <button key={group.id} type="button" onClick={() => setSelectedGroupId(group.id)} className={`w-full rounded-xl border p-3 text-left ${selectedGroup?.id === group.id ? 'border-wuxia-gold/60 bg-wuxia-gold/10' : 'border-wuxia-gold/10 bg-black/30'}`}><div className={`font-serif ${selectedGroup?.id === group.id ? 'text-wuxia-gold' : 'text-gray-200'}`}>{group.名称}</div><div className="mt-1 text-[11px] text-gray-500">{group.描述 || '无描述'}</div></button>)}</div></div>
                            </div>
                            <div className="min-h-0 overflow-auto rounded-2xl border border-wuxia-gold/15 bg-black/35 p-4 space-y-4">
                                {selectedBook && <>
                                    <div className="rounded-2xl border border-wuxia-gold/10 bg-black/30 p-4 space-y-4">
                                        <div className={hintBoxClass}>
                                            生效检查：世界书本身启用、条目启用、作用域包含当前流程、条目内容不为空，并且导入或修改后已经点过“保存全部”。导入 SillyTavern / 酒馆 World Info JSON 时会自动转换为附加世界书；constant 条目默认始终注入，带 key 的非 constant 条目默认按“关键词命中”工作。
                                        </div>
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="text-lg font-serif text-wuxia-gold">附加世界书编辑</div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <select className={`${inputClass} min-w-[210px]`} value={newEntryShape} onChange={(e) => setNewEntryShape(e.target.value as 世界书条目形态)}>
                                                    {世界书条目形态选项.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                                </select>
                                                <button type="button" onClick={() => 新增条目到当前世界书(newEntryShape)} className="rounded-lg border border-wuxia-gold/20 px-3 py-1.5 text-xs text-gray-300">新增条目</button>
                                                <button type="button" onClick={async () => { if (!selectedEntry) return; if (!(await confirmDelete('删除附加条目', `确定删除“${selectedEntry.标题}”吗？`))) return; setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 条目: book.条目.filter((entry) => entry.id !== selectedEntry.id), 更新时间: Date.now() } : book)); setSelectedEntryId(''); }} className="rounded-lg border border-red-900/40 px-3 py-1.5 text-xs text-red-300">删除条目</button>
                                                <button
                                                    type="button"
                                                    disabled={isBundledDefaultWorldbook}
                                                    onClick={async () => { if (!(await confirmDelete('删除附加世界书', `确定删除“${selectedBook.标题}”吗？`))) return; setBookDraft((prev) => prev.filter((book) => book.id !== selectedBook.id)); setSelectedBookId(''); setSelectedEntryId(''); }}
                                                    className={`rounded-lg border border-red-900/40 px-3 py-1.5 text-xs text-red-300 ${isBundledDefaultWorldbook ? 'cursor-not-allowed opacity-40' : ''}`}
                                                >
                                                    删除世界书
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <label className="block">
                                                <div className={fieldLabelClass}>世界书标题</div>
                                                <input className={inputClass} value={selectedBook.标题} onChange={(e) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 标题: e.target.value, 更新时间: Date.now() } : book))} />
                                            </label>
                                            <div className="flex items-end">
                                                <div className="flex items-center gap-3 rounded-xl border border-wuxia-gold/10 bg-black/20 px-3 py-2.5 text-sm text-gray-300">
                                                    <span>启用这本附加世界书</span>
                                                    <ToggleSwitch checked={selectedBook.启用 !== false} onChange={(next) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 启用: next, 更新时间: Date.now() } : book))} ariaLabel={`切换附加世界书 ${selectedBook.标题 || '未命名'} 启用状态`} />
                                                </div>
                                            </div>
                                            {isBundledDefaultWorldbook && (
                                                <div className="md:col-span-2 rounded-xl border border-wuxia-gold/10 bg-wuxia-gold/5 px-3 py-2 text-xs text-gray-400">
                                                    这是默认启用的本地世界书。你可以关闭、编辑，或者在左侧“本地世界书预置”里恢复原始内容；为了避免刷新后自动回补造成困惑，这三本不提供彻底删除。
                                                </div>
                                            )}
                                            <div className="md:col-span-2">
                                                <button type="button" className={sectionToggleClass} onClick={() => 切换世界书区块展开(selectedBook.id, 'description')}>
                                                    <span>
                                                        <span className="block text-xs font-serif uppercase tracking-[0.2em] text-wuxia-gold/70">世界书描述</span>
                                                        <span className="mt-1 block text-xs text-gray-500">默认折叠，点击展开编辑。</span>
                                                    </span>
                                                    <span className="text-xs text-gray-400">{世界书区块已展开(selectedBook.id, 'description') ? '收起' : '展开'}</span>
                                                </button>
                                                {世界书区块已展开(selectedBook.id, 'description') && (
                                                    <textarea className={`${textareaClass} mt-2`} value={selectedBook.描述 || ''} onChange={(e) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 描述: e.target.value, 更新时间: Date.now() } : book))} />
                                                )}
                                            </div>
                                            <div className="md:col-span-2">
                                                <button type="button" className={sectionToggleClass} onClick={() => 切换世界书区块展开(selectedBook.id, 'outline')}>
                                                    <span>
                                                        <span className="block text-xs font-serif uppercase tracking-[0.2em] text-wuxia-gold/70">常驻大纲</span>
                                                        <span className="mt-1 block text-xs text-gray-500">默认折叠，点击展开编辑。</span>
                                                    </span>
                                                    <span className="text-xs text-gray-400">{世界书区块已展开(selectedBook.id, 'outline') ? '收起' : '展开'}</span>
                                                </button>
                                                {世界书区块已展开(selectedBook.id, 'outline') && (
                                                    <textarea className={`${textareaClass} mt-2`} value={selectedBook.常驻大纲 || ''} onChange={(e) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 常驻大纲: e.target.value, 更新时间: Date.now() } : book))} />
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                                            <div className="space-y-2">
                                                {selectedBook.条目.map((entry) => (
                                                    <button key={entry.id} type="button" onClick={() => setSelectedEntryId(entry.id)} className={`w-full rounded-xl border p-3 text-left ${selectedEntry?.id === entry.id ? 'border-wuxia-gold/60 bg-wuxia-gold/10' : 'border-wuxia-gold/10 bg-black/30'}`}>
                                                        <div className={`text-sm font-serif ${selectedEntry?.id === entry.id ? 'text-wuxia-gold' : 'text-gray-200'}`}>{entry.标题}</div>
                                                        <div className="mt-1 text-[11px] text-gray-500">{entry.启用 === false ? '已停用' : '已启用'} · {获取条目形态标签(entry.条目形态)} · {获取条目类型标签(entry.类型)}</div>
                                                    </button>
                                                ))}
                                            </div>
                                            {selectedEntry && <div className="space-y-3">
                                                <div className="flex items-center justify-between gap-3 rounded-xl border border-wuxia-gold/15 bg-wuxia-gold/5 px-3 py-2">
                                                    <div>
                                                        <div className="text-sm text-gray-200">启用这个条目</div>
                                                        <div className="mt-0.5 text-[11px] text-gray-500">关闭后只停用当前条目，不影响同一本世界书里的其他条目。</div>
                                                    </div>
                                                    <ToggleSwitch checked={selectedEntry.启用 !== false} onChange={(next) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 更新时间: Date.now(), 条目: book.条目.map((entry) => entry.id === selectedEntry.id ? { ...entry, 启用: next } : entry) } : book))} ariaLabel={`切换世界书条目 ${selectedEntry.标题 || '未命名'} 启用状态`} />
                                                </div>
                                                <label className="block">
                                                    <div className={fieldLabelClass}>条目标题</div>
                                                    <input className={inputClass} value={selectedEntry.标题} onChange={(e) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 更新时间: Date.now(), 条目: book.条目.map((entry) => entry.id === selectedEntry.id ? 更新条目注入说明({ ...entry, 标题: e.target.value }) : entry) } : book))} />
                                                </label>
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <label className="block">
                                                        <div className={fieldLabelClass}>条目形态</div>
                                                        <select className={inputClass} value={selectedEntry.条目形态 || 'normal'} onChange={(e) => {
                                                            const nextShape = e.target.value as 世界书条目形态;
                                                            const shapeSeed = 创建空世界书条目(nextShape);
                                                            setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? {
                                                                ...book,
                                                                更新时间: Date.now(),
                                                                条目: book.条目.map((entry) => entry.id === selectedEntry.id ? 更新条目注入说明({
                                                                    ...entry,
                                                                    条目形态: nextShape,
                                                                    类型: shapeSeed.类型,
                                                                    作用域: shapeSeed.作用域,
                                                                    注入模式: shapeSeed.注入模式,
                                                                    优先级: shapeSeed.优先级,
                                                                    时间线开始时间: nextShape === 'time_injection' ? (entry.时间线开始时间 || '') : '',
                                                                    时间线结束时间: nextShape === 'time_injection' ? (entry.时间线结束时间 || '') : ''
                                                                }) : entry)
                                                            } : book));
                                                        }}>
                                                            {世界书条目形态选项.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                                        </select>
                                                    </label>
                                                    <label className="block">
                                                        <div className={fieldLabelClass}>条目类型</div>
                                                        <select className={inputClass} value={selectedEntry.类型} onChange={(e) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 更新时间: Date.now(), 条目: book.条目.map((entry) => entry.id === selectedEntry.id ? 更新条目注入说明({ ...entry, 类型: e.target.value as 世界书类型 }) : entry) } : book))}>
                                                            {世界书类型选项.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                                        </select>
                                                    </label>
                                                    <label className="block">
                                                        <div className={fieldLabelClass}>注入模式</div>
                                                        <select className={inputClass} value={selectedEntry.注入模式} onChange={(e) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 更新时间: Date.now(), 条目: book.条目.map((entry) => entry.id === selectedEntry.id ? 更新条目注入说明({ ...entry, 注入模式: e.target.value as any }) : entry) } : book))}>
                                                            {世界书注入模式选项.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                                        </select>
                                                    </label>
                                                    <label className="block">
                                                        <div className={fieldLabelClass}>优先级</div>
                                                        <input className={inputClass} type="number" min={0} max={999} value={selectedEntry.优先级 ?? 50} onChange={(e) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 更新时间: Date.now(), 条目: book.条目.map((entry) => entry.id === selectedEntry.id ? 更新条目注入说明({ ...entry, 优先级: Number(e.target.value || 0) }) : entry) } : book))} />
                                                    </label>
                                                    <label className="block">
                                                            <div className={fieldLabelClass}>归属功能模块</div>
                                                        <select className={inputClass} value={selectedEntry.功能模块 || ''} onChange={(e) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 更新时间: Date.now(), 条目: book.条目.map((entry) => entry.id === selectedEntry.id ? 更新条目注入说明({ ...entry, 功能模块: (e.target.value || undefined) as any }) : entry) } : book))}>
                                                            <option value="">不归属（始终注入）</option>
                                                            {世界书功能模块选项.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                                        </select>
                                                        <div className="mt-1 text-[10px] leading-4 text-gray-500">
                                                            {世界书功能模块选项.find((item) => item.value === selectedEntry.功能模块)?.description
                                                                || '不归属任何模块时始终注入。归属后，对应设置开关关闭时该条目会被自动跳过（仅影响注入，不会删除条目）。'}
                                                        </div>
                                                    </label>
                                                </div>
                                                {selectedEntry.条目形态 === 'timeline_outline' && (
                                                    <div className="rounded-xl border border-wuxia-gold/10 bg-black/20 px-3 py-2 text-[11px] text-gray-400">
                                                        时间线大纲条目默认建议用于常驻时间线补充，默认会覆盖主剧情、开局、世界演变、变量生成、剧情规划、女主规划等流程；你仍可手动微调作用域。
                                                    </div>
                                                )}
                                                <div>
                                                    <div className={fieldLabelClass}>作用域</div>
                                                    <div className="grid gap-2 sm:grid-cols-3">
                                                        {世界书作用域选项.map((scope) => {
                                                            const checked = selectedEntry.作用域?.includes(scope.value);
                                                            return <勾选胶囊 key={scope.value} checked={!!checked} label={scope.label} onChange={() => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 更新时间: Date.now(), 条目: book.条目.map((entry) => { if (entry.id !== selectedEntry.id) return entry; const next = new Set(entry.作用域 || []); if (checked) next.delete(scope.value); else next.add(scope.value); return 更新条目注入说明({ ...entry, 作用域: Array.from(next) as 世界书作用域[] }); }) } : book))} className="justify-start" />;
                                                        })}
                                                    </div>
                                                </div>
                                                {selectedEntry.条目形态 === 'time_injection' && (
                                                    <div className="grid gap-3 md:grid-cols-2">
                                                        <label className="block">
                                                            <div className={fieldLabelClass}>起始时间</div>
                                                            <input className={inputClass} placeholder="YYYY:MM:DD:HH:MM，可留空" value={selectedEntry.时间线开始时间 || ''} onChange={(e) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 更新时间: Date.now(), 条目: book.条目.map((entry) => entry.id === selectedEntry.id ? 更新条目注入说明({ ...entry, 时间线开始时间: e.target.value }) : entry) } : book))} />
                                                        </label>
                                                        <label className="block">
                                                            <div className={fieldLabelClass}>结束时间</div>
                                                            <input className={inputClass} placeholder="YYYY:MM:DD:HH:MM，可留空" value={selectedEntry.时间线结束时间 || ''} onChange={(e) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 更新时间: Date.now(), 条目: book.条目.map((entry) => entry.id === selectedEntry.id ? 更新条目注入说明({ ...entry, 时间线结束时间: e.target.value }) : entry) } : book))} />
                                                        </label>
                                                    </div>
                                                )}
                                                <label className="block">
                                                    <div className={fieldLabelClass}>关键词</div>
                                                    <input className={inputClass} value={(selectedEntry.关键词 || []).join(', ')} onChange={(e) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 更新时间: Date.now(), 条目: book.条目.map((entry) => entry.id === selectedEntry.id ? 更新条目注入说明({ ...entry, 关键词: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) }) : entry) } : book))} />
                                                </label>
                                                <div className="rounded-xl border border-wuxia-gold/10 bg-black/20 px-3 py-2 text-[11px] text-gray-500">{selectedEntry.注入说明 || 获取世界书条目注入说明(selectedEntry)}</div>
                                                <label className="block">
                                                    <div className={fieldLabelClass}>条目内容</div>
                                                    <textarea className={largeTextareaClass} value={selectedEntry.内容} onChange={(e) => setBookDraft((prev) => prev.map((book) => book.id === selectedBook.id ? { ...book, 更新时间: Date.now(), 条目: book.条目.map((entry) => entry.id === selectedEntry.id ? 更新条目注入说明({ ...entry, 内容: e.target.value }) : entry) } : book))} />
                                                </label>
                                            </div>}
                                        </div>
                                    </div>
                                </>}
                                {selectedGroup && <div className="rounded-2xl border border-wuxia-gold/10 bg-black/30 p-4 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="text-lg font-serif text-wuxia-gold">附加世界书预设组编辑</div><div className="flex items-center gap-2"><button type="button" onClick={() => { setBookDraft((prev) => 应用世界书预设组到世界书列表(prev, selectedGroup)); setGroupDraft((prev) => prev.map((group) => ({ ...group, 启用: group.id === selectedGroup.id, 更新时间: Date.now() }))); }} className="rounded-lg border border-wuxia-gold/30 bg-wuxia-gold/10 px-3 py-2 text-xs text-wuxia-gold">启用预设组</button><button type="button" onClick={() => setGroupDraft((prev) => prev.map((group) => group.id === selectedGroup.id ? { ...group, 书籍快照: 规范化世界书列表(bookDraft.filter((book) => book.启用 !== false)), 更新时间: Date.now() } : group))} className="rounded-lg border border-wuxia-gold/20 px-3 py-2 text-xs text-gray-300">保存当前启用状态</button><button type="button" onClick={() => setGroupDraft((prev) => prev.map((group) => group.id === selectedGroup.id ? { ...group, 书籍快照: 规范化世界书列表(bookDraft.filter((book) => selectedPackBookIds.includes(book.id))), 更新时间: Date.now() } : group))} className="rounded-lg border border-wuxia-gold/20 px-3 py-2 text-xs text-gray-300">按所选重组</button><button type="button" onClick={async () => { if (!(await confirmDelete('删除附加世界书预设组', `确定删除“${selectedGroup.名称}”吗？`))) return; setGroupDraft((prev) => prev.filter((group) => group.id !== selectedGroup.id)); setSelectedGroupId(''); }} className="rounded-lg border border-red-900/40 px-3 py-2 text-xs text-red-300">删除预设组</button></div></div><input className={inputClass} value={selectedGroup.名称} onChange={(e) => setGroupDraft((prev) => prev.map((group) => group.id === selectedGroup.id ? { ...group, 名称: e.target.value, 更新时间: Date.now() } : group))} /><textarea className={textareaClass} value={selectedGroup.描述 || ''} onChange={(e) => setGroupDraft((prev) => prev.map((group) => group.id === selectedGroup.id ? { ...group, 描述: e.target.value, 更新时间: Date.now() } : group))} /><div className="space-y-2">{selectedGroup.书籍快照.map((book) => <div key={book.id} className="flex items-center justify-between gap-3 rounded-xl border border-wuxia-gold/10 bg-black/30 px-3 py-2 text-sm"><div><div className="text-gray-200">{book.标题}</div><div className="text-[10px] text-gray-500">条目 {book.条目.length}</div></div><button type="button" onClick={() => setGroupDraft((prev) => prev.map((group) => group.id === selectedGroup.id ? { ...group, 书籍快照: group.书籍快照.filter((item) => item.id !== book.id), 更新时间: Date.now() } : group))} className="rounded-lg border border-red-900/40 px-2 py-1 text-[10px] text-red-300">移除</button></div>)}</div></div>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WorldbookManagerModal;
