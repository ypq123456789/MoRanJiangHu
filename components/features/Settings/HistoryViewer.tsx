import React, { useMemo, useState } from 'react';
import { 聊天记录结构, 记忆系统结构 } from '../../../types';

interface Props {
    history?: 聊天记录结构[];
    memorySystem?: 记忆系统结构;
}

type 回忆展示结构 = {
    名称: string;
    概括: string;
    原文: string;
    回合: number;
    记录时间: string;
    时间戳: string;
};

const 即时短期分隔标记 = '\n<<SHORT_TERM_SYNC>>\n';

const 拆分即时与短期 = (entry: string): { 即时内容: string; 短期摘要: string } => {
    const raw = (entry || '').trim();
    if (!raw) return { 即时内容: '', 短期摘要: '' };
    const splitAt = raw.lastIndexOf(即时短期分隔标记);
    if (splitAt < 0) return { 即时内容: raw, 短期摘要: '' };
    return {
        即时内容: raw.slice(0, splitAt).trim(),
        短期摘要: raw.slice(splitAt + 即时短期分隔标记.length).trim()
    };
};

const 格式化回忆名称 = (round: number): string => `【回忆${String(Math.max(1, round)).padStart(3, '0')}】`;
const 格式化回合显示 = (round: number): string => (round === 1 ? '开场剧情' : `回合：${round}`);

const HistoryViewer: React.FC<Props> = ({ history = [], memorySystem }) => {
    const [query, setQuery] = useState('');
    const [expandedKey, setExpandedKey] = useState<string | null>(null);

    const allMemories = useMemo<回忆展示结构[]>(() => {
        if (Array.isArray(memorySystem?.回忆档案) && memorySystem!.回忆档案.length > 0) {
            return memorySystem!.回忆档案
                .map((item, idx) => ({
                    名称: typeof item?.名称 === 'string' && item.名称.trim() ? item.名称.trim() : 格式化回忆名称(idx + 1),
                    概括: typeof item?.概括 === 'string' ? item.概括 : '',
                    原文: typeof item?.原文 === 'string' ? item.原文 : '',
                    回合: typeof item?.回合 === 'number' && Number.isFinite(item.回合) ? Math.max(1, Math.floor(item.回合)) : idx + 1,
                    记录时间: typeof item?.记录时间 === 'string' ? item.记录时间 : '未知时间',
                    时间戳: typeof item?.时间戳 === 'string' ? item.时间戳 : (typeof item?.记录时间 === 'string' ? item.记录时间 : '未知时间')
                }))
                .sort((a, b) => b.回合 - a.回合);
        }

        const immediate = Array.isArray(memorySystem?.即时记忆) ? memorySystem!.即时记忆 : [];
        if (immediate.length > 0) {
            return immediate
                .map((raw, idx) => {
                    const { 即时内容, 短期摘要 } = 拆分即时与短期(raw);
                    const round = idx + 1;
                    return {
                        名称: 格式化回忆名称(round),
                        概括: 短期摘要,
                        原文: 即时内容,
                        回合: round,
                        记录时间: '未知时间',
                        时间戳: '未知时间'
                    };
                })
                .filter(item => item.概括.trim() || item.原文.trim())
                .reverse();
        }

        const fallback = history
            .filter(msg => msg.role === 'assistant' && msg.structuredResponse)
            .map((msg, idx) => {
                const summary = (msg.structuredResponse?.shortTerm || '').trim();
                const rawText = Array.isArray(msg.structuredResponse?.logs)
                    ? msg.structuredResponse!.logs.map(l => `${l.sender}：${l.text}`).join('\n')
                    : msg.content;
                const round = idx + 1;
                return {
                    名称: 格式化回忆名称(round),
                    概括: summary,
                    原文: rawText,
                    回合: round,
                    记录时间: msg.gameTime || '未知时间',
                    时间戳: msg.gameTime || '未知时间'
                };
            })
            .filter(item => item.概括.trim() || item.原文.trim())
            .reverse();

        return fallback;
    }, [memorySystem, history]);

    const filteredMemories = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return allMemories;
        return allMemories.filter(item => {
            const haystack = `${item.名称}\n${item.概括}\n${item.原文}\n${item.记录时间}`.toLowerCase();
            return haystack.includes(keyword);
        });
    }, [allMemories, query]);

    return (
        <div className="h-full flex flex-col animate-fadeIn">
            <h3 className="text-wuxia-gold font-serif font-bold text-lg mb-4 shrink-0">互动历史存档</h3>

            <div className="shrink-0 mb-3">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索 名称 / 概括 / 原文"
                    className="w-full bg-black/40 border border-gray-700 p-2.5 text-sm text-white rounded-md outline-none focus:border-wuxia-gold"
                />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-black/20 border border-gray-800 rounded-lg p-3 space-y-2">
                {filteredMemories.map((item) => {
                    const key = `${item.名称}-${item.回合}`;
                    const isExpanded = expandedKey === key;
                    return (
                        <div key={key} className="border border-gray-800/70 rounded-lg bg-black/35 overflow-hidden">
                            <button
                                onClick={() => setExpandedKey(prev => prev === key ? null : key)}
                                className={`w-full text-left px-3 py-2.5 transition-colors ${isExpanded ? 'bg-wuxia-gold/10' : 'hover:bg-white/5'}`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className={`font-mono text-xs truncate ${isExpanded ? 'text-wuxia-gold' : 'text-gray-200'}`}>{item.名称}</div>
                                    <div className={`text-[10px] ${isExpanded ? 'text-wuxia-gold' : 'text-gray-500'}`}>{isExpanded ? '收起' : '展开'}</div>
                                </div>
                                <div className={`mt-1 text-[11px] truncate ${isExpanded ? 'text-gray-200' : 'text-gray-500'}`}>
                                    {item.概括 || '（无概括）'}
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="border-t border-gray-800 px-3 py-3 space-y-3">
                                    <div className="text-[11px] text-gray-500">{格式化回合显示(item.回合)}</div>

                                    <div>
                                        <div className="text-xs text-wuxia-cyan mb-1">概括</div>
                                        <div className="text-sm text-gray-300 whitespace-pre-wrap">{item.概括 || '（无概括）'}</div>
                                    </div>

                                    <div className="border-t border-gray-800 pt-3">
                                        <div className="text-xs text-wuxia-cyan mb-1">原文</div>
                                        <div className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed">{item.原文 || '（无原文）'}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {filteredMemories.length === 0 && (
                    <div className="text-center text-gray-600 py-10">暂无匹配记录</div>
                )}
            </div>
        </div>
    );
};

export default HistoryViewer;
