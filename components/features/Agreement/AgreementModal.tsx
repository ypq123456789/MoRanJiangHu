import React, { useEffect, useState } from 'react';
import { 约定结构, 约定性质 } from '../../../models/task';
import { IconCalendar, IconHandshake, IconMapPin, IconScroll } from '../../ui/Icons';

interface Props {
    agreements: 约定结构[];
    onClose: () => void;
    onDeleteAgreement?: (agreementIndex: number) => void;
}

const AgreementModal: React.FC<Props> = ({ agreements, onClose, onDeleteAgreement }) => {
    const [selectedIdx, setSelectedIdx] = useState<number>(0);
    const currentItem = agreements[selectedIdx];

    useEffect(() => {
        if (agreements.length === 0) {
            if (selectedIdx !== 0) {
                setSelectedIdx(0);
            }
            return;
        }
        if (selectedIdx >= agreements.length) {
            setSelectedIdx(Math.max(0, agreements.length - 1));
        }
    }, [agreements.length, selectedIdx]);

    const handleDeleteCurrent = () => {
        if (!onDeleteAgreement || !currentItem) return;
        onDeleteAgreement(selectedIdx);
    };

    const getNatureColor = (nature: 约定性质) => {
        switch(nature) {
            case '情感': return 'text-pink-400 border-pink-400/30 bg-pink-900/10 shadow-[0_0_10px_rgba(244,114,182,0.1)]';
            case '复仇': return 'text-red-500 border-red-500/30 bg-red-900/10 shadow-[0_0_10px_rgba(239,68,68,0.1)]';
            case '交易': return 'text-wuxia-gold border-wuxia-gold/30 bg-wuxia-gold/10 shadow-[0_0_10px_rgba(212,175,55,0.1)]';
            case '赌约': return 'text-purple-400 border-purple-400/30 bg-purple-900/10 shadow-[0_0_10px_rgba(192,132,252,0.1)]';
            default: return 'text-blue-300 border-blue-300/30 bg-blue-900/10 shadow-[0_0_10px_rgba(147,197,253,0.1)]';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[200] hidden md:flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-ink-black/95 w-full max-w-7xl max-h-[90vh] h-[90vh] flex flex-col rounded-2xl border border-wuxia-gold/20 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 relative overflow-hidden">
                
                {/* 背景装饰 */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[url('/assets/images/ui/paper-texture.png')] opacity-[0.03] mix-blend-overlay"></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-wuxia-gold/5 via-transparent to-black"></div>
                </div>

                {/* 顶栏 */}
                <div className="h-16 shrink-0 border-b border-wuxia-gold/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-6 relative z-50">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-wuxia-gold animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>
                        <h3 className="text-wuxia-gold font-serif font-bold text-xl tracking-[0.4em] drop-shadow-md">
                            君子之约
                            <span className="text-[10px] text-wuxia-gold/50 ml-2 font-mono tracking-widest border border-wuxia-gold/20 px-2 py-0.5 rounded-full">AGREEMENTS</span>
                        </h3>
                    </div>

                    <div className="flex items-center gap-4">
                        {currentItem && onDeleteAgreement && (
                            <button
                                type="button"
                                onClick={handleDeleteCurrent}
                                className="flex items-center gap-2 px-4 py-1.5 rounded bg-red-950/40 border border-red-900/50 text-red-500/80 text-xs font-serif tracking-[0.2em] hover:bg-red-900/60 hover:text-red-300 hover:border-red-500 shadow-sm transition-all"
                            >
                                <span className="text-lg">✖</span>
                                撕毁此契
                            </button>
                        )}
                        <button 
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-wuxia-red hover:border-wuxia-red hover:bg-red-950/30 transition-all hover:rotate-90"
                            title="关闭"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden relative z-10">
                    {/* 左侧：约定列表 */}
                    <div className="w-[340px] shrink-0 border-r border-wuxia-gold/10 bg-black/40 backdrop-blur-sm flex flex-col relative overflow-hidden">
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            {agreements.map((agree, idx) => {
                                const isSelected = idx === selectedIdx;
                                const natureTheme = getNatureColor(agree.性质);

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedIdx(idx)}
                                        className={`w-full text-left p-5 rounded-2xl transition-all duration-300 relative group overflow-hidden border flex flex-col gap-3 ${
                                            isSelected 
                                            ? 'border-wuxia-gold/40 bg-gradient-to-r from-wuxia-gold/10 to-black shadow-[0_0_15px_rgba(212,175,55,0.1)]' 
                                            : 'border-white/5 bg-black/40 hover:border-wuxia-gold/20 hover:bg-white/5'
                                        }`}
                                    >
                                        {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>}
                                        
                                        <div className="flex justify-between items-start mb-1 w-full gap-2 relative z-10">
                                            <div className="flex-1 min-w-0">
                                                <div className={`font-serif text-lg truncate ${isSelected ? 'text-wuxia-gold font-bold drop-shadow-sm' : 'text-gray-200'}`}>
                                                    {agree.标题}
                                                </div>
                                            </div>
                                            <div className={`shrink-0 text-[10px] px-2 py-0.5 rounded font-serif shadow-inner border tracking-widest ${natureTheme}`}>
                                                {agree.性质}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 w-full relative z-10 mt-1 pb-1 border-b border-gray-800">
                                            <span className="text-xs text-gray-400 font-bold font-serif min-w-[3rem]">{agree.对象}</span>
                                            <span className="w-1 h-1 rounded-full bg-wuxia-gold/30"></span>
                                            <span className="text-xs text-gray-500 truncate font-serif">{agree.约定地点}</span>
                                        </div>

                                        <div className="text-[10px] text-gray-600 font-mono flex items-center gap-2">
                                            <IconCalendar size={12} className="text-wuxia-gold/50" />
                                            {agree.约定时间}
                                        </div>
                                        
                                        {/* 装饰 */}
                                        <div className="absolute right-0 bottom-0 text-7xl text-wuxia-gold opacity-[0.02] transform translate-y-4 translate-x-2 select-none pointer-events-none group-hover:opacity-[0.05] transition-opacity font-serif">
                                            诺
                                        </div>
                                    </button>
                                );
                            })}
                            {agreements.length === 0 && (
                                <div className="text-center text-wuxia-gold/40 font-serif text-lg py-32 tracking-widest border border-dashed border-wuxia-gold/10 rounded-2xl bg-black/20 m-2 flex flex-col items-center justify-center gap-4">
                                    <IconHandshake size={52} className="opacity-40" />
                                    了无牵挂，大道独行
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右侧：文书详情 */}
                    <div className="flex-1 p-8 overflow-y-auto relative flex items-center justify-center" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        
                        {/* 页面装饰底纹 */}
                        <div className="absolute inset-0 bg-gradient-radial from-wuxia-gold/5 to-transparent blur-[50px] pointer-events-none"></div>

                        {currentItem ? (
                            <div className="relative w-full max-w-2xl bg-[#dad4c5] p-12 shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-[#a1967c] transform animate-fadeIn">
                                
                                {/* 纸张纹理 */}
                                <div className="absolute inset-0 bg-[url('/assets/images/ui/paper-texture.png')] opacity-60 mix-blend-multiply pointer-events-none"></div>
                                <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.2)] pointer-events-none"></div>

                                {/* 四角装饰 */}
                                <div className="absolute top-2 left-2 w-8 h-8 border-t-2 border-l-2 border-[#8b0000]/60 opacity-50"></div>
                                <div className="absolute top-2 right-2 w-8 h-8 border-t-2 border-r-2 border-[#8b0000]/60 opacity-50"></div>
                                <div className="absolute bottom-2 left-2 w-8 h-8 border-b-2 border-l-2 border-[#8b0000]/60 opacity-50"></div>
                                <div className="absolute bottom-2 right-2 w-8 h-8 border-b-2 border-r-2 border-[#8b0000]/60 opacity-50"></div>

                                <div className="relative z-10">
                                    {/* 抬头 */}
                                    <div className="flex justify-between items-center text-xs text-[#5e5544] mb-8 border-b border-[#a1967c] pb-4 font-serif">
                                        <div className="flex items-center gap-2">
                                            <IconMapPin size={14} className="text-[#8b0000]" />
                                            相约之地：<span className="font-bold text-[#3e382d]">{currentItem.约定地点}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <IconCalendar size={14} className="text-[#8b0000]" />
                                            履约之期：<span className="font-bold text-[#3e382d]">{currentItem.约定时间}</span>
                                        </div>
                                    </div>

                                    {/* 标题 */}
                                    <h2 className="text-3xl font-black text-center mb-10 tracking-[0.3em] font-serif text-[#8b0000] drop-shadow-sm">
                                        {currentItem.标题}
                                    </h2>

                                    {/* 正文 */}
                                    <div className="text-xl leading-[2.5] indent-10 mb-12 font-serif text-[#1a1814] font-medium text-justify">
                                        “{currentItem.誓言内容}”
                                    </div>

                                    {/* 后果与署名区 */}
                                    <div className="grid grid-cols-2 gap-8 mt-12 border-t-2 border-double border-[#a1967c] pt-8">
                                        <div className="text-xs font-serif space-y-4">
                                            <div className="flex flex-col gap-1.5 p-3 bg-green-900/5 rounded border border-green-800/20">
                                                <span className="font-bold text-green-900 flex items-center gap-1"><span className="text-lg">✓</span> 履约此誓：</span>
                                                <span className="text-[#4e483e] leading-relaxed">{currentItem.履行后果}</span>
                                            </div>
                                            <div className="flex flex-col gap-1.5 p-3 bg-red-900/5 rounded border border-red-800/20">
                                                <span className="font-bold text-[#8b0000] flex items-center gap-1"><span className="text-lg">✗</span> 若违此誓：</span>
                                                <span className="text-[#4e483e] leading-relaxed">{currentItem.违约后果}</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center justify-end relative pb-6">
                                            <div className="text-sm text-[#5e5544] mb-2 font-serif">立誓人</div>
                                            <div className="font-black text-2xl font-serif text-[#3e382d] tracking-widest border-b border-[#a1967c] pb-1 min-w-[120px] text-center">
                                                {currentItem.对象}
                                            </div>
                                            
                                            {/* 印章效果 */}
                                            <div className="absolute right-0 bottom-0 translate-x-4 -translate-y-2 opacity-80 mix-blend-multiply transform rotate-[-15deg] pointer-events-none">
                                                <div className="w-20 h-20 border-4 border-[#8b0000] rounded-lg text-[#8b0000] font-black flex items-center justify-center relative">
                                                    <div className="absolute inset-0 bg-[#8b0000] opacity-10"></div>
                                                    <div className="text-lg leading-tight tracking-widest text-center font-serif" style={{ writingMode: 'vertical-rl' }}>
                                                        天地明鉴
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-wuxia-gold/20 font-serif gap-6 relative z-10">
                                <IconScroll size={120} className="opacity-20 drop-shadow-2xl" />
                                <span className="text-2xl tracking-[0.3em] font-bold">请查阅左侧卷宗</span>
                            </div>
                        )}
                        
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgreementModal;
