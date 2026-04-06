import React from 'react';
import { useMusic } from './MusicProvider';

const MusicPlayerUI: React.FC = () => {
    const {
        tracks,
        enabled,
        isPlaying,
        togglePlay,
        nextTrack,
        prevTrack,
        currentTime,
        duration,
        currentTrackId,
        currentLyric,
        playMode,
        setPlayMode,
        seek
    } = useMusic();

    if (!enabled) return null;

    const currentTrack = tracks.find(t => t.id === currentTrackId);
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        seek(pct * duration);
    };

    return (
        <div className="flex flex-col items-center group/he select-none w-full py-4 px-2">
            <style>
                {`
                    @keyframes marquee-scroll {
                        0% { transform: translateX(0); }
                        20% { transform: translateX(0); }
                        80% { transform: translateX(calc(-50% - 1rem)); }
                        100% { transform: translateX(calc(-50% - 1rem)); }
                    }
                    .animate-marquee-text {
                        display: inline-block;
                        white-space: nowrap;
                        animation: marquee-scroll 15s linear infinite;
                    }
                `}
            </style>
            {/* Collapsed State Icon (Disc) */}
            <div
                className="relative z-0 h-16 -mb-4 transition-all duration-300 group-hover/he:h-0 group-hover/he:opacity-0 group-hover/he:-translate-y-4"
            >
                <div className="relative">
                    <div className={`w-20 h-20 rounded-full border-4 border-wuxia-gold/20 shadow-lg overflow-hidden transition-all duration-500 bg-black ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}>
                        {currentTrack?.封面URL ? (
                            <img src={currentTrack.封面URL} alt="cover" className="w-full h-full object-cover opacity-80" />
                        ) : (
                            <svg width="100%" height="100%" viewBox="0 0 128 128">
                                <rect width="128" height="128" fill="black"></rect>
                                <circle cx="20" cy="20" r="2" fill="white" className="opacity-40"></circle>
                                <circle cx="100" cy="40" r="2" fill="white" className="opacity-40"></circle>
                                <circle cx="60" cy="100" r="2" fill="white" className="opacity-40"></circle>
                                <circle cx="64" cy="64" r="58" fill="none" stroke="rgba(230,200,110,0.15)" strokeWidth="1"></circle>
                            </svg>
                        )}
                    </div>
                    {/* Center Pin */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-wuxia-gold rounded-full shadow-[0_0_10px_rgba(230,200,110,0.8)] z-10 border border-black"></div>
                </div>
            </div>

            {/* Expanded UI Panel */}
            <div
                className="z-30 flex flex-col w-full h-[70px] transition-all duration-300 bg-black/60 backdrop-blur-md border border-wuxia-gold/10 shadow-2xl group-hover/he:h-[180px] rounded-xl overflow-hidden relative"
            >
                {/* Top Section: Spinning Disc & Track Info */}
                <div className="flex flex-row w-full h-0 group-hover/he:h-20 opacity-0 group-hover/he:opacity-100 transition-all duration-300">
                    <div
                        className="relative flex items-center justify-center w-20 h-20 -top-2 left-2 transition-all duration-500"
                    >
                         <div className={`w-16 h-16 rounded-full border-2 border-wuxia-gold/30 shadow-md overflow-hidden bg-black ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}>
                            {currentTrack?.封面URL ? (
                                <img src={currentTrack.封面URL} alt="cover" className="w-full h-full object-cover" />
                            ) : (
                                <svg width="100%" height="100%" viewBox="0 0 128 128">
                                    <rect width="128" height="128" fill="black"></rect>
                                    <circle cx="64" cy="64" r="20" fill="#18181b" stroke="#3f3f46" strokeWidth="1"></circle>
                                </svg>
                            )}
                        </div>
                        <div className="absolute z-10 w-2 h-2 bg-wuxia-gold rounded-full shadow-sm top-[28px] left-[28px] border border-black"></div>
                    </div>
                    
                    <div className="flex flex-col justify-center w-full pl-6 pr-4 overflow-hidden">
                        <div className="w-full overflow-hidden whitespace-nowrap mask-marquee">
                            <p className={`text-sm font-bold text-wuxia-gold tracking-wider ${currentTrack && currentTrack.名称.length > 8 ? 'animate-marquee-text' : ''}`}>
                                {currentTrack ? (
                                    <>
                                        <span className="inline-block">{currentTrack.名称}</span>
                                        {currentTrack.名称.length > 8 && <span className="inline-block ml-8">{currentTrack.名称}</span>}
                                    </>
                                ) : '无曲目'}
                            </p>
                        </div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5 truncate">
                            {isPlaying ? '江湖绝响 · 播放中' : '长夜漫漫 · 待机中'}
                        </p>
                    </div>
                </div>

                {/* Middle Section: Progress Bar */}
                <div className="flex flex-col mx-3 mt-8 group-hover/he:mt-5 transition-all">
                    <div className="flex justify-between mb-1 opacity-0 group-hover/he:opacity-100 transition-opacity duration-300 px-1">
                        <span className="text-[9px] font-mono text-zinc-500">{formatTime(currentTime)}</span>
                        <span className="text-[9px] font-mono text-zinc-500">{formatTime(duration)}</span>
                    </div>
                    <div 
                        className="h-1 bg-zinc-800 rounded-full relative cursor-pointer group/progress mx-1"
                        onClick={handleProgressClick}
                    >
                        <div 
                            className="absolute h-full bg-wuxia-gold shadow-[0_0_8px_rgba(230,200,110,0.6)] transition-all duration-200"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>

                {/* Bottom Section: Controls */}
                <div className="flex flex-row items-center justify-center flex-grow mx-3 space-x-4 opacity-0 group-hover/he:opacity-100 transition-opacity duration-500">
                    {/* Play Mode */}
                    <button 
                        onClick={() => {
                            const modes: ('list-loop' | 'single-loop' | 'random')[] = ['list-loop', 'single-loop', 'random'];
                            const next = modes[(modes.indexOf(playMode) + 1) % modes.length];
                            setPlayMode(next);
                        }}
                        className="text-zinc-600 hover:text-wuxia-gold transition-colors"
                        title="播放模式"
                    >
                        {playMode === 'list-loop' && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                        )}
                        {playMode === 'single-loop' && (
                            <div className="relative">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                                <span className="absolute -top-1 -right-1 text-[8px] font-bold">1</span>
                            </div>
                        )}
                        {playMode === 'random' && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
                        )}
                    </button>

                    <button onClick={prevTrack} className="text-zinc-400 hover:text-white transition-colors">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
                    </button>

                    <button 
                        onClick={togglePlay}
                        className="w-10 h-10 rounded-full border border-wuxia-gold/40 text-wuxia-gold flex items-center justify-center hover:bg-wuxia-gold/20 hover:border-wuxia-gold transition-all"
                    >
                        {isPlaying ? (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="ml-1"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        )}
                    </button>

                    <button onClick={nextTrack} className="text-zinc-400 hover:text-white transition-colors">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                    </button>
                    
                    {/* Placeholder for list/else */}
                    <div className="w-4"></div>
                </div>

                {/* Static indicator for collapsed state within the panel (when not hovered) */}
                <div className="absolute inset-0 flex items-center justify-center group-hover/he:opacity-0 transition-opacity duration-300 pointer-events-none">
                     <span className="text-[10px] text-wuxia-gold/40 tracking-[0.4em] uppercase">江湖清音</span>
                </div>
            </div>
        </div>
    );
};

export default MusicPlayerUI;
