import React, { useEffect, useMemo, useState } from 'react';
import { useGitHubOAuth } from '../../../hooks/useGitHubOAuth';
import {
    uploadToCloud,
    downloadFromCloud,
    fetchSyncMetaData,
    getBoundRepoConfig,
    clearBoundRepoConfig,
    GITHUB_REPO_KEY
} from '../../../services/githubSync';

const FLOATING_BUTTON_STYLE: React.CSSProperties = {
    top: 'calc(env(safe-area-inset-top, 0px) + 12px)'
};

type GitHubSyncButtonProps = {
    floating?: boolean;
    className?: string;
    style?: React.CSSProperties;
};

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

const getProgressPercent = (progress: any) => {
    if (!progress || progress.totalBytes <= 0) return 0;
    return Math.max(0, Math.min(100, (progress.transferredBytes / progress.totalBytes) * 100));
};

const getStageText = (progress: any) => {
    if (!progress) return '待命';
    switch (progress.stage) {
        case 'packing': return '正在打包';
        case 'uploading': return '正在上传';
        case 'downloading': return '正在下载';
        case 'restoring': return '正在恢复';
        default: return '待命';
    }
};

const validateRepoName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');

export const GitHubSyncButton: React.FC<GitHubSyncButtonProps> = ({ floating = true, className = '', style }) => {
    const {
        token,
        login,
        logout,
        isLoggingIn,
        isNativeApp,
        hasGitHubOAuthClientId,
        oauthSession,
        reopenAuthorizationPage,
        oauthRedirectUri,
        nativeDeepLinkUri
    } = useGitHubOAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const [showPanel, setShowPanel] = useState(false);
    const [syncData, setSyncData] = useState<{ exists: boolean; updatedAt: string | null; url: string | null } | null>(null);
    const [isLoadingMeta, setIsLoadingMeta] = useState(false);
    const [repoName, setRepoName] = useState<string | null>(null);
    const [repoInput, setRepoInput] = useState('');
    const [progress, setProgress] = useState<any>(null);

    const normalizedRepoInput = useMemo(() => validateRepoName(repoInput), [repoInput]);
    const activeRepoName = normalizedRepoInput || repoName || '';
    const containerStyle = floating ? { ...FLOATING_BUTTON_STYLE, ...style } : style;
    const containerClassName = floating
        ? `absolute right-3 md:right-28 z-20 ${className}`.trim()
        : `relative z-20 shrink-0 ${className}`.trim();

    const refreshSyncMeta = async (preferredRepo?: string) => {
        if (!token) return;
        const repoToUse = validateRepoName(preferredRepo || '');
        if (!repoToUse) {
            setSyncData(null);
            setIsLoadingMeta(false);
            return;
        }

        setIsLoadingMeta(true);
        try {
            localStorage.setItem(GITHUB_REPO_KEY, repoToUse);
            const data = await fetchSyncMetaData(token);
            setSyncData(data);
            setRepoName(getBoundRepoConfig());
        } finally {
            setIsLoadingMeta(false);
        }
    };

    useEffect(() => {
        if (!showPanel) return;
        const cachedRepo = getBoundRepoConfig();
        setRepoName(cachedRepo);
        setRepoInput(cachedRepo || '');
        if (token && cachedRepo) {
            void refreshSyncMeta(cachedRepo);
        } else {
            setSyncData(null);
        }
    }, [showPanel, token]);

    const copyText = async (value: string) => {
        if (!value) return false;

        try {
            if (isNativeApp) {
                const { Clipboard } = await import('@capacitor/clipboard');
                await Clipboard.write({ string: value });
                return true;
            }

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
                return true;
            }
        } catch (error) {
            console.warn('Copy text failed', error);
        }

        return false;
    };

    const copyAuthorizationLink = async () => {
        const targetUrl = oauthSession.authorizationUrl;
        if (!targetUrl) return;

        const copied = await copyText(targetUrl);
        if (copied) {
            alert('GitHub 授权链接已复制。');
            return;
        }

        window.prompt('请手动复制下面的 GitHub 授权链接：', targetUrl);
    };

    const saveRepoBinding = async () => {
        if (!normalizedRepoInput) {
            alert('请先输入 GitHub 私有仓库名，只填仓库名，不要带用户名。');
            return false;
        }
        localStorage.setItem(GITHUB_REPO_KEY, normalizedRepoInput);
        setRepoName(getBoundRepoConfig());
        await refreshSyncMeta(normalizedRepoInput);
        return true;
    };

    const handleChangeRepo = () => {
        if (!window.confirm('清除当前仓库绑定后，下次同步会使用新的 GitHub 私有仓库名，是否继续？')) return;
        clearBoundRepoConfig();
        setRepoName(null);
        setRepoInput('');
        setSyncData(null);
    };

    const handleUpload = async () => {
        if (!(await saveRepoBinding())) return;
        if (!window.confirm('这会把当前本机的全部存档、设置与相关素材完整打包上传到 GitHub 私有仓库，确定继续吗？')) return;
        setIsSyncing(true);
        setProgress(null);
        try {
            const success = await uploadToCloud(token!, setProgress);
            if (success) {
                alert('云端备份上传完成。');
                await refreshSyncMeta(normalizedRepoInput);
            } else {
                alert('云端备份上传失败，请稍后重试。');
            }
        } catch (error: any) {
            alert(`上传失败: ${error.message || '未知错误'}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDownload = async () => {
        if (!(await saveRepoBinding())) return;
        if (!window.confirm('下载会用云端存档完整覆盖当前本地设置和进度，且不可撤销，是否继续？')) return;
        setIsSyncing(true);
        setProgress(null);
        try {
            const result = await downloadFromCloud(token!, setProgress);
            if (result.success) {
                alert('云端存档恢复完成，页面即将刷新。');
                window.location.reload();
            } else {
                alert(
                    `云端同步失败\n` +
                    `阶段: ${result.stageLabel}\n` +
                    `原因: ${result.error || '未知错误'}\n` +
                    `统计: 存档 ${result.importedSaveCount}/${result.saveCount}，设置 ${result.importedSettingCount}/${result.settingCount}，资源 ${result.importedAssetCount}/${result.assetCount}\n` +
                    `时间: ${result.timestamp}`
                );
            }
        } catch (error: any) {
            alert(`同步失败: ${error.message || '未知错误'}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const progressPercent = getProgressPercent(progress);

    if ((isLoggingIn && !showPanel) || (isSyncing && !showPanel)) {
        return (
            <div
                className={`${containerClassName} flex items-center justify-center border border-wuxia-gold/40 bg-black/60 px-3 py-2 text-xs md:text-sm font-serif tracking-wider text-wuxia-gold opacity-90`}
                style={containerStyle}
            >
                <svg className="mr-2 h-4 w-4 animate-spin text-wuxia-gold" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                处理中...
            </div>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={() => {
                    if (!token && !isNativeApp && hasGitHubOAuthClientId) {
                        void login();
                        return;
                    }
                    setShowPanel(true);
                }}
                className={`${containerClassName} flex min-h-[40px] items-center gap-2 border px-3 py-2 text-xs md:text-sm font-serif transition-all duration-300 ${
                    token
                        ? 'border-emerald-500/40 bg-black/60 text-emerald-400 hover:border-emerald-400 hover:bg-black/80 hover:text-emerald-300'
                        : 'border-wuxia-gold/40 bg-black/60 text-wuxia-gold hover:border-wuxia-gold/80 hover:bg-black/80 hover:text-white'
                }`}
                style={containerStyle}
                title={token ? '管理 GitHub 云同步' : '登录 GitHub 并同步存档'}
            >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>{token ? '云端同步' : 'GitHub 登录'}</span>
            </button>

            {showPanel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-md md:p-4">
                    <div className="relative flex max-h-[calc(100vh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-24px)] w-full max-w-[430px] flex-col overflow-hidden rounded-2xl border border-wuxia-gold/30 bg-gradient-to-b from-[#0b0b0b] to-[#040404] shadow-[0_0_50px_rgba(0,0,0,0.9)]">
                        <div className="shrink-0 border-b border-wuxia-gold/15 px-4 pb-4 pt-[max(env(safe-area-inset-top),16px)] md:px-6 md:pt-5">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <div className="text-lg font-serif font-bold tracking-[0.18em] text-wuxia-gold">GitHub 云同步</div>
                                    <div className="mt-1 text-xs leading-5 text-gray-400">
                                        {token
                                            ? '登录后可在手机与 PC 之间同步设置、存档与素材。'
                                            : isNativeApp
                                                ? 'APK 现已使用标准 GitHub OAuth，授权完成后会通过 Android deep link / app link 自动回到应用。'
                                                : '网页端会跳转 GitHub OAuth 完成授权。'}
                                    </div>
                                </div>
                                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] leading-5 text-amber-200/90">
                                        云同步建议在直连网络下进行。开启 VPN、系统代理或浏览器代理时，上传速度可能明显变慢，甚至出现失败。
                                    </div>
                                <button onClick={() => setShowPanel(false)} className="rounded-full border border-wuxia-gold/20 p-2 text-gray-400 transition-colors hover:text-wuxia-gold" title="关闭面板">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {!token ? (
                            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+16px)] md:px-6">
                                <div className="rounded-2xl border border-wuxia-gold/15 bg-black/35 p-4">
                                    {isNativeApp ? (
                                        <>
                                            <div className="text-sm leading-6 text-gray-300">
                                                1. 点下面按钮打开 GitHub 官方授权页
                                                <br />
                                                2. 在浏览器确认 GitHub 授权
                                                <br />
                                                3. GitHub 回调会通过 Android app link / deep link 自动拉回 APK
                                            </div>

                                            <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs leading-6 text-sky-100/85">
                                                <div className="font-semibold tracking-[0.16em] text-sky-200">当前 OAuth 回调</div>
                                                <div className="mt-2 break-all font-mono text-[11px] text-sky-100/90">
                                                    {oauthRedirectUri}
                                                </div>
                                                <div className="mt-3 text-sky-100/70">
                                                    如果你更想使用自定义 scheme，也可以把 GitHub OAuth App 的回调地址改成：
                                                </div>
                                                <div className="mt-1 break-all font-mono text-[11px] text-sky-100/90">
                                                    {nativeDeepLinkUri}
                                                </div>
                                            </div>

                                            {oauthSession.status !== 'idle' && (
                                                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                                                    <div className="text-xs tracking-[0.18em] text-emerald-300/80">当前授权状态</div>
                                                    <div className="mt-3 text-xs leading-5 text-gray-400">
                                                        {oauthSession.message || '等待 GitHub 回调中。'}
                                                    </div>
                                                    <div className="mt-2 text-[11px] leading-5 text-emerald-100/80">
                                                        如果没有自动拉起应用，可以重新打开授权页，或手动复制链接到系统浏览器继续完成授权。
                                                    </div>
                                                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                                        <button
                                                            type="button"
                                                            onClick={copyAuthorizationLink}
                                                            className="rounded-lg border border-wuxia-gold/25 bg-black/50 px-3 py-2 text-sm text-wuxia-gold transition-colors hover:bg-black/70"
                                                        >
                                                            复制授权链接
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={reopenAuthorizationPage}
                                                            className="sm:col-span-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/20"
                                                        >
                                                            重新打开 GitHub 授权页
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-sm leading-6 text-gray-300">
                                                当前环境会跳转 GitHub 官方授权页，授权完成后自动回到游戏。
                                            </div>
                                            {!hasGitHubOAuthClientId && (
                                                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
                                                    当前部署没有注入 `VITE_GITHUB_CLIENT_ID`，网页端 GitHub 登录不可用。
                                                    请在 GitHub Actions Secret 中配置 `VITE_GITHUB_CLIENT_ID`，然后重新部署。
                                                </div>
                                            )}
                                        </>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => void login()}
                                        disabled={!hasGitHubOAuthClientId}
                                        className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold tracking-[0.18em] transition-all ${
                                            !hasGitHubOAuthClientId
                                                ? 'cursor-not-allowed border-gray-800/80 bg-[#111] text-gray-600'
                                                : 'border-wuxia-gold/30 bg-gradient-to-r from-wuxia-gold/10 via-wuxia-gold/5 to-wuxia-gold/10 text-wuxia-gold hover:border-wuxia-gold/60 hover:bg-black/70'
                                        }`}
                                    >
                                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                                            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                                        </svg>
                                        {isNativeApp ? '开始 GitHub OAuth 登录' : hasGitHubOAuthClientId ? '前往 GitHub 授权' : '未配置 GitHub Client ID'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+16px)] md:px-6">
                                    <div className="flex flex-col gap-4 text-sm text-gray-300">
                                        <div className="rounded-2xl border border-wuxia-gold/15 bg-black/35 p-4">
                                            <div className="flex items-center justify-between gap-3 border-b border-gray-800/80 pb-3">
                                                <span className="text-gray-400">GitHub 授权状态</span>
                                                <span className="flex items-center gap-2 text-emerald-400">
                                                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
                                                    已登录
                                                </span>
                                            </div>

                                            <div className="mt-4">
                                                <label className="mb-2 block text-xs tracking-[0.14em] text-gray-400">目标私有仓库</label>
                                                <div className="flex flex-col gap-2 sm:flex-row">
                                                    <input
                                                        value={repoInput}
                                                        onChange={(event) => setRepoInput(event.target.value)}
                                                        placeholder="例如 wuxia-cloud-save"
                                                        className="min-w-0 flex-1 rounded-lg border border-wuxia-gold/20 bg-black/60 px-3 py-2 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-wuxia-gold/60"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => void saveRepoBinding()}
                                                        className="rounded-lg border border-wuxia-gold/25 bg-wuxia-gold/10 px-4 py-2 text-sm text-wuxia-gold transition-colors hover:bg-wuxia-gold/15"
                                                    >
                                                        绑定仓库
                                                    </button>
                                                </div>
                                                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500">
                                                    <span>只填仓库名，不要带用户名。</span>
                                                    {repoName && (
                                                        <button onClick={handleChangeRepo} className="text-wuxia-gold/70 transition-colors hover:text-wuxia-gold">
                                                            清除绑定
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mt-4 flex justify-between items-end border-b border-gray-800/80 pb-3">
                                                <span className="text-gray-400">最近云端记录</span>
                                                <span className={`text-right font-mono ${syncData?.exists ? 'text-wuxia-gold' : 'text-gray-600'}`}>
                                                    {activeRepoName
                                                        ? isLoadingMeta
                                                            ? '查询中...'
                                                            : syncData?.exists
                                                                ? formatTime(syncData.updatedAt)
                                                                : '当前仓库暂无云备份'
                                                        : '尚未绑定仓库'}
                                                </span>
                                            </div>

                                            {syncData?.url && (
                                                <a
                                                    href={syncData.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="mt-3 inline-flex text-xs text-wuxia-gold/60 underline decoration-wuxia-gold/30 underline-offset-2 transition-colors hover:text-wuxia-gold"
                                                >
                                                    前往 GitHub Release 查看云端附件
                                                </a>
                                            )}
                                            <div className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-3 text-xs leading-5 text-amber-100/85">
                                                如果上传速度只有几十 KB/s，或频繁出现上传失败，优先关闭 VPN、代理插件和系统代理后再重试，通常会明显改善。
                                            </div>
                                        </div>

                                        {isSyncing ? (
                                            <div className="rounded-2xl border border-wuxia-gold/25 bg-wuxia-gold/5 p-4 text-wuxia-gold">
                                                <div className="flex items-center justify-center gap-3">
                                                    <svg className="h-6 w-6 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    <span>{progress?.message || '云同步处理中...'}</span>
                                                </div>
                                                <div className="mt-3 flex justify-between text-xs text-wuxia-gold/80">
                                                    <span>{progress?.direction === 'upload' ? '上传任务' : progress?.direction === 'download' ? '下载任务' : '同步任务'} · {getStageText(progress)}</span>
                                                    <span>{progress?.partCount ? `分卷 ${progress.partIndex}/${progress.partCount}` : '准备中'}</span>
                                                </div>
                                                <div className="mt-3 h-2 overflow-hidden rounded-full border border-wuxia-gold/10 bg-black/50">
                                                    <div className="h-full bg-gradient-to-r from-wuxia-gold/40 via-wuxia-gold to-wuxia-gold/50 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                                                </div>
                                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-wuxia-gold/80">
                                                    <span>进度: {progressPercent.toFixed(1)}%</span>
                                                    <span className="text-right">速度: {formatSpeed(progress?.speedBytesPerSecond || 0)}</span>
                                                    <span>已传: {formatBytes(progress?.transferredBytes || 0)}</span>
                                                    <span className="text-right">总量: {formatBytes(progress?.totalBytes || 0)}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid gap-3">
                                                <button
                                                    type="button"
                                                    onClick={handleUpload}
                                                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-700/60 bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950 px-4 py-3 text-sm font-semibold tracking-[0.18em] text-emerald-100 shadow-[0_0_15px_rgba(52,211,153,0.15)] transition-all hover:border-emerald-400"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4 text-emerald-400">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75" />
                                                    </svg>
                                                    上传到 GitHub 云端
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={handleDownload}
                                                    disabled={!syncData?.exists}
                                                    className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold tracking-[0.18em] transition-all ${
                                                        !syncData?.exists
                                                            ? 'cursor-not-allowed border-gray-800/80 bg-[#111] text-gray-700'
                                                            : 'border-sky-700/60 bg-gradient-to-r from-sky-950 via-sky-900 to-sky-950 text-sky-100 shadow-[0_0_15px_rgba(56,189,248,0.15)] hover:border-sky-400'
                                                    }`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={`h-4 w-4 ${syncData?.exists ? 'text-sky-400' : 'text-gray-700'}`}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                                                    </svg>
                                                    {syncData?.exists ? '下载并覆盖本地存档' : '当前仓库暂无可恢复的云端备份'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="shrink-0 border-t border-wuxia-gold/10 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+16px)] md:px-6">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!window.confirm('这只会清除当前设备保存的 GitHub 令牌，不会删除你的云端仓库，确定退出吗？')) return;
                                            logout();
                                            setShowPanel(false);
                                        }}
                                        className="w-full rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-xs tracking-[0.14em] text-red-300 transition-colors hover:bg-red-500/10"
                                    >
                                        解除当前设备上的 GitHub 授权
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
