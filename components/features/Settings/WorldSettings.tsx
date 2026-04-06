
import React, { useState } from 'react';
import { 节日结构 } from '../../../types';
import GameButton from '../../ui/GameButton';

interface Props {
    festivals: 节日结构[];
    onUpdate: (festivals: 节日结构[]) => void;
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
}

const WorldSettings: React.FC<Props> = ({ festivals, onUpdate, requestConfirm }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<节日结构 | null>(null);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const pushNotice = (type: 'success' | 'error', text: string) => {
        setNotice({ type, text });
        window.setTimeout(() => setNotice(null), 2200);
    };

    const handleEdit = (festival: 节日结构) => {
        setEditingId(festival.id);
        setEditForm({ ...festival });
    };

    const handleSave = () => {
        if (!editForm) return;
        
        // Validation
        if (editForm.月 < 1 || editForm.月 > 12) {
            pushNotice('error', '月份必须在 1-12 之间');
            return;
        }
        if (editForm.日 < 1 || editForm.日 > 30) {
             pushNotice('error', '日期必须在 1-30 之间');
             return;
        }

        const newList = festivals.map(f => f.id === editForm.id ? editForm : f);
        if (!festivals.find(f => f.id === editForm.id)) {
            newList.push(editForm);
        }
        
        // Sort by date
        newList.sort((a, b) => (a.月 * 30 + a.日) - (b.月 * 30 + b.日));
        
        onUpdate(newList);
        setEditingId(null);
        setEditForm(null);
        pushNotice('success', '节日设置已保存');
    };

    const handleDelete = async (id: string) => {
        const ok = requestConfirm
            ? await requestConfirm({ title: '删除节日', message: '确定删除此节日吗？', confirmText: '删除', danger: true })
            : true;
        if (!ok) return;
        onUpdate(festivals.filter(f => f.id !== id));
    };

    const handleAddNew = () => {
        const newFestival: 节日结构 = {
            id: Date.now().toString(),
            名称: '新节日',
            月: 1,
            日: 1,
            描述: '节日描述...',
            效果: '无特殊效果'
        };
        setEditForm(newFestival);
        setEditingId(newFestival.id);
    };

    if (editingId && editForm) {
        return (
            <div className="space-y-4 p-5 bg-black/40 border border-gray-700/50 backdrop-blur-sm animate-fadeIn">
                <h3 className="text-wuxia-gold font-serif font-bold mb-2">编辑节日</h3>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400">节日名称</label>
                        <input 
                            className="w-full bg-black/30 border border-gray-600/50 p-2 text-paper-white focus:border-wuxia-gold outline-none"
                            value={editForm.名称}
                            onChange={e => setEditForm({...editForm, 名称: e.target.value})}
                        />
                    </div>
                    <div className="flex gap-2">
                         <div className="space-y-1 flex-1">
                            <label className="text-xs text-gray-400">月</label>
                            <input 
                                type="number" min="1" max="13"
                                className="w-full bg-black/30 border border-gray-600/50 p-2 text-wuxia-gold font-mono focus:border-wuxia-gold outline-none"
                                value={editForm.月}
                                onChange={e => setEditForm({...editForm, 月: parseInt(e.target.value) || 1})}
                            />
                        </div>
                        <div className="space-y-1 flex-1">
                            <label className="text-xs text-gray-400">日</label>
                            <input 
                                type="number" min="1" max="30"
                                className="w-full bg-black/30 border border-gray-600/50 p-2 text-wuxia-gold font-mono focus:border-wuxia-gold outline-none"
                                value={editForm.日}
                                onChange={e => setEditForm({...editForm, 日: parseInt(e.target.value) || 1})}
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-gray-400">节日描述</label>
                    <textarea 
                        className="w-full h-20 bg-black/30 border border-gray-600/50 p-2 text-xs text-gray-300 focus:border-wuxia-gold outline-none custom-scrollbar resize-none"
                        value={editForm.描述}
                        onChange={e => setEditForm({...editForm, 描述: e.target.value})}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-gray-400">特殊效果 (仅记录)</label>
                    <input 
                        className="w-full bg-black/30 border border-gray-600/50 p-2 text-xs text-wuxia-red/80 focus:border-wuxia-red outline-none"
                        value={editForm.效果}
                        onChange={e => setEditForm({...editForm, 效果: e.target.value})}
                        placeholder="例如：特定怪物出现，或者NPC对话改变"
                    />
                </div>

                 <div className="flex gap-2 justify-end pt-2">
                    <GameButton onClick={() => { setEditingId(null); setEditForm(null); }} variant="secondary" className="px-4 py-2 text-xs">取消</GameButton>
                    <GameButton onClick={handleSave} variant="primary" className="px-4 py-2 text-xs">保存</GameButton>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {notice && (
                <div className={`text-xs px-3 py-2 border rounded ${
                    notice.type === 'success'
                        ? 'border-green-500/40 bg-green-900/20 text-green-300'
                        : 'border-wuxia-red/40 bg-red-900/20 text-red-300'
                }`}>
                    {notice.text}
                </div>
            )}
            <div className="flex justify-between items-center">
                 <h3 className="text-wuxia-gold font-serif font-bold text-lg">世界节日设定</h3>
                 <GameButton onClick={handleAddNew} variant="primary" className="text-xs px-3 py-2">新增节日</GameButton>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                {festivals.map(f => (
                    <div key={f.id} className="relative bg-black/30 border border-gray-800 p-4 hover:border-wuxia-gold/30 transition-colors group">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-3">
                                <span className="text-wuxia-gold font-bold font-serif text-lg">{f.名称}</span>
                                <span className="text-xs font-mono bg-wuxia-gold/10 text-wuxia-gold px-2 py-0.5 rounded border border-wuxia-gold/20">
                                    {f.月}月{f.日}日
                                </span>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEdit(f)} className="text-xs text-wuxia-cyan hover:underline">编辑</button>
                                <button onClick={() => handleDelete(f.id)} className="text-xs text-wuxia-red hover:underline">删除</button>
                            </div>
                        </div>
                        
                        <p className="text-xs text-gray-400 mb-2 leading-relaxed">{f.描述}</p>
                        
                        {f.效果 && f.效果 !== '无' && (
                            <div className="text-[10px] text-wuxia-red/70 flex items-center gap-1 mt-2 border-t border-gray-800 pt-2">
                                <span className="uppercase font-bold tracking-wider">Effect:</span>
                                <span>{f.效果}</span>
                            </div>
                        )}
                    </div>
                ))}

                {festivals.length === 0 && (
                    <div className="text-center text-gray-600 py-10 font-serif">
                        暂无节日，世界一片寂静。
                    </div>
                )}
            </div>
            
             <p className="text-[10px] text-gray-500 italic mt-4">
                * 设置的节日将根据游戏内日期自动同步至顶部状态栏。
            </p>
        </div>
    );
};

export default WorldSettings;
