import React, { useMemo, useState } from 'react';
import { 世界数据结构 } from '../../../models/world';
import { normalizeCanonicalGameTime, 结构化时间转标准串 } from '../../../hooks/useGame/timeUtils';
import { IconMapPin } from '../../ui/Icons';
import { 势力关系图边, 势力关系图节点, 构建世界显示名解析器, 构建势力关系图数据 } from '../../../utils/worldFactionRelations';

interface Props {
    world: 世界数据结构;
    worldEvolutionEnabled?: boolean;
    worldEvolutionUpdating?: boolean;
    worldEvolutionStatus?: string;
    worldEvolutionLastUpdatedAt?: string | null;
    worldEvolutionLastSummary?: string[];
    worldEvolutionLastRawText?: string;
    onForceUpdate?: () => Promise<string | null> | string | null;
    onClose: () => void;
}

type TabType = 'events' | 'npcs' | 'overview';

const 转标准时间串 = (value: unknown): string | null => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const direct = 结构化时间转标准串(value);
        if (direct) return direct;
        const source = value as Record<string, unknown>;
        for (const key of ['归档时间', '开始时间', '预计结束时间', '结算时间', '行动开始时间', '行动结束时间', '计划执行时间', '最早执行时间', '最晚执行时间', '触发时间']) {
            const normalized = 转标准时间串(source[key]);
            if (normalized) return normalized;
        }
        return null;
    }
    if (typeof value !== 'string') return null;
    return normalizeCanonicalGameTime(value.trim());
};

