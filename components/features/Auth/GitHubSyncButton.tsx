import React, { useState, useEffect } from 'react';
import { useGitHubOAuth } from '../../../hooks/useGitHubOAuth';
import {
    uploadToCloud,
    downloadFromCloud,
    fetchSyncMetaData,
    getBoundRepoConfig,
    clearBoundRepoConfig,
    type 云同步进度状态
} from '../../../services/githubSync';

const formatTime = (isoString: string | null) => {
    if (!isoString) return '从未同步';
    try {
        const d = new Date(isoString);
        return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch {
        return '未知时间';
    }
};

const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};

const formatSpeed = (bytesPerSecond: number) => {
    if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '计算中';
    return `${formatBytes(bytesPerSecond)}/s`;
};

const getProgressPercent = (progress: 云同步进度状态 | null) => {
    if (!progress || progress.totalBytes <= 0) return 0;
    return Math.max(0, Math.min(100, (progress.transferredBytes / progress.totalBytes) * 100));
};

const getStageText = (progress: 云同步进度状态 | null) => {
    if (!progress) return '待命';
    switch (progress.stage) {
        case 'packing': return '正在打包';
        case 'uploading': return '正在上传';
        case 'downloading': return '正在下载';
        case 'restoring': return '正在恢复';
        default: return '待命';
    }
};

