import React from 'react';
import GameButton from './GameButton';
import { RELEASE_INFO } from '../../data/releaseInfo';

type ReleaseEntry = {
    versionCode?: number;
    versionName?: string;
    publishedAt?: string;
    changes?: string[];
};

interface Props {
    open: boolean;
    isNativeApp: boolean;
    suppressForToday: boolean;
    onSuppressForTodayChange: (value: boolean) => void;
    onClose: () => void;
    onPrimaryAction: () => void;
    onOpenGithub: () => void;
}

const formatReleaseTime = (value?: string) => {
    if (!value) return '待补充';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};

const normalizedHistory: ReleaseEntry[] = [
    {
        versionCode: RELEASE_INFO.versionCode,
        versionName: RELEASE_INFO.versionName,
        publishedAt: RELEASE_INFO.releasePublishedAt,
        changes: Array.isArray(RELEASE_INFO.releaseNotes) ? [...RELEASE_INFO.releaseNotes] : []
    },
    ...(Array.isArray(RELEASE_INFO.releaseHistory) ? RELEASE_INFO.releaseHistory : [])
].reduce<ReleaseEntry[]>((list, item) => {
    if (!item?.versionName) return list;
    if (list.some((entry) => entry.versionName === item.versionName && entry.versionCode === item.versionCode)) {
        return list;
    }
    return [...list, item];
}, []);

const ReleaseNotesModal: React.FC<Props> = ({
    open,
    isNativeApp,
    suppressForToday,
    onSuppressForTodayChange,
    onClose,
    onPrimaryAction,
    onOpenGithub
}) => {
    if (!open) return null;

    const latest = normalizedHistory[0];
    const history = normalizedHistory.slice(1);

    return (
        <div className="fixed inset-0 z-[410] flex items-center justify-center bg-black/82 px-4 py-6 backdrop-blur-md animate-fadeIn">
            <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-wuxia-gold/25 bg-[radial-gradient(circle_at_top,rgba(198,153,74,0.14),transparent_30%),linear-gradient(180deg,rgba(20,17,15,0.98),rgba(8,8,8,0.98))] shadow-[0_30px_120px_rgba(0,0,0,0.72)]">
                <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-wuxia-gold/45 to-transparent" />

                <div className="flex items-start justify-between gap-4 border-b border-wuxia-gold/10 px-5 py-5 md:px-7">
                    <div>
                        <div className="inline-flex items-center rounded-full border border-wuxia-gold/20 bg-wuxia-gold/10 px-3 py-1 text-[11px] tracking-[0.28em] text-wuxia-gold/90">
                            VERSION BULLETIN
                        </div>
                        <h3 className="mt-3 text-2xl font-serif font-bold tracking-[0.12em] text-wuxia-gold md:text-3xl">
                            更新日志
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-gray-300 md:text-[15px]">
                            当前版本 v{RELEASE_INFO.versionName} · APK {RELEASE_INFO.versionCode}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-wuxia-gold/20 bg-black/30 text-xl text-gray-300 transition-colors hover:border-wuxia-gold/40 hover:text-white"
                        aria-label="关闭更新日志"
                        title="关闭更新日志"
                    >
                        ×
                    </button>
                </div>

                <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[1.15fr_0.85fr]">
                    <div className="min-h-0 overflow-y-auto border-b border-wuxia-gold/10 px-5 py-5 md:border-b-0 md:border-r md:px-7">
                        <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/8 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] tracking-[0.24em] text-emerald-200">
                                    LATEST
                                </span>
                                <span className="text-lg font-semibold text-white">
                                    v{latest?.versionName || RELEASE_INFO.versionName}
                                </span>
                                {latest?.versionCode ? (
                                    <span className="text-xs tracking-[0.18em] text-gray-400">
                                        CODE {latest.versionCode}
                                    </span>
                                ) : null}
                            </div>

                            <div className="mt-3 text-sm text-gray-300">
                                发布时间：{formatReleaseTime(latest?.publishedAt)}
                            </div>

                            <div className="mt-5 space-y-3">
                                {(latest?.changes && latest.changes.length > 0 ? latest.changes : ['本次版本已发布，详细内容整理中。']).map((item, index) => (
                                    <div
                                        key={`${latest?.versionName || 'latest'}-${index}`}
                                        className="rounded-2xl border border-white/5 bg-black/25 px-4 py-3 text-sm leading-7 text-gray-100"
                                    >
                                        <span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-wuxia-gold/20 bg-wuxia-gold/10 text-xs text-wuxia-gold">
                                            {index + 1}
                                        </span>
                                        <span>{item}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="min-h-0 overflow-y-auto px-5 py-5 md:px-6">
                        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
                            <div className="text-sm tracking-[0.22em] text-gray-300">历史版本</div>
                            <div className="mt-4 space-y-4">
                                {history.length > 0 ? history.map((entry) => (
                                    <div key={`${entry.versionName || 'unknown'}-${entry.versionCode || 0}`} className="rounded-2xl border border-white/6 bg-black/25 p-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="text-base font-semibold text-white">v{entry.versionName || '未知版本'}</div>
                                            {entry.versionCode ? (
                                                <div className="text-[11px] tracking-[0.18em] text-gray-500">CODE {entry.versionCode}</div>
                                            ) : null}
                                        </div>
                                        <div className="mt-2 text-xs leading-5 text-gray-500">
                                            {formatReleaseTime(entry.publishedAt)}
                                        </div>
                                        <div className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
                                            {(entry.changes && entry.changes.length > 0 ? entry.changes : ['该版本未填写详细变更。']).map((change, index) => (
                                                <div key={`${entry.versionName || 'unknown'}-change-${index}`} className="flex gap-2">
                                                    <span className="mt-[2px] text-wuxia-gold/70">•</span>
                                                    <span>{change}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm leading-6 text-gray-500">
                                        暂无更多历史版本记录。
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-4 border-t border-wuxia-gold/10 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-7">
                    <label className="inline-flex cursor-pointer items-center gap-3 text-sm text-gray-300">
                        <input
                            type="checkbox"
                            checked={suppressForToday}
                            onChange={(event) => onSuppressForTodayChange(event.target.checked)}
                            className="h-4 w-4 rounded border border-wuxia-gold/30 bg-black text-wuxia-gold accent-wuxia-gold"
                        />
                        今日不再弹出
                    </label>

                    <div className="flex flex-wrap gap-3">
                        <GameButton onClick={onOpenGithub} variant="secondary" className="px-4 py-2 text-xs">
                            GitHub 项目
                        </GameButton>
                        <GameButton onClick={onPrimaryAction} variant="primary" className="px-4 py-2 text-xs">
                            {isNativeApp ? '检查更新' : '下载 APK'}
                        </GameButton>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReleaseNotesModal;
