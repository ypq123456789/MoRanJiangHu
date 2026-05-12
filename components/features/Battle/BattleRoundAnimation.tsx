import React, { useEffect, useMemo, useState, useRef } from 'react';
import { 角色数据结构, 战斗状态结构 } from '../../../types';

// ─── 类型定义 ───────────────────────────────────────────────────────────────

export interface 回合行动 {
    行动者: string;
    身法值: number;
    阵营: 'ally' | 'enemy';
    行动类型: '攻击' | '防御' | '闪避' | '施法' | '逃跑' | '使用物品';
    目标?: string;
    技能名?: string;
    伤害?: number;
    伤害类型?: '物理' | '内功' | '真实' | '混合';
    命中部位?: string;
    是否暴击?: boolean;
    效果描述?: string;
}

export interface 状态变化 {
    角色名: string;
    血量变化?: number;
    精力变化?: number;
    内力变化?: number;
    部位损伤?: { 部位: string; 伤害: number; 新状态?: string }[];
    新状态?: '正常' | '昏迷' | '死亡' | '逃跑' | '重伤';
}

export interface 战斗回合数据 {
    回合数: number;
    行动序列: 回合行动[];
    状态变化列表: 状态变化[];
    回合描述?: string;
}

interface Props {
    character: 角色数据结构;
    battle: 战斗状态结构;
    roundData?: 战斗回合数据;
    onAnimationComplete?: () => void;
    compact?: boolean;
}

// ─── 工具函数 ───────────────────────────────────────────────────────────────

const 计算身法排序 = (actions: 回合行动[]): 回合行动[] => {
    return [...actions].sort((a, b) => b.身法值 - a.身法值);
};

const 获取阵营颜色 = (side: 'ally' | 'enemy') =>
    side === 'ally' ? 'text-emerald-300' : 'text-red-300';

const 获取阵营边框 = (side: 'ally' | 'enemy') =>
    side === 'ally' ? 'border-emerald-500/30' : 'border-red-500/30';

const 获取阵营背景 = (side: 'ally' | 'enemy') =>
    side === 'ally' ? 'bg-emerald-950/20' : 'bg-red-950/20';

const 获取状态颜色 = (status?: string) => {
    switch (status) {
        case '昏迷': return 'text-yellow-400 bg-yellow-950/30 border-yellow-500/40';
        case '死亡': return 'text-gray-400 bg-gray-950/30 border-gray-500/40';
        case '逃跑': return 'text-blue-400 bg-blue-950/30 border-blue-500/40';
        case '重伤': return 'text-orange-400 bg-orange-950/30 border-orange-500/40';
        default: return 'text-emerald-400 bg-emerald-950/30 border-emerald-500/40';
    }
};

const 获取行动图标 = (type: string) => {
    switch (type) {
        case '攻击': return '⚔️';
        case '防御': return '🛡️';
        case '闪避': return '💨';
        case '施法': return '✨';
        case '逃跑': return '🏃';
        case '使用物品': return '🧪';
        default: return '⚡';
    }
};

// ─── 伤害飘字组件 ─────────────────────────────────────────────────────────

const DamageFloat: React.FC<{
    damage: number;
    isCrit?: boolean;
    type?: string;
    onDone?: () => void;
}> = ({ damage, isCrit, type, onDone }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setTimeout(() => onDone?.(), 1200);
        return () => clearTimeout(timer);
    }, [onDone]);

    const colorClass = type === '内功' ? 'text-indigo-300'
        : type === '真实' ? 'text-white'
        : type === '混合' ? 'text-purple-300'
        : 'text-red-300';

    return (
        <div
            ref={ref}
            className={`absolute pointer-events-none font-mono font-black select-none
                ${isCrit ? 'text-2xl' : 'text-lg'} ${colorClass}
                animate-damage-float`}
            style={{
                left: `${50 + (Math.random() - 0.5) * 40}%`,
                top: '20%',
            }}
        >
            {isCrit && <span className="text-yellow-400 text-xs mr-1">暴击!</span>}
            -{damage}
        </div>
    );
};

// ─── 资源条变化组件 ─────────────────────────────────────────────────────────

