import React from 'react';
import type { NPC结构, NPC记忆, 记忆配置结构, 香闺秘档部位类型 } from '../../../types';
import { 构建NPC记忆展示结果, 构建手动NPC记忆总结候选 } from '../../../hooks/useGame/npcMemorySummary';
import { 获取图片展示地址 } from '../../../utils/imageAssets';

type 图片槽位类型 = '头像' | '立绘' | '背景' | 香闺秘档部位类型;

interface Props {
    socialList: NPC结构[];
    memoryConfig?: 记忆配置结构;
    onStartNpcMemorySummary?: (npcId: string) => void;
    onCreateNpc: (seed?: Partial<NPC结构>) => NPC结构 | void;
    onSaveNpc: (npcId: string, npc: NPC结构) => void;
    onDeleteNpc: (npcId: string) => void;
    onUploadNpcImage: (npcId: string, slot: 图片槽位类型, payload: { dataUrl: string; fileName?: string }) => Promise<unknown> | unknown;
}

const 图片槽位列表: Array<{ key: 图片槽位类型; label: string }> = [
    { key: '头像', label: '头像' },
    { key: '立绘', label: '立绘' },
    { key: '背景', label: '背景' },
    { key: '胸部', label: '胸部' },
    { key: '小穴', label: '小穴' },
    { key: '屁穴', label: '屁穴' }
];

const 卡片样式 = 'rounded-2xl border border-gray-800/80 bg-black/25 p-4 md:p-5';
const 输入框样式 = 'w-full rounded-xl border border-gray-700/80 bg-black/40 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-wuxia-gold/50';
const 小标题样式 = 'text-xs tracking-[0.22em] text-gray-500';
const 次级按钮样式 = 'rounded-lg border border-gray-700/80 px-3 py-2 text-xs text-gray-300 transition-colors hover:border-wuxia-gold/40 hover:text-wuxia-gold';
const 主按钮样式 = 'rounded-lg border border-wuxia-gold/50 bg-wuxia-gold/10 px-3 py-2 text-xs text-wuxia-gold transition-colors hover:bg-wuxia-gold/20';

const 读取JSON = <T,>(text: string, fallback: T): T => {
    try {
        return JSON.parse(text) as T;
    } catch {
        return fallback;
    }
};

