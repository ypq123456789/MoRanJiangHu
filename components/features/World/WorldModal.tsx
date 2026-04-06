import React, { useState } from 'react';
import { 世界数据结构 } from '../../../models/world';
import { normalizeCanonicalGameTime, 结构化时间转标准串 } from '../../../hooks/useGame/timeUtils';
import { IconBolt, IconEye, IconScroll, IconSwords, IconMapPin } from '../../ui/Icons';

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
    const trimmed = value.trim();
    if (!trimmed) return null;
    return normalizeCanonicalGameTime(trimmed);
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

const WorldModal: React.FC<Props> = ({
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

    const hasRawMessage = typeof worldEvolutionLastRawText === 'string' && worldEvolutionLastRawText.trim().length > 0;
    const 待执行事件 = Array.isArray(world?.待执行事件) ? world.待执行事件 : [];
    const 进行中事件 = Array.isArray(world?.进行中事件) ? world.进行中事件 : [];
    const 已结算事件 = Array.isArray(world?.已结算事件) ? world.已结算事件 : [];
    const 活跃NPC列表 = Array.isArray(world?.活跃NPC列表) ? world.活跃NPC列表 : [];
    const 世界镜头规划 = Array.isArray(world?.世界镜头规划) ? world.世界镜头规划 : [];
    const 江湖史册 = Array.isArray(world?.江湖史册) ? world.江湖史册 : [];

    const handleForceUpdate = async () => {
        if (!onForceUpdate || worldEvolutionUpdating) return;
        const result = await onForceUpdate();
        if (typeof result === 'string' && result.trim().length > 0) {
            setLocalNotice(result.trim());
            window.setTimeout(() => setLocalNotice(''), 2000);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-ink-black/95 border border-wuxia-gold/20 w-full max-w-7xl max-h-[90vh] h-[90vh] flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.9)] relative overflow-hidden rounded-2xl">
                <div className="h-20 shrink-0 border-b border-wuxia-gold/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-8 relative z-50">
                    <div>
                        <div className="text-wuxia-gold font-serif font-bold text-2xl tracking-[0.4em]">天下大势</div>
                        <div className="mt-2 text-xs text-gray-400">洞察天地演化，纵览群英万象与山川地理。</div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => { void handleForceUpdate(); }}
                            disabled={!worldEvolutionEnabled || worldEvolutionUpdating}
                            className={`rounded-xl border px-5 py-2 text-xs tracking-widest transition-all ${
                                !worldEvolutionEnabled
                                    ? 'border-gray-700 bg-black/50 text-gray-500'
                                    : worldEvolutionUpdating
                                        ? 'border-wuxia-gold/50 bg-wuxia-gold/10 text-wuxia-gold'
                                        : 'border-wuxia-gold/40 bg-black/50 text-wuxia-gold'
                            }`}
                        >
                            {worldEvolutionUpdating ? '推演中…' : '拨弄天机'}
                        </button>
                        <div className="text-[10px] text-gray-500 text-right">
                            <div>{localNotice || worldEvolutionStatus || '系统静默'}</div>
                            <div className="mt-1">{worldEvolutionLastUpdatedAt ? `最近显化：${worldEvolutionLastUpdatedAt}` : '尚无最近显化时间'}</div>
                        </div>
                        <button onClick={onClose} className="w-10 h-10 rounded-full border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-400">×</button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    <aside className="w-[280px] bg-black/40 border-r border-wuxia-gold/10 flex flex-col py-6 relative z-10 backdrop-blur-sm shadow-xl shrink-0">
                        <div className="px-6 grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-gray-800 bg-black/40 p-4 text-center">
                                <div className="text-[10px] text-gray-500 tracking-[0.2em]">待执行</div>
                                <div className="mt-2 text-2xl font-mono text-wuxia-gold">{待执行事件.length}</div>
                            </div>
                            <div className="rounded-xl border border-gray-800 bg-black/40 p-4 text-center">
                                <div className="text-[10px] text-gray-500 tracking-[0.2em]">进行中</div>
                                <div className="mt-2 text-2xl font-mono text-wuxia-red">{进行中事件.length}</div>
                            </div>
                            <div className="rounded-xl border border-gray-800 bg-black/40 p-4 text-center">
                                <div className="text-[10px] text-gray-500 tracking-[0.2em]">活跃NPC</div>
                                <div className="mt-2 text-2xl font-mono text-wuxia-cyan">{活跃NPC列表.length}</div>
                            </div>
                            <div className="rounded-xl border border-gray-800 bg-black/40 p-4 text-center">
                                <div className="text-[10px] text-gray-500 tracking-[0.2em]">江湖史册</div>
                                <div className="mt-2 text-2xl font-mono text-gray-300">{江湖史册.length}</div>
                            </div>
                        </div>

                        <div className="mt-6 px-4 space-y-2">
                            {[
                                { id: 'events' as const, label: '风云变幻', desc: '待执行与进行中事件', icon: <IconBolt size={18} /> },
                                { id: 'npcs' as const, label: '天下群英', desc: 'NPC行动与势力状态', icon: <IconSwords size={18} /> },
                                { id: 'overview' as const, label: '史册留痕', desc: '已结算与沉淀归档', icon: <IconScroll size={18} /> }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`w-full rounded-xl border px-4 py-4 text-left transition-all ${
                                        activeTab === tab.id ? 'border-wuxia-gold/30 bg-wuxia-gold/10 text-wuxia-gold' : 'border-transparent text-gray-500 hover:border-gray-800 hover:bg-black/30'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        {tab.icon}
                                        <div>
                                            <div className="font-serif font-bold tracking-[0.2em]">{tab.label}</div>
                                            <div className="mt-1 text-[10px] text-gray-500">{tab.desc}</div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </aside>

                    <div className="flex-1 bg-ink-wash/5 p-8 overflow-y-auto custom-scrollbar relative z-10 flex flex-col">
                        {worldEvolutionLastSummary.length > 0 && (
                            <div
                                className={`mb-6 rounded-2xl border p-5 ${
                                    hasRawMessage ? 'border-cyan-500/30 bg-cyan-500/5 cursor-pointer' : 'border-cyan-950/30 bg-cyan-950/10'
                                }`}
                                onClick={() => {
                                    if (hasRawMessage) setShowRawMessage(true);
                                }}
                            >
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="text-sm tracking-[0.25em] text-wuxia-cyan">天道演算</div>
                                    {hasRawMessage && <div className="text-[10px] text-cyan-300/70 flex items-center gap-1"><IconEye size={12} /> 点击溯源</div>}
                                </div>
                                <div className="space-y-2">
                                    {worldEvolutionLastSummary.slice(0, 8).map((line, idx) => (
                                        <div key={`world-summary-${idx}`} className="text-xs text-cyan-100/85 leading-6">
                                            {line}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'events' && (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <section className="rounded-2xl border border-gray-800 bg-black/35 p-5">
                                    <div className="text-sm font-serif font-bold text-wuxia-gold tracking-[0.25em] mb-4">待执行事件</div>
                                    <div className="space-y-4">
                                        {待执行事件.length > 0 ? 待执行事件.map((evt, idx) => (
                                            <div key={`pending-${idx}`} className="rounded-xl border border-gray-800 bg-black/30 p-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-base text-gray-100 font-semibold">{evt.事件名 || `待执行事件 ${idx + 1}`}</div>
                                                    <div className="text-[10px] text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full">{evt.当前状态 || '待执行'}</div>
                                                </div>
                                                <div className="mt-2 text-sm text-gray-400 leading-7">{evt.事件说明 || '暂无说明'}</div>
                                                
                                                <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-gray-500">
                                                    <div className="col-span-2 flex flex-wrap gap-x-3 gap-y-1">
                                                        <span>计划时间：{格式化时间展示(evt.计划执行时间)}</span>
                                                        <span>最早：{格式化时间展示(evt.最早执行时间)}</span>
                                                        <span>最晚：{格式化时间展示(evt.最晚执行时间)}</span>
                                                    </div>
                                                </div>

                                                <div className="mt-3 space-y-1.5 text-[10px] text-gray-400">
                                                    {取数组(evt.前置条件).length > 0 && <div><span className="text-gray-500">前置条件：</span>{取数组(evt.前置条件).join('；')}</div>}
                                                    {取数组(evt.触发条件).length > 0 && <div><span className="text-gray-500">触发条件：</span>{取数组(evt.触发条件).join('；')}</div>}
                                                    {取数组(evt.阻断条件).length > 0 && <div><span className="text-red-900/80">阻断条件：</span>{取数组(evt.阻断条件).join('；')}</div>}
                                                </div>

                                                {(取数组(evt.关联人物).length > 0 || 取数组(evt.关联地点).length > 0 || 取数组(evt.关联势力).length > 0 || 取数组(evt.关联分歧线).length > 0 || 取数字数组(evt.关联分解组).length > 0) && (
                                                    <div className="mt-3 pt-3 border-t border-gray-800/50 flex flex-wrap gap-2 text-[10px]">
                                                        {取数组(evt.关联人物).map((p, i) => <span key={`p-${i}`} className="bg-cyan-900/30 text-cyan-500 px-2 py-0.5 rounded">@{p}</span>)}
                                                        {取数组(evt.关联势力).map((p, i) => <span key={`f-${i}`} className="bg-orange-900/30 text-orange-500 px-2 py-0.5 rounded">{p}</span>)}
                                                        {取数组(evt.关联地点).map((l, i) => <span key={`l-${i}`} className="bg-green-900/30 text-green-500 px-2 py-0.5 rounded">📍{l}</span>)}
                                                        {取数字数组(evt.关联分解组).map((g, i) => <span key={`g-${i}`} className="bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded">分解组{g}</span>)}
                                                        {取数组(evt.关联分歧线).map((b, i) => <span key={`b-${i}`} className="bg-pink-900/30 text-pink-400 px-2 py-0.5 rounded">分歧:{b}</span>)}
                                                    </div>
                                                )}
                                                
                                                {(取数组(evt.执行后影响).length > 0 || 取数组(evt.错过后影响).length > 0) && (
                                                    <div className="mt-3 bg-black/40 p-2 rounded border border-gray-800 text-[10px]">
                                                        {取数组(evt.执行后影响).length > 0 && <div className="text-gray-400"><span className="text-wuxia-gold">执行影响：</span>{取数组(evt.执行后影响).join('；')}</div>}
                                                        {取数组(evt.错过后影响).length > 0 && <div className="text-gray-500 mt-1"><span className="text-red-900/80">错过影响：</span>{取数组(evt.错过后影响).join('；')}</div>}
                                                    </div>
                                                )}
                                            </div>
                                        )) : <div className="text-xs text-gray-600 italic">暂无待执行事件。</div>}
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-gray-800 bg-black/35 p-5">
                                    <div className="text-sm font-serif font-bold text-wuxia-red tracking-[0.25em] mb-4">进行中事件</div>
                                    <div className="space-y-4">
                                        {进行中事件.length > 0 ? 进行中事件.map((evt, idx) => (
                                            <div key={`ongoing-${idx}`} className="rounded-xl border border-gray-800 bg-black/30 p-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-base text-gray-100 font-semibold">{evt.事件名 || `进行中事件 ${idx + 1}`}</div>
                                                    <div className="text-[10px] text-red-400 border border-red-900/50 bg-red-900/10 px-2 py-0.5 rounded-full">{evt.类型 || '事件'}</div>
                                                </div>
                                                <div className="mt-2 text-sm text-gray-400 leading-7">{evt.事件说明 || '暂无说明'}</div>
                                                
                                                <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-gray-500">
                                                    <div>开始：{格式化时间展示(evt.开始时间)}</div>
                                                    <div>预计结束：{格式化时间展示(evt.预计结束时间)}</div>
                                                </div>

                                                {取文本(evt.当前进展) && (
                                                    <div className="mt-3 bg-black/40 p-2 rounded border border-red-900/20 text-xs text-red-200/80 leading-5">
                                                        <span className="text-wuxia-red font-bold">当前进展：</span>{evt.当前进展}
                                                    </div>
                                                )}

                                                {取数组(evt.已产生影响).length > 0 && (
                                                    <div className="mt-2 text-[10px] text-gray-400">
                                                        <span className="text-gray-500">已产生影响：</span>{取数组(evt.已产生影响).join('；')}
                                                    </div>
                                                )}

                                                {(取数组(evt.关联人物).length > 0 || 取数组(evt.关联地点).length > 0 || 取数组(evt.关联势力).length > 0 || 取数组(evt.关联分歧线).length > 0 || 取数字数组(evt.关联分解组).length > 0) && (
                                                    <div className="mt-3 pt-3 border-t border-gray-800/50 flex flex-wrap gap-2 text-[10px]">
                                                        {取数组(evt.关联人物).map((p, i) => <span key={`op-${i}`} className="bg-cyan-900/30 text-cyan-500 px-2 py-0.5 rounded">@{p}</span>)}
                                                        {取数组(evt.关联势力).map((p, i) => <span key={`of-${i}`} className="bg-orange-900/30 text-orange-500 px-2 py-0.5 rounded">{p}</span>)}
                                                        {取数组(evt.关联地点).map((l, i) => <span key={`ol-${i}`} className="bg-green-900/30 text-green-500 px-2 py-0.5 rounded">📍{l}</span>)}
                                                        {取数字数组(evt.关联分解组).map((g, i) => <span key={`og-${i}`} className="bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded">分解组{g}</span>)}
                                                        {取数组(evt.关联分歧线).map((b, i) => <span key={`ob-${i}`} className="bg-pink-900/30 text-pink-400 px-2 py-0.5 rounded">分歧:{b}</span>)}
                                                    </div>
                                                )}
                                            </div>
                                        )) : <div className="text-xs text-gray-600 italic">暂无进行中事件。</div>}
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === 'npcs' && (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                {活跃NPC列表.length > 0 ? 活跃NPC列表.map((npc, idx) => (
                                    <section key={`npc-${idx}`} className="rounded-2xl border border-gray-800 bg-black/35 p-5">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-xl text-wuxia-cyan font-serif font-bold">{npc.姓名 || `NPC ${idx + 1}`}</div>
                                                <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                                                    <span className="bg-orange-900/20 text-orange-500/90 px-2 py-0.5 rounded">{npc.所属势力 || '无门无派'}</span>
                                                    <span className="text-gray-600">|</span>
                                                    <span className="bg-green-900/20 text-green-500/90 px-2 py-0.5 rounded flex items-center gap-1"><IconMapPin size={10} />{npc.当前位置 || '未知地点'}</span>
                                                </div>
                                            </div>
                                            <div className="text-[10px] text-gray-300 border border-gray-700 rounded-full px-3 py-1">{npc.当前状态 || '未定'}</div>
                                        </div>
                                        <div className="mt-4 rounded-xl border border-cyan-900/20 bg-cyan-950/10 p-4">
                                            <div className="text-[10px] text-cyan-600 mb-2 font-bold tracking-wider">当前行动</div>
                                            <div className="text-sm text-gray-300 leading-7">{取文本(npc.当前行动) || '暂无行动'}</div>
                                        </div>
                                        <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] text-gray-500 text-center">
                                            <div className="rounded border border-gray-800 bg-black/30 p-2">行动开始：{格式化时间展示(npc.行动开始时间)}</div>
                                            <div className="rounded border border-gray-800 bg-black/30 p-2">行动结束：{格式化时间展示(npc.行动结束时间)}</div>
                                        </div>
                                    </section>
                                )) : <div className="col-span-full text-center py-24 text-gray-600 italic">当前没有活跃 NPC 轨迹。</div>}
                            </div>
                        )}

                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <section className="rounded-2xl border border-gray-800 bg-black/35 p-5">
                                    <div className="text-sm font-serif font-bold text-gray-100 tracking-[0.25em] mb-4">已结算事件</div>
                                    <div className="space-y-4">
                                        {已结算事件.length > 0 ? 已结算事件.map((evt, idx) => (
                                            <div key={`settled-${idx}`} className="rounded-xl border border-gray-800 bg-black/30 p-4 relative overflow-hidden">
                                                {evt.是否进入史册 && <div className="absolute top-3 right-3 text-[10px] bg-wuxia-gold/20 text-wuxia-gold px-2 py-0.5 rounded border border-wuxia-gold/30">已入史册</div>}
                                                <div className="text-base text-gray-100 font-semibold pr-16">{evt.事件名 || `已结算事件 ${idx + 1}`}</div>
                                                <div className="mt-2 text-[10px] text-gray-500">结算时间：{格式化时间展示(evt.结算时间)}</div>
                                                <div className="mt-2 text-sm text-gray-400 leading-7">{evt.事件说明 || '暂无说明'}</div>
                                                
                                                <div className="mt-3 space-y-1.5 text-[10px]">
                                                    {取数组(evt.事件结果).length > 0 && <div><span className="text-gray-500">事件结果：</span><span className="text-gray-300">{取数组(evt.事件结果).join('；')}</span></div>}
                                                    {取数组(evt.长期影响).length > 0 && <div><span className="text-wuxia-gold/60">长期影响：</span><span className="text-wuxia-gold/80">{取数组(evt.长期影响).join('；')}</span></div>}
                                                </div>

                                                {(取数组(evt.关联人物).length > 0 || 取数组(evt.关联地点).length > 0 || 取数组(evt.关联势力).length > 0 || 取数组(evt.关联分歧线).length > 0 || 取数字数组(evt.关联分解组).length > 0) && (
                                                    <div className="mt-3 pt-3 border-t border-gray-800/50 flex flex-wrap gap-2 text-[10px] opacity-70">
                                                        {取数组(evt.关联人物).map((p, i) => <span key={`sp-${i}`} className="bg-cyan-900/30 text-cyan-500 px-2 py-0.5 rounded">@{p}</span>)}
                                                        {取数组(evt.关联势力).map((p, i) => <span key={`sf-${i}`} className="bg-orange-900/30 text-orange-500 px-2 py-0.5 rounded">{p}</span>)}
                                                        {取数组(evt.关联地点).map((l, i) => <span key={`sl-${i}`} className="bg-green-900/30 text-green-500 px-2 py-0.5 rounded">📍{l}</span>)}
                                                        {取数字数组(evt.关联分解组).map((g, i) => <span key={`sg-${i}`} className="bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded">分解组{g}</span>)}
                                                        {取数组(evt.关联分歧线).map((b, i) => <span key={`sb-${i}`} className="bg-pink-900/30 text-pink-400 px-2 py-0.5 rounded">分歧:{b}</span>)}
                                                    </div>
                                                )}
                                            </div>
                                        )) : <div className="text-xs text-gray-600 italic">暂无已结算事件。</div>}
                                    </div>
                                </section>

                                <section className="space-y-6">
                                    <div className="rounded-2xl border border-gray-800 bg-black/35 p-5">
                                        <div className="text-sm font-serif font-bold text-wuxia-gold tracking-[0.25em] mb-4">江湖史册</div>
                                        <div className="space-y-4">
                                            {江湖史册.map((item, idx) => (
                                                <div key={`chronicle-${idx}`} className="rounded-xl border border-gray-800 bg-black/30 p-4">
                                                    <div className="text-base text-wuxia-gold font-bold">{item.标题 || `史册条目 ${idx + 1}`}</div>
                                                    <div className="mt-2 text-[10px] text-gray-500">归档时间：{格式化时间展示(item.归档时间)}</div>
                                                    <div className="mt-3 text-sm text-gray-300 leading-7">
                                                        {取数组(item.归档内容).map((c, i) => <p key={i} className="mb-1">{c}</p>)}
                                                    </div>
                                                    
                                                    {取数组(item.长期影响).length > 0 && (
                                                        <div className="mt-2 text-[10px] text-wuxia-gold/80 bg-wuxia-gold/5 p-2 rounded border border-wuxia-gold/10">
                                                            影响：{取数组(item.长期影响).join('；')}
                                                        </div>
                                                    )}

                                                    {(取数组(item.关联人物).length > 0 || 取数组(item.关联地点).length > 0 || 取数组(item.关联势力).length > 0 || 取数组(item.关联分歧线).length > 0) && (
                                                        <div className="mt-3 pt-3 border-t border-gray-800/50 flex flex-wrap gap-2 text-[10px] opacity-70">
                                                            {取数组(item.关联人物).map((p, i) => <span key={`cp-${i}`} className="bg-cyan-900/30 text-cyan-500 px-2 py-0.5 rounded">@{p}</span>)}
                                                            {取数组(item.关联势力).map((p, i) => <span key={`cf-${i}`} className="bg-orange-900/30 text-orange-500 px-2 py-0.5 rounded">{p}</span>)}
                                                            {取数组(item.关联地点).map((l, i) => <span key={`cl-${i}`} className="bg-green-900/30 text-green-500 px-2 py-0.5 rounded">📍{l}</span>)}
                                                            {取数组(item.关联分歧线).map((b, i) => <span key={`cb-${i}`} className="bg-pink-900/30 text-pink-400 px-2 py-0.5 rounded">分歧:{b}</span>)}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {江湖史册.length === 0 && <div className="text-xs text-gray-600 italic">暂无史册沉淀。</div>}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-gray-800 bg-black/35 p-5">
                                        <div className="text-sm font-serif font-bold text-purple-400 tracking-[0.25em] mb-4">世界镜头</div>
                                        <div className="space-y-4">
                                            {世界镜头规划.map((shot, idx) => (
                                                <div key={`world-shot-${idx}`} className="rounded-xl border border-purple-900/20 bg-purple-950/10 p-4 relative">
                                                    <div className="absolute top-3 right-3 text-[10px] text-purple-400 border border-purple-900/50 px-2 py-0.5 rounded-full">{shot.当前状态 || '待触发'}</div>
                                                    <div className="text-base text-purple-200 font-bold pr-16">{shot.镜头标题 || `世界镜头 ${idx + 1}`}</div>
                                                    <div className="mt-2 text-[10px] text-gray-500">触发时间：{格式化时间展示(shot.触发时间)}</div>
                                                    <div className="mt-3 text-sm text-purple-100/80 leading-7 bg-purple-900/10 p-3 rounded">{shot.镜头内容 || '暂无镜头内容'}</div>
                                                    
                                                    {取数组(shot.触发条件).length > 0 && <div className="mt-3 text-[10px] text-gray-400"><span className="text-gray-500">触发条件：</span>{取数组(shot.触发条件).join('；')}</div>}
                                                    {取数组(shot.沉淀内容).length > 0 && <div className="mt-1 text-[10px] text-gray-400"><span className="text-gray-500">沉淀内容：</span>{取数组(shot.沉淀内容).join('；')}</div>}

                                                    {(取数组(shot.关联人物).length > 0 || 取数组(shot.关联地点).length > 0 || 取数组(shot.关联分歧线).length > 0 || 取数字数组(shot.关联分解组).length > 0) && (
                                                        <div className="mt-3 pt-3 border-t border-purple-900/20 flex flex-wrap gap-2 text-[10px]">
                                                            {取数组(shot.关联人物).map((p, i) => <span key={`wp-${i}`} className="bg-cyan-900/30 text-cyan-500 px-2 py-0.5 rounded">@{p}</span>)}
                                                            {取数组(shot.关联地点).map((l, i) => <span key={`wl-${i}`} className="bg-green-900/30 text-green-500 px-2 py-0.5 rounded">📍{l}</span>)}
                                                            {取数字数组(shot.关联分解组).map((g, i) => <span key={`wg-${i}`} className="bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded">分解组{g}</span>)}
                                                            {取数组(shot.关联分歧线).map((b, i) => <span key={`wb-${i}`} className="bg-pink-900/30 text-pink-400 px-2 py-0.5 rounded">分歧:{b}</span>)}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {世界镜头规划.length === 0 && <div className="text-xs text-gray-600 italic">暂无镜头规划。</div>}
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}
                    </div>
                </div>

                {showRawMessage && (
                    <div className="absolute inset-0 z-[250] bg-black/95 backdrop-blur-md flex items-center justify-center p-6 animate-fadeIn_fast" onClick={() => setShowRawMessage(false)}>
                        <div className="w-full max-w-4xl h-[80%] border border-wuxia-cyan/40 bg-gradient-to-b from-[#0a0f12] to-black rounded-2xl shadow-[0_0_60px_rgba(34,211,238,0.15)] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="h-16 px-6 border-b border-cyan-900/40 flex items-center justify-between bg-black/60">
                                <div>
                                    <div className="text-base text-wuxia-cyan font-bold tracking-[0.3em] font-serif">天道溯源</div>
                                    <div className="text-[10px] text-cyan-500/60 font-mono tracking-widest mt-0.5">原始演化之息</div>
                                </div>
                                <button className="w-8 h-8 rounded-full border border-gray-700 text-gray-400" onClick={() => setShowRawMessage(false)}>×</button>
                            </div>
                            <div className="flex-1 p-6 overflow-auto custom-scrollbar">
                                <pre className="m-0 text-sm leading-8 text-cyan-100/80 font-serif whitespace-pre-wrap break-words">
                                    {worldEvolutionLastRawText || '无可用原迹。'}
                                </pre>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorldModal;