const ResourceBar: React.FC<{
    label: string;
    current: number;
    max: number;
    change?: number;
    color: string;
}> = ({ label, current, max, change, color }) => {
    const safeMax = Math.max(1, max);
    const safeCur = Math.max(0, Math.min(current, safeMax));
    const pct = (safeCur / safeMax) * 100;

    return (
        <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[10px]">
                <span className="text-gray-500 font-serif">{label}</span>
                <div className="flex items-center gap-1.5">
                    <span className="font-mono text-gray-300">{safeCur}/{safeMax}</span>
                    {change !== undefined && change !== 0 && (
                        <span className={`font-mono text-[9px] px-1 py-0.5 rounded ${
                            change > 0 ? 'text-emerald-300 bg-emerald-950/40' : 'text-red-300 bg-red-950/40'
                        }`}>
                            {change > 0 ? '+' : ''}{change}
                        </span>
                    )}
                </div>
            </div>
            <div className="h-1.5 rounded-full border border-white/5 bg-black/60 overflow-hidden">
                <div
                    className={`h-full ${color} transition-all duration-700 ease-out`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
};

// ─── 部位损伤展示 ─────────────────────────────────────────────────────────

const BodyPartDamage: React.FC<{
    damages: { 部位: string; 伤害: number; 新状态?: string }[];
}> = ({ damages }) => {
    if (!damages || damages.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
            {damages.map((d, i) => (
                <span
                    key={`${d.部位}-${i}`}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        d.新状态 === '重伤' ? 'border-red-500/40 bg-red-950/30 text-red-200'
                        : d.新状态 === '骨折' ? 'border-orange-500/40 bg-orange-950/30 text-orange-200'
                        : 'border-yellow-500/30 bg-yellow-950/20 text-yellow-200'
                    }`}
                >
                    {d.部位} -{d.伤害}
                    {d.新状态 && d.新状态 !== '正常' && <span className="ml-1 opacity-70">({d.新状态})</span>}
                </span>
            ))}
        </div>
    );
};

// ─── 状态标签 ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const colorClass = 获取状态颜色(status);
    const icon = status === '昏迷' ? '💫' : status === '死亡' ? '💀' : status === '逃跑' ? '🏃' : status === '重伤' ? '🩸' : '✓';

    return (
        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-serif ${colorClass}`}>
            <span>{icon}</span>
            {status}
        </span>
    );
};

// ─── 主组件 ───────────────────────────────────────────────────────────────

const BattleRoundAnimation: React.FC<Props> = ({
    character,
    battle,
    roundData,
    onAnimationComplete,
    compact = false,
}) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [floatingDamages, setFloatingDamages] = useState<Array<{ id: number; damage: number; isCrit?: boolean; type?: string }>>([]);
    const damageIdRef = useRef(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 按身法排序的行动序列
    const sortedActions = useMemo(() => {
        if (!roundData?.行动序列) return [];
        return 计算身法排序(roundData.行动序列);
    }, [roundData]);

    // 自动播放动画
    useEffect(() => {
        if (!isPlaying || currentStep >= sortedActions.length) {
            if (currentStep >= sortedActions.length && sortedActions.length > 0) {
                onAnimationComplete?.();
            }
            return;
        }

        const action = sortedActions[currentStep];
        if (action.伤害) {
            const id = ++damageIdRef.current;
            setFloatingDamages(prev => [...prev, {
                id,
                damage: action.伤害!,
                isCrit: action.是否暴击,
                type: action.伤害类型,
            }]);
        }

        timerRef.current = setTimeout(() => {
            setCurrentStep(prev => prev + 1);
        }, compact ? 800 : 1500);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [isPlaying, currentStep, sortedActions, compact, onAnimationComplete]);

    const handlePlay = () => {
        setCurrentStep(0);
        setFloatingDamages([]);
        setIsPlaying(true);
    };

    const handleStep = () => {
        if (currentStep < sortedActions.length) {
            const action = sortedActions[currentStep];
            if (action.伤害) {
                const id = ++damageIdRef.current;
                setFloatingDamages(prev => [...prev, {
                    id,
                    damage: action.伤害!,
                    isCrit: action.是否暴击,
                    type: action.伤害类型,
                }]);
            }
            setCurrentStep(prev => prev + 1);
        }
    };

    const removeDamageFloat = (id: number) => {
        setFloatingDamages(prev => prev.filter(d => d.id !== id));
    };

    // 如果没有回合数据，显示从当前战斗状态生成的模拟数据
    const displayRound = roundData || generateMockRound(character, battle);

    return (
        <div className="rounded-xl border border-wuxia-gold/20 bg-black/40 overflow-hidden">
            {/* 回合标题 */}
            <div className="px-4 py-2.5 border-b border-wuxia-gold/10 bg-gradient-to-r from-black/60 to-transparent flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/70"></div>
                    <span className="text-sm font-serif text-wuxia-gold tracking-widest">
                        第 {displayRound.回合数} 回合
                    </span>
                    {displayRound.回合描述 && (
                        <span className="text-[10px] text-gray-500 ml-2">{displayRound.回合描述}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {!isPlaying && currentStep === 0 && sortedActions.length > 0 && (
                        <button
                            onClick={handlePlay}
                            className="text-[10px] px-2.5 py-1 rounded border border-wuxia-gold/30 text-wuxia-gold/80 hover:bg-wuxia-gold/10 transition-colors font-serif"
                        >
                            ▶ 播放
                        </button>
                    )}
                    {!isPlaying && currentStep < sortedActions.length && (
                        <button
                            onClick={handleStep}
                            className="text-[10px] px-2.5 py-1 rounded border border-gray-700 text-gray-400 hover:bg-white/5 transition-colors"
                        >
                            下一步 ({currentStep + 1}/{sortedActions.length})
                        </button>
                    )}
                </div>
            </div>

            {/* 行动顺序时间轴 */}
            <div className="px-4 py-3">
                <div className="text-[10px] text-gray-500 tracking-widest mb-2 font-serif">行动顺序（按身法排列）</div>
                <div className="space-y-2 relative">
                    {/* 时间轴线 */}
                    <div className="absolute left-[11px] top-3 bottom-3 w-px bg-gradient-to-b from-wuxia-gold/30 via-wuxia-gold/10 to-transparent"></div>

                    {sortedActions.map((action, idx) => {
                        const isActive = idx === currentStep - 1;
                        const isPast = idx < currentStep;
                        const isFuture = idx >= currentStep;

                        return (
                            <div
                                key={`action-${idx}`}
                                className={`relative pl-8 transition-all duration-300 ${
                                    isFuture && isPlaying ? 'opacity-30' : ''
                                } ${isActive ? 'scale-[1.02]' : ''}`}
                            >
                                {/* 时间轴节点 */}
                                <div className={`absolute left-1.5 top-2 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                                    isActive ? 'border-wuxia-gold bg-wuxia-gold/20 shadow-[0_0_8px_rgba(212,175,55,0.5)]'
                                    : isPast ? 'border-gray-600 bg-gray-800'
                                    : 'border-gray-700 bg-black/60'
                                }`}>
                                    <span className="text-[8px]">{获取行动图标(action.行动类型)}</span>
                                </div>

                                {/* 行动卡片 */}
                                <div className={`rounded-lg border p-2.5 transition-all ${
                                    isActive
                                        ? `${获取阵营边框(action.阵营)} ${获取阵营背景(action.阵营)} shadow-lg`
                                        : 'border-gray-800/50 bg-black/20'
                                }`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-serif text-sm font-bold ${获取阵营颜色(action.阵营)}`}>
                                                {action.行动者}
                                            </span>
                                            <span className="text-[10px] text-gray-500 font-mono bg-black/40 px-1.5 py-0.5 rounded">
                                                身法 {action.身法值}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-gray-400 font-serif">
                                            {action.行动类型}
                                            {action.技能名 && <span className="text-wuxia-gold/70 ml-1">· {action.技能名}</span>}
                                        </span>
                                    </div>

                                    {(action.目标 || action.伤害) && (
                                        <div className="mt-1.5 flex items-center gap-3 text-[11px]">
                                            {action.目标 && (
                                                <span className="text-gray-400">
                                                    → <span className="text-gray-200">{action.目标}</span>
                                                </span>
                                            )}
                                            {action.伤害 && (
                                                <span className={`font-mono font-bold ${
                                                    action.是否暴击 ? 'text-yellow-300' : 'text-red-300'
                                                }`}>
                                                    {action.是否暴击 && '💥'}
                                                    -{action.伤害}
                                                    {action.命中部位 && (
                                                        <span className="text-gray-500 font-normal ml-1">({action.命中部位})</span>
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {action.效果描述 && (
                                        <div className="mt-1 text-[10px] text-gray-500 italic">{action.效果描述}</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 伤害飘字层 */}
            <div className="relative h-0">
                {floatingDamages.map(d => (
                    <DamageFloat
                        key={d.id}
                        damage={d.damage}
                        isCrit={d.isCrit}
                        type={d.type}
                        onDone={() => removeDamageFloat(d.id)}
                    />
                ))}
            </div>

            {/* 状态变化区 */}
            {displayRound.状态变化列表 && displayRound.状态变化列表.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-800/50 bg-black/20">
                    <div className="text-[10px] text-gray-500 tracking-widest mb-2 font-serif">本回合状态变化</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {displayRound.状态变化列表.map((change, idx) => (
                            <div
                                key={`change-${idx}`}
                                className="rounded-lg border border-gray-800/50 bg-black/30 p-2.5"
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-serif text-gray-200">{change.角色名}</span>
                                    {change.新状态 && change.新状态 !== '正常' && (
                                        <StatusBadge status={change.新状态} />
                                    )}
                                </div>
                                <div className="space-y-1">
                                    {change.血量变化 !== undefined && (
                                        <ResourceBar
                                            label="气血"
                                            current={100 + (change.血量变化 || 0)}
                                            max={100}
                                            change={change.血量变化}
                                            color="bg-gradient-to-r from-red-700 to-red-400"
                                        />
                                    )}
                                    {change.精力变化 !== undefined && (
                                        <ResourceBar
                                            label="精力"
                                            current={100 + (change.精力变化 || 0)}
                                            max={100}
                                            change={change.精力变化}
                                            color="bg-gradient-to-r from-cyan-700 to-cyan-400"
                                        />
                                    )}
                                    {change.内力变化 !== undefined && (
                                        <ResourceBar
                                            label="内力"
                                            current={100 + (change.内力变化 || 0)}
                                            max={100}
                                            change={change.内力变化}
                                            color="bg-gradient-to-r from-indigo-700 to-indigo-400"
                                        />
                                    )}
                                </div>
                                {change.部位损伤 && (
                                    <BodyPartDamage damages={change.部位损伤} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── 从当前战斗状态生成模拟回合数据 ─────────────────────────────────────────

function generateMockRound(character: 角色数据结构, battle: 战斗状态结构): 战斗回合数据 {
    const enemies = Array.isArray(battle?.敌方) ? battle.敌方 : [];
    const playerAgility = Math.round((character.敏捷 || 10) * 1.5 + ((character.当前精力 || 0) / Math.max(1, character.最大精力 || 1)) * 20);

    const actions: 回合行动[] = [
        {
            行动者: character.姓名 || '主角',
            身法值: playerAgility,
            阵营: 'ally',
            行动类型: '攻击',
            目标: enemies[0]?.名字 || '敌方',
            技能名: character.功法列表?.[0]?.名称,
        },
        ...enemies.filter(e => (e?.当前血量 || 0) > 0).map(enemy => ({
            行动者: enemy.名字 || '敌方',
            身法值: Math.round((enemy.敏捷 || 8) * 1.2 + ((enemy.当前精力 || 0) / Math.max(1, enemy.最大精力 || 1)) * 16),
            阵营: 'enemy' as const,
            行动类型: '攻击' as const,
            目标: character.姓名 || '主角',
            技能名: enemy.技能?.[0],
        })),
    ];

    return {
        回合数: 1,
        行动序列: actions,
        状态变化列表: [],
    };
}

export default BattleRoundAnimation;
