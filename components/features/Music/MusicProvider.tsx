import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { 视觉设置结构, MusicTrack } from '../../../types';
import { 读取设置, 保存设置, 读取图片资源 } from '../../../services/dbService';
import { 设置键 } from '../../../utils/settingsSchema';

interface MusicContextType {
    tracks: MusicTrack[];
    addTrack: (track: MusicTrack) => Promise<void>;
    removeTrack: (id: string) => Promise<void>;
    playTrack: (id: string) => void;
    togglePlay: () => void;
    nextTrack: () => void;
    prevTrack: () => void;
    seek: (time: number) => void;
    setVolume: (vol: number) => void;
    setPlayMode: (mode: 'list-loop' | 'single-loop' | 'random') => void;
    toggleMusicFeature: (enabled: boolean) => void;
    
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    currentTrackId: string | undefined;
    currentLyric: string;
    
    enabled: boolean;
    volume: number;
    playMode: 'list-loop' | 'single-loop' | 'random';
}

const 默认音乐上下文: MusicContextType = {
    tracks: [],
    addTrack: async () => {},
    removeTrack: async () => {},
    playTrack: () => {},
    togglePlay: () => {},
    nextTrack: () => {},
    prevTrack: () => {},
    seek: () => {},
    setVolume: () => {},
    setPlayMode: () => {},
    toggleMusicFeature: () => {},
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    currentTrackId: undefined,
    currentLyric: '',
    enabled: false,
    volume: 50,
    playMode: 'list-loop'
};

const MusicContext = createContext<MusicContextType>(默认音乐上下文);

export const useMusic = () => {
    return useContext(MusicContext);
};

