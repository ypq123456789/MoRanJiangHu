import React, { useEffect, useMemo, useState } from 'react';
import type { DirectorWorldBible } from '../../../models/directorBible';
import {
    评估NPC交易资格,
    执行情境交易结算,
    提取交易对方库存列表,
    提取主角可交易物品列表,
    检测当前交易场所,
    type ExecuteTradeResult
} from '../../../engine/plugins/tradePlugin';
import type {
    NPC结构,
    OpeningConfig,
    世界数据结构,
    场外交易记录结构,
    角色数据结构
} from '../../../types';
import { 构建角色金钱显示快照, 获取货币显示模式, 计算角色货币底层总值 } from '../../../utils/currencyDisplay';
import { 角色对话确认键 } from '../../../utils/roleChatLocation';

interface Props {
    open: boolean;
    loading: boolean;
    role: 角色数据结构;
    env: any;
    world?: Partial<世界数据结构> | null;
    social: NPC结构[];
    directorBible?: DirectorWorldBible | null;
    openingConfig?: OpeningConfig | null;
    pendingTrades: 场外交易记录结构[];
    onApplyTrade: (result: Required<Pick<ExecuteTradeResult, 'nextRole' | 'nextSocial' | 'record'>>) => void;
    onClearTrades: () => void;
    onClose: () => void;
    onOpenSettings?: () => void;
}

