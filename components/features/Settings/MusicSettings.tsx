import React, { useRef } from 'react';
import { useMusic } from '../Music/MusicProvider';
import { MusicTrack } from '../../../types';
import { parseMusicMetadata } from '../../../utils/musicMetadata';

const MusicSettings: React.FC = () => {
    const { 
        tracks, 
        addTrack, 
        removeTrack, 
        playTrack, 
        currentTrackId, 
        enabled, 
        volume, 
        playMode,
        setVolume,
        setPlayMode,
        toggleMusicFeature
    } = useMusic();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [deletingTrackId, setDeletingTrackId] = React.useState<string | null>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset input
        e.target.value = '';

        try {
            const arrayBuffer = await file.arrayBuffer();

            const reader = new FileReader();
            reader.readAsDataURL(file);
            const audioDataUrl = await new Promise<string>((resolve) => {
                reader.onloadend = () => resolve(reader.result as string);
            });

            const audio = new Audio(audioDataUrl);
            await new Promise<void>((resolve) => {
                audio.onloadedmetadata = () => resolve();
            });

            const metadata = await parseMusicMetadata(arrayBuffer);
            
            // Smarter naming: ignore "Track X" patterns
            const fileName = file.name.replace(/\.[^/.]+$/, "");
            let trackName = metadata.title?.trim();
            if (!trackName || /^track\s*\d+$/i.test(trackName)) {
                trackName = fileName;
            }

            const newTrack: MusicTrack = {
                id: `track_${Date.now()}`,
                名称: trackName,
                URL: audioDataUrl,
                时长: audio.duration,
                封面URL: metadata.coverUrl,
                歌词: metadata.lyrics
            };
            
            await addTrack(newTrack);
        } catch (error) {
            console.error("上传错误:", error);
            alert("读取音乐元数据或上传失败。");
        }
    };

    return (
        <div className="p-4 space-y-6 text-gray-200">
            {/* Feature Toggle */}
            <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                <div>
                    <h3 className="text-lg font-bold text-wuxia-gold">背景音乐功能</h3>
                    <p className="text-xs text-gray-400">开启后将在主界面通过播放器控制音乐</p>
                </div>
                <button 
                    onClick={() => toggleMusicFeature(!enabled)}
                    className={`px-6 py-2 rounded-full transition-all ${enabled ? 'bg-wuxia-gold text-black font-bold' : 'bg-zinc-800 text-gray-400'}`}
                >
                    {enabled ? '已开启' : '已关闭'}
                </button>
            </div>

            {/* Volume Control */}
            <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <span className="text-sm font-medium">全局音量</span>
                    <span className="text-sm font-mono text-wuxia-gold">{volume}%</span>
                </div>
                <input 
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => setVolume(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-wuxia-gold"
                />
            </div>

            {/* Play Mode */}
            <div className="grid grid-cols-3 gap-2">
                {(['list-loop', 'single-loop', 'random'] as const).map(mode => (
                    <button
                        key={mode}
                        onClick={() => setPlayMode(mode)}
                        className={`py-2 px-1 border rounded-lg transition-all text-sm ${playMode === mode ? 'border-wuxia-gold text-wuxia-gold bg-wuxia-gold/10' : 'border-zinc-800 text-gray-500 hover:border-zinc-600'}`}
                    >
                        {mode === 'list-loop' && '列表循环'}
                        {mode === 'single-loop' && '单曲循环'}
                        {mode === 'random' && '随机播放'}
                    </button>
                ))}
            </div>

            {/* Track List & Upload */}
            <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                    <h4 className="font-bold flex items-center gap-2">
                        <span className="w-1 h-4 bg-wuxia-gold rounded-full"></span>
                        已添加曲目 ({tracks.length})
                    </h4>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs bg-wuxia-gold/10 text-wuxia-gold border border-wuxia-gold/20 px-3 py-1.5 rounded-lg hover:bg-wuxia-gold/20 transition-all flex items-center gap-1"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        添加音乐
                    </button>
                    <input 
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept="audio/*"
                        className="hidden"
                    />
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {tracks.length === 0 ? (
                        <div className="text-center py-8 bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800 text-gray-600 text-sm">
                            尚无本地曲目，请点击上方按钮添加
                        </div>
                    ) : (
                        tracks.map(track => (
                            <div 
                                key={track.id}
                                className={`flex items-center justify-between p-3 border rounded-xl transition-colors group ${currentTrackId === track.id ? 'border-wuxia-gold/40 bg-wuxia-gold/5' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/40'}`}
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="w-10 h-10 shrink-0 bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center overflow-hidden">
                                        {track.封面URL ? (
                                            <img src={track.封面URL} alt="cover" className="w-full h-full object-cover" />
                                        ) : (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                                        )}
                                    </div>
                                    <div className="overflow-hidden cursor-pointer" onClick={() => playTrack(track.id)}>
                                        <div className={`truncate text-sm font-medium ${currentTrackId === track.id ? 'text-wuxia-gold' : 'text-gray-200'}`}>
                                            {track.名称}
                                        </div>
                                        <div className="text-[10px] text-gray-500 uppercase tracking-tighter">
                                            {track.封面URL ? '已解析封面' : '无封面信息'}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {deletingTrackId === track.id ? (
                                        <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-300">
                                            <button 
                                                onClick={() => {
                                                    removeTrack(track.id);
                                                    setDeletingTrackId(null);
                                                }}
                                                className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/40 px-2 py-1 rounded hover:bg-red-500/30 transition-all font-bold"
                                            >
                                                确认删除
                                            </button>
                                            <button 
                                                onClick={() => setDeletingTrackId(null)}
                                                className="text-[10px] bg-zinc-800 text-gray-400 px-2 py-1 rounded hover:bg-zinc-700 transition-all"
                                            >
                                                取消
                                            </button>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => setDeletingTrackId(track.id)}
                                            className="p-2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default MusicSettings;
