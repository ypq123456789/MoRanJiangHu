import React from 'react';
import GameButton from '../ui/GameButton';
import { GitHubSyncButton } from '../features/Auth/GitHubSyncButton';
import { RELEASE_INFO } from '../../data/releaseInfo';
import { checkForAppUpdate, openExternalUrl } from '../../services/appUpdate';
import { isNativeCapacitorEnvironment, setNativeSystemBarsHidden } from '../../utils/nativeRuntime';

const hasFullscreenElement = () => {
    const doc = document as Document & {
        webkitFullscreenElement?: Element;
        msFullscreenElement?: Element;
    };

    return !!(
        document.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.msFullscreenElement
    );
};

const requestBrowserFullscreen = async () => {
    const doc = document as Document & {
        webkitFullscreenElement?: Element;
        webkitExitFullscreen?: () => Promise<void> | void;
        msFullscreenElement?: Element;
        msExitFullscreen?: () => Promise<void> | void;
    };

    const root = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
        msRequestFullscreen?: () => Promise<void> | void;
    };

    const isFullscreen = hasFullscreenElement();

    if (!isFullscreen) {
        const enter = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
        if (enter) {
            try {
                await Promise.resolve(enter.call(root));
                await setNativeSystemBarsHidden(true);
            } catch (err: unknown) {
                console.error('进入全屏失败:', err);
            }
        }
        return;
    }

    const exit = document.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
    if (exit) {
        try {
            await Promise.resolve(exit.call(document));
            await setNativeSystemBarsHidden(false);
        } catch (err: unknown) {
            console.error('退出全屏失败:', err);
        }
    }
};

interface Props {
    onStart: () => void;
    onLoad: () => void;
    onImageManager: () => void;
    onWorldbookManager: () => void;
    onNovelDecomposition: () => void;
    onSettings: () => void;
    onOpenReleaseNotes: () => void;
    hasSave: boolean;
}

const actionButtonStyle: React.CSSProperties = {
    fontFamily: 'var(--ui-按钮-font-family, inherit)',
    fontSize: 'var(--ui-按钮-font-size, 14px)',
    lineHeight: 'var(--ui-按钮-line-height, 1.2)'
};