const NpcManager: React.FC<Props> = ({
    socialList,
    memoryConfig,
    onStartNpcMemorySummary,
    onCreateNpc,
    onSaveNpc,
    onDeleteNpc,
    onUploadNpcImage
}) => {
    const uploadInputRef = React.useRef<HTMLInputElement>(null);
    const [selectedNpcId, setSelectedNpcId] = React.useState('');
    const [draftText, setDraftText] = React.useState('');
    const [memoryDraftList, setMemoryDraftList] = React.useState<NPC记忆[]>([]);
    const [collapsedMemoryIndexes, setCollapsedMemoryIndexes] = React.useState<number[]>([]);
    const [error, setError] = React.useState('');
    const [uploadSlot, setUploadSlot] = React.useState<图片槽位类型>('头像');
    const list = React.useMemo(() => Array.isArray(socialList) ? socialList : [], [socialList]);
    const selectedNpc = React.useMemo(
        () => list.find((npc) => npc?.id === selectedNpcId) || list[0] || null,
        [list, selectedNpcId]
    );
    const 是否男性NPC = selectedNpc?.性别 === '男';
    const 可见图片槽位列表 = React.useMemo(
        () => 图片槽位列表.filter((slot) => !是否男性NPC || (slot.key !== '胸部' && slot.key !== '小穴' && slot.key !== '屁穴')),
        [是否男性NPC]
    );
    const 记忆展示结果 = React.useMemo(
        () => 构建NPC记忆展示结果(selectedNpc?.总结记忆, memoryDraftList),
        [memoryDraftList, selectedNpc?.总结记忆]
    );
    const 待总结候选 = React.useMemo(
        () => 构建手动NPC记忆总结候选(memoryDraftList, memoryConfig),
        [memoryConfig, memoryDraftList]
    );

    React.useEffect(() => {
        if (!selectedNpc && selectedNpcId) {
            setSelectedNpcId('');
            return;
        }
        if (!selectedNpc && list[0]?.id) {
            setSelectedNpcId(list[0].id);
        }
    }, [list, selectedNpc, selectedNpcId]);

    React.useEffect(() => {
        if (!selectedNpc) {
            setDraftText('');
            setMemoryDraftList([]);
            return;
        }
        const restNpc = { ...selectedNpc } as Partial<NPC结构>;
        delete (restNpc as any).记忆;
        delete (restNpc as any).总结记忆;
        setDraftText(JSON.stringify(restNpc, null, 2));
        setMemoryDraftList(Array.isArray(selectedNpc.记忆) ? selectedNpc.记忆 : []);
        setCollapsedMemoryIndexes(Array.isArray(selectedNpc.记忆) ? selectedNpc.记忆.map((_, index) => index) : []);
        setError('');
    }, [selectedNpc]);

    React.useEffect(() => {
        if (!是否男性NPC) return;
        if (uploadSlot === '胸部' || uploadSlot === '小穴' || uploadSlot === '屁穴') {
            setUploadSlot('头像');
        }
    }, [uploadSlot, 是否男性NPC]);

    const updateDraftField = (field: string, value: unknown) => {
        const parsed = 读取JSON<Record<string, unknown>>(draftText, selectedNpc ? { ...selectedNpc } as Record<string, unknown> : {});
        parsed[field] = value;
        setDraftText(JSON.stringify(parsed, null, 2));
    };

    const handleCreateNpc = () => {
        const created = onCreateNpc({
            姓名: `新NPC${list.length + 1}`,
            身份: '待编辑',
            简介: ''
        });
        if (created && typeof created === 'object' && 'id' in created && typeof created.id === 'string' && created.id) {
            setSelectedNpcId(created.id);
        }
    };

    const handleSave = () => {
        if (!selectedNpc?.id) return;
        try {
            const parsedNpc = JSON.parse(draftText) as NPC结构;
            parsedNpc.id = selectedNpc.id;
            parsedNpc.记忆 = memoryDraftList
                .map((item) => ({
                    内容: typeof item?.内容 === 'string' ? item.内容.trim() : '',
                    时间: typeof item?.时间 === 'string' ? item.时间.trim() : ''
                }))
                .filter((item) => item.内容 || item.时间);
            parsedNpc.总结记忆 = Array.isArray(selectedNpc.总结记忆) ? selectedNpc.总结记忆 : [];
            onSaveNpc(selectedNpc.id, parsedNpc);
            setError('');
        } catch (saveError: any) {
            setError(saveError?.message || 'NPC 草稿 JSON 无法解析。');
        }
    };

    const handleDelete = () => {
        if (!selectedNpc?.id) return;
        if (!window.confirm(`确定删除 NPC「${selectedNpc.姓名 || selectedNpc.id}」吗？`)) return;
        onDeleteNpc(selectedNpc.id);
        setSelectedNpcId('');
    };

    const handleTriggerUpload = (slot: 图片槽位类型) => {
        setUploadSlot(slot);
        uploadInputRef.current?.click();
    };

    const handleUploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedNpc?.id) return;
        const reader = new FileReader();
        reader.onload = async () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            if (!result) return;
            await onUploadNpcImage(selectedNpc.id, uploadSlot, {
                dataUrl: result,
                fileName: file.name
            });
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    };

    const 当前槽位图片 = (slot: 图片槽位类型) => {
        if (!selectedNpc?.图片档案) return null;
        if (slot === '胸部' || slot === '小穴' || slot === '屁穴') {
            return selectedNpc.图片档案.香闺秘档部位档案?.[slot] || null;
        }
        const archive = selectedNpc.图片档案;
        const targetId = slot === '头像'
            ? archive.已选头像图片ID
            : slot === '立绘'
                ? archive.已选立绘图片ID
                : archive.已选背景图片ID;
        return (Array.isArray(archive.生图历史) ? archive.生图历史 : []).find((item) => item?.id === targetId) || null;
    };

    const 更新记忆条目 = (index: number, patch: Partial<NPC记忆>) => {
        setMemoryDraftList((prev) => prev.map((item, itemIndex) => (
            itemIndex === index ? { ...item, ...patch } : item
        )));
    };

    const 新增记忆条目 = () => {
        setMemoryDraftList((prev) => [...prev, { 内容: '', 时间: '' }]);
    };

    const 删除记忆条目 = (index: number) => {
        setMemoryDraftList((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
        setCollapsedMemoryIndexes((prev) => prev
            .filter((itemIndex) => itemIndex !== index)
            .map((itemIndex) => (itemIndex > index ? itemIndex - 1 : itemIndex)));
    };

    const 切换记忆折叠 = (index: number) => {
        setCollapsedMemoryIndexes((prev) => (
            prev.includes(index)
                ? prev.filter((itemIndex) => itemIndex !== index)
                : [...prev, index]
        ));
    };

    const 全部展开记忆 = () => {
        setCollapsedMemoryIndexes([]);
    };

    const 全部折叠记忆 = () => {
        setCollapsedMemoryIndexes(memoryDraftList.map((_, index) => index));
    };

    return (
        <div className="space-y-4 pb-6">
            <div className={卡片样式}>
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="text-lg font-bold text-paper-white">NPC 管理</div>
                        <div className="mt-1 text-sm text-gray-500">直接编辑当前会话中的 NPC 完整数据，并手动上传头像、立绘、背景与私密部位图片。</div>
                    </div>
                    <button type="button" onClick={handleCreateNpc} className={`${主按钮样式} w-full sm:w-auto`}>
                        新增 NPC
                    </button>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                <div className={卡片样式}>
                    <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-bold text-wuxia-gold">当前 NPC</div>
                        <div className="text-xs text-gray-500">{list.length} 名</div>
                    </div>
                    <div className="space-y-2 max-h-[36vh] overflow-y-auto custom-scrollbar pr-1 sm:max-h-[70vh]">
                        {list.length === 0 && (
                            <div className="rounded-xl border border-dashed border-gray-700 p-4 text-sm text-gray-500">
                                当前没有 NPC，可直接新建。
                            </div>
                        )}
                        {list.map((npc) => (
                            <button
                                key={npc.id}
                                type="button"
                                onClick={() => setSelectedNpcId(npc.id)}
                                className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                                    selectedNpc?.id === npc.id
                                        ? 'border-wuxia-gold/60 bg-wuxia-gold/10'
                                        : 'border-gray-800/80 bg-black/20 hover:border-gray-600'
                                }`}
                            >
                                <div className="text-sm font-bold text-paper-white">{npc.姓名 || npc.id}</div>
                                <div className="mt-1 text-xs text-gray-500">{npc.身份 || '未填写身份'}</div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-400">
                                    <span>好感 {npc.好感度 ?? 0}</span>
                                    <span>{npc.关系状态 || '未定义关系'}</span>
                                    {npc.是否主要角色 && <span className="text-wuxia-gold">主角团</span>}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className={卡片样式}>
                        <div className="grid gap-3 md:grid-cols-2">
                            <label className="space-y-2">
                                <div className={小标题样式}>姓名</div>
                                <input
                                    value={读取JSON<Record<string, any>>(draftText, {}).姓名 || ''}
                                    onChange={(e) => updateDraftField('姓名', e.target.value)}
                                    className={输入框样式}
                                />
                            </label>
                            <label className="space-y-2">
                                <div className={小标题样式}>身份</div>
                                <input
                                    value={读取JSON<Record<string, any>>(draftText, {}).身份 || ''}
                                    onChange={(e) => updateDraftField('身份', e.target.value)}
                                    className={输入框样式}
                                />
                            </label>
                            <label className="space-y-2">
                                <div className={小标题样式}>好感度</div>
                                <input
                                    type="number"
                                    value={读取JSON<Record<string, any>>(draftText, {}).好感度 ?? 0}
                                    onChange={(e) => updateDraftField('好感度', Number(e.target.value))}
                                    className={输入框样式}
                                />
                            </label>
                            <label className="space-y-2">
                                <div className={小标题样式}>关系状态</div>
                                <input
                                    value={读取JSON<Record<string, any>>(draftText, {}).关系状态 || ''}
                                    onChange={(e) => updateDraftField('关系状态', e.target.value)}
                                    className={输入框样式}
                                />
                            </label>
                        </div>
                    </div>

                    <div className={卡片样式}>
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <div className="text-sm font-bold text-paper-white">图片槽位</div>
                                <div className="mt-1 text-xs text-gray-500">
                                    上传后的图片会直接写入 NPC 图片档案并绑定对应槽位。
                                    {是否男性NPC ? '男性 NPC 默认隐藏私密部位上传槽。' : ''}
                                </div>
                            </div>
                            <input ref={uploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadFile} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {可见图片槽位列表.map((slot) => {
                                const record = 当前槽位图片(slot.key);
                                const imageSrc = 获取图片展示地址(record);
                                return (
                                    <div key={slot.key} className="rounded-xl border border-gray-800/80 bg-black/20 p-3">
                                        <div className="mb-2 flex items-center justify-between">
                                            <div className="text-xs font-bold tracking-[0.2em] text-gray-400">{slot.label}</div>
                                            <button type="button" onClick={() => handleTriggerUpload(slot.key)} className={次级按钮样式}>
                                                上传
                                            </button>
                                        </div>
                                        {imageSrc ? (
                                            <img src={imageSrc} alt={slot.label} className="h-40 w-full rounded-lg border border-wuxia-gold/20 object-cover" />
                                        ) : (
                                            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-700 text-xs text-gray-500">
                                                暂无图片
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className={卡片样式}>
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold text-paper-white">总结记忆预览</div>
                                <div className="mt-1 text-xs text-gray-500">总结记忆由应用层维护，用于上下文压缩、社交展示和存档延续。</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="text-xs text-gray-500">
                                    原始 {memoryDraftList.length} 条 / 已总结 {记忆展示结果.总结记忆.length} 段
                                </div>
                                <button
                                    type="button"
                                    onClick={() => selectedNpc?.id && onStartNpcMemorySummary?.(selectedNpc.id)}
                                    disabled={!selectedNpc?.id || !待总结候选 || !onStartNpcMemorySummary}
                                    className={`${主按钮样式} disabled:cursor-not-allowed disabled:opacity-40`}
                                >
                                    手动总结当前批次
                                </button>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {记忆展示结果.总结记忆.length > 0 ? (
                                记忆展示结果.总结记忆.map((item) => (
                                    <div key={`summary-${item.标签}`} className="rounded-xl border border-wuxia-gold/20 bg-wuxia-gold/5 p-3">
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-wuxia-gold">
                                            <span className="font-mono">{item.标签}</span>
                                            <span className="font-mono">{item.索引范围}</span>
                                            <span className="font-mono">{item.时间}</span>
                                            <span className="text-gray-500">共 {item.条数} 条</span>
                                        </div>
                                        <div className="mt-2 text-sm leading-relaxed text-gray-300">{item.内容}</div>
                                    </div>
                                ))
                            ) : (
                                <div className="rounded-xl border border-dashed border-gray-700 p-4 text-sm text-gray-500">
                                    当前还没有已沉淀的总结记忆。
                                </div>
                            )}
                            <div className="rounded-xl border border-cyan-900/40 bg-cyan-950/10 p-3">
                                <div className="text-xs text-wuxia-cyan font-bold tracking-[0.18em]">待总结批次预览</div>
                                {待总结候选 ? (
                                    <div className="mt-2 space-y-2">
                                        <div className="text-xs text-gray-400">
                                            将提炼前 {待总结候选.批次条数} 条，时间范围 {待总结候选.起始时间} - {待总结候选.结束时间}，保留后续 {待总结候选.预留原始条数} 条原始记忆。
                                        </div>
                                        <div className="max-h-40 space-y-2 overflow-y-auto custom-scrollbar pr-1">
                                            {待总结候选.批次.map((item, index) => (
                                                <div key={`pending-${index}`} className="rounded-lg border border-cyan-900/30 bg-black/20 p-2">
                                                    <div className="text-[11px] text-cyan-400 font-mono">[{index}] {item.时间 || '未知时间'}</div>
                                                    <div className="mt-1 text-sm text-gray-300 leading-relaxed">{item.内容}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-2 text-sm text-gray-500">
                                        当前原始记忆不足，暂不生成手动总结批次。
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className={卡片样式}>
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold text-paper-white">记忆编辑</div>
                                <div className="mt-1 text-xs text-gray-500">逐条编辑 NPC 记忆；完整 JSON 区不再承担 `记忆` 字段编辑。</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={全部展开记忆} className={次级按钮样式}>
                                    全部展开
                                </button>
                                <button type="button" onClick={全部折叠记忆} className={次级按钮样式}>
                                    全部折叠
                                </button>
                            </div>
                        </div>
                        <div className="space-y-3 max-h-[52vh] overflow-y-auto custom-scrollbar pr-1 sm:max-h-[60vh]">
                            {memoryDraftList.length === 0 && (
                                <div className="rounded-xl border border-dashed border-gray-700 p-4 text-sm text-gray-500">
                                    当前没有记忆条目，可手动新增。
                                </div>
                            )}
                            {memoryDraftList.map((memory, index) => (
                                <div key={`memory-${index}`} className="rounded-xl border border-gray-800/80 bg-black/20 p-3">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                        <button type="button" onClick={() => 切换记忆折叠(index)} className="min-w-0 flex-1 text-left">
                                            <div className="text-xs tracking-[0.2em] text-gray-500">记忆 #{index + 1}</div>
                                            <div className="mt-1 truncate text-sm text-paper-white">
                                                {memory?.时间 || '未填写时间'}
                                                {(memory?.时间 || memory?.内容) ? ' · ' : ''}
                                                {memory?.内容 || '未填写内容'}
                                            </div>
                                        </button>
                                        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
                                            <button type="button" onClick={() => 切换记忆折叠(index)} className={`${次级按钮样式} flex-1 sm:flex-none`}>
                                                {collapsedMemoryIndexes.includes(index) ? '展开' : '折叠'}
                                            </button>
                                            <button type="button" onClick={() => 删除记忆条目(index)} className="flex-1 rounded-lg border border-red-900/70 px-3 py-1.5 text-xs text-red-300 transition-colors hover:border-red-700 hover:bg-red-950/20 sm:flex-none">
                                                删除
                                            </button>
                                        </div>
                                    </div>
                                    {!collapsedMemoryIndexes.includes(index) && (
                                        <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
                                            <label className="space-y-2">
                                                <div className={小标题样式}>时间</div>
                                                <input
                                                    value={memory?.时间 || ''}
                                                    onChange={(e) => 更新记忆条目(index, { 时间: e.target.value })}
                                                    className={输入框样式}
                                                    placeholder="1:01:01:00:00"
                                                />
                                            </label>
                                            <label className="space-y-2">
                                                <div className={小标题样式}>内容</div>
                                                <textarea
                                                    value={memory?.内容 || ''}
                                                    onChange={(e) => 更新记忆条目(index, { 内容: e.target.value })}
                                                    rows={4}
                                                    className={`${输入框样式} max-h-56 resize-y overflow-y-auto custom-scrollbar`}
                                                    placeholder="输入这条记忆的内容"
                                                />
                                            </label>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div className="flex justify-end">
                                <button type="button" onClick={新增记忆条目} className={`${主按钮样式} w-full sm:w-auto`}>
                                    新增记忆
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className={卡片样式}>
                        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="text-sm font-bold text-paper-white">完整 NPC JSON</div>
                                <div className="mt-1 text-xs text-gray-500">可直接编辑除 `记忆` 外的全部字段，包括关系网、私密字段、子宫档案、装备背包等。</div>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <button type="button" onClick={() => {
                                    if (!selectedNpc) return;
                                    const restNpc = { ...selectedNpc } as Partial<NPC结构>;
                                    delete (restNpc as any).记忆;
                                    delete (restNpc as any).总结记忆;
                                    setDraftText(JSON.stringify(restNpc, null, 2));
                                    setMemoryDraftList(Array.isArray(selectedNpc.记忆) ? selectedNpc.记忆 : []);
                                }} className={`${次级按钮样式} w-full sm:w-auto`}>
                                    重置草稿
                                </button>
                                <button type="button" onClick={handleDelete} className="w-full rounded-lg border border-red-900/70 px-3 py-2 text-xs text-red-300 transition-colors hover:border-red-700 hover:bg-red-950/20 sm:w-auto">
                                    删除 NPC
                                </button>
                                <button type="button" onClick={handleSave} className={`${主按钮样式} w-full sm:w-auto`}>
                                    保存 NPC
                                </button>
                            </div>
                        </div>
                        <textarea
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value)}
                            rows={24}
                            className={`${输入框样式} font-mono text-[12px] leading-6`}
                            placeholder="请选择或新建 NPC"
                        />
                        {error && <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-2 text-sm text-red-300">{error}</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NpcManager;
