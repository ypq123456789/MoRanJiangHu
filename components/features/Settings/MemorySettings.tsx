
import React, { useState } from 'react';
import { 记忆配置结构 } from '../../../types';
import GameButton from '../../ui/GameButton';

interface Props {
    settings: 记忆配置结构;
    onSave: (settings: 记忆配置结构) => void;
}

const MemorySettings: React.FC<Props> = ({ settings, onSave }) => {
    const [form, setForm] = useState<记忆配置结构>(settings);
    const [showSuccess, setShowSuccess] = useState(false);

    const handleSave = () => {
        onSave(form);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    return (
        <div className="space-y-8 animate-fadeIn">
            <div className="flex justify-between items-center border-b border-wuxia-gold/30 pb-2">
                <h3 className="text-wuxia-gold font-serif font-bold text-lg">记忆压缩配置</h3>
                {showSuccess && <span className="text-green-400 text-xs font-bold animate-pulse">✔ 配置已保存</span>}
            </div>
            
            {/* Thresholds */}
            <div className="space-y-4">
                <div className="space-y-2 bg-black/20 p-4 rounded border border-gray-800">
                    <label className="text-xs text-wuxia-cyan font-bold uppercase tracking-widest">短期记忆阈值 (条)</label>
                    <div className="flex items-center gap-3">
                        <input 
                            type="number"
                            min="5" max="50"
                            value={form.短期记忆阈值}
                            onChange={(e) => setForm({...form, 短期记忆阈值: parseInt(e.target.value) || 30})}
                            className="bg-black/50 border border-gray-600 p-2 text-white font-mono w-24 text-center focus:border-wuxia-gold outline-none"
                        />
                        <span className="text-gray-500 text-xs">超过该值时触发“短期 -&gt; 中期”总结</span>
                    </div>
                </div>

                <div className="space-y-2 bg-black/20 p-4 rounded border border-gray-800">
                    <label className="text-xs text-wuxia-cyan font-bold uppercase tracking-widest">中期转长期阈值 (条)</label>
                    <div className="flex items-center gap-3">
                        <input 
                            type="number"
                            min="20" max="200"
                            value={form.中期记忆阈值 || 50}
                            onChange={(e) => setForm({...form, 中期记忆阈值: parseInt(e.target.value) || 50})}
                            className="bg-black/50 border border-gray-600 p-2 text-white font-mono w-24 text-center focus:border-wuxia-gold outline-none"
                        />
                        <span className="text-gray-500 text-xs">超过该值时触发“中期 -&gt; 长期”总结</span>
                    </div>
                </div>

                <div className="space-y-2 bg-black/20 p-4 rounded border border-gray-800">
                    <label className="text-xs text-wuxia-cyan font-bold uppercase tracking-widest">重要角色记忆条数 N</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            min="1" max="50"
                            value={form.重要角色关键记忆条数N || 20}
                            onChange={(e) => setForm({ ...form, 重要角色关键记忆条数N: parseInt(e.target.value) || 20 })}
                            className="bg-black/50 border border-gray-600 p-2 text-white font-mono w-24 text-center focus:border-wuxia-gold outline-none"
                        />
                        <span className="text-gray-500 text-xs">用于重要角色上下文记忆条数</span>
                    </div>
                </div>

                <div className="space-y-2 bg-black/20 p-4 rounded border border-gray-800">
                    <label className="text-xs text-wuxia-cyan font-bold uppercase tracking-widest">NPC 记忆总结阈值</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            min="5" max="100"
                            value={form.NPC记忆总结阈值 || 20}
                            onChange={(e) => setForm({ ...form, NPC记忆总结阈值: parseInt(e.target.value) || 20 })}
                            className="bg-black/50 border border-gray-600 p-2 text-white font-mono w-24 text-center focus:border-wuxia-gold outline-none"
                        />
                        <span className="text-gray-500 text-xs">单个 NPC 记忆达到该条数后，较早记忆会自动聚合为总结记忆</span>
                    </div>
                </div>

                <div className="space-y-2 bg-black/20 p-4 rounded border border-gray-800">
                    <label className="text-xs text-wuxia-cyan font-bold uppercase tracking-widest">即时消息上传条数 N</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            min="1" max="100"
                            value={form.即时消息上传条数N || 10}
                            onChange={(e) => setForm({ ...form, 即时消息上传条数N: parseInt(e.target.value) || 10 })}
                            className="bg-black/50 border border-gray-600 p-2 text-white font-mono w-24 text-center focus:border-wuxia-gold outline-none"
                        />
                        <span className="text-gray-500 text-xs">按回合计数；用于“即时 -&gt; 短期”滑动和 Script 上传窗口（开场AI=1，后续玩家+AI=1）</span>
                    </div>
                </div>
            </div>

            {/* Prompts */}
            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="text-xs text-gray-400 font-bold">短期转中期 · 总结提示词模板</label>
                    <p className="text-[10px] text-gray-500">指导 AI 如何将琐碎的对话回合精简为关键事件。</p>
                    <textarea 
                        value={form.短期转中期提示词}
                        onChange={(e) => setForm({...form, 短期转中期提示词: e.target.value})}
                        className="w-full h-24 bg-black/30 border border-gray-600/50 p-3 text-sm text-gray-300 focus:border-wuxia-gold outline-none custom-scrollbar resize-none font-mono"
                        placeholder="例如：请总结上述事件的关键信息..."
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs text-gray-400 font-bold">中期转长期 · 史诗化提示词模板</label>
                    <p className="text-[10px] text-gray-500">指导 AI 如何将一系列事件升华为角色的长期阅历。</p>
                    <textarea 
                        value={form.中期转长期提示词}
                        onChange={(e) => setForm({...form, 中期转长期提示词: e.target.value})}
                        className="w-full h-24 bg-black/30 border border-gray-600/50 p-3 text-sm text-gray-300 focus:border-wuxia-gold outline-none custom-scrollbar resize-none font-mono"
                        placeholder="例如：请将这些经历概括为..."
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs text-gray-400 font-bold">NPC 记忆总结提示词模板</label>
                    <p className="text-[10px] text-gray-500">用于 NPC 自动/手动记忆总结；要求保持该 NPC 视角可知事实。</p>
                    <textarea
                        value={form.NPC记忆总结提示词}
                        onChange={(e) => setForm({ ...form, NPC记忆总结提示词: e.target.value })}
                        className="w-full h-24 bg-black/30 border border-gray-600/50 p-3 text-sm text-gray-300 focus:border-wuxia-gold outline-none custom-scrollbar resize-none font-mono"
                        placeholder="例如：请把该 NPC 已知的多条记忆压缩为一条长期可读的角色记忆..."
                    />
                </div>
            </div>

            <div className="pt-4 border-t border-gray-800 flex justify-end">
                <GameButton onClick={handleSave} variant="primary" className="w-full md:w-auto px-8">
                    保存记忆配置
                </GameButton>
            </div>
        </div>
    );
};

export default MemorySettings;