const LandingPage: React.FC<Props> = ({
    onStart,
    onLoad,
    onImageManager,
    onWorldbookManager,
    onNovelDecomposition,
    onSettings,
    onOpenReleaseNotes,
    hasSave
}) => {
    const isNativeApp = React.useMemo(() => isNativeCapacitorEnvironment(), []);
    const [isCheckingUpdate, setIsCheckingUpdate] = React.useState(false);

    React.useEffect(() => {
        const syncSystemBars = () => {
            void setNativeSystemBarsHidden(hasFullscreenElement());
        };

        document.addEventListener('fullscreenchange', syncSystemBars);
        return () => {
            document.removeEventListener('fullscreenchange', syncSystemBars);
            void setNativeSystemBarsHidden(false);
        };
    }, []);

    const handleCheckUpdate = async () => {
        setIsCheckingUpdate(true);
        try {
            await checkForAppUpdate();
        } catch (error: any) {
            window.alert(`开始更新失败：${error?.message || '未知错误'}`);
        } finally {
            setIsCheckingUpdate(false);
        }
    };

    return (
        <div className="relative z-40 flex h-full w-full flex-col items-center overflow-y-auto rounded-xl bg-black px-4 pt-[max(var(--app-safe-top,env(safe-area-inset-top,0px)),12px)] pb-[calc(var(--app-safe-bottom,env(safe-area-inset-bottom,0px))+16px)]">
            <div className="absolute inset-0 bg-black" />

            <div className="relative z-20 mb-8 flex w-full max-w-5xl flex-wrap items-center justify-center gap-2 pt-2 sm:justify-end md:mb-12">
                <GitHubSyncButton floating={false} />

                {isNativeApp && (
                    <button
                        type="button"
                        onClick={() => { void handleCheckUpdate(); }}
                        className="min-h-[40px] border border-wuxia-gold/40 bg-black/60 px-3 py-2 text-xs font-serif tracking-[0.18em] text-wuxia-gold transition-colors hover:bg-black/80 md:text-sm"
                        style={actionButtonStyle}
                        title="检查 APK 更新"
                    >
                        {isCheckingUpdate ? '检查中...' : '检查更新'}
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => { void requestBrowserFullscreen(); }}
                    className="min-h-[40px] border border-wuxia-gold/40 bg-black/60 px-3 py-2 text-xs font-serif tracking-[0.2em] text-wuxia-gold transition-colors hover:bg-black/80 md:text-sm"
                    style={actionButtonStyle}
                    title="切换全屏"
                >
                    全屏
                </button>
            </div>

            <div className="relative z-10 mt-2 mb-16 flex flex-col items-center animate-fadeIn">
                <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-wuxia-gold/5 blur-3xl" />

                <h1
                    onClick={() => { void requestBrowserFullscreen(); }}
                    className="mb-6 cursor-pointer select-none bg-gradient-to-b from-gray-100 to-gray-500 bg-clip-text text-center font-serif text-7xl font-black tracking-[0.1em] text-transparent drop-shadow-2xl md:text-9xl"
                    style={{
                        fontFamily: 'var(--ui-页面标题-font-family, inherit)',
                        fontSize: 'var(--ui-页面标题-font-size, clamp(3rem,8vw,6rem))',
                        lineHeight: 'var(--ui-页面标题-line-height, 1.2)',
                        fontStyle: 'var(--ui-页面标题-font-style, normal)'
                    }}
                    title="点击切换全屏"
                >
                    墨染江湖
                </h1>

                <div className="flex items-center gap-6 opacity-80">
                    <div className="h-px w-16 bg-gradient-to-r from-transparent to-wuxia-red" />
                    <h2
                        className="text-shadow-sm text-xl font-bold uppercase tracking-[0.5em] text-wuxia-red md:text-2xl"
                        style={{
                            fontFamily: 'var(--ui-分组标题-font-family, inherit)',
                            lineHeight: 'var(--ui-分组标题-line-height, 1.35)'
                        }}
                    >
                        无尽武林
                    </h2>
                    <div className="h-px w-16 bg-gradient-to-l from-transparent to-wuxia-red" />
                </div>
            </div>

            <div className="relative z-10 flex w-64 flex-col gap-6 animate-slide-in delay-100">
                <GameButton onClick={onStart} variant="primary" className="py-4 text-lg shadow-lg">
                    踏入江湖
                </GameButton>

                <GameButton
                    onClick={onLoad}
                    variant="secondary"
                    className={`py-4 text-lg shadow-lg ${!hasSave ? 'cursor-not-allowed grayscale opacity-50' : ''}`}
                    disabled={!hasSave}
                >
                    重入江湖
                </GameButton>

                <GameButton onClick={onImageManager} variant="secondary" className="border-opacity-50 py-4 text-lg opacity-90 shadow-lg hover:opacity-100">
                    图片管理
                </GameButton>

                <GameButton onClick={onWorldbookManager} variant="secondary" className="border-opacity-50 py-4 text-lg opacity-90 shadow-lg hover:opacity-100">
                    世界书管理
                </GameButton>

                <GameButton onClick={onNovelDecomposition} variant="secondary" className="border-opacity-50 py-4 text-lg opacity-90 shadow-lg hover:opacity-100">
                    小说拆解
                </GameButton>

                <GameButton onClick={onSettings} variant="secondary" className="border-opacity-50 py-4 text-lg opacity-80 shadow-lg hover:opacity-100">
                    设置
                </GameButton>
            </div>

            <div className="relative z-10 mt-8 w-full max-w-xl animate-fadeIn rounded-2xl border border-wuxia-gold/15 bg-black/45 px-4 py-4 shadow-[0_12px_36px_rgba(0,0,0,0.45)] backdrop-blur-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-wuxia-gold/10 pb-3">
                    <div>
                        <div className="text-sm font-serif tracking-[0.24em] text-wuxia-gold">发布信息</div>
                        <div className="mt-1 text-xs text-gray-400">
                            Web / APK 当前统一版本 v{RELEASE_INFO.versionName}
                        </div>
                    </div>
                    <div className="text-xs font-mono tracking-[0.18em] text-gray-500">
                        APK CODE {RELEASE_INFO.versionCode}
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={() => { void openExternalUrl(RELEASE_INFO.githubRepoUrl); }}
                        className="min-h-[40px] border border-wuxia-gold/25 bg-white/[0.03] px-4 py-2 text-xs tracking-[0.16em] text-wuxia-gold transition-colors hover:bg-white/[0.06]"
                    >
                        GitHub 项目
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (isNativeApp) {
                                void handleCheckUpdate();
                                return;
                            }
                            void openExternalUrl(RELEASE_INFO.apkDownloadUrl);
                        }}
                        className="min-h-[40px] border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-xs tracking-[0.16em] text-emerald-300 transition-colors hover:bg-emerald-500/15"
                    >
                        {isNativeApp ? '立即更新' : 'APK 下载'}
                    </button>
                    <button
                        type="button"
                        onClick={onOpenReleaseNotes}
                        className="min-h-[40px] border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-xs tracking-[0.16em] text-sky-200 transition-colors hover:bg-sky-500/15"
                    >
                        更新日志
                    </button>
                </div>
            </div>

            <div
                className="relative z-10 mt-6 text-[10px] font-mono tracking-[0.3em] text-gray-600 opacity-60"
                style={{
                    fontFamily: 'var(--ui-等宽信息-font-family, inherit)',
                    fontSize: 'var(--ui-等宽信息-font-size, 12px)',
                    lineHeight: 'var(--ui-等宽信息-line-height, 1.45)'
                }}
            >
                VER {RELEASE_INFO.versionName} · APK {RELEASE_INFO.versionCode}
            </div>

            <div className="absolute top-10 right-20 h-32 w-32 rounded-full bg-black/50 opacity-40 blur-2xl" />
            <div className="absolute bottom-20 left-10 h-48 w-48 rounded-full bg-black/60 opacity-30 blur-3xl" />
        </div>
    );
};

export default LandingPage;
