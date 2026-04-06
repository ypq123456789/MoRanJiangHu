import React from 'react';
import { 角色数据结构, 战斗状态结构 } from '../../../types';

interface Props {
    character: 角色数据结构;
    battle: 战斗状态结构;
    onClose: () => void;
}

type 扩展敌方 = 战斗状态结构['敌方'][number] & {
    当前内力?: number;
    最大内力?: number;
};

const 条形值: React.FC<{
    label: string;
    current: number;
    max: number;
    color: string;
}> = ({ label, current, max, color }) => {
    const safeMax = Math.max(1, Number(max) || 0);
    const safeCur = Math.max(0, Number(current) || 0);
    const pct = Math.max(0, Math.min(100, (safeCur / safeMax) * 100));
    return (
        <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-gray-500">{label}</span>
                <span className="font-mono text-gray-300">{safeCur}/{safeMax}</span>
            </div>
            <div className="h-1.5 rounded-full border border-gray-800 bg-black/40 overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

const MobileBattleModal: React.FC<Props> = ({ character, battle, onClose }) => {
    const 敌方列表 = (Array.isArray(battle?.敌方) ? battle.敌方 : []) as 扩展敌方[];
    const 存活敌人数 = 敌方列表.filter((enemy) => (enemy?.当前血量 || 0) > 0).length;

    const 部位当前 = [
        character.头部当前血量,
        character.胸部当前血量,
        character.腹部当前血量,
        character.左手当前血量,
        character.右手当前血量,
        character.左腿当前血量,
        character.右腿当前血量,
    ];
    const 部位上限 = [
        character.头部最大血量,
        character.胸部最大血量,
        character.腹部最大血量,
        character.左手最大血量,
        character.右手最大血量,
        character.左腿最大血量,
        character.右腿最大血量,
    ];
    const 玩家总血量当前 = 部位当前.reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0);
    const 玩家总血量上限 = 部位上限.reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0);
    const 境界值 = Math.max(1, Number(character.境界层级) || 1);
    const 玩家境界展示 = (character.境界 || '').trim() || `境界值 ${境界值}`;
 
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[210] flex items-center justify-center p-3 md:hidden animate-fadeIn">
            <div className="w-full max-w-[620px] h-[86vh] rounded-2xl border border-wuxia-gold/30 bg-ink-black/95 shadow-[0_0_65px_rgba(0,0,0,0.88)] overflow-hidden flex flex-col">
                <div className="h-12 shrink-0 px-4 border-b border-gray-800/60 bg-black/45 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="text-wuxia-gold font-serif font-bold text-base tracking-[0.24em]">战斗</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            battle?.是否战斗中
                                ? 'border-red-700/70 text-red-300 bg-red-900/20'
                                : 'border-emerald-700/60 text-emerald-300 bg-emerald-900/20'
                        }`}>
                            {battle?.是否战斗中 ? `交战中(${存活敌人数})` : '非战斗'}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-wuxia-red hover:border-wuxia-red transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-ink-wash/5">
                    <div className="rounded-xl border border-wuxia-gold/25 bg-black/35 p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="text-[10px] text-gray-500 tracking-[0.18em]">PLAYER</div>
                                <div className="text-sm text-gray-100 font-serif">{character.姓名 || '无名侠客'}</div>
                            </div>
                            <div className="text-[10px] text-wuxia-gold/80">{玩家境界展示 || '未定境界'}</div>
                        </div>
                        <div className="space-y-2">
                            <条形值 label="总气血" current={玩家总血量当前} max={玩家总血量上限} color="bg-gradient-to-r from-red-700 to-red-400" />
                            <条形值 label="精力" current={character.当前精力} max={character.最大精力} color="bg-gradient-to-r from-cyan-700 to-cyan-400" />
                            <条形值 label="内力" current={character.当前内力} max={character.最大内力} color="bg-gradient-to-r from-indigo-700 to-indigo-400" />
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-800 bg-black/35 p-3">
                        <div className="text-[10px] text-gray-500 tracking-[0.2em] mb-2">敌方单位</div>
                        {敌方列表.length === 0 ? (
                            <div className="text-xs text-gray-600 py-5 text-center border border-dashed border-gray-800 rounded-lg">当前没有敌方数据</div>
                        ) : (
                            <div className="space-y-3">
                                {敌方列表.map((enemy, idx) => {
                                    const hpCur = Math.max(0, enemy?.当前血量 || 0);
                                    const hpMax = Math.max(1, enemy?.最大血量 || 1);
                                    const spCur = Math.max(0, enemy?.当前精力 || 0);
                                    const spMax = Math.max(1, enemy?.最大精力 || 1);
                                    const qiCur = Math.max(0, enemy?.当前内力 || 0);
                                    const qiMax = Math.max(1, enemy?.最大内力 || Math.max(qiCur, 1));
                                    return (
                                        <div key={`${enemy?.名字 || 'enemy'}-${idx}`} className="rounded-lg border border-red-900/35 bg-red-950/10 p-3">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <div className="text-sm text-gray-100 font-serif">{enemy?.名字 || `敌方${idx + 1}`}</div>
                                                    <div className="text-[10px] text-gray-500 mt-0.5">{enemy?.境界 || '未知境界'}</div>
                                                </div>
                                                <div className="text-right text-[10px] font-mono">
                                                    <div className="text-red-300">攻 {enemy?.战斗力 || 0}</div>
                                                    <div className="text-blue-300">防 {enemy?.防御力 || 0}</div>
                                                </div>
                                            </div>
                                            <div className="mt-2 space-y-2">
                                                <条形值 label="气血" current={hpCur} max={hpMax} color="bg-gradient-to-r from-red-700 to-red-400" />
                                                <条形值 label="精力" current={spCur} max={spMax} color="bg-gradient-to-r from-cyan-700 to-cyan-400" />
                                                {(enemy?.最大内力 !== undefined || enemy?.当前内力 !== undefined) && (
                                                    <条形值 label="内力" current={qiCur} max={qiMax} color="bg-gradient-to-r from-indigo-700 to-indigo-400" />
                                                )}
                                            </div>
                                            <div className="mt-2 text-[10px] text-gray-500">
                                                技能：{Array.isArray(enemy?.技能) && enemy.技能.length > 0 ? enemy.技能.join(' / ') : '无'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MobileBattleModal;
