
import React, { useEffect, useMemo, useState } from 'react';
import { 详细门派结构, 门派任务, 职位等级排序 } from '../../../models/sect';
import { 游戏时间格式 } from '../../../models/world';

interface Props {
    sectData: 详细门派结构;
    currentTime: 游戏时间格式; // "YYYY:MM:DD:HH:MM"
    onClose: () => void;
    onOpenNpc?: (npc: any) => void;
    onLearnBook?: (book: any) => void;
    learnedBookIds?: string[];
    onAcceptMission?: (mission: 门派任务) => void;
}

type Tab = 'hall' | 'missions' | 'exchange' | 'library' | 'members';

const SectModal: React.FC<Props> = ({ sectData, currentTime, onClose, onOpenNpc, onLearnBook, learnedBookIds = [], onAcceptMission }) => {
    const [activeTab, setActiveTab] = useState<Tab>('hall');
    const [missionFilter, setMissionFilter] = useState<'all' | 'active' | 'available'>('all');
    const 未加入门派 = !sectData
        || ['none', '无', '无门无派', '未加入', '散人'].includes(String(sectData.ID || '').trim())
        || ['none', '无', '无门无派', '未加入', '散人'].includes(String(sectData.名称 || '').trim())
        || ['none', '无', '无门无派', '未加入', '散人'].includes(String(sectData.玩家职位 || '').trim());
    const tabs = useMemo(() => (
        未加入门派
            ? [{ id: 'hall' as Tab, label: '宗门大殿' }]
            : [
                { id: 'hall' as Tab, label: '宗门大殿' },
                { id: 'missions' as Tab, label: '任务布告' },
                { id: 'exchange' as Tab, label: '聚宝阁' },
                { id: 'library' as Tab, label: '藏经阁' },
                { id: 'members' as Tab, label: '同门名录' },
            ]
    ), [未加入门派]);

    useEffect(() => {
        if (未加入门派 && activeTab !== 'hall') {
            setActiveTab('hall');
        }
    }, [activeTab, 未加入门派]);

    // Helper: Parse Time
    const parseTime = (timeStr: string) => {
        const [y, m, d] = timeStr.split(':').map(Number);
        return { y, m, d };
    };

    // Helper: Compare Time (Simple string compare works for YYYY:MM:DD format generally)
    // Return true if t1 > t2
    const isTimeAfter = (t1: string, t2: string) => {
        return t1 > t2; 
    };

    const getMissionStatusColor = (status: string) => {
        switch(status) {
            case '可接取': return 'text-green-400 border-green-500/50';
            case '进行中': return 'text-wuxia-gold border-wuxia-gold/50';
            case '已完成': return 'text-gray-400 border-gray-600';
            case '已过期': return 'text-red-500 border-red-500';
            default: return 'text-gray-500 border-gray-600';
        }
    };

    const filteredMissions = (sectData.任务列表 || []).filter(m => {
        if (missionFilter === 'all') return true;
        if (missionFilter === 'active') return m.当前状态 === '进行中';
        if (missionFilter === 'available') return m.当前状态 === '可接取';
        return true;
    });
    const 累计贡献 = Math.max(sectData.玩家贡献 || 0, sectData.累计贡献 || 0);
    const 晋升门槛: Record<string, number> = {
        杂役弟子: 0,
        外门弟子: 100,
        内门弟子: 350,
        真传弟子: 900,
        执事: 1600,
        长老: 3200,
        副掌门: 6500,
        掌门: 12000
    };
    const 职位折扣: Record<string, number> = {
        杂役弟子: 0,
        外门弟子: 0.05,
        内门弟子: 0.1,
        真传弟子: 0.15,
        执事: 0.18,
        长老: 0.22,
        副掌门: 0.26,
        掌门: 0.3
    };
    const 职位特权: Record<string, string[]> = {
        杂役弟子: ['基础任务', '入门补给'],
        外门弟子: ['藏经阁入门典籍', '聚宝阁九五折'],
        内门弟子: ['进阶典籍', '聚宝阁九折'],
        真传弟子: ['真传典籍优先', '聚宝阁八五折'],
        执事: ['执事任务', '聚宝阁八二折'],
        长老: ['高阶典籍调阅', '聚宝阁七八折'],
        副掌门: ['门派要务', '聚宝阁七四折'],
        掌门: ['全阁调阅', '聚宝阁七折']
    };
    const 当前折扣 = 职位折扣[sectData.玩家职位] || 0;
    const 当前折扣文本 = 当前折扣 > 0 ? `${Math.round((1 - 当前折扣) * 100)}折` : '无折扣';
    const 计算折后贡献 = (price: number) => Math.max(1, Math.ceil(price * (1 - 当前折扣)));
    const 职位可达 = (requiredRank?: string) => (
        (职位等级排序[sectData.玩家职位] || 0) >= (职位等级排序[requiredRank || '杂役弟子'] || 0)
    );

    return (
        <div className="sect-modal-body fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] hidden md:flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-ink-black/95 border border-wuxia-gold/30 w-full max-w-6xl h-[700px] flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.9)] relative overflow-hidden rounded-2xl">
                
                {/* --- Header --- */}
                <div className="h-20 shrink-0 border-b border-gray-800/50 bg-black/40 flex items-center justify-between px-8 relative z-50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-wuxia-gold/10 border border-wuxia-gold/50 rounded-full flex items-center justify-center text-2xl font-serif font-bold text-wuxia-gold shadow-[0_0_15px_rgba(230,200,110,0.2)]">
                            {sectData.名称[0]}
                        </div>
                        <div>
                            <h3 className="text-wuxia-gold font-serif font-bold text-2xl tracking-[0.2em]">{sectData.名称}</h3>
                            <div className="flex gap-4 text-xs text-gray-500 font-mono mt-1">
                                <span>资金: <span className="text-gray-300">{sectData.门派资金}</span></span>
                                <span>物资: <span className="text-gray-300">{sectData.门派物资}</span></span>
                                <span>建设: <span className="text-gray-300">{sectData.建设度}</span></span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <div className="text-xs text-gray-500 uppercase tracking-widest">身份</div>
                            <div className="text-wuxia-cyan font-bold font-serif text-lg">{sectData.玩家职位}</div>
                        </div>
                        <div className="text-right border-l border-gray-700 pl-6">
                            <div className="text-xs text-gray-500 uppercase tracking-widest">贡献点</div>
                            <div className="text-wuxia-gold font-bold font-mono text-xl">{sectData.玩家贡献}</div>
                        </div>
                        <button 
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-wuxia-red hover:border-wuxia-red transition-all ml-4"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* --- Main Content --- */}
                <div className="flex-1 flex overflow-hidden">
                    
                    {/* Sidebar Navigation */}
                    <div className="w-64 bg-black/20 border-r border-gray-800/50 flex flex-col py-6 gap-2">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as Tab)}
                                className={`px-8 py-4 text-left font-serif font-bold tracking-widest transition-all text-sm ${
                                    activeTab === tab.id 
                                    ? 'text-wuxia-gold bg-wuxia-gold/5 border-l-4 border-wuxia-gold' 
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border-l-4 border-transparent'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 bg-ink-wash/5 relative overflow-y-auto custom-scrollbar p-8">
                        
                        {/* --- HALL (Overview) --- */}
                        {activeTab === 'hall' && (
                            <div className="max-w-4xl mx-auto space-y-8 animate-slide-in">
                                {未加入门派 ? (
                                    <div className="bg-black/30 border border-gray-700 p-8 rounded-lg relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 text-[120px] font-serif leading-none pointer-events-none">散</div>
                                        <h4 className="text-wuxia-gold font-bold text-lg mb-4 flex items-center gap-2">
                                            <span className="w-1 h-6 bg-wuxia-gold"></span>
                                            尚未加入门派
                                        </h4>
                                        <p className="text-gray-300 font-serif leading-loose text-lg indent-8">
                                            当前仍是江湖散人，暂无晋升、贡献、藏经阁、聚宝阁和同门名录。加入门派后，这里才会显示对应宗门事务。
                                        </p>
                                    </div>
                                ) : (
                                <>
                                <div className="bg-black/30 border border-gray-700 p-8 rounded-lg relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 text-[120px] font-serif leading-none pointer-events-none">宗</div>
                                    <h4 className="text-wuxia-gold font-bold text-lg mb-4 flex items-center gap-2">
                                        <span className="w-1 h-6 bg-wuxia-gold"></span>
                                        宗门宗旨
                                    </h4>
                                    <p className="text-gray-300 font-serif leading-loose text-lg indent-8">
                                        “{sectData.简介}”
                                    </p>
                                    <div className="mt-6 flex flex-wrap gap-4">
                                        {sectData.门规.map((rule, i) => (
                                            <span key={i} className="text-xs bg-red-950/30 text-red-300 border border-red-900/50 px-3 py-1 rounded">
                                                戒律{i+1}: {rule}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                     <div className="bg-black/30 border border-gray-700 p-6 rounded-lg">
                                        <h4 className="text-gray-100 font-bold text-sm uppercase tracking-widest mb-4">晋升之路</h4>
                                        <div className="space-y-4 relative">
                                            {Object.entries(职位等级排序).sort((a,b) => a[1] - b[1]).map(([rank, lvl]) => {
                                                const currentLvl = 职位等级排序[sectData.玩家职位] || 0;
                                                const isCurrent = rank === sectData.玩家职位;
                                                const isPassed = lvl < currentLvl;
                                                const required = 晋升门槛[rank] ?? lvl * 200;
                                                const contributionReady = 累计贡献 >= required;

                                                if (lvl > currentLvl + 2 || lvl < currentLvl - 1) return null;

                                                return (
                                                    <div key={rank} className={`flex items-center gap-4 ${isCurrent ? 'opacity-100' : contributionReady ? 'opacity-85' : 'opacity-60'}`}>
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs border ${
                                                            isCurrent ? 'bg-wuxia-gold text-black border-wuxia-gold' : 
                                                            isPassed ? 'bg-gray-700 text-gray-100 border-gray-600' : contributionReady ? 'border-emerald-400 text-emerald-100' : 'border-gray-600 text-gray-200'
                                                        }`}>
                                                            {lvl}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className={`font-bold ${isCurrent ? 'text-wuxia-gold' : 'text-gray-100'}`}>{rank}</div>
                                                            <div className="mt-1 text-xs text-gray-200">累计贡献 {累计贡献} / {required}</div>
                                                            <div className="mt-1 text-[11px] text-gray-400">
                                                                {(职位特权[rank] || []).join(' · ') || '暂无特权'}
                                                            </div>
                                                        </div>
                                                        {isCurrent && <span className="text-xs text-wuxia-gold border border-wuxia-gold px-2 rounded">当前</span>}
                                                        {!isCurrent && contributionReady && <span className="text-xs text-emerald-200 border border-emerald-400/50 px-2 rounded">贡献达标</span>}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                     </div>
                                     <div className="bg-black/30 border border-gray-700 p-6 rounded-lg">
                                         <h4 className="text-gray-100 font-bold text-sm uppercase tracking-widest mb-4">贡献总览</h4>
                                         <div className="grid grid-cols-2 gap-3 text-sm">
                                             <div className="rounded border border-wuxia-gold/20 bg-wuxia-gold/5 p-4">
                                                 <div className="text-gray-200">可用贡献</div>
                                                 <div className="mt-2 text-2xl font-mono font-bold text-wuxia-gold">{sectData.玩家贡献}</div>
                                             </div>
                                             <div className="rounded border border-emerald-400/20 bg-emerald-950/20 p-4">
                                                 <div className="text-gray-200">累计贡献</div>
                                                 <div className="mt-2 text-2xl font-mono font-bold text-emerald-200">{累计贡献}</div>
                                             </div>
                                         </div>
                                         <p className="mt-4 text-sm leading-6 text-gray-200">晋升只看累计生成过的贡献点，聚宝阁兑换只消耗当前可用贡献。</p>
                                         <div className="mt-4 rounded border border-wuxia-gold/20 bg-black/25 p-3">
                                             <div className="text-xs tracking-widest text-wuxia-gold/70">当前身份特权</div>
                                             <div className="mt-2 text-sm text-gray-100">{sectData.玩家职位} · 聚宝阁{当前折扣文本}</div>
                                             <div className="mt-2 flex flex-wrap gap-2">
                                                 {(职位特权[sectData.玩家职位] || ['基础门派事务']).map(item => (
                                                     <span key={item} className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-gray-200">{item}</span>
                                                 ))}
                                             </div>
                                         </div>
                                     </div>
                                </div>
                                </>
                                )}
                            </div>
                        )}

                        {/* --- MISSIONS --- */}
                        {activeTab === 'missions' && (
                            <div className="space-y-6 animate-slide-in">
                                {/* Filters */}
                                <div className="flex gap-4 mb-6 border-b border-gray-800 pb-4">
                                    {['all', 'available', 'active'].map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setMissionFilter(f as any)}
                                            className={`px-4 py-1 text-xs rounded transition-all ${
                                                missionFilter === f 
                                                ? 'bg-wuxia-gold text-black font-bold' 
                                                : 'text-gray-500 hover:text-gray-300'
                                            }`}
                                        >
                                            {f === 'all' ? '全部' : f === 'available' ? '可接取' : '进行中'}
                                        </button>
                                    ))}
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {filteredMissions.map(mission => {
                                        const statusColor = getMissionStatusColor(mission.当前状态);
                                        const isExpired = isTimeAfter(currentTime, mission.截止日期) && mission.当前状态 !== '已完成';

                                        return (
                                            <div key={mission.id} className="relative bg-black/40 border border-gray-700 hover:border-gray-500 transition-all p-5 rounded-lg group">
                                                {/* Left Border Status Indicator */}
                                                <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${
                                                    mission.当前状态 === '可接取' ? 'bg-green-500' : 
                                                    mission.当前状态 === '进行中' ? 'bg-wuxia-gold' : 'bg-gray-600'
                                                }`}></div>

                                                <div className="flex justify-between items-start pl-4">
                                                    <div>
                                                        <div className="flex items-center gap-3 mb-1">
                                                            <h4 className="text-gray-200 font-bold text-lg">{mission.标题}</h4>
                                                            <span className={`text-xs px-2 py-0.5 rounded border ${statusColor}`}>
                                                                {isExpired ? '已过期' : mission.当前状态}
                                                            </span>
                                                            <span className="text-xs bg-gray-800 text-gray-200 px-2 py-0.5 rounded">
                                                                {mission.类型}
                                                            </span>
                                                        </div>
                                                        <p className="text-gray-300 text-sm mt-2 max-w-2xl">{mission.描述}</p>
                                                    </div>
                                                    
                                                    {/* Rewards */}
                                                    <div className="text-right">
                                                        <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">奖励</div>
                                                        <div className="flex flex-col gap-1 items-end">
                                                            <span className="text-wuxia-gold font-mono font-bold text-sm">+{mission.奖励贡献} 贡献</span>
                                                            {mission.奖励资金 > 0 && <span className="text-gray-300 font-mono text-xs">+{mission.奖励资金} 铜钱</span>}
                                                            {mission.奖励物品 && (
                                                                <div className="flex flex-col gap-0.5 mt-1 items-end">
                                                                    {mission.奖励物品.map((itemStr, i) => (
                                                                        <span key={i} className="text-xs bg-purple-900/30 text-purple-100 px-2 py-0.5 rounded border border-purple-800/50">
                                                                            {itemStr}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Dates Footer */}
                                                <div className="mt-4 pt-3 border-t border-gray-800/50 flex gap-6 text-xs font-mono text-gray-300 pl-4">
                                                    <span>发布: {mission.发布日期}</span>
                                                    <span className={`${isExpired ? 'text-red-500 font-bold' : ''}`}>截止: {mission.截止日期}</span>
                                                    {mission.刷新日期 && mission.刷新日期 !== "无" && <span>刷新: {mission.刷新日期}</span>}
                                                </div>
                                                
                                                {/* Action Button */}
                                                <div className="absolute right-5 bottom-4">
                                                    {mission.当前状态 === '可接取' && !isExpired && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onAcceptMission?.(mission)}
                                                            className="bg-wuxia-gold/10 hover:bg-wuxia-gold text-wuxia-gold hover:text-black border border-wuxia-gold px-4 py-1.5 rounded text-xs font-bold transition-all"
                                                        >
                                                            接取任务
                                                        </button>
                                                    )}
                                                    {mission.当前状态 === '进行中' && !isExpired && (
                                                         <button className="bg-gray-800 text-gray-400 border border-gray-600 px-4 py-1.5 rounded text-xs cursor-not-allowed">
                                                            进行中...
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* --- EXCHANGE --- */}
                        {activeTab === 'exchange' && (
                             <div className="space-y-5 animate-slide-in">
                                 <div className="rounded-lg border border-wuxia-gold/20 bg-wuxia-gold/5 p-4">
                                     <div className="text-lg font-bold text-wuxia-gold">聚宝阁</div>
                                     <p className="mt-2 text-sm leading-6 text-gray-300">贡献点足够即可兑换。兑换消耗当前贡献，不影响晋升所需的累计贡献。</p>
                                 </div>
                                 <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                     {sectData.兑换列表.map(good => {
                                         const discountedPrice = 计算折后贡献(good.兑换价格);
                                         const canExchange = 职位可达(good.要求职位) && sectData.玩家贡献 >= discountedPrice && good.库存 > 0;
                                         return (
                                             <div key={good.id} className="bg-black/40 border border-gray-700 p-4 rounded-lg flex flex-col gap-3 group hover:border-wuxia-gold/50 transition-colors">
                                                 <div className="flex justify-between items-start">
                                                     <div className="font-bold text-gray-100">{good.物品名称}</div>
                                                     <span className="text-xs bg-gray-800 text-gray-100 px-1.5 py-0.5 rounded">{good.类型}</span>
                                                 </div>
                                                 <div className="text-sm text-gray-200">
                                                     要求: <span className="text-gray-100">{good.要求职位}</span>
                                                 </div>
                                                 <div className="mt-auto pt-2 border-t border-gray-800 flex justify-between items-center">
                                                     <div className="text-wuxia-gold font-mono font-bold">
                                                         {discountedPrice} 贡献
                                                         {discountedPrice !== good.兑换价格 && (
                                                             <span className="ml-2 text-xs text-gray-400 line-through">{good.兑换价格}</span>
                                                         )}
                                                     </div>
                                                     <div className="text-xs text-gray-200">库存: {good.库存}</div>
                                                 </div>
                                                 {当前折扣 > 0 && <div className="text-[11px] text-emerald-300">身份折扣：{当前折扣文本}</div>}
                                                 <button className={`rounded px-3 py-2 text-sm font-bold transition-colors ${canExchange ? 'border border-wuxia-gold bg-wuxia-gold/15 text-wuxia-gold hover:bg-wuxia-gold hover:text-black' : 'border border-gray-700 bg-gray-900 text-gray-300 cursor-not-allowed'}`}>
                                                     {canExchange ? '可兑换' : !职位可达(good.要求职位) ? '身份不足' : '贡献不足'}
                                                 </button>
                                             </div>
                                         );
                                     })}
                                 </div>
                             </div>
                        )}

                        {/* --- LIBRARY --- */}
                        {activeTab === 'library' && (
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-slide-in">
                                 {(sectData.藏经阁列表 || []).map(book => {
                                     const canRead = 职位可达(book.要求职位) && 累计贡献 >= book.要求累计贡献;
                                     const alreadyLearned = learnedBookIds.includes(book.id);
                                     const canLearn = canRead && !alreadyLearned;
                                     return (
                                         <div key={book.id} className="bg-black/40 border border-gray-700 p-5 rounded-lg transition-colors hover:border-wuxia-gold/50">
                                             <div className="flex items-start justify-between gap-4">
                                                 <div>
                                                     <div className="text-lg font-bold text-gray-100">{book.名称}</div>
                                                     <div className="mt-2 flex gap-2 text-xs">
                                                         <span className="rounded border border-wuxia-gold/30 px-2 py-0.5 text-wuxia-gold">{book.类型}</span>
                                                         <span className="rounded border border-white/15 px-2 py-0.5 text-gray-200">{book.品阶}</span>
                                                     </div>
                                                 </div>
                                                  <span className={`rounded border px-2 py-1 text-xs ${alreadyLearned ? 'border-gray-600 text-gray-300' : canRead ? 'border-emerald-400/50 text-emerald-200' : 'border-gray-700 text-gray-300'}`}>
                                                      {alreadyLearned ? '已学习' : canRead ? '可学' : !职位可达(book.要求职位) ? '身份未足' : '贡献未足'}
                                                  </span>
                                             </div>
                                             <p className="mt-4 text-sm leading-6 text-gray-300">{book.简介}</p>
                                              <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-gray-300">
                                                  <div className="rounded border border-white/10 bg-black/20 px-3 py-2">职位 {book.要求职位}</div>
                                                  <div className="rounded border border-white/10 bg-black/20 px-3 py-2">累计贡献 {book.要求累计贡献}</div>
                                              </div>
                                               <button
                                                   type="button"
                                                   disabled={!canLearn}
                                                   onClick={() => onLearnBook?.(book)}
                                                   className={`mt-4 w-full rounded px-3 py-2 text-sm font-bold transition-colors ${canLearn ? 'border border-wuxia-gold bg-wuxia-gold/15 text-wuxia-gold hover:bg-wuxia-gold hover:text-black' : 'border border-gray-700 bg-gray-900 text-gray-400 cursor-not-allowed'}`}
                                               >
                                                  {alreadyLearned ? '已学习' : '学习'}
                                              </button>
                                          </div>
                                      );
                                 })}
                             </div>
                        )}

                        {/* --- MEMBERS --- */}
                        {activeTab === 'members' && (
                            <div className="space-y-4 animate-slide-in">
                                {sectData.重要成员.map(mem => (
                                    <button
                                        key={mem.id}
                                        type="button"
                                        onClick={() => onOpenNpc?.(mem)}
                                        className="w-full text-left bg-black/40 border border-gray-700 p-4 rounded-lg flex flex-col gap-3 relative overflow-hidden group hover:bg-black/60 hover:border-wuxia-gold/40 transition-colors"
                                    >
                                        <div className="flex items-start gap-4 z-10">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border shrink-0 ${mem.性别 === '女' ? 'border-pink-900 bg-pink-900/10 text-pink-500' : 'border-blue-900 bg-blue-900/10 text-blue-500'}`}>
                                                {mem.姓名[0]}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-gray-200 font-bold text-lg">{mem.姓名}</span>
                                                    <span className="text-xs text-wuxia-gold font-bold bg-wuxia-gold/10 px-2 py-0.5 rounded border border-wuxia-gold/20">{mem.身份}</span>
                                                </div>
                                                <div className="text-xs text-gray-300 flex gap-3 mb-2">
                                                    <span>{mem.性别}</span>
                                                    <span>{mem.年龄}岁</span>
                                                    <span className="text-wuxia-cyan">{mem.境界}</span>
                                                </div>
                                                <p className="text-sm text-gray-200 font-serif border-t border-gray-800/50 pt-2">
                                                    “{mem.简介}”
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};

export default SectModal;
