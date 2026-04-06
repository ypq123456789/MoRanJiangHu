
import React, { useState, useMemo } from 'react';
import { 提示词结构, PromptCategory } from '../../../types';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';

type RuntimePromptState = {
    当前启用: boolean;
    原始启用: boolean;
    受运行时接管: boolean;
    运行时注入: boolean;
};

interface Props {
    prompts: 提示词结构[];
    onUpdate: (prompts: 提示词结构[]) => void;
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
    runtimePromptStates?: Record<string, RuntimePromptState>;
}

const CATEGORIES: PromptCategory[] = ['核心设定', '数值设定', '难度设定', '写作设定', '自定义'];
const THINKING_OPEN_TAG_SOURCE = '<\\s*thinking\\s*>';
const THINKING_CLOSE_TAG_SOURCE = '<\\s*\\/\\s*thinking\\s*>';

const PromptManager: React.FC<Props> = ({ prompts, onUpdate, requestConfirm, runtimePromptStates }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<提示词结构 | null>(null);
    const [activeCategory, setActiveCategory] = useState<PromptCategory | 'ALL'>('ALL');
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const pushNotice = (type: 'success' | 'error', text: string) => {
        setNotice({ type, text });
        window.setTimeout(() => setNotice(null), 2200);
    };

    const handleEdit = (prompt: 提示词结构) => {
        setEditingId(prompt.id);
        setEditForm({ ...prompt });
    };

    const handleSave = () => {
        if (!editForm) return;
        const newPrompts = prompts.map(p => p.id === editForm.id ? editForm : p);
        if (!prompts.find(p => p.id === editForm.id)) {
            newPrompts.push(editForm);
        }
        onUpdate(newPrompts);
        setEditingId(null);
        setEditForm(null);
    };

    const handleDelete = async (id: string) => {
        const ok = requestConfirm
            ? await requestConfirm({ title: '删除提示词', message: '确定删除此提示词吗？', confirmText: '删除', danger: true })
            : true;
        if (!ok) return;
        onUpdate(prompts.filter(p => p.id !== id));
    };

    const handleAddNew = () => {
        const newPrompt: 提示词结构 = {
            id: Date.now().toString(),
            标题: '新提示词',
            内容: '',
            类型: activeCategory === 'ALL' ? '自定义' : activeCategory,
            启用: true
        };
        setEditForm(newPrompt);
        setEditingId(newPrompt.id);
    };

    const handleToggleEnable = (id: string) => {
        const newPrompts = prompts.map(p => p.id === id ? { ...p, 启用: !p.启用 } : p);
        onUpdate(newPrompts);
    };

    const handleExport = () => {
        const blob = new Blob([JSON.stringify(prompts, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'wuxia_prompts.json';
        a.click();
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target?.result as string);
                if (Array.isArray(imported)) {
                    onUpdate(imported);
                    pushNotice('success', '导入成功');
                } else {
                    pushNotice('error', '导入失败：文件结构不是提示词数组');
                }
            } catch (err) {
                pushNotice('error', '导入失败：JSON 格式错误');
            }
        };
        reader.readAsText(file);
    };
    const handleConvertThinkingTags = () => {
        let changedPromptCount = 0;
        let replacedTagCount = 0;
        const nextPrompts = prompts.map((prompt) => {
            const rawContent = typeof prompt.内容 === 'string' ? prompt.内容 : '';
            if (!rawContent) return prompt;
            const openPattern = new RegExp(THINKING_OPEN_TAG_SOURCE, 'gi');
            const closePattern = new RegExp(THINKING_CLOSE_TAG_SOURCE, 'gi');
            const openCount = (rawContent.match(openPattern) || []).length;
            const closeCount = (rawContent.match(closePattern) || []).length;
            const totalCount = openCount + closeCount;
            if (totalCount <= 0) return prompt;
            replacedTagCount += totalCount;
            changedPromptCount += 1;
            const nextContent = rawContent
                .replace(openPattern, '<think>')
                .replace(closePattern, '</think>');
            return { ...prompt, 内容: nextContent };
        });

        if (changedPromptCount <= 0) {
            pushNotice('success', '未检测到 <thinking> / </thinking> 标签。');
            return;
        }
        onUpdate(nextPrompts);
        pushNotice('success', `已转换 ${changedPromptCount} 条提示词，共 ${replacedTagCount} 处标签。`);
    };

    // Grouping logic
    const filteredPrompts = useMemo(() => {
        if (activeCategory === 'ALL') return prompts;
        return prompts.filter(p => p.类型 === activeCategory);
    }, [prompts, activeCategory]);

    if (editingId && editForm) {
        return (
            <div className="space-y-3 p-4 bg-black/40 border border-gray-700/50 backdrop-blur-sm relative animate-fadeIn">
                <input 
                    className="w-full bg-black/30 border border-gray-600/50 p-2 text-wuxia-gold focus:border-wuxia-gold outline-none"
                    value={editForm.标题}
                    onChange={e => setEditForm({...editForm, 标题: e.target.value})}
                    placeholder="提示词标题"
                />
                <select 
                     className="w-full bg-black/30 border border-gray-600/50 p-2 text-gray-300 focus:border-wuxia-gold outline-none"
                     value={editForm.类型}
                     onChange={e => setEditForm({...editForm, 类型: e.target.value as any})}
                >
                    {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
                <textarea 
                    className="w-full h-64 bg-black/30 border border-gray-600/50 p-2 text-xs font-mono text-gray-300 focus:border-wuxia-gold outline-none custom-scrollbar"
                    value={editForm.内容}
                    onChange={e => setEditForm({...editForm, 内容: e.target.value})}
                    placeholder="在此输入提示词内容..."
                />
                 <div className="flex gap-2 justify-end">
                    <GameButton onClick={() => { setEditingId(null); setEditForm(null); }} variant="secondary">取消</GameButton>
                    <GameButton onClick={handleSave} variant="primary">保存</GameButton>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {notice && (
                <div className={`text-xs px-3 py-2 border rounded ${
                    notice.type === 'success'
                        ? 'border-green-500/40 bg-green-900/20 text-green-300'
                        : 'border-wuxia-red/40 bg-red-900/20 text-red-300'
                }`}>
                    {notice.text}
                </div>
            )}
            <div className="flex justify-between items-center mb-2">
                <div className="flex gap-2">
                    <GameButton onClick={handleAddNew} variant="primary" className="text-xs px-4 py-2">新增提示词</GameButton>
                    <GameButton onClick={handleConvertThinkingTags} variant="secondary" className="text-xs px-4 py-2">
                        thinking -&gt; think
                    </GameButton>
                </div>
                <div className="flex gap-3">
                    <GameButton onClick={handleExport} variant="secondary" className="text-xs px-4 py-2">导出</GameButton>
                    <label className="relative cursor-pointer group">
                        <span className="relative z-10 block px-4 py-2 font-serif font-bold uppercase transition-all duration-200 transform border-2 border-wuxia-cyan text-wuxia-cyan text-xs clip-path-polygon group-hover:-translate-y-1 bg-black/50">导入</span>
                        <input type="file" onChange={handleImport} className="hidden" accept=".json" />
                    </label>
                </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-2 custom-scrollbar">
                <button 
                    onClick={() => setActiveCategory('ALL')}
                    className={`px-3 py-1 text-xs whitespace-nowrap border border-transparent hover:text-wuxia-gold ${activeCategory === 'ALL' ? 'text-wuxia-gold border-b-wuxia-gold bg-white/5' : 'text-gray-500'}`}
                >
                    全部
                </button>
                {CATEGORIES.map(cat => (
                    <button 
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-3 py-1 text-xs whitespace-nowrap border border-transparent hover:text-wuxia-gold ${activeCategory === cat ? 'text-wuxia-gold border-b-wuxia-gold bg-white/5' : 'text-gray-500'}`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                {filteredPrompts.map(p => {
                    const runtimeState = runtimePromptStates?.[p.id];
                    const displayEnabled = runtimeState ? runtimeState.当前启用 : p.启用;
                    const runtimeControlled = runtimeState?.受运行时接管 === true;
                    return (
                        <div key={p.id} className={`flex justify-between items-center bg-black/30 p-3 border-l-2 transition-colors group ${displayEnabled ? 'border-wuxia-gold bg-wuxia-gold/5' : 'border-gray-700 opacity-60 hover:opacity-100'}`}>
                            <div className="flex items-center gap-3">
                                <ToggleSwitch
                                    checked={displayEnabled}
                                    disabled={runtimeControlled}
                                    onChange={() => handleToggleEnable(p.id)}
                                    ariaLabel={`${displayEnabled ? '禁用' : '启用'}提示词 ${p.标题}`}
                                />
                                <div>
                                    <div className={`font-bold font-serif transition-colors ${displayEnabled ? 'text-wuxia-gold group-hover:text-white' : 'text-gray-500'}`}>
                                        {p.标题}
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">
                                        {p.类型} | Chars: {p.内容.length}{runtimeControlled ? ' | 运行时接管' : ''}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => handleEdit(p)} className="text-xs text-wuxia-cyan hover:text-white transition-colors">编辑</button>
                                <button onClick={() => handleDelete(p.id)} className="text-xs text-wuxia-red hover:text-white transition-colors">删除</button>
                            </div>
                        </div>
                    );
                })}
                {filteredPrompts.length === 0 && (
                    <div className="text-center text-gray-600 py-8 text-xs font-serif">
                        此处空无一物
                    </div>
                )}
            </div>
        </div>
    );
};

export default PromptManager;