export const GitHubSyncButton: React.FC = () => {
    const { token, login, logout, isLoggingIn } = useGitHubOAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const [showPanel, setShowPanel] = useState(false);
    const [syncData, setSyncData] = useState<{ exists: boolean, updatedAt: string | null, url: string | null } | null>(null);
    const [isLoadingMeta, setIsLoadingMeta] = useState(false);
    const [repoName, setRepoName] = useState<string | null>(null);
    const [progress, setProgress] = useState<云同步进度状态 | null>(null);

    useEffect(() => {
        if (showPanel && token) {
            setRepoName(getBoundRepoConfig());
            setIsLoadingMeta(true);
            fetchSyncMetaData(token).then(data => {
                setSyncData(data);
                setIsLoadingMeta(false);
                setRepoName(getBoundRepoConfig());
            }).catch(() => {
                setIsLoadingMeta(false);
            });
        }
    }, [showPanel, token]);

    if (isLoggingIn || (isSyncing && !showPanel)) {
        return (
            <div className="absolute right-24 md:right-28 top-4 z-20 border border-wuxia-gold/40 bg-black/50 px-3 py-1 text-xs md:text-sm font-serif tracking-wider text-wuxia-gold opacity-80 flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-wuxia-gold" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                处理中...
            </div>
        );
    }

    if (!token) {
        return (
            <button
                type="button"
                onClick={login}
                className="absolute right-24 md:right-28 top-4 z-20 flex items-center gap-2 border border-wuxia-gold/40 bg-black/50 px-3 py-1 text-xs md:text-sm font-serif tracking-[0.2em] text-wuxia-gold hover:bg-black/70 hover:text-white hover:border-wuxia-gold/80 transition-all duration-300"
                style={{
                    fontFamily: 'var(--ui-按钮-font-family, inherit)',
                    fontSize: 'var(--ui-按钮-font-size, 14px)',
                    lineHeight: 'var(--ui-按钮-line-height, 1.2)'
                }}
                title="使用 GitHub 进行云存档同步"
            >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-[14px] h-[14px] md:w-4 md:h-4">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                云存档登录
            </button>
        );
    }

    const handleChangeRepo = () => {
        if (!window.confirm('重置后，下次云端操作时会重新要求您输入一个仓库名。要继续吗？')) return;
        clearBoundRepoConfig();
        setRepoName(null);
        setSyncData({ exists: false, updatedAt: null, url: null });
        alert('已清除本地仓库绑定配置，请点击操作后重新输入您的私有仓库名。');
    };

    const handleUpload = async () => {
        if (!window.confirm('这将会将当前所有存档、游戏设置和游戏内图片（排除提示词）完整打包并分卷上传到 GitHub 私有仓库，过程可能耗时，切勿关闭网页。是否继续？')) return;
        setIsSyncing(true);
        setProgress(null);
        try {
            const success = await uploadToCloud(token, setProgress);
            if (success) {
                alert('私有仓库云备份上传成功！');
                setIsLoadingMeta(true);
                setSyncData(await fetchSyncMetaData(token));
                setRepoName(getBoundRepoConfig());
                setIsLoadingMeta(false);
            } else {
                alert('云备份上传失败，请稍后重试。');
            }
        } catch (e: any) {
            alert('上传失败: ' + e.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDownload = async () => {
        if (!window.confirm('警告：这将会以云端仓库存档包裹彻底覆盖本地进度和设置（过程不可逆），是否继续？')) return;
        setIsSyncing(true);
        setProgress(null);
        try {
            const success = await downloadFromCloud(token, setProgress);
            if (success) {
                alert('私有仓库云存档下载恢复成功！页面即将刷新加载最新数据。');
                window.location.reload();
            } else {
                alert('云端同步失败，请稍后重试。');
            }
        } catch (e: any) {
            alert('同步失败: ' + e.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const progressPercent = getProgressPercent(progress);

    return (
        <>
            <button
                type="button"
                onClick={() => setShowPanel(true)}
                className="absolute right-24 md:right-28 top-4 z-20 flex items-center gap-2 border border-emerald-500/40 bg-black/50 px-3 py-1 text-xs md:text-sm font-serif tracking-[0.2em] text-emerald-400 hover:bg-black/70 hover:text-emerald-300 hover:border-emerald-500/80 transition-all duration-300"
                style={{
                    fontFamily: 'var(--ui-按钮-font-family, inherit)',
                    fontSize: 'var(--ui-按钮-font-size, 14px)',
                    lineHeight: 'var(--ui-按钮-line-height, 1.2)'
                }}
                title="管理私有武林云盘"
            >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-[14px] h-[14px] md:w-4 md:h-4">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                云端同步
            </button>

            {showPanel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn transition-all">
                    <div className="bg-gradient-to-b from-[#0a0a0a] to-[#040404] border border-wuxia-gold/30 rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.9),_inset_0_0_20px_rgba(212,175,55,0.05)] w-full max-w-[380px] p-7 relative flex flex-col gap-6 transform transition-all duration-300 scale-100">
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-wuxia-gold/60 rounded-tl-lg shadow-[-2px_-2px_10px_rgba(212,175,55,0.2)]"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-wuxia-gold/60 rounded-tr-lg shadow-[2px_-2px_10px_rgba(212,175,55,0.2)]"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-wuxia-gold/60 rounded-bl-lg shadow-[-2px_2px_10px_rgba(212,175,55,0.2)]"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-wuxia-gold/60 rounded-br-lg shadow-[2px_2px_10px_rgba(212,175,55,0.2)]"></div>

                        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-48 h-48 text-wuxia-gold">
                                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                            </svg>
                        </div>

                        <div className="flex justify-between items-center border-b border-wuxia-gold/20 pb-4 relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-full bg-wuxia-gold/10 border border-wuxia-gold/20 shadow-[0_0_10px_rgba(212,175,55,0.2)]">
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-wuxia-gold">
                                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                                    </svg>
                                </div>
                                <h2 className="text-[1.1rem] font-serif text-wuxia-gold font-bold tracking-[0.25em] drop-shadow-md">
                                    私有云存仓库
                                </h2>
                            </div>
                            <button onClick={() => setShowPanel(false)} className="text-gray-400 hover:text-wuxia-gold transition-colors pb-1" title="关闭面板">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex flex-col gap-4 text-[13px] text-gray-300 font-serif px-1 relative z-10">
                            <div className="flex justify-between items-end pb-2 border-b border-gray-800/80 group hover:border-wuxia-gold/30 transition-colors">
                                <span className="text-gray-400">设备授权状态</span>
                                <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_5px_rgba(52,211,153,0.8)]"></span>
                                    <span className="text-emerald-400 font-bold tracking-widest drop-shadow-sm">已绑定 GitHub</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-end pb-2 border-b border-gray-800/80 group hover:border-wuxia-gold/30 transition-colors">
                                <span className="text-gray-400">被绑定的目标仓库</span>
                                <div className="flex items-center gap-2 text-right">
                                    <span className="font-mono text-xs">{repoName || '尚未指定'}</span>
                                    {repoName && (
                                        <button onClick={handleChangeRepo} className="text-wuxia-gold/60 hover:text-wuxia-gold underline decoration-wuxia-gold/30 underline-offset-2 hover:decoration-wuxia-gold text-xs transition-colors">
                                            修改
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-between items-end pb-2 border-b border-gray-800/80 group hover:border-wuxia-gold/30 transition-colors">
                                <span className="text-gray-400">远端仓库同步记录</span>
                                <span className={`font-mono tracking-wider text-right ${syncData?.exists ? 'text-wuxia-gold drop-shadow-sm' : 'text-gray-600'}`}>
                                    {isLoadingMeta ? '查询中...' : syncData?.exists ? formatTime(syncData.updatedAt) : '空空如也'}
                                </span>
                            </div>
                            {syncData?.url && (
                                <div className="text-xs text-wuxia-gold/50 text-right mt-[-6px] pr-1">
                                    <a href={syncData.url} target="_blank" rel="noreferrer" className="hover:text-wuxia-gold transition-colors underline decoration-wuxia-gold/30 underline-offset-2 hover:decoration-wuxia-gold">
                                        前往 GitHub Release 查看云端附件 ↗
                                    </a>
                                </div>
                            )}
                        </div>

                        <div className="mt-2 flex flex-col gap-3 relative z-10">
                            {isSyncing ? (
                                <div className="py-5 px-4 flex flex-col gap-3 text-wuxia-gold text-sm font-serif tracking-widest border border-wuxia-gold/30 bg-wuxia-gold/5 rounded-md shadow-inner">
                                    <div className="flex items-center justify-center gap-3">
                                        <svg className="animate-spin h-6 w-6 text-wuxia-gold drop-shadow-md" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>{progress?.message || '深度云端备份处理中...'}</span>
                                    </div>
                                    <div className="text-[12px] tracking-normal text-wuxia-gold/80 flex justify-between">
                                        <span>{progress?.direction === 'upload' ? '上传任务' : progress?.direction === 'download' ? '下载任务' : '同步任务'} · {getStageText(progress)}</span>
                                        <span>{progress?.partCount ? `分卷 ${progress.partIndex}/${progress.partCount}` : '准备中'}</span>
                                    </div>
                                    <div className="w-full h-2 rounded-full bg-black/50 overflow-hidden border border-wuxia-gold/10">
                                        <div className="h-full bg-gradient-to-r from-wuxia-gold/40 via-wuxia-gold to-wuxia-gold/50 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                                    </div>
                                    <div className="text-[12px] tracking-normal text-wuxia-gold/80 grid grid-cols-2 gap-2">
                                        <span>进度：{progressPercent.toFixed(1)}%</span>
                                        <span className="text-right">速度：{formatSpeed(progress?.speedBytesPerSecond || 0)}</span>
                                        <span>已传：{formatBytes(progress?.transferredBytes || 0)}</span>
                                        <span className="text-right">总量：{formatBytes(progress?.totalBytes || 0)}</span>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleUpload}
                                        className="w-full py-3 relative overflow-hidden group bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950 border border-emerald-700/60 rounded flex items-center justify-center gap-2 hover:border-emerald-400 transition-all duration-300 shadow-[0_0_15px_rgba(52,211,153,0.15)]"
                                    >
                                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent -translate-x-[100%] group-hover:animate-[shine_2s_ease-in-out_infinite]"></div>
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-emerald-400 drop-shadow">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75" />
                                        </svg>
                                        <span className="text-emerald-100 font-serif tracking-[0.2em] text-[13px] font-semibold drop-shadow-sm flex items-center pt-0.5">
                                            分卷上传云端（带进度/速度）
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleDownload}
                                        disabled={!syncData?.exists}
                                        className={`w-full py-3 relative rounded flex items-center justify-center gap-2 transition-all duration-300 shadow-sm text-sm border font-serif tracking-[0.2em] 
                                            ${!syncData?.exists
                                                ? 'bg-[#111] border-gray-800/80 text-gray-700 cursor-not-allowed'
                                                : 'bg-gradient-to-r from-sky-950 via-sky-900 to-sky-950 border-sky-700/60 text-sky-100 hover:border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.15)] cursor-pointer group'}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={`w-4 h-4 ${syncData?.exists ? 'text-sky-400 drop-shadow' : 'text-gray-700'}`}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                                        </svg>
                                        <span className="flex items-center pt-0.5 text-[13px] font-semibold">
                                            {syncData?.exists ? '分卷下载并覆盖本地（带进度/速度）' : '您的目标仓库尚无云端备份'}
                                        </span>
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="pt-4 mt-2 border-t border-wuxia-gold/10 flex justify-center relative z-10">
                            <button
                                type="button"
                                onClick={() => {
                                    if (window.confirm('确认解除与 GitHub 的 OAuth 授权？这只是清除本地保存的 Token，您的私有仓库本身不会消失。\n下次上传时需要重新打开网页登录。')) {
                                        logout();
                                        setShowPanel(false);
                                    }
                                }}
                                className="text-[11px] text-red-500/60 hover:text-red-400 transition-colors tracking-widest flex items-center gap-1 group"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-300">
                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                </svg>
                                <span>解除设备与 GitHub 账号的授权并退出</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