const 格式化时间展示 = (value: unknown): string => {
    const canonical = 转标准时间串(value);
    if (!canonical) return '未知时间';
    const match = canonical.match(/^(\d{1,6}):(\d{2}):(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return canonical;
    return `${match[1]}年${match[2]}月${match[3]}日 ${match[4]}:${match[5]}`;
};

const 取数组 = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const 取数字数组 = (value: unknown): number[] => Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : [];

const 取文本 = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const 清洗数组显示名 = (values: unknown, resolveName: (value: unknown, fallback?: string) => string): string[] => (
    Array.isArray(values) ? values : []
)
    .map((item) => resolveName(item))
    .filter(Boolean);

const 移动势力图颜色 = (tone: 势力关系图边['tone']): { line: string; badge: string } => {
    if (tone === 'bad') return { line: '#ef4444', badge: 'border-red-500/45 bg-red-500/10 text-red-200' };
    if (tone === 'good') return { line: '#22c55e', badge: 'border-emerald-500/45 bg-emerald-500/10 text-emerald-100' };
    return { line: '#9ca3af', badge: 'border-gray-500/45 bg-white/5 text-gray-200' };
};

const 移动势力关系图: React.FC<{ nodes: 势力关系图节点[]; edges: 势力关系图边[] }> = ({ nodes, edges }) => {
    if (nodes.length < 2) return null;
    return (
        <div className="world-faction-graph rounded-3xl border border-orange-900/25 bg-black/35 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold tracking-widest text-orange-300">势力关系图</div>
                <div className="text-[10px] text-gray-500">{edges.length} 条</div>
            </div>
            <div className="world-faction-graph-canvas relative aspect-square min-h-[260px] overflow-hidden rounded-2xl border border-gray-800 bg-[radial-gradient(circle_at_center,rgba(120,72,24,0.22),rgba(0,0,0,0.18)_60%,rgba(0,0,0,0.35))]">
                <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" role="img" aria-label="势力关系连线图">
                    {edges.map((edge, idx) => {
                        const color = 移动势力图颜色(edge.tone).line;
                        const midX = (edge.sourceX + edge.targetX) / 2;
                        const midY = (edge.sourceY + edge.targetY) / 2;
                        return (
                            <g key={`${edge.sourceId}-${edge.targetId}-${edge.relation}-${idx}`}>
                                <line
                                    x1={edge.sourceX}
                                    y1={edge.sourceY}
                                    x2={edge.targetX}
                                    y2={edge.targetY}
                                    stroke={color}
                                    strokeWidth={edge.tone === 'neutral' ? 0.48 : 0.72}
                                    strokeOpacity={edge.tone === 'neutral' ? 0.62 : 0.9}
                                />
                                <text x={midX} y={midY - 1.2} textAnchor="middle" className="world-faction-edge-label fill-gray-200 text-[3px] font-semibold">
                                    {edge.relation}
                                </text>
                            </g>
                        );
                    })}
                </svg>
                {nodes.map((node) => (
                    <div
                        key={node.id}
                        className="world-faction-node absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-orange-300/45 bg-[#24160e]/95 px-1.5 text-center text-[11px] font-bold leading-4 text-orange-100 shadow-[0_0_20px_rgba(251,146,60,0.18)]"
                        style={{ left: `${node.x}%`, top: `${node.y}%` }}
                        title={node.name}
                    >
                        <span className="line-clamp-2 break-all">{node.name}</span>
                    </div>
                ))}
            </div>
            <div className="mt-2 flex flex-wrap justify-end gap-1.5 text-[9px]">
                <span className={`rounded-full border px-2 py-0.5 ${移动势力图颜色('good').badge}`}>绿 好</span>
                <span className={`rounded-full border px-2 py-0.5 ${移动势力图颜色('neutral').badge}`}>灰 中立</span>
                <span className={`rounded-full border px-2 py-0.5 ${移动势力图颜色('bad').badge}`}>红 差</span>
            </div>
        </div>
    );
};

const MobileWorldModal: React.FC<Props> = ({
    world,
    worldEvolutionEnabled = false,
    worldEvolutionUpdating = false,
    worldEvolutionStatus = '',
    worldEvolutionLastUpdatedAt = null,
    worldEvolutionLastSummary = [],
    worldEvolutionLastRawText = '',
    onForceUpdate,
    onClose
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('events');
    const [localNotice, setLocalNotice] = useState('');
    const [showRawMessage, setShowRawMessage] = useState(false);

    const 待执行事件 = useMemo(() => Array.isArray(world?.待执行事件) ? world.待执行事件 : [], [world]);
    const 进行中事件 = useMemo(() => Array.isArray(world?.进行中事件) ? world.进行中事件 : [], [world]);
    const 已结算事件 = useMemo(() => Array.isArray(world?.已结算事件) ? world.已结算事件 : [], [world]);
    const 活跃NPC列表 = useMemo(() => Array.isArray(world?.活跃NPC列表) ? world.活跃NPC列表 : [], [world]);
    const 世界镜头规划 = useMemo(() => Array.isArray(world?.世界镜头规划) ? world.世界镜头规划 : [], [world]);
    const 江湖史册 = useMemo(() => Array.isArray(world?.江湖史册) ? world.江湖史册 : [], [world]);
    const 势力列表 = useMemo(() => Array.isArray(world?.势力列表) ? world.势力列表 : [], [world]);
    const 势力互动历史 = useMemo(() => Array.isArray(world?.势力互动历史) ? world.势力互动历史 : [], [world]);
    const 拍卖行待投放物品 = useMemo(() => Array.isArray(world?.拍卖行待投放物品) ? world.拍卖行待投放物品 : [], [world]);
    const 势力关系图数据 = useMemo(() => 构建势力关系图数据(势力列表), [势力列表]);
    const 解析世界显示名 = useMemo(() => 构建世界显示名解析器(势力列表), [势力列表]);
    const 显示关联列表 = (values: unknown): string[] => 清洗数组显示名(values, 解析世界显示名);
    const 显示单名 = (value: unknown, fallback = ''): string => 解析世界显示名(value, fallback);

    const hasRawMessage = typeof worldEvolutionLastRawText === 'string' && worldEvolutionLastRawText.trim().length > 0;

    const handleForceUpdate = async () => {
        if (!onForceUpdate || worldEvolutionUpdating) return;
        const result = await onForceUpdate();
        if (typeof result === 'string' && result.trim().length > 0) {
            setLocalNotice(result.trim());
            window.setTimeout(() => setLocalNotice(''), 2000);
        }
    };

    return (
        <div className="fixed inset-0 z-[220] bg-black/95 backdrop-blur-md md:hidden">
            <div className="world-modal-body flex h-full flex-col bg-gradient-to-b from-[#050505] via-black to-[#090909] text-gray-100">
                <div className="shrink-0 border-b border-wuxia-gold/15 bg-black/70 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="text-lg font-bold tracking-[0.18em] text-wuxia-gold">天下大势</div>
                            <div className="mt-1 text-[11px] leading-5 text-gray-400">纵览群英万象与山川地理。</div>
                            {worldEvolutionLastUpdatedAt && (
                                <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-wuxia-gold/20 bg-black/60 px-3 py-1 text-[10px] text-wuxia-gold/75">
                                    <span className="truncate">最近显化：{worldEvolutionLastUpdatedAt}</span>
                                </div>
                            )}
                        </div>
                        <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-700 bg-black/60 text-gray-300">×</button>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-2xl border border-wuxia-gold/10 bg-white/[0.03] px-2 py-2 text-center">
                            <div className="text-[10px] tracking-[0.2em] text-gray-500">待执行</div>
                            <div className="mt-1 text-base font-bold text-wuxia-gold">{待执行事件.length}</div>
                        </div>
                        <div className="rounded-2xl border border-cyan-500/10 bg-white/[0.03] px-2 py-2 text-center">
                            <div className="text-[10px] tracking-[0.2em] text-gray-500">进行中</div>
                            <div className="mt-1 text-base font-bold text-wuxia-red">{进行中事件.length}</div>
                        </div>
                        <div className="rounded-2xl border border-gray-700 bg-white/[0.03] px-2 py-2 text-center">
                            <div className="text-[10px] tracking-[0.2em] text-gray-500">势力</div>
                            <div className="mt-1 text-base font-bold text-gray-200">{势力列表.length}</div>
                        </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => { void handleForceUpdate(); }}
                            disabled={!worldEvolutionEnabled || worldEvolutionUpdating}
                            className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${
                                !worldEvolutionEnabled
                                    ? 'cursor-not-allowed border-gray-800 bg-black/50 text-gray-500'
                                    : worldEvolutionUpdating
                                        ? 'border-wuxia-gold/50 bg-wuxia-gold/10 text-wuxia-gold'
                                        : 'border-wuxia-gold/35 bg-black/60 text-wuxia-gold'
                            }`}
                        >
                            {worldEvolutionUpdating ? '推演中…' : '拨弄天机'}
                        </button>
                        <div className="min-w-0 flex-[1.2] rounded-2xl border border-gray-800 bg-black/40 px-3 py-3 text-[11px] leading-5 text-gray-400">
                            <div className="truncate text-gray-300">{localNotice || worldEvolutionStatus || '系统静默'}</div>
                        </div>
                    </div>
                </div>

                <div className="shrink-0 border-b border-gray-800/80 bg-black/50 px-3 py-2">
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { id: 'events' as const, label: '风云' },
                            { id: 'npcs' as const, label: '群英' },
                            { id: 'overview' as const, label: '史册' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`rounded-2xl border px-2 py-2.5 text-sm transition-all text-center ${
                                    activeTab === tab.id ? 'border-wuxia-gold/40 bg-wuxia-gold/10 text-wuxia-gold' : 'border-gray-800 bg-black/20 text-gray-400'
                                }`}
                            >
                                <div className="text-[11px] tracking-[0.18em]">{tab.label}</div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
                    {Array.isArray(worldEvolutionLastSummary) && worldEvolutionLastSummary.length > 0 && (
                        <button
                            type="button"
                            disabled={!hasRawMessage}
                            onClick={() => {
                                if (!hasRawMessage) return;
                                setShowRawMessage(true);
                            }}
                            className={`mb-3 w-full rounded-2xl border p-4 text-left ${
                                hasRawMessage ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-cyan-950/40 bg-cyan-950/10'
                            }`}
                        >
                            <div className="mb-2 text-sm font-semibold tracking-[0.16em] text-wuxia-cyan">天道演算</div>
                            <div className="space-y-2">
                                {worldEvolutionLastSummary.slice(0, 4).map((line, idx) => (
                                    <div key={`mobile-world-summary-${idx}`} className="text-xs leading-5 text-cyan-100/85">{line}</div>
                                ))}
                            </div>
                        </button>
                    )}

                    {activeTab === 'events' && (
                        <div className="space-y-3">
                            <div className="px-2 pb-1 text-[11px] font-bold text-wuxia-gold tracking-widest">待执行事件</div>
                            {待执行事件.map((evt, idx) => (
                                <div key={`pending-${idx}`} className="rounded-3xl border border-wuxia-gold/15 bg-gradient-to-br from-black/80 to-black/45 p-4">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="text-base font-bold text-wuxia-gold">{evt.事件名 || `待执行事件 ${idx + 1}`}</div>
                                        <div className="text-[10px] text-gray-500 border border-gray-700 px-2 py-0.5 rounded-full whitespace-nowrap">{evt.当前状态 || '待执行'}</div>
                                    </div>
                                    <div className="mt-3 text-sm leading-7 text-gray-300">{evt.事件说明 || '暂无详情。'}</div>
                                    
                                    <div className="mt-3 space-y-1 text-[10px] text-gray-400 bg-black/40 p-2 rounded-xl border border-gray-800/60">
                                        <div><span className="text-gray-500">计划：</span>{格式化时间展示(evt.计划执行时间)}</div>
                                        <div><span className="text-gray-500">时限：</span>{格式化时间展示(evt.最早执行时间)} 至 {格式化时间展示(evt.最晚执行时间)}</div>
                                    </div>

                                    {(取数组(evt.前置条件).length > 0 || 取数组(evt.触发条件).length > 0) && (
                                        <div className="mt-2 text-[10px] text-gray-400 space-y-1">
                                            {取数组(evt.前置条件).length > 0 && <div><span className="text-gray-500">前置：</span>{取数组(evt.前置条件).join('；')}</div>}
                                            {取数组(evt.触发条件).length > 0 && <div><span className="text-gray-500">触发：</span>{取数组(evt.触发条件).join('；')}</div>}
                                        </div>
                                    )}

                                    {(取数组(evt.关联人物).length > 0 || 取数组(evt.关联地点).length > 0 || 取数组(evt.关联势力).length > 0 || 取数组(evt.关联分歧线).length > 0 || 取数字数组(evt.关联分解组).length > 0) && (
                                        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                                            {取数组(evt.关联人物).map((p, i) => <span key={`p-${i}`} className="bg-cyan-900/30 text-cyan-500 px-1.5 py-0.5 rounded">@{p}</span>)}
                                            {显示关联列表(evt.关联势力).map((p, i) => <span key={`f-${i}`} className="bg-orange-900/30 text-orange-500 px-1.5 py-0.5 rounded">{p}</span>)}
                                            {取数组(evt.关联地点).map((l, i) => <span key={`l-${i}`} className="bg-green-900/30 text-green-500 px-1.5 py-0.5 rounded">📍{l}</span>)}
                                            {取数字数组(evt.关联分解组).map((g, i) => <span key={`g-${i}`} className="bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded">分解组{g}</span>)}
                                            {取数组(evt.关联分歧线).map((b, i) => <span key={`b-${i}`} className="bg-pink-900/30 text-pink-400 px-1.5 py-0.5 rounded">分歧:{b}</span>)}
                                        </div>
                                    )}
                                </div>
                            ))}

                            <div className="px-2 pt-4 pb-1 text-[11px] font-bold text-wuxia-red tracking-widest">进行中事件</div>
                            {进行中事件.map((evt, idx) => (
                                <div key={`ongoing-${idx}`} className="rounded-3xl border border-red-500/15 bg-gradient-to-br from-black/80 to-red-950/10 p-4">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="text-base font-bold text-wuxia-red">{evt.事件名 || `进行中事件 ${idx + 1}`}</div>
                                        <div className="text-[10px] text-red-400 border border-red-900/50 bg-red-900/10 px-2 py-0.5 rounded-full whitespace-nowrap">{evt.类型 || '事件'}</div>
                                    </div>
                                    <div className="mt-3 text-sm leading-7 text-gray-300">{evt.事件说明 || '暂无详情。'}</div>
                                    
                                    <div className="mt-3 space-y-1 text-[10px] text-gray-400 bg-black/40 p-2 rounded-xl border border-red-900/20">
                                        <div><span className="text-gray-500">开始：</span>{格式化时间展示(evt.开始时间)}</div>
                                        <div><span className="text-gray-500">结束：</span>{格式化时间展示(evt.预计结束时间)}</div>
                                    </div>

                                    {取文本(evt.当前进展) && (
                                        <div className="mt-3 text-[11px] text-red-300/80 leading-5">
                                            <span className="text-wuxia-red font-bold">进展：</span>{evt.当前进展}
                                        </div>
                                    )}

                                    {(取数组(evt.关联人物).length > 0 || 取数组(evt.关联地点).length > 0 || 取数组(evt.关联势力).length > 0 || 取数组(evt.关联分歧线).length > 0 || 取数字数组(evt.关联分解组).length > 0) && (
                                        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                                            {取数组(evt.关联人物).map((p, i) => <span key={`op-${i}`} className="bg-cyan-900/30 text-cyan-500 px-1.5 py-0.5 rounded">@{p}</span>)}
                                            {显示关联列表(evt.关联势力).map((p, i) => <span key={`of-${i}`} className="bg-orange-900/30 text-orange-500 px-1.5 py-0.5 rounded">{p}</span>)}
                                            {取数组(evt.关联地点).map((l, i) => <span key={`ol-${i}`} className="bg-green-900/30 text-green-500 px-1.5 py-0.5 rounded">📍{l}</span>)}
                                            {取数字数组(evt.关联分解组).map((g, i) => <span key={`og-${i}`} className="bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded">分解组{g}</span>)}
                                            {取数组(evt.关联分歧线).map((b, i) => <span key={`ob-${i}`} className="bg-pink-900/30 text-pink-400 px-1.5 py-0.5 rounded">分歧:{b}</span>)}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {待执行事件.length === 0 && 进行中事件.length === 0 && (
                                <div className="rounded-3xl border border-dashed border-gray-800 bg-black/30 px-4 py-16 text-center text-sm text-gray-500">当前没有世界事件。</div>
                            )}
                        </div>
                    )}

                    {activeTab === 'npcs' && (
                        <div className="space-y-3">
                            <div className="px-2 pb-1 text-[11px] font-bold text-orange-300 tracking-widest">江湖势力</div>
                            <移动势力关系图 nodes={势力关系图数据.nodes} edges={势力关系图数据.edges} />
                            {势力列表.map((faction, idx) => (
                                <div key={`faction-${faction.ID || idx}`} className="rounded-3xl border border-orange-900/25 bg-gradient-to-br from-black/80 to-orange-950/10 p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="text-base font-bold text-orange-200">{显示单名(faction.名称 || faction.ID, `势力 ${idx + 1}`)}</div>
                                        <div className="shrink-0 rounded-full border border-orange-900/40 px-2 py-0.5 text-[10px] text-orange-300">实力 {Number(faction.实力等级) || 0}</div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                                        <span className="rounded bg-orange-900/25 px-2 py-0.5 text-orange-300">{faction.类型 || '势力'}</span>
                                        {取文本(faction.地盘归属) && <span className="rounded bg-green-900/20 px-2 py-0.5 text-green-400">{faction.地盘归属}</span>}
                                    </div>
                                    <div className="mt-3 text-sm leading-7 text-gray-300">{取文本(faction.描述) || '暂无势力传闻。'}</div>
                                    {取文本(faction.当前状态) && (
                                        <div className="mt-3 rounded-2xl border border-orange-900/20 bg-black/40 px-3 py-3 text-xs leading-5 text-orange-100/80">{faction.当前状态}</div>
                                    )}
                                </div>
                            ))}
                            {势力列表.length === 0 && (
                                <div className="rounded-3xl border border-dashed border-gray-800 bg-black/30 px-4 py-10 text-center text-sm text-gray-500">当前尚未显化江湖势力。</div>
                            )}

                            {势力互动历史.length > 0 && (
                                <>
                                    <div className="px-2 pt-4 pb-1 text-[11px] font-bold text-wuxia-gold tracking-widest">势力风闻</div>
                                    {势力互动历史.slice(0, 6).map((event, idx) => (
                                        <div key={`faction-event-${event.ID || idx}`} className="rounded-3xl border border-gray-800 bg-black/35 p-4">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-sm font-semibold text-gray-100">{显示关联列表(event.参与势力).join('、') || '未知势力'}</div>
                                                <div className="rounded-full border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400">{event.类型 || '互动'}</div>
                                            </div>
                                            <div className="mt-2 text-sm leading-6 text-gray-300">{event.事件摘要 || '暂无摘要。'}</div>
                                        </div>
                                    ))}
                                </>
                            )}

                            {拍卖行待投放物品.length > 0 && (
                                <>
                                    <div className="px-2 pt-4 pb-1 text-[11px] font-bold text-purple-300 tracking-widest">市面风声</div>
                                    {拍卖行待投放物品.slice(0, 6).map((item, idx) => (
                                        <div key={`market-item-${item.名称 || idx}`} className="rounded-3xl border border-purple-900/25 bg-purple-950/10 p-4">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-sm font-semibold text-purple-100">{item.名称 || `未知物品 ${idx + 1}`}</div>
                                                <div className="rounded-full border border-purple-900/40 px-2 py-0.5 text-[10px] text-purple-300">{item.品质 || '未知品质'}</div>
                                            </div>
                                            <div className="mt-2 text-xs text-gray-400">{item.类型 || '物品'}</div>
                                            {取文本(item.描述) && <div className="mt-2 text-sm leading-6 text-gray-300">{item.描述}</div>}
                                        </div>
                                    ))}
                                </>
                            )}

                            <div className="px-2 pt-4 pb-1 text-[11px] font-bold text-wuxia-cyan tracking-widest">活跃群英</div>
                            {活跃NPC列表.length > 0 ? 活跃NPC列表.map((npc, idx) => (
                                <div key={`npc-${idx}`} className="rounded-3xl border border-cyan-500/15 bg-gradient-to-br from-black/80 to-cyan-950/10 p-4">
                                    <div className="flex justify-between items-start">
                                        <div className="text-base font-bold text-wuxia-cyan">{npc.姓名 || `NPC ${idx + 1}`}</div>
                                        <div className="text-[10px] text-gray-300 border border-gray-700 rounded-full px-2 py-0.5">{npc.当前状态 || '未定'}</div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                                        <span className="bg-orange-900/20 text-orange-500/90 px-2 py-0.5 rounded border border-orange-900/20">{显示单名(npc.所属势力, '无门无派')}</span>
                                        <span className="bg-green-900/20 text-green-500/90 px-2 py-0.5 rounded border border-green-900/20 flex items-center gap-1"><IconMapPin size={10} />{npc.当前位置 || '未知地点'}</span>
                                    </div>
                                    <div className="mt-3 rounded-2xl border border-cyan-900/30 bg-black/40 px-3 py-3 text-sm leading-7 text-cyan-50/90">
                                        <span className="text-[10px] text-cyan-600 block mb-1 font-bold">当前行动：</span>
                                        {取文本(npc.当前行动) || '暂无行动描述。'}
                                    </div>
                                    <div className="mt-3 space-y-2 text-[10px] text-gray-400">
                                        <div className="rounded-xl border border-gray-800 bg-black/35 px-3 py-2">开始：{格式化时间展示(npc.行动开始时间)}</div>
                                        <div className="rounded-xl border border-gray-800 bg-black/35 px-3 py-2">结束：{格式化时间展示(npc.行动结束时间)}</div>
                                    </div>
                                </div>
                            )) : (
                                <div className="rounded-3xl border border-dashed border-gray-800 bg-black/30 px-4 py-16 text-center text-sm text-gray-500">天机晦暗，不见群英行迹。</div>
                            )}
                        </div>
                    )}

                    {activeTab === 'overview' && (
                        <div className="space-y-3">
                            <div className="px-2 pb-1 text-[11px] font-bold text-gray-300 tracking-widest">已结算事件</div>
                            {已结算事件.map((evt, idx) => (
                                <div key={`settled-${idx}`} className="rounded-3xl border border-gray-800 bg-gradient-to-br from-black/80 to-black/45 p-4 relative">
                                    {evt.是否进入史册 && <div className="absolute top-4 right-4 text-[9px] bg-wuxia-gold/20 text-wuxia-gold px-1.5 py-0.5 rounded border border-wuxia-gold/30">已入史册</div>}
                                    <div className="text-base font-bold text-gray-100 pr-12">{evt.事件名 || `已结算事件 ${idx + 1}`}</div>
                                    <div className="mt-2 text-[10px] text-gray-500">结算：{格式化时间展示(evt.结算时间)}</div>
                                    <div className="mt-3 text-sm leading-7 text-gray-400">{evt.事件说明 || '暂无说明。'}</div>
                                    
                                    <div className="mt-3 space-y-1 text-[10px]">
                                        {取数组(evt.事件结果).length > 0 && <div><span className="text-gray-500">结果：</span><span className="text-gray-300">{取数组(evt.事件结果).join('；')}</span></div>}
                                        {取数组(evt.长期影响).length > 0 && <div><span className="text-wuxia-gold/60">影响：</span><span className="text-wuxia-gold/80">{取数组(evt.长期影响).join('；')}</span></div>}
                                    </div>

                                    {(取数组(evt.关联人物).length > 0 || 取数组(evt.关联地点).length > 0 || 取数组(evt.关联势力).length > 0 || 取数组(evt.关联分歧线).length > 0 || 取数字数组(evt.关联分解组).length > 0) && (
                                        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] opacity-80">
                                            {取数组(evt.关联人物).map((p, i) => <span key={`sp-${i}`} className="bg-cyan-900/30 text-cyan-500 px-1.5 py-0.5 rounded">@{p}</span>)}
                                            {显示关联列表(evt.关联势力).map((p, i) => <span key={`sf-${i}`} className="bg-orange-900/30 text-orange-500 px-1.5 py-0.5 rounded">{p}</span>)}
                                            {取数组(evt.关联地点).map((l, i) => <span key={`sl-${i}`} className="bg-green-900/30 text-green-500 px-1.5 py-0.5 rounded">📍{l}</span>)}
                                            {取数字数组(evt.关联分解组).map((g, i) => <span key={`sg-${i}`} className="bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded">组{g}</span>)}
                                            {取数组(evt.关联分歧线).map((b, i) => <span key={`sb-${i}`} className="bg-pink-900/30 text-pink-400 px-1.5 py-0.5 rounded">分歧:{b}</span>)}
                                        </div>
                                    )}
                                </div>
                            ))}

                            <div className="px-2 pt-4 pb-1 text-[11px] font-bold text-wuxia-gold tracking-widest">江湖史册</div>
                            {江湖史册.map((evt, idx) => (
                                <div key={`chronicle-${idx}`} className="rounded-3xl border border-gray-800 bg-gradient-to-br from-black/80 to-black/45 p-4">
                                    <div className="text-base font-bold text-wuxia-gold">{evt.标题 || `史册 ${idx + 1}`}</div>
                                    <div className="mt-2 text-[10px] text-gray-500">归档：{格式化时间展示(evt.归档时间)}</div>
                                    <div className="mt-3 text-sm leading-7 text-gray-300">
                                        {取数组(evt.归档内容).map((c, i) => <p key={i} className="mb-1">{c}</p>)}
                                    </div>
                                    
                                    {取数组(evt.长期影响).length > 0 && (
                                        <div className="mt-2 text-[10px] text-wuxia-gold/80 bg-wuxia-gold/5 p-2 rounded-xl border border-wuxia-gold/10">
                                            影响：{取数组(evt.长期影响).join('；')}
                                        </div>
                                    )}

                                    {(取数组(evt.关联人物).length > 0 || 取数组(evt.关联地点).length > 0 || 取数组(evt.关联势力).length > 0 || 取数组(evt.关联分歧线).length > 0) && (
                                        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] opacity-80">
                                            {取数组(evt.关联人物).map((p, i) => <span key={`cp-${i}`} className="bg-cyan-900/30 text-cyan-500 px-1.5 py-0.5 rounded">@{p}</span>)}
                                            {显示关联列表(evt.关联势力).map((p, i) => <span key={`cf-${i}`} className="bg-orange-900/30 text-orange-500 px-1.5 py-0.5 rounded">{p}</span>)}
                                            {取数组(evt.关联地点).map((l, i) => <span key={`cl-${i}`} className="bg-green-900/30 text-green-500 px-1.5 py-0.5 rounded">📍{l}</span>)}
                                            {取数组(evt.关联分歧线).map((b, i) => <span key={`cb-${i}`} className="bg-pink-900/30 text-pink-400 px-1.5 py-0.5 rounded">分歧:{b}</span>)}
                                        </div>
                                    )}
                                </div>
                            ))}

                            <div className="px-2 pt-4 pb-1 text-[11px] font-bold text-purple-400 tracking-widest">世界镜头规划</div>
                            {世界镜头规划.map((shot, idx) => (
                                <div key={`world-shot-${idx}`} className="rounded-3xl border border-purple-900/20 bg-purple-950/10 p-4 relative">
                                    <div className="absolute top-4 right-4 text-[9px] text-purple-400 border border-purple-900/50 px-1.5 py-0.5 rounded-full">{shot.当前状态 || '待触发'}</div>
                                    <div className="text-base font-bold text-purple-200 pr-12">{shot.镜头标题 || `世界镜头 ${idx + 1}`}</div>
                                    <div className="mt-2 text-[10px] text-gray-500">触发：{格式化时间展示(shot.触发时间)}</div>
                                    <div className="mt-3 text-sm leading-7 text-purple-100/80 bg-purple-900/10 p-3 rounded-2xl">{shot.镜头内容 || '暂无镜头内容。'}</div>
                                    
                                    {取数组(shot.触发条件).length > 0 && <div className="mt-3 text-[10px] text-gray-400"><span className="text-gray-500">触发：</span>{取数组(shot.触发条件).join('；')}</div>}
                                    {取数组(shot.沉淀内容).length > 0 && <div className="mt-1 text-[10px] text-gray-400"><span className="text-gray-500">沉淀：</span>{取数组(shot.沉淀内容).join('；')}</div>}

                                    {(取数组(shot.关联人物).length > 0 || 取数组(shot.关联地点).length > 0 || 取数组(shot.关联分歧线).length > 0 || 取数字数组(shot.关联分解组).length > 0) && (
                                        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                                            {取数组(shot.关联人物).map((p, i) => <span key={`wp-${i}`} className="bg-cyan-900/30 text-cyan-500 px-1.5 py-0.5 rounded">@{p}</span>)}
                                            {取数组(shot.关联地点).map((l, i) => <span key={`wl-${i}`} className="bg-green-900/30 text-green-500 px-1.5 py-0.5 rounded">📍{l}</span>)}
                                            {取数字数组(shot.关联分解组).map((g, i) => <span key={`wg-${i}`} className="bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded">组{g}</span>)}
                                            {取数组(shot.关联分歧线).map((b, i) => <span key={`wb-${i}`} className="bg-pink-900/30 text-pink-400 px-1.5 py-0.5 rounded">分歧:{b}</span>)}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {已结算事件.length === 0 && 江湖史册.length === 0 && 世界镜头规划.length === 0 && (
                                <div className="rounded-3xl border border-dashed border-gray-800 bg-black/30 px-4 py-16 text-center text-sm text-gray-500">尚无惊世骇俗之举留名史册。</div>
                            )}
                        </div>
                    )}
                </div>

                {showRawMessage && (
                    <div className="absolute inset-0 z-[230] bg-black/95 px-3 py-[max(env(safe-area-inset-top),12px)]">
                        <div className="flex h-full flex-col rounded-3xl border border-cyan-500/30 bg-[#060b0e] shadow-[0_0_40px_rgba(34,211,238,0.12)]">
                            <div className="flex items-center justify-between gap-3 border-b border-cyan-950/50 px-4 py-4">
                                <div>
                                    <div className="text-base font-bold tracking-[0.18em] text-wuxia-cyan">天道溯源</div>
                                    <div className="mt-1 text-[11px] text-cyan-200/60">原始演化之息</div>
                                </div>
                                <button type="button" onClick={() => setShowRawMessage(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 bg-black/50 text-gray-300">×</button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
                                <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-cyan-50/85">{worldEvolutionLastRawText || '无可用原迹。'}</pre>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MobileWorldModal;