export const MusicProvider: React.FC<{ 
    children: React.ReactNode;
    visualConfig: 视觉设置结构 | undefined;
    onSaveVisual: (config: 视觉设置结构) => void;
}> = ({ children, visualConfig, onSaveVisual }) => {
    const [tracks, setTracks] = useState<MusicTrack[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentLyric, setCurrentLyric] = useState("");
    
    const parsedLyrics = useRef<{ time: number; text: string }[]>([]);
    
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const enabled = visualConfig?.启用背景音乐 === true;
    const volume = visualConfig?.全局音量 ?? 50;
    const playMode = visualConfig?.音频播放模式 || 'list-loop';
    const currentTrackId = visualConfig?.当前播放曲目ID;

    // Load initial tracks
    useEffect(() => {
        const loadTracks = async () => {
            try {
                const savedTracks = await 读取设置(设置键.音乐曲库);
                if (savedTracks && Array.isArray(savedTracks)) {
                    setTracks(savedTracks);
                }
            } catch (err) {
                console.error("加载音乐列表失败", err);
            }
        };
        loadTracks();
    }, []);

    // Create and cleanup audio element
    useEffect(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.preload = "auto";
        }
        
        const audio = audioRef.current;
        
        const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
        const handleDurationChange = () => setDuration(audio.duration);
        const handleEnded = () => {
            if (playMode === 'single-loop') {
                audio.currentTime = 0;
                audio.play().catch(console.error);
            } else {
                handleNext(true); // Auto next
            }
        };
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('durationchange', handleDurationChange);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('durationchange', handleDurationChange);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
        };
    }, [playMode]);

    // Sync volume
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume / 100;
        }
    }, [volume]);

    // Handle track switching & Lyric parsing
    useEffect(() => {
        const loadAndPlayTrack = async () => {
            const audio = audioRef.current;
            if (!audio || !enabled || !currentTrackId) {
                if (audio && !enabled) audio.pause();
                return;
            }
            
            const targetTrack = tracks.find(t => t.id === currentTrackId);
            if (!targetTrack) return;
            
            // Parse Lyrics
            if (targetTrack.歌词) {
                const lines = targetTrack.歌词.split('\n');
                const lyricMap = lines.map(line => {
                    const match = line.match(/\[(\d+):(\d+\.?\d*)\](.*)/);
                    if (match) {
                        const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
                        return { time, text: match[3].trim() };
                    }
                    return null;
                }).filter((l): l is { time: number; text: string } => l !== null);
                parsedLyrics.current = lyricMap.sort((a, b) => a.time - b.time);
            } else {
                parsedLyrics.current = [];
            }
            setCurrentLyric("");

            try {
                let src = targetTrack.URL;
                if (src.startsWith('REF:')) {
                    src = await 读取图片资源(src); 
                }
                
                if (audio.src !== src) {
                    audio.src = src;
                    audio.load();
                }
                
                if (enabled) {
                    audio.play().catch(e => {
                        console.log("Play interrupted", e);
                        setIsPlaying(false);
                    });
                }
            } catch (err) {
                console.error("播放曲目失败", err);
            }
        };

        loadAndPlayTrack();
    }, [currentTrackId, tracks, enabled]);

    // Update current lyric based on time
    useEffect(() => {
        if (!parsedLyrics.current.length) {
            if (currentLyric) setCurrentLyric("");
            return;
        }

        const activeLine = [...parsedLyrics.current]
            .reverse()
            .find(line => currentTime >= line.time);
            
        if (activeLine && activeLine.text !== currentLyric) {
            setCurrentLyric(activeLine.text);
        } else if (!activeLine && currentLyric) {
            setCurrentLyric("");
        }
    }, [currentTime, currentLyric]);

    const handleNext = useCallback((isAuto = false) => {
        if (!tracks.length) return;
        const currentIndex = tracks.findIndex(t => t.id === currentTrackId);
        
        let nextIndex = 0;
        if (playMode === 'random') {
            nextIndex = Math.floor(Math.random() * tracks.length);
        } else {
            nextIndex = currentIndex >= 0 ? (currentIndex + 1) % tracks.length : 0;
        }
        
        playTrack(tracks[nextIndex].id);
    }, [tracks, currentTrackId, playMode, visualConfig]);

    const handlePrev = useCallback(() => {
        if (!tracks.length) return;
        const currentIndex = tracks.findIndex(t => t.id === currentTrackId);
        let prevIndex = currentIndex > 0 ? currentIndex - 1 : tracks.length - 1;
        playTrack(tracks[prevIndex].id);
    }, [tracks, currentTrackId, visualConfig]);

    const addTrack = async (track: MusicTrack) => {
        const updatedTracks = [...tracks, track];
        setTracks(updatedTracks);
        await 保存设置(设置键.音乐曲库, updatedTracks);
        
        if (!currentTrackId && updatedTracks.length === 1) {
            playTrack(track.id);
        }
    };

    const removeTrack = async (id: string) => {
        const updatedTracks = tracks.filter(t => t.id !== id);
        setTracks(updatedTracks);
        await 保存设置(设置键.音乐曲库, updatedTracks);
        
        if (currentTrackId === id) {
            handleNext();
            if (updatedTracks.length === 0) {
                audioRef.current?.pause();
                playTrack(''); 
            }
        }
    };

    const playTrack = (id: string) => {
        if (!visualConfig) return;
        onSaveVisual({
            ...visualConfig,
            当前播放曲目ID: id
        });
    };

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio || !currentTrackId) return;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play().catch(console.error);
        }
    };

    const seek = (time: number) => {
        const audio = audioRef.current;
        if (audio) {
            audio.currentTime = time;
        }
    };

    const setVolume = (vol: number) => {
        if (!visualConfig) return;
        onSaveVisual({
            ...visualConfig,
            全局音量: vol
        });
    };

    const setPlayMode = (mode: 'list-loop' | 'single-loop' | 'random') => {
        if (!visualConfig) return;
        onSaveVisual({
            ...visualConfig,
            音频播放模式: mode
        });
    };
    
    const toggleMusicFeature = (isEnabled: boolean) => {
        if (!visualConfig) return;
        onSaveVisual({
            ...visualConfig,
            启用背景音乐: isEnabled
        });
    };

    return (
        <MusicContext.Provider value={{
            tracks,
            addTrack,
            removeTrack,
            playTrack,
            togglePlay,
            nextTrack: handleNext,
            prevTrack: handlePrev,
            seek,
            setVolume,
            setPlayMode,
            toggleMusicFeature,
            isPlaying,
            currentTime,
            duration,
            currentTrackId,
            currentLyric,
            enabled,
            volume,
            playMode
        }}>
            {children}
        </MusicContext.Provider>
    );
};
