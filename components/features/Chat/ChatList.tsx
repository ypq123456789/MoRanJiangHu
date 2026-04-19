import React from 'react';
import { 聊天记录结构, NPC结构, 视觉设置结构 } from '../../../types';
import TurnItem from './TurnItem';
import { 构建区域文字样式 } from '../../../utils/visualSettings';
import BookLoader from '../../ui/BookLoader';

interface Props {
    history: 聊天记录结构[];
    loading: boolean;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    onUpdateHistory?: (index: number, newJson: string) => Promise<string | null> | string | null;
    onPolishTurn?: (index: number) => Promise<string | null> | string | null;
    visualConfig?: 视觉设置结构;
    socialList?: NPC结构[];
    playerProfile?: { 姓名?: string; 头像图片URL?: string };
    renderCount?: number;
    suppressAutoScrollToken?: number;
    forceScrollToken?: number;
}

type 流式草稿显示结构 = {
    是否思考中: boolean;
    正文内容: string;
    原始内容: string;
};

const 解析流式草稿显示 = (content: string): 流式草稿显示结构 => {
    const source = typeof content === 'string' ? content : '';
    if (!source) {
        return {
            是否思考中: false,
            正文内容: '',
            原始内容: ''
        };
    }

    const bodyOpenRegex = /<\s*正文\s*>/gi;
    const bodyCloseRegex = /<\s*\/\s*正文\s*>/gi;
    let lastBodyOpenIndex = -1;
    let lastBodyOpenLength = 0;
    let bodyOpenMatch: RegExpExecArray | null = null;
    while ((bodyOpenMatch = bodyOpenRegex.exec(source)) !== null) {
        lastBodyOpenIndex = bodyOpenMatch.index;
        lastBodyOpenLength = bodyOpenMatch[0].length;
    }

    const 提取正文片段 = (text: string): string => {
        const target = typeof text === 'string' ? text : '';
        if (!target) return '';
        return target.replace(bodyCloseRegex, '').trimStart();
    };

    if (lastBodyOpenIndex >= 0) {
        const afterThinking = source.slice(lastBodyOpenIndex + lastBodyOpenLength);
        return {
            是否思考中: false,
            正文内容: 提取正文片段(afterThinking),
            原始内容: source
        };
    }

    return {
        是否思考中: source.trim().length > 0,
        正文内容: '',
        原始内容: source
    };
};

