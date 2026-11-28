import React, { useEffect, useMemo, useState } from 'react';
import type { DirectorWorldBible } from '../../../models/directorBible';
import {
    创建战术交锋会话,
    构建NPC明牌交锋面板,
    构建主角明牌交锋面板,
    推演交锋一拍,
    结算战术交锋结果,
    获取可选战术交锋目标,
    type ClashSessionState,
    type TacticalMoveId
} from '../../../engine/plugins/clashPlugin';
import type { NPC结构, 场外战果暂存结构, 角色数据结构 } from '../../../types';

interface Props {
    open: boolean;
    loading: boolean;
    role: 角色数据结构;
    env: any;
    social: NPC结构[];
    directorBible?: DirectorWorldBible | null;
    pendingClashes: 场外战果暂存结构[];
    onCommitClash: (payload: { nextRole: 角色数据结构; record: 场外战果暂存结构 }) => void;
    onClearClashes: () => void;
    onClose: () => void;
    onOpenSettings?: () => void;
}

const MOVE_BUTTONS: Array<{ id: TacticalMoveId; title: string; subtitle: string; tone: string }> = [
    { id: 'press', title: '强攻压招', subtitle: '克虚晃 · 耗1气力打高额压制', tone: 'border-red-500/45 bg-red-950/25 text-red-200 hover:border-red-400' },
    { id: 'deflect', title: '卸力借势', subtitle: '破强攻 · 回1气力并逼出破绽', tone: 'border-cyan-500/45 bg-cyan-950/25 text-cyan-200 hover:border-cyan-400' },
    { id: 'feint', title: '虚晃寻隙', subtitle: '破卸力 · 零消耗骗招抢占先手', tone: 'border-amber-500/45 bg-amber-950/25 text-amber-200 hover:border-amber-400' },
    { id: 'withdraw', title: '借势脱身', subtitle: '比拼身法+胜势，撤离或逼停交锋', tone: 'border-emerald-500/45 bg-emerald-950/25 text-emerald-200 hover:border-emerald-400' }
];

