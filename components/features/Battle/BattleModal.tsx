import React from 'react';
import { 角色数据结构, 战斗状态结构 } from '../../../types';
import { IconSwords, IconYinYang } from '../../ui/Icons';

interface Props {
    character: 角色数据结构;
    battle: 战斗状态结构;
    onClose: () => void;
}

type 扩展敌方 = 战斗状态结构['敌方'][number] & {
    当前内力?: number;
    最大内力?: number;
};

const 资源条: React.FC<{
    label: string;
    current: number;
    max: number;
    tone: 'red' | 'cyan' | 'indigo';
    icon?: React.ReactNode;
}> = ({ label, current, max, tone, icon }) => {
    const safeMax = Math.max(1, Number(max) || 0);
    const safeCur = Math.max(0, Number(current) || 0);
    const pct = Math.max(0, Math.min(100, (safeCur / safeMax) * 100));
    const fillClass =
        tone === 'red'
            ? 'bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_10px_rgba(220,38,38,0.5)]'
            : tone === 'indigo'
                ? 'bg-gradient-to-r from-indigo-500 to-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.5)]'
                : 'bg-gradient-to-r from-cyan-600 to-cyan-400 shadow-[0_0_10px_rgba(8,145,178,0.5)]';

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-wuxia-gold/80 font-serif tracking-widest">
                    {icon && <span className="opacity-80">{icon}</span>}
                    {label}
                </div>
                <span className="font-mono text-gray-200">{safeCur} <span className="text-gray-500">/</span> {safeMax}</span>
            </div>
            <div className="h-2 rounded-full border border-white/5 bg-black/60 overflow-hidden shadow-inner">
                <div className={`h-full ${fillClass} transition-all duration-500 ease-out`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

const BattleModal: React.FC<Props> = ({ character, battle, onClose }) => {
    const 敌方列表 = (Array.isArray(battle?.敌方) ? battle.敌方 : []) as 扩展敌方[];
    const 存活敌人数 = 敌方列表.filter((enemy) => (enemy?.当前血量 || 0) > 0).length;

    const 部位列表 = [
        ['头部', character.头部当前血量, character.头部最大血量, character.头部状态],
        ['胸腹', character.胸部当前血量, character.胸部最大血量, character.胸部状态], // 简化合并展示，腹部胸部通常相关联，这里按原数据展示
        ['腹部', character.腹部当前血量, character.腹部最大血量, character.腹部状态],
        ['左手', character.左手当前血量, character.左手最大血量, character.左手状态],
        ['右手', character.右手当前血量, character.右手最大血量, character.右手状态],
        ['左腿', character.左腿当前血量, character.左腿最大血量, character.左腿状态],
        ['右腿', character.右腿当前血量, character.右腿最大血量, character.右腿状态],
    ] as const;

    const 合并展示部位 = [
        { label: '首', cur: character.头部当前血量, max: character.头部最大血量, status: character.头部状态 },
        { label: '胸', cur: character.胸部当前血量, max: character.胸部最大血量, status: character.胸部状态 },
        { label: '腹', cur: character.腹部当前血量, max: character.腹部最大血量, status: character.腹部状态 },
        { label: '臂', cur: (character.左手当前血量 || 0) + (character.右手当前血量 || 0), max: (character.左手最大血量 || 0) + (character.右手最大血量 || 0), status: character.右手状态 !== '正常' ? character.右手状态 : character.左手状态 },
        { label: '腿', cur: (character.左腿当前血量 || 0) + (character.右腿当前血量 || 0), max: (character.左腿最大血量 || 0) + (character.右腿最大血量 || 0), status: character.右腿状态 !== '正常' ? character.右腿状态 : character.左腿状态 },
    ];

    const 玩家总血量上限 = 部位列表.reduce((sum, [, , max]) => sum + Math.max(0, Number(max) || 0), 0);
    const 玩家总血量当前 = 部位列表.reduce((sum, [, cur]) => sum + Math.max(0, Number(cur) || 0), 0);
    const 境界值 = Math.max(1, Number(character.境界层级) || 1);
    const 玩家境界展示 = (character.境界 || '').trim() || `境界值 ${境界值}`;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[210] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-ink-black/95 w-full max-w-7xl max-h-[90vh] h-[90vh] flex flex-col rounded-2xl border border-wuxia-gold/20 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 relative overflow-hidden">
                
                {/* 装饰类背景层 */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-ink-wash/5 bg-cover bg-center opacity-30 mix-blend-luminosity filter blur-sm"></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-red-900/5 via-transparent to-black"></div>
                </div>

                {/* 顶栏 */}
                <div className="h-14 shrink-0 border-b border-wuxia-gold/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-6 relative z-50">
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full animate-pulse shadow-[0_0_10px_rgba(255,0,0,0.8)] ${battle?.是否战斗中 ? 'bg-red-500' : 'bg-wuxia-gold'}`}></div>
                        <h3 className="text-wuxia-gold font-serif font-bold text-xl tracking-[0.4em] drop-shadow-md">
                            战斗局势
                            <span className="text-[10px] text-wuxia-gold/50 ml-2 font-mono tracking-widest border border-wuxia-gold/20 px-2 py-0.5 rounded-full">COMBAT</span>
                        </h3>
                    </div>

                    <div className="flex items-center gap-6">
                        <span className={`text-xs px-4 py-1.5 rounded-full border tracking-widest font-serif shadow-inner ${
                            battle?.是否战斗中
                                ? 'border-red-900/50 text-red-300 bg-red-950/40 shadow-[0_0_10px_rgba(220,38,38,0.2)]'
                                : 'border-emerald-900/50 text-emerald-300 bg-emerald-950/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                        }`}>
                            {battle?.是否战斗中 ? `刀剑无眼 · 敌兵 ${存活敌人数} 名` : '休战整顿'}
                        </span>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-400 hover:bg-red-400/10 transition-all hover:rotate-90"
                            title="关闭"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* 主体内容 */}
                <div className="flex-1 min-h-0 flex flex-col relative z-10">
                    {/* 敌方单位列表（全宽版） */}
                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar relative">
                        {敌方列表.length === 0 ? (
                            <div className="h-full rounded-2xl border border-dashed border-wuxia-gold/20 bg-black/20 flex flex-col items-center justify-center text-wuxia-gold/40 gap-4 font-serif">
                                <IconYinYang size={64} className="opacity-30 drop-shadow-lg" />
                                <span className="text-xl tracking-widest">四海升平，并无强压</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-max">
                                {敌方列表.map((enemy, idx) => {
                                    const hpCur = Math.max(0, enemy?.当前血量 || 0);
                                    const hpMax = Math.max(1, enemy?.最大血量 || 1);
                                    const spCur = Math.max(0, enemy?.当前精力 || 0);
                                    const spMax = Math.max(1, enemy?.最大精力 || 1);
                                    const qiCur = Math.max(0, enemy?.当前内力 || 0);
                                    const qiMax = Math.max(1, enemy?.最大内力 || Math.max(qiCur, 1));
                                    const 已失能 = hpCur <= 0;

                                    return (
                                        <div key={`${enemy?.名字 || 'enemy'}-${idx}`} className={`relative rounded-xl border p-5 overflow-hidden group transition-all duration-300 ${
                                            已失能 
                                                ? 'border-gray-800 bg-black/40 opacity-50 grayscale scale-[0.98]' 
                                                : 'border-red-900/30 bg-gradient-to-br from-red-950/20 to-black hover:border-red-700/50 hover:shadow-[0_0_20px_rgba(220,38,38,0.1)]'
                                        }`}>
                                            {/* 背景血迹装饰 */}
                                            {!已失能 && <div className="absolute -right-4 -top-4 text-7xl text-red-500 opacity-[0.03] rotate-12 pointer-events-none font-serif">杀</div>}
                                            
                                            <div className="flex items-start justify-between gap-4 relative z-10">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-lg text-red-100 font-serif font-bold flex items-center gap-2 truncate drop-shadow-sm">
                                                        <IconSwords size={16} className={已失能 ? 'text-gray-500' : 'text-red-400'} />
                                                        {enemy?.名字 || `无名游卒 ${idx + 1}`}
                                                    </div>
                                                    <div className="text-[11px] text-red-300/70 mt-1.5 flex items-center gap-2">
                                                        <span className="border border-red-900/50 bg-red-950/50 px-2 py-0.5 rounded font-serif shadow-sm tracking-wider">
                                                            {enemy?.境界 || '未明修身'}
                                                        </span>
                                                        {已失能 && <span className="text-gray-400 border border-gray-700 bg-gray-900 px-2 py-0.5 rounded tracking-widest">失能/败北</span>}
                                                    </div>
                                                    {enemy?.简介 && <div className="text-[11px] text-gray-400 mt-3 leading-relaxed border-l-2 border-red-900/40 pl-2 line-clamp-2 italic">
                                                        {enemy.简介}
                                                    </div>}
                                                </div>
                                                
                                                <div className="grid grid-cols-1 gap-2 text-[10px] font-mono shrink-0">
                                                    <div className="bg-black/50 border border-red-900/30 rounded px-2.5 py-1.5 text-red-300 flex justify-between gap-3 shadow-inner">
                                                        <span>威</span> <strong>{enemy?.战斗力 || 0}</strong>
                                                    </div>
                                                    <div className="bg-black/50 border border-blue-900/30 rounded px-2.5 py-1.5 text-blue-300 flex justify-between gap-3 shadow-inner">
                                                        <span>护</span> <strong>{enemy?.防御力 || 0}</strong>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-5 space-y-2.5 relative z-10">
                                                <资源条 label="气血" current={hpCur} max={hpMax} tone="red" />
                                                <资源条 label="精力" current={spCur} max={spMax} tone="cyan" />
                                                {(enemy?.最大内力 !== undefined || enemy?.当前内力 !== undefined) && (
                                                    <资源条 label="内力" current={qiCur} max={qiMax} tone="indigo" />
                                                )}
                                            </div>

                                            <div className="mt-4 pt-3 border-t border-white/5 relative z-10">
                                                <div className="text-[10px] text-red-500/70 tracking-[0.2em] font-serif mb-2 flex items-center gap-1.5">
                                                    <span className="w-1 h-3 bg-red-900/80 rounded-full"></span> 功法路数
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {Array.isArray(enemy?.技能) && enemy.技能.length > 0 ? (
                                                        enemy.技能.map((skill) => (
                                                            <span key={skill} className="text-[10px] px-2 py-0.5 rounded border border-red-900/30 bg-red-950/20 text-gray-300 shadow-sm font-serif">
                                                                {skill}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-[10px] text-gray-600 italic">平平无奇，无招亦无式</span>
                                                    )}
                                                </div>
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

export default BattleModal;
