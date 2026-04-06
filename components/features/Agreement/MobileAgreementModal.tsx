import React, { useEffect, useState } from 'react';
import { 约定结构, 约定性质, 约定状态 } from '../../../models/task';

interface Props {
    agreements: 约定结构[];
    onClose: () => void;
    onDeleteAgreement?: (agreementIndex: number) => void;
}

const 取性质样式 = (nature: 约定性质) => {
    switch (nature) {
        case '情感':
            return 'text-pink-300 border-pink-500/30 bg-pink-950/20';
        case '复仇':
            return 'text-red-300 border-red-500/30 bg-red-950/20';
        case '交易':
            return 'text-wuxia-gold border-wuxia-gold/30 bg-wuxia-gold/10';
        case '赌约':
            return 'text-purple-300 border-purple-500/30 bg-purple-950/20';
        default:
            return 'text-sky-300 border-sky-500/30 bg-sky-950/20';
    }
};

const 取状态样式 = (status: 约定状态) => {
    switch (status) {
        case '等待中':
            return 'text-gray-300 border-gray-700 bg-black/30';
        case '即将到来':
            return 'text-amber-300 border-amber-600/40 bg-amber-950/20';
        case '已履行':
            return 'text-emerald-300 border-emerald-600/40 bg-emerald-950/20';
        case '已违约':
            return 'text-red-300 border-red-600/40 bg-red-950/20';
        default:
            return 'text-gray-500 border-gray-800 bg-black/20';
    }
};

const MobileAgreementModal: React.FC<Props> = ({ agreements, onClose, onDeleteAgreement }) => {
    const safeAgreements = Array.isArray(agreements) ? agreements : [];
    const [selectedIdx, setSelectedIdx] = useState(0);
    const currentItem = safeAgreements[selectedIdx];

    useEffect(() => {
        if (safeAgreements.length === 0) {
            setSelectedIdx(0);
            return;
        }
        if (selectedIdx >= safeAgreements.length) {
            setSelectedIdx(Math.max(0, safeAgreements.length - 1));
        }
    }, [safeAgreements.length, selectedIdx]);

    const handleDeleteCurrent = () => {
        if (!currentItem || !onDeleteAgreement) return;
        onDeleteAgreement(selectedIdx);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:hidden animate-fadeIn">
            <div className="bg-ink-black/95 border border-wuxia-gold/30 w-full max-w-[640px] h-[86vh] flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden rounded-2xl">
                <div className="h-12 shrink-0 border-b border-gray-800/60 bg-black/40 flex items-center justify-between px-4">
                    <div>
                        <div className="text-wuxia-gold font-serif font-bold text-base tracking-[0.2em]">君子之约</div>
                        <div className="text-[9px] text-gray-500 font-mono mt-0.5">现存契书 {safeAgreements.length} 份</div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-wuxia-red hover:border-wuxia-red transition-all"
                    >
                        ×
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-ink-wash/5">
                    {currentItem ? (
                        <div className="bg-black/40 border border-gray-800 rounded-xl p-4 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="text-lg text-wuxia-gold font-serif font-bold truncate">{currentItem.标题}</div>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${取性质样式(currentItem.性质)}`}>
                                            {currentItem.性质}
                                        </span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${取状态样式(currentItem.当前状态)}`}>
                                            {currentItem.当前状态}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-1">
                                        立誓人 {currentItem.对象}{currentItem.头衔 ? ` · ${currentItem.头衔}` : ''}
                                    </div>
                                </div>
                                {onDeleteAgreement && (
                                    <button
                                        type="button"
                                        onClick={handleDeleteCurrent}
                                        className="shrink-0 px-2 py-1 rounded border border-red-900/50 bg-red-950/20 text-[10px] text-red-300"
                                    >
                                        删除
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400">
                                <div className="rounded-lg border border-gray-800 bg-black/30 px-3 py-2">
                                    约定地点
                                    <div className="mt-1 text-gray-200">{currentItem.约定地点 || '未定'}</div>
                                </div>
                                <div className="rounded-lg border border-gray-800 bg-black/30 px-3 py-2">
                                    约定时间
                                    <div className="mt-1 text-gray-200">{currentItem.约定时间 || '未定'}</div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-wuxia-gold/20 bg-wuxia-gold/5 p-4">
                                <div className="text-[10px] text-wuxia-gold/70 tracking-[0.3em] mb-2">誓言内容</div>
                                <div className="text-sm text-gray-200 font-serif leading-relaxed">“{currentItem.誓言内容 || '暂无誓辞。'}”</div>
                            </div>

                            {currentItem.背景故事 && (
                                <div className="rounded-xl border border-gray-800 bg-black/30 p-4">
                                    <div className="text-[10px] text-gray-500 tracking-[0.3em] mb-2">缘起</div>
                                    <div className="text-[11px] text-gray-400 leading-relaxed font-serif">{currentItem.背景故事}</div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-3">
                                <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/15 p-3">
                                    <div className="text-[10px] text-emerald-300 tracking-[0.25em] mb-1">履约结果</div>
                                    <div className="text-[11px] text-emerald-100/85 leading-relaxed">{currentItem.履行后果 || '暂无说明'}</div>
                                </div>
                                <div className="rounded-xl border border-red-900/40 bg-red-950/15 p-3">
                                    <div className="text-[10px] text-red-300 tracking-[0.25em] mb-1">违约结果</div>
                                    <div className="text-[11px] text-red-100/85 leading-relaxed">{currentItem.违约后果 || '暂无说明'}</div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-black/40 border border-gray-800 rounded-xl px-4 py-10 text-center text-gray-600 text-sm">
                            暂无约定
                        </div>
                    )}

                    <div className="bg-black/40 border border-gray-800 rounded-xl p-3 space-y-2">
                        <div className="text-[10px] text-gray-500 tracking-[0.3em] px-1">契书列表</div>
                        {safeAgreements.length > 0 ? (
                            safeAgreements.map((item, idx) => {
                                const selected = idx === selectedIdx;
                                return (
                                    <button
                                        key={`${item.标题}-${idx}`}
                                        onClick={() => setSelectedIdx(idx)}
                                        className={`w-full text-left p-3 border rounded-lg transition-all ${
                                            selected ? 'border-wuxia-gold/50 bg-wuxia-gold/5' : 'border-gray-800 bg-white/[0.02] hover:bg-white/[0.05]'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className={`font-serif text-sm font-bold truncate ${selected ? 'text-wuxia-gold' : 'text-gray-200'}`}>
                                                    {item.标题 || `约定 ${idx + 1}`}
                                                </div>
                                                <div className="text-[10px] text-gray-500 mt-1 truncate">
                                                    {item.对象 || '未知'} · {item.约定地点 || '未定地点'}
                                                </div>
                                            </div>
                                            <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${取状态样式(item.当前状态)}`}>
                                                {item.当前状态}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })
                        ) : (
                            <div className="text-center text-gray-600 text-xs py-8">此生暂无契约牵系</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MobileAgreementModal;
