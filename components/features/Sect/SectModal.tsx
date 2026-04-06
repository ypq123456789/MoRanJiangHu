
import React, { useState } from 'react';
import { 详细门派结构, 门派任务, 职位等级排序 } from '../../../models/sect';
import { 游戏时间格式 } from '../../../models/world';

interface Props {
    sectData: 详细门派结构;
    currentTime: 游戏时间格式; // "YYYY:MM:DD:HH:MM"
    onClose: () => void;
}

type Tab = 'hall' | 'missions' | 'exchange' | 'members';

const SectModal: React.FC<Props> = ({ sectData, currentTime, onClose }) => {
    const [activeTab, setActiveTab] = useState<Tab>('hall');
    const [missionFilter, setMissionFilter] = useState<'all' | 'active' | 'available'>('all');

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

    const filteredMissions = sectData.任务列表.filter(m => {
        if (missionFilter === 'all') return true;
        if (missionFilter === 'active') return m.当前状态 === '进行中';
        if (missionFilter === 'available') return m.当前状态 === '可接取';
        return true;
    });

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] hidden md:flex items-center justify-center p-4 animate-fadeIn">
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
                        {[
                            { id: 'hall', label: '宗门大殿' },
                            { id: 'missions', label: '任务布告' },
                            { id: 'exchange', label: '藏经阁' },
                            { id: 'members', label: '同门名录' },
                        ].map(tab => (
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
                                        <h4 className="text-gray-400 font-bold text-sm uppercase tracking-widest mb-4">晋升之路</h4>
                                        <div className="space-y-4 relative">
                                            {/* Simple visual ladder */}
                                            {Object.entries(职位等级排序).sort((a,b) => a[1] - b[1]).map(([rank, lvl]) => {
                                                const currentLvl = 职位等级排序[sectData.玩家职位] || 0;
                                                const isCurrent = rank === sectData.玩家职位;
                                                const isPassed = lvl < currentLvl;

                                                if (lvl > currentLvl + 2 || lvl < currentLvl - 1) return null; // Show only relevant ranks

                                                return (
                                                    <div key={rank} className={`flex items-center gap-4 ${isCurrent ? 'opacity-100' : 'opacity-40'}`}>
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs border ${
                                                            isCurrent ? 'bg-wuxia-gold text-black border-wuxia-gold' : 
                                                            isPassed ? 'bg-gray-700 text-gray-400 border-gray-600' : 'border-gray-600 text-gray-600'
                                                        }`}>
                                                            {lvl}
                                                        </div>
                                                        <div className={`font-bold ${isCurrent ? 'text-wuxia-gold' : 'text-gray-500'}`}>
                                                            {rank}
                                                        </div>
                                                        {isCurrent && <span className="text-[10px] text-wuxia-gold border border-wuxia-gold px-2 rounded">当前</span>}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                     </div>
                                </div>
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
                                                            <span className={`text-[10px] px-2 py-0.5 rounded border ${statusColor}`}>
                                                                {isExpired ? '已过期' : mission.当前状态}
                                                            </span>
                                                            <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                                                                {mission.类型}
                                                            </span>
                                                        </div>
                                                        <p className="text-gray-400 text-sm mt-2 max-w-2xl">{mission.描述}</p>
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
                                                                        <span key={i} className="text-[10px] bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded border border-purple-800/50">
                                                                            {itemStr}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Dates Footer */}
                                                <div className="mt-4 pt-3 border-t border-gray-800/50 flex gap-6 text-[10px] font-mono text-gray-500 pl-4">
                                                    <span>发布: {mission.发布日期}</span>
                                                    <span className={`${isExpired ? 'text-red-500 font-bold' : ''}`}>截止: {mission.截止日期}</span>
                                                    {mission.刷新日期 && mission.刷新日期 !== "无" && <span>刷新: {mission.刷新日期}</span>}
                                                </div>
                                                
                                                {/* Action Button */}
                                                <div className="absolute right-5 bottom-4">
                                                    {mission.当前状态 === '可接取' && !isExpired && (
                                                        <button className="bg-wuxia-gold/10 hover:bg-wuxia-gold text-wuxia-gold hover:text-black border border-wuxia-gold px-4 py-1.5 rounded text-xs font-bold transition-all">
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
                             <div className="grid grid-cols-2 md:grid-cols-3 gap-6 animate-slide-in">
                                 {sectData.兑换列表.map(good => (
                                     <div key={good.id} className="bg-black/40 border border-gray-700 p-4 rounded-lg flex flex-col gap-3 group hover:border-wuxia-gold/50 transition-colors">
                                         <div className="flex justify-between items-start">
                                             <div className="font-bold text-gray-200">{good.物品名称}</div>
                                             <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{good.类型}</span>
                                         </div>
                                         <div className="text-xs text-gray-500">
                                             要求: <span className="text-gray-300">{good.要求职位}</span>
                                         </div>
                                         <div className="mt-auto pt-2 border-t border-gray-800 flex justify-between items-center">
                                             <div className="text-wuxia-gold font-mono font-bold">{good.兑换价格} 贡献</div>
                                             <div className="text-xs text-gray-600">库存: {good.库存}</div>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                        )}

                        {/* --- MEMBERS --- */}
                        {activeTab === 'members' && (
                            <div className="space-y-4 animate-slide-in">
                                {sectData.重要成员.map(mem => (
                                    <div key={mem.id} className="bg-black/40 border border-gray-700 p-4 rounded-lg flex flex-col gap-3 relative overflow-hidden group hover:bg-black/60 transition-colors">
                                        <div className="flex items-start gap-4 z-10">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border shrink-0 ${mem.性别 === '女' ? 'border-pink-900 bg-pink-900/10 text-pink-500' : 'border-blue-900 bg-blue-900/10 text-blue-500'}`}>
                                                {mem.姓名[0]}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-gray-200 font-bold text-lg">{mem.姓名}</span>
                                                    <span className="text-xs text-wuxia-gold font-bold bg-wuxia-gold/10 px-2 py-0.5 rounded border border-wuxia-gold/20">{mem.身份}</span>
                                                </div>
                                                <div className="text-xs text-gray-500 flex gap-3 mb-2">
                                                    <span>{mem.性别}</span>
                                                    <span>{mem.年龄}岁</span>
                                                    <span className="text-wuxia-cyan">{mem.境界}</span>
                                                </div>
                                                <p className="text-sm text-gray-400 font-serif italic border-t border-gray-800/50 pt-2">
                                                    “{mem.简介}”
                                                </p>
                                            </div>
                                        </div>
                                    </div>
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
