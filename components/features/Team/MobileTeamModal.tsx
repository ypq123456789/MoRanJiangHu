import React from 'react';
import { 角色数据结构, NPC结构 } from '../../../types';

interface Props {
    character: 角色数据结构;
    teammates: NPC结构[];
    onClose: () => void;
}

const ProgressBar: React.FC<{ label: string; cur: number; max: number; color: string }> = ({ label, cur, max, color }) => {
    const safeMax = Math.max(1, max || 0);
    const safeCur = Math.max(0, cur || 0);
    const pct = Math.max(0, Math.min(100, (safeCur / safeMax) * 100));
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">{label}</span>
                <span className="font-mono text-gray-300">{safeCur}/{safeMax}</span>
            </div>
            <div className="h-1.5 bg-gray-900 rounded-full border border-gray-800 overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

const MobileTeamModal: React.FC<Props> = ({ character, teammates, onClose }) => {
    const activeTeammates = (Array.isArray(teammates) ? teammates : []).filter((n) => n.是否队友 === true);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:hidden animate-fadeIn">
            <div className="bg-ink-black/95 border border-wuxia-gold/30 w-full max-w-[560px] h-[84vh] flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden rounded-2xl">
                <div className="h-12 shrink-0 border-b border-gray-800/60 bg-black/40 flex items-center justify-between px-4">
                    <h3 className="text-wuxia-gold font-serif font-bold text-base tracking-[0.3em]">队伍管理</h3>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-wuxia-red hover:border-wuxia-red transition-all"
                        title="关闭"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-ink-wash/5">
                    <div className="bg-black/40 border border-wuxia-gold/20 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <div className="text-[10px] text-gray-500 tracking-[0.2em]">队长</div>
                                <div className="text-lg text-wuxia-gold font-serif font-bold">{character.姓名}</div>
                            </div>
                            <div className="text-[10px] text-gray-400">{character.境界}</div>
                        </div>
                        <div className="space-y-2">
                            <ProgressBar label="精力" cur={character.当前精力} max={character.最大精力} color="bg-teal-500" />
                            <ProgressBar label="内力" cur={character.当前内力} max={character.最大内力} color="bg-indigo-500" />
                        </div>
                    </div>

                    <div className="bg-black/40 border border-gray-800 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-gray-500 tracking-[0.2em]">队员列表</span>
                            <span className="text-[10px] text-wuxia-cyan/80">{activeTeammates.length} 人</span>
                        </div>

                        <div className="space-y-3">
                            {activeTeammates.map((npc) => (
                                <div key={npc.id} className="bg-black/35 border border-gray-800 rounded-lg p-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm text-gray-200 font-serif">{npc.姓名}</div>
                                            <div className="text-[10px] text-gray-500">{npc.身份} · {npc.境界}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-red-300">攻 {npc.攻击力 || 0}</div>
                                            <div className="text-[10px] text-blue-300">防 {npc.防御力 || 0}</div>
                                        </div>
                                    </div>
                                    <div className="mt-2 space-y-2">
                                        <ProgressBar label="血量" cur={npc.当前血量 || 0} max={npc.最大血量 || 0} color="bg-red-700" />
                                        <ProgressBar label="精力" cur={npc.当前精力 || 0} max={npc.最大精力 || 0} color="bg-blue-700" />
                                        <ProgressBar label="内力" cur={npc.当前内力 || 0} max={npc.最大内力 || 0} color="bg-indigo-700" />
                                    </div>
                                </div>
                            ))}
                            {activeTeammates.length === 0 && (
                                <div className="text-center text-gray-600 text-xs py-8">暂无队员</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MobileTeamModal;
