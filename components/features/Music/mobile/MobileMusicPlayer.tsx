import React from 'react';
import { useMusic } from '../MusicProvider';

interface Props {
    open: boolean;
    onClose: () => void;
}

const MobileMusicPlayer: React.FC<Props> = ({ open, onClose }) => {
    const {
        tracks,
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
        seek,
        volume,
        setVolume
    } = useMusic();

    if (!open) return null;

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
        <div className="fixed inset-0 z-[100] flex items-end justify-center pointer-events-none">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto animate-in fade-in duration-300"
                onClick={onClose}
            ></div>

            {/* Panel */}
            <div className="relative w-full max-w-md bg-zinc-950 border-t border-wuxia-gold/30 rounded-t-3xl p-6 pb-12 pointer-events-auto animate-in slide-in-from-bottom duration-300 flex flex-col items-center">
                {/* Drag Handle */}
                <div className="w-12 h-1 bg-zinc-800 rounded-full mb-6"></div>

                {/* Track Info */}
                <div className="w-full flex flex-col items-center mb-6">
                    <div className={`w-36 h-36 rounded-full border-4 border-wuxia-gold/20 shadow-2xl overflow-hidden mb-6 bg-black ${isPlaying ? 'animate-[spin_10s_linear_infinite]' : ''}`}>
                        {currentTrack?.封面URL ? (
                            <img src={currentTrack.封面URL} alt="cover" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="rgba(230,200,110,0.2)" strokeWidth="1"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                            </div>
                        )}
                    </div>
                    
                    <h2 className="text-lg font-bold text-wuxia-gold tracking-widest text-center truncate w-full px-4">
                        {currentTrack?.名称 || '未在播放'}
                    </h2>
                    <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">
                        {isPlaying ? '江湖绝响 · 播放中' : '长夜漫漫 · 待机中'}
                    </p>
                </div>

                {/* Lyrics Gap */}
                <div className="h-12 w-full flex items-center justify-center px-6 mb-4">
                    <p className="text-sm text-wuxia-gold/90 italic text-center line-clamp-2 drop-shadow-[0_0_3px_rgba(230,200,110,0.3)]">
                        {currentLyric || (isPlaying ? '🎶 ...' : '曲终人散，余音袅袅')}
                    </p>
                </div>

                {/* Progress Bar */}
                <div className="w-full px-4 mb-8">
                    <div className="flex justify-between mb-2">
                        <span className="text-[10px] font-mono text-zinc-500">{formatTime(currentTime)}</span>
                        <span className="text-[10px] font-mono text-zinc-500">{formatTime(duration)}</span>
                    </div>
                    <div 
                        className="h-1.5 bg-zinc-900 rounded-full relative cursor-pointer"
                        onClick={handleProgressClick}
                    >
                        <div 
                            className="absolute h-full bg-wuxia-gold shadow-[0_0_10px_rgba(230,200,110,0.5)] rounded-full transition-all duration-200"
                            style={{ width: `${progress}%` }}
                        ></div>
                        <div 
                            className="absolute w-3 h-3 bg-white rounded-full shadow-md top-1/2 -translate-y-1/2 -translate-x-1/2 border border-wuxia-gold transition-all"
                            style={{ left: `${progress}%` }}
                        ></div>
                    </div>
                </div>

                {/* Volume Slider - Mini */}
                <div className="w-full px-12 mb-8 flex items-center gap-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon></svg>
                    <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={volume}
                        onChange={(e) => setVolume(parseInt(e.target.value))}
                        className="flex-1 h-1 bg-zinc-900 rounded-full appearance-none accent-wuxia-gold/60"
                    />
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between w-full px-8">
                    {/* Mode Toggle */}
                    <button 
                         onClick={() => {
                            const modes: ('list-loop' | 'single-loop' | 'random')[] = ['list-loop', 'single-loop', 'random'];
                            const next = modes[(modes.indexOf(playMode) + 1) % modes.length];
                            setPlayMode(next);
                        }}
                        className="text-zinc-500 p-2"
                    >
                        {playMode === 'list-loop' && (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                        )}
                         {playMode === 'single-loop' && (
                            <div className="relative">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                                <span className="absolute -top-1 -right-1 text-[8px] font-bold">1</span>
                            </div>
                        )}
                        {playMode === 'random' && (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
                        )}
                    </button>

                    <button onClick={prevTrack} className="text-zinc-300 p-2">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
                    </button>

                    <button 
                        onClick={togglePlay}
                        className="w-16 h-16 rounded-full bg-wuxia-gold text-black flex items-center justify-center shadow-[0_0_20px_rgba(230,200,110,0.4)] active:scale-95 transition-all"
                    >
                        {isPlaying ? (
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        ) : (
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="ml-1"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        )}
                    </button>

                    <button onClick={nextTrack} className="text-zinc-300 p-2">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                    </button>

                    <button onClick={onClose} className="text-zinc-500 p-2">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MobileMusicPlayer;