const TacticalClashModal: React.FC<Props> = ({
    open,
    loading,
    role,
    env,
    social,
    directorBible,
    pendingClashes,
    onCommitClash,
    onClearClashes,
    onClose,
    onOpenSettings
}) => {
    const candidates = useMemo(() => 获取可选战术交锋目标(social, env), [social, env]);
    const [selectedKey, setSelectedKey] = useState('');
    const [mode, setMode] = useState<'切磋试探' | '生死交锋'>('切磋试探');
    const [useSignature, setUseSignature] = useState(false);
    const [session, setSession] = useState<ClashSessionState | null>(null);
    const [committedMsg, setCommittedMsg] = useState('');

    useEffect(() => {
        if (!open) return;
        setCommittedMsg('');
        setUseSignature(false);
        const firstKey = candidates[0] ? String(candidates[0].npc.id || candidates[0].npc.姓名 || '') : '';
        setSelectedKey(firstKey);
        if (candidates[0]) {
            setSession(创建战术交锋会话({
                targetName: candidates[0].npc.姓名,
                npcId: candidates[0].npc.id,
                mode: '切磋试探'
            }));
        } else {
            setSession(null);
        }
    }, [open]);

    const playerProfile = useMemo(() => 构建主角明牌交锋面板(role), [role]);
    const selectedTarget = useMemo(
        () => candidates.find((c) => String(c.npc.id || c.npc.姓名 || '') === selectedKey) || candidates[0] || null,
        [candidates, selectedKey]
    );
    const enemyProfile = useMemo(
        () => selectedTarget ? 构建NPC明牌交锋面板(selectedTarget.npc, directorBible) : null,
        [selectedTarget, directorBible]
    );

    if (!open) return null;

    const restartSession = (targetName: string, npcId: string | undefined, nextMode: '切磋试探' | '生死交锋') => {
        setCommittedMsg('');
        setUseSignature(false);
        setSession(创建战术交锋会话({ targetName, npcId, mode: nextMode }));
    };

    const handleMove = (moveId: TacticalMoveId) => {
        if (!session || !enemyProfile || session.finished || loading) return;
        const nextSession = 推演交锋一拍(session, moveId, playerProfile, enemyProfile, useSignature);
        setSession(nextSession);
        setUseSignature(false);
    };

    const handleCommitOutcome = () => {
        if (!session || !session.finished) return;
        const settled = 结算战术交锋结果({ session, role });
        onCommitClash(settled);
        setCommittedMsg(`战果已写入待注入队列，并在下次主剧情发送时承接：${settled.record.战果摘要}`);
    };

    const dynamicTips = useMemo(() => {
        const list = [...playerProfile.upgradeTips];
        if (enemyProfile && enemyProfile.offense - playerProfile.offense >= 3) {
            list.unshift(`对方攻势高出你 ${enemyProfile.offense - playerProfile.offense} 点，硬拼极吃亏；建议盯准征兆多用【卸力借势】打反手或【借势脱身】！`);
        }
        return list.slice(0, 3);
    }, [playerProfile, enemyProfile]);

    return (
        <div className="fixed inset-0 z-[230] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
            <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-wuxia-gold/35 bg-ink-black/95 shadow-[0_20px_60px_rgba(0,0,0,0.75)] overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-gray-800 bg-black/50 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-serif font-bold tracking-wider text-wuxia-gold">直观战术交锋 · 明牌对阵</span>
                        <select
                            value={selectedKey}
                            onChange={(e) => {
                                const k = e.target.value;
                                setSelectedKey(k);
                                const found = candidates.find((c) => String(c.npc.id || c.npc.姓名 || '') === k);
                                if (found) restartSession(found.npc.姓名, found.npc.id, mode);
                            }}
                            className="bg-black/70 border border-gray-700 rounded px-2.5 py-1 text-xs text-paper-white outline-none focus:border-wuxia-gold"
                        >
                            {candidates.length === 0 && <option value="">（当前没有在场可交手对象）</option>}
                            {candidates.map(({ npc }) => {
                                const key = String(npc.id || npc.姓名 || '');
                                return <option key={key} value={key}>{npc.姓名}（{npc.境界 || '未知'}）</option>;
                            })}
                        </select>
                        <div className="flex items-center gap-1">
                            {(['切磋试探', '生死交锋'] as const).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => {
                                        setMode(m);
                                        if (selectedTarget) restartSession(selectedTarget.npc.姓名, selectedTarget.npc.id, m);
                                    }}
                                    className={`px-2 py-1 rounded text-[11px] border ${mode === m ? 'border-wuxia-gold bg-wuxia-gold/20 text-wuxia-gold' : 'border-gray-700 text-gray-400'}`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {onOpenSettings && (
                            <button type="button" onClick={onOpenSettings} className="px-2 py-1 text-[11px] rounded border border-gray-700 text-gray-400 hover:text-wuxia-cyan">
                                插件设置
                            </button>
                        )}
                        <button type="button" onClick={onClose} className="px-2.5 py-1 text-xs rounded border border-gray-700 text-gray-300 hover:text-white">
                            关闭
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4">
                    {!selectedTarget || !enemyProfile || !session ? (
                        <div className="py-10 text-center text-xs text-gray-400">
                            当前没有在场的交手人物。请先在主剧情中接触目标人物后再开启明牌交锋。
                        </div>
                    ) : (
                        <>
                            {/* Transparent Breakdown */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="rounded-xl border border-wuxia-gold/30 bg-black/40 p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-wuxia-gold">{playerProfile.name}（{playerProfile.realm}）</span>
                                        <span className="text-xs text-amber-200">攻 {playerProfile.offense} / 守 {playerProfile.defense} / 敏 {playerProfile.agility}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                                        {[...playerProfile.offenseReasons, ...playerProfile.defenseReasons, ...playerProfile.agilityReasons].map((r, idx) => (
                                            <span key={`pr-${idx}`} className={`px-2 py-0.5 rounded border ${r.delta >= 0 ? 'border-gray-700 bg-black/50 text-gray-300' : 'border-red-500/40 bg-red-950/30 text-red-300'}`}>
                                                {r.label} {r.delta >= 0 ? `+${r.delta}` : r.delta}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-cyan-500/30 bg-black/40 p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-wuxia-cyan">{enemyProfile.name}（{enemyProfile.realm}）</span>
                                        <span className="text-xs text-cyan-200">攻 {enemyProfile.offense} / 守 {enemyProfile.defense} / 敏 {enemyProfile.agility}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                                        {[...enemyProfile.offenseReasons, ...enemyProfile.defenseReasons, ...enemyProfile.agilityReasons].map((r, idx) => (
                                            <span key={`er-${idx}`} className="px-2 py-0.5 rounded border border-gray-700 bg-black/50 text-gray-300">
                                                {r.label} +{r.delta}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Actionable Upgrade Guidance */}
                            {dynamicTips.length > 0 && (
                                <div className="rounded-xl border border-amber-500/25 bg-amber-950/15 px-3 py-2 text-xs text-amber-200/90 space-y-1">
                                    <div className="font-semibold text-amber-300">战前明牌诊断与变强指引：</div>
                                    {dynamicTips.map((tip, idx) => (
                                        <div key={`tip-${idx}`}>· {tip}</div>
                                    ))}
                                </div>
                            )}

                            {/* Live Posture & Controls */}
                            <div className="rounded-xl border border-gray-800 bg-black/45 p-3 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-amber-200">我方架势：{session.playerPosture}%</span>
                                            <span className="text-gray-400">气力：{session.playerStamina}/{playerProfile.maxStamina} · 胜势 {session.momentum >= 0 ? `+${session.momentum}` : session.momentum}</span>
                                        </div>
                                        <div className="h-2.5 rounded-full bg-gray-800 overflow-hidden">
                                            <div className="h-full bg-wuxia-gold transition-all" style={{ width: `${session.playerPosture}%` }} />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-cyan-200">{session.targetName} 架势：{session.enemyPosture}%</span>
                                            <span className="text-red-300">{session.enemyExposed ? '【破绽已露 +3】' : `第 ${session.beat} 拍`}</span>
                                        </div>
                                        <div className="h-2.5 rounded-full bg-gray-800 overflow-hidden">
                                            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${session.enemyPosture}%` }} />
                                        </div>
                                    </div>
                                </div>

                                {!session.finished ? (
                                    <>
                                        <div className="rounded-lg border border-red-500/25 bg-red-950/15 px-3 py-2 text-xs text-red-200">
                                            对手动作征兆：{session.nextEnemyTelegraph}
                                        </div>

                                        {playerProfile.signatureArtName && (
                                            <label className="flex items-center gap-2 text-xs text-wuxia-gold cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={useSignature}
                                                    disabled={session.playerStamina < 1}
                                                    onChange={(e) => setUseSignature(e.target.checked)}
                                                />
                                                催动绝学《{playerProfile.signatureArtName}》（多耗 1 气力，本拍 +3 压制力）
                                            </label>
                                        )}

                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                            {MOVE_BUTTONS.map((btn) => {
                                                const disabled = (btn.id === 'press' && session.playerStamina < (useSignature ? 2 : 1)) || loading;
                                                return (
                                                    <button
                                                        key={btn.id}
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => handleMove(btn.id)}
                                                        className={`rounded-xl border p-2.5 text-left transition-all disabled:opacity-35 ${btn.tone}`}
                                                    >
                                                        <div className="text-xs font-bold">{btn.title}</div>
                                                        <div className="text-[10px] opacity-80 mt-0.5 leading-4">{btn.subtitle}</div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : (
                                    <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/20 p-3 flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-xs text-emerald-200">
                                            交锋已分结果：<span className="font-bold text-wuxia-gold">{session.outcome}</span>（共 {session.logs.length} 拍）
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => restartSession(session.targetName, session.npcId, mode)}
                                                className="px-3 py-1 rounded border border-gray-700 text-xs text-gray-300 hover:text-white"
                                            >
                                                重新演练
                                            </button>
                                            <button
                                                type="button"
                                                disabled={Boolean(committedMsg)}
                                                onClick={handleCommitOutcome}
                                                className="px-3 py-1 rounded border border-wuxia-gold bg-wuxia-gold/20 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold hover:text-ink-black disabled:opacity-45"
                                            >
                                                {committedMsg ? '已落账并暂存' : '结算体力并写入主剧情'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {committedMsg && (
                                    <div className="text-xs text-emerald-200 border border-emerald-500/30 bg-emerald-950/25 rounded px-3 py-2">
                                        {committedMsg}
                                    </div>
                                )}
                            </div>

                            {/* Beat Log */}
                            {session.logs.length > 0 && (
                                <div className="rounded-xl border border-gray-800 bg-black/35 p-3 space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                                    <div className="text-[11px] text-gray-400">出招拆解实录</div>
                                    {session.logs.map((l) => (
                                        <div key={`beat-${l.beat}`} className="text-xs text-gray-200 border-l-2 border-wuxia-gold/40 pl-2 leading-5">
                                            {l.summary}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {pendingClashes.length > 0 && (
                        <div className="rounded-xl border border-gray-800 bg-black/35 p-3 space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-gray-400">
                                <span>已暂存待写入下一回合主剧情的交锋战果（{pendingClashes.length} 条）：</span>
                                <button type="button" onClick={onClearClashes} className="text-[11px] text-red-300 hover:underline">清空待注入战果</button>
                            </div>
                            {pendingClashes.map((c) => (
                                <div key={c.id} className="text-xs text-cyan-200/90 border-l-2 border-cyan-500/50 pl-2">{c.战果摘要}</div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TacticalClashModal;
