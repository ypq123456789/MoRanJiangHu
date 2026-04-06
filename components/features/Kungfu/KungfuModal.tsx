import React, { useEffect, useMemo, useState } from 'react';
import { 功法结构 } from '../../../models/kungfu';
import { getRarityNameClass, getRarityStyles } from '../../ui/rarityStyles';
import { IconLock, IconScroll, IconSparkles, IconYinYang } from '../../ui/Icons';

interface Props {
    skills: 功法结构[];
    onClose: () => void;
}

const KungfuModal: React.FC<Props> = ({ skills, onClose }) => {
    const safeSkills = Array.isArray(skills) ? skills : [];
    const [selectedId, setSelectedId] = useState<string | null>(
        safeSkills.length > 0 ? safeSkills[0].ID : null
    );

    useEffect(() => {
        if (!selectedId || !safeSkills.some((s) => s.ID === selectedId)) {
            setSelectedId(safeSkills.length > 0 ? safeSkills[0].ID : null);
        }
    }, [selectedId, safeSkills]);

    const currentSkill = useMemo(
        () => safeSkills.find((s) => s.ID === selectedId) || null,
        [safeSkills, selectedId]
    );

    const StatBox: React.FC<{ label: string; value: string | number; sub?: string; icon?: React.ReactNode }> = ({ label, value, sub, icon }) => (
        <div className="bg-gradient-to-br from-black/60 to-black/30 border border-wuxia-gold/10 p-3 rounded-xl flex flex-col items-center justify-center min-w-[90px] shadow-inner hover:border-wuxia-gold/30 transition-colors group">
            <div className="flex items-center gap-1.5 mb-1.5">
                {icon && <span className="text-wuxia-gold/50 opacity-70 group-hover:opacity-100 transition-opacity">{icon}</span>}
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-serif">{label}</span>
            </div>
            <span className="font-mono text-xl text-wuxia-gold font-bold drop-shadow-[0_0_5px_rgba(212,175,55,0.3)]">{value}</span>
            {sub && <span className="text-[9px] text-gray-400 mt-1 bg-black/40 px-2 py-0.5 rounded-full border border-gray-800">{sub}</span>}
        </div>
    );

    const categories = useMemo(() => {
        const cats = new Set(safeSkills.map(s => s.类型));
        return Array.from(cats);
    }, [safeSkills]);

    const [activeFilter, setActiveFilter] = useState<string>('全部');

    const filteredSkills = useMemo(() => {
        if (activeFilter === '全部') return safeSkills;
        return safeSkills.filter(s => s.类型 === activeFilter);
    }, [safeSkills, activeFilter]);

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-ink-black/95 w-full max-w-7xl max-h-[90vh] h-[90vh] flex flex-col rounded-2xl border border-wuxia-gold/20 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 relative overflow-hidden">
                
                {/* 装饰类背景层 */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[url('/assets/images/ui/paper-texture.png')] opacity-5 mix-blend-overlay"></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-wuxia-gold/5 via-transparent to-black"></div>
                </div>

                {/* 顶栏 */}
                <div className="h-14 shrink-0 border-b border-wuxia-gold/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-6 relative z-50">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-sm rotate-45 bg-wuxia-gold animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>
                        <h3 className="text-wuxia-gold font-serif font-bold text-xl tracking-[0.4em] drop-shadow-md">
                            武学典籍
                            <span className="text-[10px] text-wuxia-gold/50 ml-2 font-mono tracking-widest border border-wuxia-gold/20 px-2 py-0.5 rounded-full">MARTIAL ARTS</span>
                        </h3>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex flex-wrap bg-black/50 rounded-lg p-1 border border-gray-800 gap-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            <button
                                onClick={() => setActiveFilter('全部')}
                                className={`px-4 py-1.5 text-xs rounded transition-all font-serif tracking-widest ${activeFilter === '全部' ? 'bg-wuxia-gold/20 text-wuxia-gold shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                览尽群书
                            </button>
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setActiveFilter(cat)}
                                    className={`px-4 py-1.5 text-xs rounded transition-all font-serif tracking-widest ${activeFilter === cat ? 'bg-wuxia-gold/20 text-wuxia-gold shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-400 hover:bg-red-400/10 transition-all hover:rotate-90"
                            title="合卷"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden relative z-10">
                    {/* 左侧：秘籍列表 */}
                    <div className="w-[320px] shrink-0 border-r border-wuxia-gold/10 bg-black/40 backdrop-blur-sm flex flex-col relative overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            {filteredSkills.map((skill) => {
                                const isSelected = selectedId === skill.ID;
                                const qStyles = getRarityStyles(skill.品质);
                                const expMax = Math.max(skill.升级经验 || 0, 1);
                                const progress = Math.min((skill.当前熟练度 / expMax) * 100, 100);
                                const isMaxed = skill.当前重数 >= (skill.最高重数 || 10);

                                return (
                                    <button
                                        key={skill.ID}
                                        onClick={() => setSelectedId(skill.ID)}
                                        className={`w-full text-left p-4 rounded-xl transition-all relative group overflow-hidden border flex flex-col gap-2 ${
                                            isSelected
                                                ? `bg-gradient-to-br ${qStyles.bg} bg-opacity-10 border-wuxia-gold/40 shadow-[0_0_15px_rgba(212,175,55,0.1)]`
                                                : 'border-wuxia-gold/5 bg-black/40 hover:border-wuxia-gold/20 hover:bg-white/5'
                                        }`}
                                    >
                                        {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>}
                                        
                                        <div className="flex justify-between items-start w-full relative z-10">
                                            <div className="flex-1 min-w-0 pr-2">
                                                <div className={`font-serif text-lg truncate drop-shadow-sm ${getRarityNameClass(skill.品质)} ${isSelected ? 'font-bold' : ''}`}>
                                                    {skill.名称}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-[10px] px-1.5 py-0.5 border rounded-sm font-serif tracking-widest shadow-inner bg-black/60 ${qStyles.text} ${qStyles.border}`}>
                                                        {skill.品质}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500 font-serif tracking-widest">{skill.类型}</span>
                                                </div>
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end">
                                                <div className="text-[10px] text-wuxia-gold/60 font-serif tracking-widest mb-1">造诣</div>
                                                <div className="flex items-baseline gap-0.5 text-wuxia-gold font-mono">
                                                    <span className="text-xl leading-none font-bold">{skill.当前重数}</span>
                                                    <span className="text-xs text-gray-500">重</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="w-full relative z-10 mt-1">
                                            <div className="h-1 bg-black/60 rounded-full border border-white/5 overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all duration-500 shadow-[0_0_5px_currentColor] ${isMaxed ? 'bg-wuxia-gold' : 'bg-wuxia-gold/60'}`} 
                                                    style={{ width: `${progress}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        
                                        {/* 装饰修饰 */}
                                        <div className="absolute right-0 bottom-0 text-7xl font-serif text-wuxia-gold opacity-[0.03] transform translate-y-4 translate-x-4 select-none pointer-events-none group-hover:opacity-[0.05] transition-opacity">
                                            {skill.类型[0] || '武'}
                                        </div>
                                    </button>
                                );
                            })}
                            {filteredSkills.length === 0 && (
                                <div className="text-center text-wuxia-gold/40 font-serif text-lg py-20 tracking-widest border border-dashed border-wuxia-gold/10 rounded-xl bg-black/20">
                                    <span className="block mb-4 opacity-50"><IconScroll size={40} className="mx-auto" /></span>
                                    腹中空空，暂无墨水
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右侧：典籍详情 */}
                    <div className="flex-1 p-8 overflow-y-auto relative" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {/* 书卷背景印花 */}
                        <div className="absolute right-0 top-0 text-[400px] text-wuxia-gold opacity-[0.02] font-serif select-none pointer-events-none leading-none -mt-20 -mr-20">
                            {currentSkill?.名称?.[0] || '武'}
                        </div>

                        {currentSkill ? (
                            <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn relative z-10">
                                
                                {/* 卷首语：标题与信息 */}
                                <div className="flex items-start justify-between border-b-2 border-wuxia-gold/20 pb-8 relative">
                                    <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-wuxia-gold/0 via-wuxia-gold/50 to-wuxia-gold/0"></div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="w-4 h-4 rotate-45 border-2 border-wuxia-gold/50 flex items-center justify-center bg-black/50 shadow-[0_0_10px_rgba(212,175,55,0.3)]">
                                                <div className="w-1.5 h-1.5 bg-wuxia-gold"></div>
                                            </div>
                                            <h2 className={`text-4xl font-black font-serif tracking-[0.1em] drop-shadow-lg ${getRarityNameClass(currentSkill.品质)}`}>{currentSkill.名称}</h2>
                                        </div>
                                        
                                        <div className="flex items-center gap-3 mb-6">
                                            <span className={`text-xs px-3 py-1 border rounded-sm font-serif tracking-widest shadow-inner bg-black/60 ${getRarityStyles(currentSkill.品质).text} ${getRarityStyles(currentSkill.品质).border}`}>
                                                品质 · {currentSkill.品质}
                                            </span>
                                            <span className="text-[10px] px-3 py-1.5 bg-gray-900 text-gray-400 rounded-sm border border-gray-700 font-serif tracking-widest shadow-inner">
                                                武学类别 · {currentSkill.类型}
                                            </span>
                                            <div className="flex-1 border-b border-dashed border-wuxia-gold/20 mx-4"></div>
                                            <div className="text-xs text-wuxia-gold/60 font-serif italic border border-wuxia-gold/10 px-3 py-1 rounded bg-black/40">
                                                传自：<span className="text-gray-300 not-italic">{currentSkill.来源 || '未知高人'}</span>
                                            </div>
                                        </div>

                                        <div className="bg-black/30 border-l-4 border-wuxia-gold/40 p-5 rounded-r-xl shadow-inner relative overflow-hidden">
                                            <svg className="absolute text-wuxia-gold/5 w-24 h-24 -top-4 -right-4 rotate-12" fill="currentColor" viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm2 2h8v2H8V8zm0 4h8v2H8v-2z" /></svg>
                                            <p className="text-gray-300 text-base font-serif italic leading-loose tracking-wide">
                                                “ {currentSkill.描述 || '此功法精妙绝伦，非恒心者不能大成。'} ”
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* 功法造诣概览 */}
                                <div className="bg-gradient-to-br from-black/60 to-black/30 border border-wuxia-gold/20 p-6 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                                    <div className="flex justify-between items-end mb-4 border-b border-wuxia-gold/10 pb-4">
                                        <div className="flex items-center gap-3">
                                            <IconYinYang size={24} className="text-wuxia-gold drop-shadow-md" />
                                            <div>
                                                <h4 className="text-wuxia-gold font-serif font-bold text-lg tracking-widest">修炼造诣</h4>
                                                <div className="text-[10px] text-gray-500 font-serif mt-1">当前境界：第 {currentSkill.当前重数} 重层级</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-3xl font-mono text-wuxia-gold font-bold drop-shadow-[0_0_8px_rgba(212,175,55,0.4)]">{currentSkill.当前熟练度}</span>
                                            <span className="text-gray-500 font-mono text-lg ml-2">/ {currentSkill.升级经验}</span>
                                            <div className="text-[10px] text-wuxia-gold/50 tracking-widest font-serif mt-1 border-t border-wuxia-gold/10 pt-1">武道熟练度</div>
                                        </div>
                                    </div>
                                    
                                    <div className="w-full h-3 bg-black/80 rounded-full overflow-hidden border border-white/10 relative shadow-inner mb-6">
                                        <div
                                            className="h-full bg-gradient-to-r from-wuxia-gold-dark to-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.6)] transition-all duration-1000 ease-out"
                                            style={{ width: `${Math.min((currentSkill.当前熟练度 / Math.max(currentSkill.升级经验, 1)) * 100, 100)}%` }}
                                        ></div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex bg-black/40 border border-wuxia-gold/10 rounded-xl overflow-hidden shadow-inner">
                                            <div className="bg-gradient-to-b from-gray-900 to-black p-3 flex flex-col items-center justify-center border-r border-wuxia-gold/10 shrink-0 w-24">
                                                <span className="text-gray-500 text-[10px] font-serif tracking-widest mb-1">天资所限</span>
                                                <IconLock size={14} className="text-wuxia-gold/60" />
                                            </div>
                                            <div className="p-3 flex items-center text-sm font-serif text-gray-300 flex-1 pl-4">
                                                {currentSkill.境界限制 ? currentSkill.境界限制 : <span className="text-gray-600 italic">有教无类，并无门槛</span>}
                                            </div>
                                        </div>
                                        <div className="flex bg-black/40 border border-wuxia-gold/10 rounded-xl overflow-hidden shadow-inner">
                                            <div className="bg-gradient-to-b from-gray-900 to-black p-3 flex flex-col items-center justify-center border-r border-wuxia-gold/10 shrink-0 w-24">
                                                <span className="text-gray-500 text-[10px] font-serif tracking-widest mb-1">破境机缘</span>
                                                <IconSparkles size={14} className="text-wuxia-gold/60" />
                                            </div>
                                            <div className="p-3 flex items-center text-sm font-serif text-gray-300 flex-1 pl-4 leading-relaxed">
                                                {currentSkill.突破条件 ? currentSkill.突破条件 : <span className="text-gray-600 italic">水到渠成，顺其自然</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 武道参数 */}
                                <div>
                                    <div className="flex items-center gap-2 mb-4 border-b border-wuxia-gold/20 pb-2">
                                        <span className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/50"></span>
                                        <div className="text-base text-wuxia-gold/90 font-serif tracking-widest font-bold">武道真意</div>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                        <StatBox 
                                            label="基础伤害" value={currentSkill.基础伤害 || 0} sub={currentSkill.伤害类型 || '无属性'} 
                                            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                                        />
                                        <StatBox 
                                            label="属性加成" value={`x${currentSkill.加成系数 || 0}`} sub={currentSkill.加成属性 || '无加成'} 
                                            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>}
                                        />
                                        <StatBox 
                                            label="内力振幅" value={`x${currentSkill.内力系数 || 0}`} sub="内劲加成"
                                            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /></svg>}
                                        />
                                        
                                        <div className="col-span-2 grid grid-rows-2 gap-3">
                                            <div className="bg-black/40 border border-gray-800 rounded-lg flex items-center px-4 hover:border-wuxia-gold/30 transition-colors">
                                                <div className="w-16 shrink-0 border-r border-gray-800 flex flex-col py-1.5">
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-serif mb-0.5">施展</span>
                                                    <span className="font-mono text-gray-300 font-bold">{currentSkill.施展耗时 || 1} <span className="font-serif text-xs font-normal">息</span></span>
                                                </div>
                                                <div className="w-16 shrink-0 border-r border-gray-800 flex flex-col py-1.5 ml-4 pl-4">
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-serif mb-0.5">调息</span>
                                                    <span className="font-mono text-gray-300 font-bold">{currentSkill.冷却时间 || 0} <span className="font-serif text-xs font-normal">息</span></span>
                                                </div>
                                                <div className="flex-1 flex justify-end gap-2 items-center min-w-0">
                                                    <span className="font-serif text-red-400 font-bold bg-red-950/30 px-2 py-0.5 rounded border border-red-900/40 truncate">
                                                        耗 {currentSkill.消耗数值 || 0} {currentSkill.消耗类型 || '精力'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="bg-black/40 border border-gray-800 rounded-lg flex items-center justify-between px-4 hover:border-wuxia-gold/30 transition-colors">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-serif">招式范围</span>
                                                </div>
                                                <span className="text-gray-300 font-serif text-sm bg-black/50 px-3 py-1 rounded shadow-inner border border-white/5">
                                                    {currentSkill.目标类型 || '单体'} · 最多 <span className="text-wuxia-gold font-mono font-bold mx-1">{currentSkill.最大目标数 || 1}</span> 目标
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 pt-4">
                                    {/* 左半区：效果与被动 */}
                                    <div className="space-y-8">
                                        {currentSkill.附带效果 && currentSkill.附带效果.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4 border-b border-cyan-900/30 pb-2">
                                                    <span className="w-1 h-3 bg-cyan-600/70 rounded-full"></span>
                                                    <div className="text-sm text-cyan-400/90 font-serif tracking-widest font-bold">玄妙流转：附带效果</div>
                                                </div>
                                                <div className="space-y-3">
                                                    {currentSkill.附带效果.map((eff, i) => (
                                                        <div key={`eff-${i}`} className="bg-gradient-to-r from-cyan-950/20 to-black border border-cyan-900/30 p-4 rounded-xl shadow-inner hover:border-cyan-700/50 transition-colors group">
                                                            <div className="flex justify-between items-center mb-3">
                                                                <span className="text-cyan-300 font-serif font-bold text-lg drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">{eff.名称}</span>
                                                                <span className="text-[10px] text-cyan-200/60 font-mono bg-cyan-950/50 border border-cyan-900/50 px-2 py-0.5 rounded uppercase tracking-widest">
                                                                    触发机率: {eff.触发概率}
                                                                </span>
                                                            </div>
                                                            <div className="bg-black/50 border border-cyan-900/20 rounded p-2.5 flex items-center justify-between text-xs font-mono text-gray-400">
                                                                <div className="flex flex-col items-center flex-1 border-r border-cyan-900/20 last:border-0">
                                                                    <span className="mb-0.5 text-cyan-500/50 font-serif">持续一遭</span>
                                                                    <span className="text-cyan-100 font-bold">{eff.持续时间}息</span>
                                                                </div>
                                                                <div className="flex flex-col items-center flex-1 border-r border-cyan-900/20 last:border-0">
                                                                    <span className="mb-0.5 text-cyan-500/50 font-serif">流转间隔</span>
                                                                    <span className="text-cyan-100 font-bold">{eff.生效间隔}息</span>
                                                                </div>
                                                                <div className="flex flex-col items-center flex-1">
                                                                    <span className="mb-0.5 text-cyan-500/50 font-serif">威能参数</span>
                                                                    <span className="text-cyan-400 font-bold text-sm bg-cyan-900/30 px-2 rounded">{eff.数值参数 || 0}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {currentSkill.被动修正 && currentSkill.被动修正.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4 border-b border-emerald-900/30 pb-2">
                                                    <span className="w-1 h-3 bg-emerald-600/70 rounded-full"></span>
                                                    <div className="text-sm text-emerald-400/90 font-serif tracking-widest font-bold">潜移默化：被动修正</div>
                                                </div>
                                                <div className="bg-gradient-to-br from-black/40 to-black/80 border border-emerald-900/20 p-4 rounded-xl shadow-inner divide-y divide-emerald-900/20">
                                                    {currentSkill.被动修正.map((mod, i) => (
                                                        <div key={`mod-${i}`} className="flex justify-between items-center text-sm py-2.5 first:pt-0 last:pb-0 hover:bg-emerald-950/10 px-2 -mx-2 rounded transition-colors group">
                                                            <span className="text-gray-300 font-serif flex items-center gap-2">
                                                                <span className="w-1 h-1 rounded-full bg-emerald-500/30 group-hover:bg-emerald-500 transition-colors"></span>
                                                                {mod.属性名}
                                                            </span>
                                                            <span className="text-emerald-400 font-mono font-bold bg-emerald-950/40 border border-emerald-900/30 px-2 py-0.5 rounded shadow-[0_0_5px_rgba(52,211,153,0.1)]">
                                                                {mod.数值 > 0 ? '+' : ''}{mod.数值}{mod.类型 === '百分比' ? '%' : ''}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 右半区：重数、特效与大成 */}
                                    <div className="space-y-8">
                                        {currentSkill.重数描述映射 && currentSkill.重数描述映射.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4 border-b border-wuxia-gold/20 pb-2">
                                                    <span className="w-1.5 h-1.5 rotate-45 bg-amber-500/70"></span>
                                                    <div className="text-sm text-wuxia-gold/90 font-serif tracking-widest font-bold">循序渐进：重数总纲</div>
                                                </div>
                                                <div className="space-y-3 relative left-2 border-l-2 border-gray-800 ml-2 pl-4">
                                                    {currentSkill.重数描述映射
                                                        .slice()
                                                        .sort((a, b) => a.重数 - b.重数)
                                                        .map((stage, idx) => {
                                                            const isReached = currentSkill.当前重数 >= stage.重数;
                                                            return (
                                                                <div
                                                                    key={`stage-${idx}`}
                                                                    className={`relative p-4 rounded-xl border transition-all duration-300 ${
                                                                        isReached 
                                                                            ? 'bg-gradient-to-r from-wuxia-gold/10 to-black/40 border-wuxia-gold/30 shadow-[0_0_10px_rgba(212,175,55,0.05)]' 
                                                                            : 'bg-black/60 border-gray-800/50 opacity-60'
                                                                    }`}
                                                                >
                                                                    {/* Timeline Dot */}
                                                                    <div className={`absolute -left-[23px] top-5 w-3 h-3 rounded-full border-2 ${isReached ? 'bg-wuxia-gold border-amber-200 shadow-[0_0_8px_rgba(212,175,55,1)]' : 'bg-gray-800 border-gray-600'}`}></div>
                                                                    
                                                                    <div className={`text-[10px] font-serif tracking-widest mb-1.5 ${isReached ? 'text-wuxia-gold' : 'text-gray-500'}`}>
                                                                        第 {stage.重数} 重境界
                                                                    </div>
                                                                    <div className={`text-sm font-serif leading-relaxed ${isReached ? 'text-gray-200' : 'text-gray-600'}`}>
                                                                        {stage.描述}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    }
                                                </div>
                                            </div>
                                        )}

                                        {currentSkill.境界特效 && currentSkill.境界特效.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4 border-b border-purple-900/30 pb-2">
                                                    <span className="w-1.5 h-1.5 rotate-45 bg-purple-500/70"></span>
                                                    <div className="text-sm text-purple-400/90 font-serif tracking-widest font-bold">武破虚空：境界特效</div>
                                                </div>
                                                <div className="space-y-3">
                                                    {currentSkill.境界特效.map((eff, i) => {
                                                        const isUnlocked = currentSkill.当前重数 >= eff.解锁重数;
                                                        return (
                                                            <div
                                                                key={`eff-k-${i}`}
                                                                className={`flex gap-4 p-4 rounded-xl border transition-all duration-300 ${
                                                                    isUnlocked
                                                                        ? 'bg-gradient-to-br from-purple-900/20 to-black/40 border-purple-900/40 shadow-inner'
                                                                        : 'bg-black/40 border-gray-800/50 opacity-40 grayscale'
                                                                }`}
                                                            >
                                                                <div className={`shrink-0 w-16 flex flex-col items-center justify-center border-r pr-4 ${isUnlocked ? 'border-purple-900/50' : 'border-gray-800'}`}>
                                                                    <div className={`text-2xl font-mono font-black ${isUnlocked ? 'text-purple-400 drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]' : 'text-gray-600'}`}>{eff.解锁重数}</div>
                                                                    <div className="text-[9px] font-serif uppercase tracking-widest text-gray-500 mt-1">重解锁</div>
                                                                </div>
                                                                <div className={`text-sm font-serif leading-relaxed flex items-center ${isUnlocked ? 'text-purple-100' : 'text-gray-500'}`}>
                                                                    {eff.描述}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {(currentSkill.大成方向 || currentSkill.圆满效果) && (
                                            <div className="grid grid-cols-1 gap-4 pt-4">
                                                {currentSkill.大成方向 && (
                                                    <div className="bg-gradient-to-r from-amber-950/20 to-black border border-amber-900/30 rounded-xl p-4 shadow-inner relative overflow-hidden group hover:border-amber-900/50 transition-colors">
                                                        <div className="absolute right-0 top-0 text-amber-500 opacity-5 text-6xl group-hover:opacity-10 transition-opacity font-serif transform translate-x-4 -translate-y-2 pointer-events-none">悟</div>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50"></span>
                                                            <div className="text-[10px] text-amber-500/70 font-serif tracking-widest uppercase font-bold">大成妙悟</div>
                                                        </div>
                                                        <div className="text-sm font-serif text-amber-100/90 leading-relaxed px-3 border-l-2 border-amber-900/40 italic">
                                                            {currentSkill.大成方向}
                                                        </div>
                                                    </div>
                                                )}
                                                {currentSkill.圆满效果 && (
                                                    <div className="bg-gradient-to-r from-wuxia-gold/10 to-black border border-wuxia-gold/30 rounded-xl p-4 shadow-[0_0_15px_rgba(212,175,55,0.05)] relative overflow-hidden group hover:border-wuxia-gold/50 transition-colors">
                                                        <div className="absolute right-0 top-0 text-wuxia-gold opacity-5 text-6xl group-hover:opacity-10 transition-opacity font-serif transform translate-x-4 -translate-y-2 pointer-events-none">极</div>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-wuxia-gold/70 shadow-[0_0_5px_rgba(212,175,55,0.8)]"></span>
                                                            <div className="text-[10px] text-wuxia-gold/80 font-serif tracking-widest uppercase font-bold">功法圆满</div>
                                                        </div>
                                                        <div className="text-sm font-serif text-wuxia-gold/90 leading-relaxed px-3 border-l-2 border-wuxia-gold/40">
                                                            {currentSkill.圆满效果}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="h-10"></div> {/* 底部留白 */}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-wuxia-gold/30 font-serif gap-6">
                                <IconScroll size={120} className="opacity-20 drop-shadow-2xl" />
                                <span className="text-2xl tracking-[0.3em] font-bold">随意翻阅，悟道长生</span>
                                <span className="text-sm text-gray-500 tracking-widest">请在左侧寻阅经典卷宗</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KungfuModal;
