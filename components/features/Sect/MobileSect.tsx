import React, { useState } from 'react';
import { 详细门派结构, 职位等级排序 } from '../../../models/sect';
import { 游戏时间格式 } from '../../../models/world';

interface Props {
    sectData: 详细门派结构;
    currentTime: 游戏时间格式;
    onClose: () => void;
}

type Tab = 'hall' | 'missions' | 'exchange' | 'members';

const MobileSect: React.FC<Props> = ({ sectData, currentTime, onClose }) => {
    const [activeTab, setActiveTab] = useState<Tab>('hall');
    const [missionFilter, setMissionFilter] = useState<'all' | 'active' | 'available'>('all');

    const isTimeAfter = (t1: string, t2: string) => t1 > t2;

    const getMissionStatusColor = (status: string) => {
        switch (status) {
            case '可接取': return 'text-green-400 border-green-500/50';
            case '进行中': return 'text-wuxia-gold border-wuxia-gold/50';
            case '已完成': return 'text-gray-400 border-gray-600';
            case '已过期': return 'text-red-500 border-red-500';
            default: return 'text-gray-500 border-gray-600';
        }
    };

    const filteredMissions = sectData.任务列表.filter(m => {
        if (missionFilter === 'all') return true;
        if (missionFilter === 'active') return m.当前状态 === '进行中';
        if (missionFilter === 'available') return m.当前状态 === '可接取';
        return true;
    });

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:hidden animate-fadeIn">
            <div className="bg-ink-black/95 border border-wuxia-gold/30 w-full max-w-[620px] h-[86vh] flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden rounded-2xl">
                <div className="h-12 shrink-0 border-b border-gray-800/60 bg-black/40 flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-wuxia-gold/10 border border-wuxia-gold/50 rounded-full flex items-center justify-center text-base font-serif font-bold text-wuxia-gold">
                            {sectData.名称[0]}
                        </div>
                        <div>
                            <div className="text-wuxia-gold font-serif font-bold text-base">{sectData.名称}</div>
                            <div className="text-[9px] text-gray-500 font-mono">{sectData.玩家职位}</div>
                        </div>
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

                <div className="border-b border-gray-800/60 bg-black/30 px-3 py-2 overflow-x-auto no-scrollbar">
                    <div className="flex gap-2">
                        {[
                            { id: 'hall', label: '宗门' },
                            { id: 'missions', label: '任务' },
                            { id: 'exchange', label: '藏经' },
                            { id: 'members', label: '同门' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as Tab)}
                                className={`px-3 py-1.5 text-[11px] rounded-full border transition-colors ${
                                    activeTab === tab.id
                                        ? 'border-wuxia-gold bg-wuxia-gold/10 text-wuxia-gold'
                                        : 'border-gray-800 text-gray-400 bg-black/20'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-ink-wash/5">
                    {activeTab === 'hall' && (
                        <>
                            <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
                                <div className="flex justify-between text-[11px] text-gray-400">
                                    <span>资金 <span className="text-gray-200">{sectData.门派资金}</span></span>
                                    <span>物资 <span className="text-gray-200">{sectData.门派物资}</span></span>
                                    <span>建设 <span className="text-gray-200">{sectData.建设度}</span></span>
                                </div>
                                <div className="mt-3 flex items-center justify-between">
                                    <div className="text-[10px] text-gray-500">贡献点</div>
                                    <div className="text-wuxia-gold font-mono font-bold">{sectData.玩家贡献}</div>
                                </div>
                            </div>

                            <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
                                <div className="text-[10px] text-wuxia-gold/70 tracking-[0.3em] mb-2">宗门宗旨</div>
                                <p className="text-sm text-gray-300 font-serif leading-relaxed">“{sectData.简介}”</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {sectData.门规.map((rule, i) => (
                                        <span key={i} className="text-[10px] bg-red-950/30 text-red-300 border border-red-900/50 px-2 py-1 rounded">
                                            戒律{i + 1}: {rule}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
                                <div className="text-[10px] text-wuxia-gold/70 tracking-[0.3em] mb-2">晋升之路</div>
                                <div className="space-y-2">
                                    {Object.entries(职位等级排序)
                                        .sort((a, b) => a[1] - b[1])
                                        .map(([rank, lvl]) => {
                                            const currentLvl = 职位等级排序[sectData.玩家职位] || 0;
                                            if (lvl > currentLvl + 2 || lvl < currentLvl - 1) return null;
                                            const isCurrent = rank === sectData.玩家职位;
                                            const isPassed = lvl < currentLvl;
                                            return (
                                                <div key={rank} className="flex items-center gap-3 text-[11px]">
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] border ${
                                                        isCurrent ? 'bg-wuxia-gold text-black border-wuxia-gold' :
                                                        isPassed ? 'bg-gray-700 text-gray-400 border-gray-600' : 'border-gray-600 text-gray-500'
                                                    }`}>
                                                        {lvl}
                                                    </div>
                                                    <span className={isCurrent ? 'text-wuxia-gold' : 'text-gray-400'}>{rank}</span>
                                                    {isCurrent && <span className="text-[9px] text-wuxia-gold border border-wuxia-gold px-2 rounded">当前</span>}
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'missions' && (
                        <>
                            <div className="flex gap-2">
                                {['all', 'available', 'active'].map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setMissionFilter(f as any)}
                                        className={`px-3 py-1.5 text-[11px] rounded-full border transition-all ${
                                            missionFilter === f ? 'bg-wuxia-gold/15 border-wuxia-gold text-wuxia-gold' : 'border-gray-800 text-gray-500'
                                        }`}
                                    >
                                        {f === 'all' ? '全部' : f === 'available' ? '可接取' : '进行中'}
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-3">
                                {filteredMissions.map(mission => {
                                    const statusColor = getMissionStatusColor(mission.当前状态);
                                    const isExpired = isTimeAfter(currentTime, mission.截止日期) && mission.当前状态 !== '已完成';
                                    return (
                                        <div key={mission.id} className="bg-black/40 border border-gray-800 rounded-xl p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm text-gray-200 font-bold">{mission.标题}</div>
                                                    <div className="text-[10px] text-gray-500 mt-1">{mission.描述}</div>
                                                </div>
                                                <span className={`text-[10px] px-2 py-0.5 rounded border ${statusColor}`}>
                                                    {isExpired ? '已过期' : mission.当前状态}
                                                </span>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-500 font-mono">
                                                <span>发布 {mission.发布日期}</span>
                                                <span className={isExpired ? 'text-red-400' : ''}>截止 {mission.截止日期}</span>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-[11px]">
                                                <span className="text-wuxia-gold font-mono">+{mission.奖励贡献} 贡献</span>
                                                {mission.当前状态 === '可接取' && !isExpired && (
                                                    <button className="px-3 py-1 text-[10px] rounded border border-wuxia-gold text-wuxia-gold hover:bg-wuxia-gold/10">
                                                        接取任务
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {activeTab === 'exchange' && (
                        <div className="grid grid-cols-2 gap-3">
                            {sectData.兑换列表.map(good => (
                                <div key={good.id} className="bg-black/40 border border-gray-800 rounded-xl p-3 space-y-2">
                                    <div className="text-sm text-gray-200 font-bold">{good.物品名称}</div>
                                    <div className="text-[10px] text-gray-500">要求 {good.要求职位}</div>
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-wuxia-gold font-mono">{good.兑换价格} 贡献</span>
                                        <span className="text-gray-500">库存 {good.库存}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'members' && (
                        <div className="space-y-3">
                            {sectData.重要成员.map(mem => (
                                <div key={mem.id} className="bg-black/40 border border-gray-800 rounded-xl p-4 flex items-start gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-base border shrink-0 ${
                                        mem.性别 === '女' ? 'border-pink-900 bg-pink-900/10 text-pink-500' : 'border-blue-900 bg-blue-900/10 text-blue-500'
                                    }`}>
                                        {mem.姓名[0]}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-200 font-bold">{mem.姓名}</span>
                                            <span className="text-[9px] text-wuxia-gold bg-wuxia-gold/10 px-2 py-0.5 rounded border border-wuxia-gold/20">{mem.身份}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-1">{mem.性别} · {mem.年龄}岁 · {mem.境界}</div>
                                        <p className="text-[11px] text-gray-400 mt-2">“{mem.简介}”</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MobileSect;