const ChatList: React.FC<Props> = ({ history, loading, scrollRef, onUpdateHistory, onPolishTurn, visualConfig, socialList, playerProfile, renderCount = 10, suppressAutoScrollToken, forceScrollToken }) => {
    const normalizedRenderCount = Number.isFinite(renderCount) ? Math.max(1, Math.floor(renderCount)) : 10;
    const chatStyle = 构建区域文字样式(visualConfig, '聊天');
    const 紧凑字号 = 'var(--ui-compact-font-size, 14px)';
    const 微字号 = 'var(--ui-micro-font-size, 12px)';
    const 紧凑等宽字号 = 'var(--ui-compact-mono-font-size, 12px)';
    const 底部判定阈值 = 120;
    const [接近底部, set接近底部] = React.useState(true);
    const [显示快速置底, set显示快速置底] = React.useState(false);
    const 隐藏按钮计时器Ref = React.useRef<number | null>(null);
    const 待抑制自动滚动Ref = React.useRef(false);
    const 抑制滚动位置Ref = React.useRef<number | null>(null);

    const 清理隐藏按钮计时器 = React.useCallback(() => {
        if (隐藏按钮计时器Ref.current !== null) {
            window.clearTimeout(隐藏按钮计时器Ref.current);
            隐藏按钮计时器Ref.current = null;
        }
    }, []);

    const 判断是否接近底部 = React.useCallback((el: HTMLDivElement): boolean => {
        const 剩余距离 = el.scrollHeight - el.scrollTop - el.clientHeight;
        return 剩余距离 <= 底部判定阈值;
    }, []);

    const 触发快速置底短暂浮现 = React.useCallback(() => {
        set显示快速置底(true);
        清理隐藏按钮计时器();
        隐藏按钮计时器Ref.current = window.setTimeout(() => {
            set显示快速置底(false);
            隐藏按钮计时器Ref.current = null;
        }, 1400);
    }, [清理隐藏按钮计时器]);

    const handleScroll = React.useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const nearBottom = 判断是否接近底部(el);
        set接近底部(nearBottom);
        if (nearBottom) {
            清理隐藏按钮计时器();
            set显示快速置底(false);
            return;
        }
        触发快速置底短暂浮现();
    }, [scrollRef, 判断是否接近底部, 清理隐藏按钮计时器, 触发快速置底短暂浮现]);

    const 快速置底 = React.useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        set接近底部(true);
        清理隐藏按钮计时器();
        set显示快速置底(false);
    }, [scrollRef, 清理隐藏按钮计时器]);

    React.useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const nearBottom = 判断是否接近底部(el);
        set接近底部(nearBottom);
        if (nearBottom) {
            el.scrollTop = el.scrollHeight;
        }
    }, [scrollRef, 判断是否接近底部]);

    React.useEffect(() => {
        if (!suppressAutoScrollToken) return;
        const el = scrollRef.current;
        待抑制自动滚动Ref.current = true;
        抑制滚动位置Ref.current = el ? el.scrollTop : null;
    }, [suppressAutoScrollToken, scrollRef]);

    React.useEffect(() => {
        if (!forceScrollToken) return;
        let raf1 = 0;
        let raf2 = 0;
        raf1 = window.requestAnimationFrame(() => {
            raf2 = window.requestAnimationFrame(() => {
                const el = scrollRef.current;
                if (!el) return;
                el.scrollTop = el.scrollHeight;
                set接近底部(true);
                清理隐藏按钮计时器();
                set显示快速置底(false);
            });
        });
        return () => {
            if (raf1) window.cancelAnimationFrame(raf1);
            if (raf2) window.cancelAnimationFrame(raf2);
        };
    }, [forceScrollToken, scrollRef, 清理隐藏按钮计时器]);

    React.useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (待抑制自动滚动Ref.current) {
            const targetScrollTop = 抑制滚动位置Ref.current;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (scrollRef.current && targetScrollTop !== null) {
                        scrollRef.current.scrollTop = targetScrollTop;
                        set接近底部(判断是否接近底部(scrollRef.current));
                    }
                    待抑制自动滚动Ref.current = false;
                    抑制滚动位置Ref.current = null;
                });
            });
            return;
        }
        if (接近底部) {
            el.scrollTop = el.scrollHeight;
        }
    }, [history, loading, 接近底部, scrollRef, 判断是否接近底部]);

    React.useEffect(() => {
        return () => {
            清理隐藏按钮计时器();
        };
    }, [清理隐藏按钮计时器]);

    // Build stable turn anchors from assistant structured responses.
    const turnAnchors = React.useMemo(() => {
        const anchors: Array<{ index: number; turn: number }> = [];
        let turn = 0;
        history.forEach((msg, index) => {
            if (msg.role === 'assistant' && msg.structuredResponse) {
                anchors.push({ index, turn });
                turn += 1;
            }
        });
        return anchors;
    }, [history]);

    const turnNumberByIndex = React.useMemo(() => {
        const map = new Map<number, number>();
        turnAnchors.forEach(anchor => map.set(anchor.index, anchor.turn));
        return map;
    }, [turnAnchors]);

    const latestTurnAnchorIndex = React.useMemo(() => {
        if (turnAnchors.length === 0) return -1;
        return turnAnchors[turnAnchors.length - 1].index;
    }, [turnAnchors]);

    // Slice by real turns (assistant structured responses), not by message count.
    const sliceIndex = React.useMemo(() => {
        if (turnAnchors.length <= normalizedRenderCount) return 0;
        const firstVisibleAnchorPos = turnAnchors.length - normalizedRenderCount;
        if (firstVisibleAnchorPos <= 0) return 0;

        // Include the user input/system notes between previous turn and current visible turn.
        const previousAnchor = turnAnchors[firstVisibleAnchorPos - 1];
        return Math.min(history.length, previousAnchor.index + 1);
    }, [history.length, normalizedRenderCount, turnAnchors]);

    const visibleHistory = history.slice(sliceIndex);
    const hiddenCount = sliceIndex;
    const hiddenTurns = Math.max(0, turnAnchors.length - normalizedRenderCount);

    return (
        <div className="relative flex-1 min-h-0">
            <div
                className="h-full overflow-y-auto px-4 md:px-12 py-6 space-y-8 scroll-smooth custom-scrollbar bg-white/8 touch-pan-y"
                ref={scrollRef}
                onScroll={handleScroll}
            >
                {history.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-30" style={chatStyle}>
                        <div className="text-6xl text-wuxia-gold mb-4 select-none">江湖</div>
                        <div className="text-sm tracking-[0.5em] text-paper-white">等待侠士出招</div>
                    </div>
                )}

                {hiddenCount > 0 && (
                    <div className="w-full text-center py-4">
                        <div className="inline-block px-4 py-1 rounded-full bg-white/5 border border-gray-700 text-gray-500 font-serif italic" style={{ fontSize: 紧凑字号 }}>
                            已隐藏早期 {hiddenTurns} 回合 / {hiddenCount} 条记录 (请在设置-互动历史中查看)
                        </div>
                    </div>
                )}
            
                {visibleHistory.map((msg, relativeIdx) => {
                    const absoluteIdx = sliceIndex + relativeIdx;
                    
                    // 1. If it's a Structured Game Response (The new format)
                    if (msg.role === 'assistant' && msg.structuredResponse) {
                        const turnNum = turnNumberByIndex.get(absoluteIdx) ?? 0;
                        return (
                            <div key={absoluteIdx}>
                                <TurnItem
                                    response={msg.structuredResponse}
                                    turnNumber={turnNum}
                                    isLatest={absoluteIdx === latestTurnAnchorIndex}
                                    rawJson={msg.rawJson}
                                    inputTokens={msg.inputTokens}
                                    responseDurationSec={msg.responseDurationSec}
                                    outputTokens={msg.outputTokens}
                                    onSaveEdit={(newJson) => onUpdateHistory ? onUpdateHistory(absoluteIdx, newJson) : null}
                                    onPolishTurn={() => onPolishTurn ? onPolishTurn(absoluteIdx) : null}
                                    fontSize={visualConfig?.字体大小}
                                    lineHeight={visualConfig?.段落间距}
                                    collapseThinkingStream={visualConfig?.AI思考流式折叠 !== false}
                                    visualConfig={visualConfig}
                                    socialList={socialList}
                                    playerProfile={playerProfile}
                                />
                            </div>
                        );
                    }
                    
                    // 2. User Input (Right aligned)
                    if (msg.role === 'user') {
                        return (
                             <div key={absoluteIdx} className="flex w-full justify-end animate-slide-in mb-8">
                                <div className="relative max-w-[88%] sm:max-w-[80%] bg-ink-gray text-wuxia-gold px-3 py-3 sm:p-4 clip-message-right shadow-lg border-r-2 border-wuxia-gold" style={chatStyle}>
                                    <p className="whitespace-pre-wrap leading-relaxed text-base sm:text-lg">
                                        {msg.content}
                                    </p>
                                    <div className="text-gray-500 mt-2 text-right font-mono" style={{ fontSize: 微字号 }}>
                                        PLAYER ACTION
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // 3. Streaming assistant preview (plain text before final JSON parse)
                    if (msg.role === 'assistant') {
                        const shouldCollapseThinking = visualConfig?.AI思考流式折叠 !== false;
                        const streamDisplay = 解析流式草稿显示(msg.content || '');
                        const displayText = shouldCollapseThinking
                            ? (streamDisplay.正文内容 || (streamDisplay.是否思考中 ? '' : (msg.content || '...')))
                            : (msg.content || '...');

                        return (
                            <div key={absoluteIdx} className="flex w-full justify-center animate-slide-in mb-6">
                                <div className="w-full max-w-3xl px-1 md:px-4">
                                    <div className="relative mx-auto max-w-[94%] md:max-w-[88%] rounded-2xl border border-wuxia-cyan/40 bg-gradient-to-b from-wuxia-cyan/10 via-black/55 to-black/65 px-4 py-3 shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
                                        <span className="block tracking-[0.2em] text-wuxia-cyan/90 font-mono mb-2" style={{ fontSize: 微字号 }}>
                                            流式草稿
                                        </span>

                                        {shouldCollapseThinking && streamDisplay.是否思考中 && (
                                            <div className="mb-3 flex items-center gap-2 rounded-xl border border-wuxia-gold/30 bg-black/35 px-3 py-2 text-wuxia-gold/90 shadow-[inset_0_0_18px_rgba(255,215,110,0.08)]">
                                                <span className="inline-flex items-center gap-1.5 font-mono tracking-[0.18em] uppercase" style={{ fontSize: 紧凑等宽字号 }}>
                                                    <span className="relative flex h-2.5 w-2.5">
                                                        <span className="absolute inline-flex h-full w-full rounded-full bg-wuxia-gold/40 animate-ping"></span>
                                                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-wuxia-gold/80"></span>
                                                    </span>
                                                    AI思考中
                                                </span>
                                            </div>
                                        )}

                                        <p className="whitespace-pre-wrap leading-relaxed text-gray-100" style={chatStyle}>
                                            {displayText || (shouldCollapseThinking && streamDisplay.是否思考中 ? '...' : '...')}
                                        </p>
                                        <div className="mt-2 flex items-center justify-between">
                                            <span className="text-wuxia-cyan/75 font-mono tracking-[0.12em]" style={{ fontSize: 微字号 }}>STREAMING</span>
                                            <span className="inline-flex items-center gap-1 text-wuxia-cyan/70">
                                                <span className="w-1.5 h-1.5 rounded-full bg-wuxia-cyan/70 animate-pulse"></span>
                                                <span className="w-1.5 h-1.5 rounded-full bg-wuxia-cyan/55 animate-pulse [animation-delay:120ms]"></span>
                                                <span className="w-1.5 h-1.5 rounded-full bg-wuxia-cyan/40 animate-pulse [animation-delay:240ms]"></span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // 4. System info messages
                    if (msg.role === 'system') {
                        return (
                            <div key={absoluteIdx} className="flex w-full justify-center mb-4 opacity-90">
                                <div className="bg-black/40 text-wuxia-gold/90 px-4 py-2 border border-wuxia-gold/30 font-mono rounded" style={{ fontSize: 紧凑等宽字号 }}>
                                    {msg.content}
                                </div>
                            </div>
                        );
                    }

                    // 5. Fallback for unknown role
                    return (
                        <div key={absoluteIdx} className="flex w-full justify-center mb-4 opacity-70">
                            <div className="bg-red-900/20 text-red-400 px-4 py-1 border border-red-900/50 font-mono" style={{ fontSize: 紧凑等宽字号 }}>
                                [{(msg.role as string).toUpperCase()}] {msg.content}
                            </div>
                        </div>
                    );
                })}

                {loading && (
                    <div className="flex justify-center mt-6 mb-10 w-full font-serif italic text-wuxia-gold">
                        <BookLoader text="乾坤推演中..." />
                    </div>
                )}
            </div>

            {!接近底部 && 显示快速置底 && (
                <button
                    type="button"
                    onClick={快速置底}
                    className="absolute right-4 md:right-8 bottom-4 md:bottom-6 z-20 w-10 h-10 flex items-center justify-center rounded-full border border-wuxia-cyan/60 bg-black/75 text-wuxia-cyan shadow-[0_6px_20px_rgba(0,0,0,0.55)] transition-all hover:border-wuxia-gold hover:text-wuxia-gold hover:bg-black/90"
                    title="快速置底"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                </button>
            )}
        </div>
    );
};

export default ChatList;