const TradePluginModal: React.FC<Props> = ({
    open,
    loading,
    role,
    env,
    world,
    social,
    directorBible,
    openingConfig,
    pendingTrades,
    onApplyTrade,
    onClearTrades,
    onClose,
    onOpenSettings
}) => {
    const venueInfo = useMemo(() => 检测当前交易场所(env, world, directorBible), [env, world, directorBible]);
    const npcCandidates = useMemo(() => {
        return (Array.isArray(social) ? social : [])
            .map((npc) => ({
                npc,
                eligibility: 评估NPC交易资格(npc, env, directorBible)
            }))
            .sort((a, b) => {
                if (a.eligibility.eligible !== b.eligibility.eligible) return a.eligibility.eligible ? -1 : 1;
                return String(a.npc?.姓名 || '').localeCompare(String(b.npc?.姓名 || ''), 'zh-CN');
            });
    }, [social, env, directorBible]);

    const [mode, setMode] = useState<'npc' | 'venue'>('npc');
    const [selectedNpcKey, setSelectedNpcKey] = useState('');
    const [confirmedLocationKey, setConfirmedLocationKey] = useState('');
    const [offerQtys, setOfferQtys] = useState<Record<string, number>>({});
    const [buyQtys, setBuyQtys] = useState<Record<string, number>>({});
    const [cashPaidBase, setCashPaidBase] = useState<number>(0);
    const [cashReceivedBase, setCashReceivedBase] = useState<number>(0);
    const [barterNote, setBarterNote] = useState('');
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    useEffect(() => {
        if (!open) return;
        setFeedback(null);
        setOfferQtys({});
        setBuyQtys({});
        setCashPaidBase(0);
        setCashReceivedBase(0);
        setBarterNote('');
        setConfirmedLocationKey('');
        const firstEligible = npcCandidates.find((c) => c.eligibility.eligible) || npcCandidates[0];
        if (!firstEligible?.eligibility.eligible && venueInfo.available) {
            setMode('venue');
        } else {
            setMode('npc');
        }
        setSelectedNpcKey(firstEligible ? String(firstEligible.npc.id || firstEligible.npc.姓名 || '') : '');
    }, [open]);

    const resetCart = () => {
        setOfferQtys({});
        setBuyQtys({});
        setCashPaidBase(0);
        setCashReceivedBase(0);
        setBarterNote('');
        setFeedback(null);
    };

    const selectedEntry = useMemo(
        () => npcCandidates.find((c) => String(c.npc.id || c.npc.姓名 || '') === selectedNpcKey) || npcCandidates[0] || null,
        [npcCandidates, selectedNpcKey]
    );

    const playerWallet = useMemo(
        () => 构建角色金钱显示快照(role?.金钱, openingConfig, role),
        [role, openingConfig]
    );
    const playerBaseMoney = useMemo(
        () => 计算角色货币底层总值(role?.金钱, openingConfig?.modeRuntimeProfile, 获取货币显示模式(openingConfig, role)),
        [role, openingConfig]
    );
    const playerItems = useMemo(() => 提取主角可交易物品列表(role), [role]);

    const { items: counterpartyItems, purseBase } = useMemo(() => 提取交易对方库存列表({
        targetType: mode,
        npc: mode === 'npc' ? selectedEntry?.npc : null,
        venue: mode === 'venue' ? venueInfo : null,
        openingConfig,
        turnSeed: pendingTrades.length + 1
    }), [mode, selectedEntry, venueInfo, openingConfig, pendingTrades.length]);

    if (!open) return null;

    const npcConfirmKey = selectedEntry?.npc ? 角色对话确认键(selectedEntry.npc, env) : '';
    const locationConfirmed = mode === 'venue'
        || Boolean(selectedEntry && (!selectedEntry.eligibility.locationCheck.需要确认 || (npcConfirmKey && confirmedLocationKey === npcConfirmKey)));

    const activeMultiplier = mode === 'venue' ? 1.05 : (selectedEntry?.eligibility.priceMultiplier ?? 1);
    const effectivePurse = mode === 'venue' ? purseBase : (selectedEntry?.eligibility.maxBuyBudgetBase ?? purseBase);
    const canTradeWithCurrentTarget = mode === 'venue'
        ? venueInfo.available
        : Boolean(selectedEntry?.eligibility.eligible && locationConfirmed);

    const offeredList = playerItems
        .map((it) => ({
            item: it,
            qty: Math.min(it.quantity, Math.max(0, Math.floor(offerQtys[it.id] || 0)))
        }))
        .filter((x) => !x.item.equippedLocked && x.qty > 0);

    const boughtList = counterpartyItems
        .map((it) => ({
            item: it,
            qty: Math.min(it.quantity, Math.max(0, Math.floor(buyQtys[it.id] || 0)))
        }))
        .filter((x) => x.qty > 0);

    const playerOfferValue = Math.max(0, Math.floor(cashPaidBase || 0))
        + offeredList.reduce((acc, x) => acc + Math.round(x.item.unitPriceBase * 0.7) * x.qty, 0);
    const counterpartyAskValue = Math.max(0, Math.floor(cashReceivedBase || 0))
        + boughtList.reduce((acc, x) => acc + Math.round(x.item.unitPriceBase * activeMultiplier) * x.qty, 0);

    const handleConfirmTrade = () => {
        if (loading || !canTradeWithCurrentTarget) return;
        const targetName = mode === 'venue' ? venueInfo.venueName : (selectedEntry?.npc?.姓名 || '对方');
        const res = 执行情境交易结算({
            targetType: mode,
            targetName,
            npcId: mode === 'npc' ? selectedEntry?.npc?.id : undefined,
            locationLabel: venueInfo.venueName || String(env?.具体地点 || env?.小地点 || '当前场景'),
            role,
            social,
            openingConfig,
            playerItemsOffered: offeredList.map((x) => ({
                name: x.item.name,
                quantity: x.qty,
                unitPriceBase: x.item.unitPriceBase
            })),
            counterpartyItemsBought: boughtList.map((x) => ({
                name: x.item.name,
                type: x.item.type,
                description: x.item.description,
                quantity: x.qty,
                unitPriceBase: x.item.unitPriceBase
            })),
            playerCashPaidBase: cashPaidBase,
            playerCashReceivedBase: cashReceivedBase,
            priceMultiplier: activeMultiplier,
            maxCounterpartyPurseBase: effectivePurse,
            barterNote: barterNote.trim() || undefined
        });

        if (!res.ok || !res.nextRole || !res.nextSocial || !res.record) {
            setFeedback({ type: 'err', text: res.error || '交易未达成。' });
            return;
        }
        onApplyTrade({ nextRole: res.nextRole, nextSocial: res.nextSocial, record: res.record });
        resetCart();
        setFeedback({ type: 'ok', text: `已成交并落账：${res.record.成交摘要}` });
    };

    return (
        <div className="fixed inset-0 z-[230] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
            <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-wuxia-gold/35 bg-ink-black/95 shadow-[0_20px_60px_rgba(0,0,0,0.75)] overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-gray-800 bg-black/50 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-serif font-bold tracking-wider text-wuxia-gold">情境交易</span>
                        <span className="text-[11px] text-gray-400">·</span>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => { setMode('npc'); resetCart(); }}
                                className={`px-2.5 py-1 rounded text-xs border transition-colors ${mode === 'npc' ? 'border-wuxia-gold bg-wuxia-gold/20 text-wuxia-gold' : 'border-gray-700 text-gray-400 hover:text-gray-200'}`}
                            >
                                与在场人物交易
                            </button>
                            <button
                                type="button"
                                onClick={() => { setMode('venue'); resetCart(); }}
                                className={`px-2.5 py-1 rounded text-xs border transition-colors ${mode === 'venue' ? 'border-wuxia-gold bg-wuxia-gold/20 text-wuxia-gold' : 'border-gray-700 text-gray-400 hover:text-gray-200'}`}
                            >
                                交易场所（{venueInfo.available ? venueInfo.venueType : '非商区'}）
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {onOpenSettings && (
                            <button
                                type="button"
                                onClick={onOpenSettings}
                                className="px-2 py-1 text-[11px] rounded border border-gray-700 text-gray-400 hover:text-wuxia-cyan"
                            >
                                插件设置
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-2.5 py-1 text-xs rounded border border-gray-700 text-gray-300 hover:text-white"
                        >
                            关闭
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4">
                    {/* Context Banner */}
                    {mode === 'npc' ? (
                        <div className="rounded-xl border border-gray-800 bg-black/40 p-3 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <label className="text-xs text-gray-400">选择在场人物：</label>
                                <select
                                    value={selectedNpcKey}
                                    onChange={(e) => { setSelectedNpcKey(e.target.value); resetCart(); setConfirmedLocationKey(''); }}
                                    className="flex-1 min-w-[220px] max-w-sm bg-black/70 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-paper-white outline-none focus:border-wuxia-gold"
                                >
                                    {npcCandidates.length === 0 && <option value="">暂无已建档人物</option>}
                                    {npcCandidates.map(({ npc, eligibility }) => {
                                        const key = String(npc.id || npc.姓名 || '');
                                        return (
                                            <option key={key} value={key}>
                                                {npc.姓名}（{eligibility.attitudeLabel}）
                                            </option>
                                        );
                                    })}
                                </select>
                                {selectedEntry && (
                                    <span className={`px-2 py-0.5 rounded-full text-[11px] border ${selectedEntry.eligibility.eligible ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300' : 'border-red-500/40 bg-red-950/30 text-red-300'}`}>
                                        {selectedEntry.eligibility.attitudeLabel}
                                        {selectedEntry.eligibility.eligible ? ` · 开价倍率 ${activeMultiplier.toFixed(2)}x` : ''}
                                    </span>
                                )}
                            </div>
                            {selectedEntry && (
                                <div className={`text-xs leading-6 ${selectedEntry.eligibility.eligible ? 'text-gray-300' : 'text-red-300'}`}>
                                    {selectedEntry.eligibility.reason}
                                    {selectedEntry.eligibility.eligible && selectedEntry.eligibility.locationCheck.需要确认 && !locationConfirmed && (
                                        <button
                                            type="button"
                                            onClick={() => setConfirmedLocationKey(npcConfirmKey)}
                                            className="ml-2 px-2.5 py-0.5 rounded border border-amber-400/60 bg-amber-950/30 text-amber-200 hover:bg-amber-900/40"
                                        >
                                            确认对方此刻就在面前可当面交易
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={`rounded-xl border p-3 text-xs leading-6 ${venueInfo.available ? 'border-wuxia-gold/30 bg-wuxia-gold/5 text-gray-200' : 'border-red-500/35 bg-red-950/20 text-red-200'}`}>
                            <div className="font-semibold text-wuxia-gold mb-1">当前所在：{venueInfo.venueName}</div>
                            <div>{venueInfo.description}</div>
                        </div>
                    )}

                    {/* Dual Inventory Ledger */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Protagonist Offer */}
                        <div className="rounded-xl border border-gray-800 bg-black/35 p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-wuxia-gold">己方随身行囊与货币</span>
                                <span className="text-[11px] text-amber-200">{playerWallet.显示}</span>
                            </div>
                            <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                {playerItems.length === 0 ? (
                                    <div className="text-xs text-gray-500 py-4 text-center">行囊暂无可交易物件</div>
                                ) : playerItems.map((item) => {
                                    const picked = offerQtys[item.id] || 0;
                                    return (
                                        <div key={item.id} className="rounded-lg border border-gray-800/80 bg-black/40 p-2 flex items-center justify-between gap-2 text-xs">
                                            <div className="min-w-0">
                                                <div className="text-gray-200 font-medium truncate">
                                                    {item.name} <span className="text-gray-500">×{item.quantity}</span>
                                                    {item.equippedLocked && <span className="ml-1 text-[10px] text-amber-400">[已装备不可售]</span>}
                                                </div>
                                                <div className="text-[10px] text-gray-500 truncate">估价折现 {Math.round(item.unitPriceBase * 0.7)}/件 · {item.type}</div>
                                            </div>
                                            {!item.equippedLocked && (
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => setOfferQtys((prev) => ({ ...prev, [item.id]: Math.max(0, picked - 1) }))}
                                                        className="w-6 h-6 rounded border border-gray-700 text-gray-300 hover:border-wuxia-gold"
                                                    >-</button>
                                                    <span className="w-5 text-center text-amber-200">{picked}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setOfferQtys((prev) => ({ ...prev, [item.id]: Math.min(item.quantity, picked + 1) }))}
                                                        className="w-6 h-6 rounded border border-gray-700 text-gray-300 hover:border-wuxia-gold"
                                                    >+</button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between gap-2 text-xs">
                                <span className="text-gray-400">己方搭付现银（基础单位，上限 {playerBaseMoney}）：</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={playerBaseMoney}
                                    value={cashPaidBase}
                                    onChange={(e) => setCashPaidBase(Math.max(0, Math.min(playerBaseMoney, Math.floor(Number(e.target.value) || 0))))}
                                    className="w-24 bg-black/70 border border-gray-700 rounded px-2 py-1 text-right text-amber-200 outline-none focus:border-wuxia-gold"
                                />
                            </div>
                        </div>

                        {/* Counterparty Stock */}
                        <div className="rounded-xl border border-gray-800 bg-black/35 p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-wuxia-cyan">对方现货与随身钱袋</span>
                                <span className="text-[11px] text-cyan-200">现银上限 {effectivePurse}</span>
                            </div>
                            {!canTradeWithCurrentTarget ? (
                                <div className="text-xs text-gray-500 py-8 text-center">
                                    {mode === 'venue' ? '当前并非可交易场所，无法查看柜台货物。' : '请先满足在场与非敌对条件，方可查看对方交易物品。'}
                                </div>
                            ) : (
                                <>
                                    <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                        {counterpartyItems.map((item) => {
                                            const picked = buyQtys[item.id] || 0;
                                            const askPrice = Math.round(item.unitPriceBase * activeMultiplier);
                                            return (
                                                <div key={item.id} className="rounded-lg border border-gray-800/80 bg-black/40 p-2 flex items-center justify-between gap-2 text-xs">
                                                    <div className="min-w-0">
                                                        <div className="text-gray-200 font-medium truncate">{item.name} <span className="text-gray-500">×{item.quantity}</span></div>
                                                        <div className="text-[10px] text-gray-500 truncate">要价 {askPrice}/件 · {item.description}</div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setBuyQtys((prev) => ({ ...prev, [item.id]: Math.max(0, picked - 1) }))}
                                                            className="w-6 h-6 rounded border border-gray-700 text-gray-300 hover:border-wuxia-cyan"
                                                        >-</button>
                                                        <span className="w-5 text-center text-cyan-200">{picked}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setBuyQtys((prev) => ({ ...prev, [item.id]: Math.min(item.quantity, picked + 1) }))}
                                                            className="w-6 h-6 rounded border border-gray-700 text-gray-300 hover:border-wuxia-cyan"
                                                        >+</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between gap-2 text-xs">
                                        <span className="text-gray-400">索取折现找零（上限 {effectivePurse}）：</span>
                                        <input
                                            type="number"
                                            min={0}
                                            max={effectivePurse}
                                            value={cashReceivedBase}
                                            onChange={(e) => setCashReceivedBase(Math.max(0, Math.min(effectivePurse, Math.floor(Number(e.target.value) || 0))))}
                                            className="w-24 bg-black/70 border border-gray-700 rounded px-2 py-1 text-right text-cyan-200 outline-none focus:border-wuxia-cyan"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Deal Summary + Optional Note + Pending List */}
                    <div className="rounded-xl border border-wuxia-gold/25 bg-black/45 p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div>
                                己方总筹码：<span className="text-amber-300 font-bold">{playerOfferValue}</span>
                                <span className="mx-2 text-gray-600">|</span>
                                对方总要价：<span className="text-cyan-300 font-bold">{counterpartyAskValue}</span>
                                <span className="ml-2 text-gray-400">
                                    ({playerOfferValue >= counterpartyAskValue ? '已满足底价，可立即成交' : `尚差 ${counterpartyAskValue - playerOfferValue} 价值`})
                                </span>
                            </div>
                            <button
                                type="button"
                                disabled={loading || !canTradeWithCurrentTarget}
                                onClick={handleConfirmTrade}
                                className="px-4 py-1.5 rounded-lg border border-wuxia-gold bg-wuxia-gold/20 text-xs font-bold text-wuxia-gold hover:bg-wuxia-gold hover:text-ink-black transition-colors disabled:opacity-40"
                            >
                                确认落账成交
                            </button>
                        </div>
                        <input
                            type="text"
                            value={barterNote}
                            onChange={(e) => setBarterNote(e.target.value)}
                            placeholder="可选附言：如“以此物抵先前人情”或“当面验货封匣”..."
                            className="w-full bg-black/60 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-wuxia-gold"
                        />
                        {feedback && (
                            <div className={`text-xs px-2.5 py-1.5 rounded border ${feedback.type === 'ok' ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200' : 'border-red-500/40 bg-red-950/30 text-red-200'}`}>
                                {feedback.text}
                            </div>
                        )}
                    </div>

                    {pendingTrades.length > 0 && (
                        <div className="rounded-xl border border-gray-800 bg-black/35 p-3 space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-gray-400">
                                <span>已暂存待写入下一回合主剧情的交易事实（{pendingTrades.length} 条）：</span>
                                <button type="button" onClick={onClearTrades} className="text-[11px] text-red-300 hover:underline">清空待注入记录</button>
                            </div>
                            {pendingTrades.map((t) => (
                                <div key={t.id} className="text-xs text-amber-200/90 border-l-2 border-wuxia-gold/50 pl-2">{t.成交摘要}</div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TradePluginModal;
