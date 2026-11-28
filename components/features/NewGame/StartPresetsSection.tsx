import React from 'react';
import type { 开局预设方案结构 } from '../../../data/newGamePresets';
import GameButton from '../../ui/GameButton';

export interface StartPresetsSectionProps {
    variant: 'desktop' | 'mobile';
    presets: 开局预设方案结构[];
    loading: boolean;
    cloudSyncing?: boolean;
    cloudSyncMessage?: string;
    actionsDisabled?: boolean;
    actionsDisabledHint?: string;
    onApply: (preset: 开局预设方案结构) => void;
    onStart: (preset: 开局预设方案结构) => void;
    onEdit: (preset: 开局预设方案结构) => void;
    onOverwrite: (preset: 开局预设方案结构) => void;
    onDelete: (presetId: string) => void;
}

/**
 * 开局预设方案区域（桌面与移动端共用）。
 * 在本地 IndexedDB 读取中或云端设置拉取中明确展示“加载中 / 云端同步中”反馈，避免空白延迟后突然弹出。
 */
export const StartPresetsSection: React.FC<StartPresetsSectionProps> = ({
    variant,
    presets,
    loading,
    cloudSyncing = false,
    cloudSyncMessage,
    actionsDisabled = false,
    actionsDisabledHint,
    onApply,
    onStart,
    onEdit,
    onOverwrite,
    onDelete
}) => {
    const syncBusy = Boolean(loading || cloudSyncing);
    if (!syncBusy && presets.length <= 0) {
        return null;
    }

    const isMobile = variant === 'mobile';
    const loadingText = cloudSyncing
        ? '正在从云端同步开局预设方案…'
        : '正在加载开局预设方案…';
    const loadingDetail = cloudSyncing
        ? (cloudSyncMessage?.trim() || '正在读取本地方案并等待云端预设回填，完成后会自动显示。')
        : '正在读取本地保存的开局预设方案，请稍候…';
    const badgeHint = cloudSyncing ? '云端同步中…' : '加载中…';

    return (
        <div className="rounded-2xl border border-wuxia-gold/25 bg-wuxia-gold/5 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm text-wuxia-gold font-bold">开局预设方案</div>
                    <div className={`text-[11px] text-gray-500 mt-1${isMobile ? ' leading-5' : ''}`}>
                        保存后的方案会优先出现在世界观页，可直接套用、编辑或跳过表单步骤直接开局。
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {syncBusy && presets.length > 0 && (
                        <span role="status" className="text-[11px] text-wuxia-cyan/90 animate-pulse">
                            {badgeHint}
                        </span>
                    )}
                    <span className="text-[10px] text-wuxia-cyan font-mono tracking-[0.18em]">CUSTOM</span>
                </div>
            </div>

            {presets.length <= 0 ? (
                <div className="space-y-3">
                    <div
                        role="status"
                        aria-live="polite"
                        className="rounded-xl border border-wuxia-gold/25 bg-wuxia-gold/10 px-4 py-3 flex items-start gap-2.5"
                    >
                        <span className="mt-1 h-2 w-2 rounded-full bg-wuxia-gold animate-pulse shrink-0" />
                        <div className="min-w-0 space-y-1">
                            <div className="text-xs font-medium text-wuxia-gold">{loadingText}</div>
                            <div className="text-[11px] text-gray-400 leading-5">{loadingDetail}</div>
                        </div>
                    </div>
                    <div className={isMobile ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-3'} aria-hidden="true">
                        {[0, 1].map((index) => (
                            <div
                                key={index}
                                className="rounded-xl border border-wuxia-gold/20 bg-wuxia-gold/5 p-4 space-y-3 animate-pulse"
                            >
                                <div className="space-y-2">
                                    <div className="h-4 w-28 rounded bg-wuxia-gold/20" />
                                    <div className="h-3 w-44 rounded bg-wuxia-gold/10" />
                                </div>
                                <div className="h-3 w-36 rounded bg-wuxia-gold/10" />
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="h-8 rounded border border-wuxia-cyan/20 bg-wuxia-cyan/10" />
                                    <div className="h-8 rounded border border-wuxia-gold/25 bg-wuxia-gold/15" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {actionsDisabled && (
                        <div
                            role="status"
                            aria-live="polite"
                            className="rounded-xl border border-wuxia-gold/25 bg-wuxia-gold/10 px-3 py-2 flex items-center gap-2 text-[11px] text-wuxia-gold"
                        >
                            <span className="h-2 w-2 rounded-full bg-wuxia-gold animate-pulse shrink-0" />
                            <span>{actionsDisabledHint || '正在读取自定义身份与天赋，请稍候…'}</span>
                        </div>
                    )}
                    <div className={isMobile ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}>
                        {presets.map((preset) => (
                            <div key={preset.id} className="rounded-xl border border-gray-700/80 bg-black/35 p-4 space-y-3">
                                <div>
                                    <div className="text-base font-serif text-wuxia-gold">{preset.名称}</div>
                                    <div className={`${isMobile ? 'text-[11px]' : 'text-xs'} text-gray-400 mt-1 leading-5 line-clamp-2`}>
                                        {preset.简介 || '自定义开局方案'}
                                    </div>
                                </div>
                                <div className="text-[11px] text-gray-500 leading-5">
                                    {preset.character.姓名 || '未命名主角'} / {preset.character.性别 || '未设性别'} / {preset.character.背景名称 || '未设背景'}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <GameButton
                                        onClick={() => onApply(preset)}
                                        disabled={actionsDisabled}
                                        variant="secondary"
                                        className="py-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        套用查看
                                    </GameButton>
                                    <GameButton
                                        onClick={() => onStart(preset)}
                                        disabled={actionsDisabled}
                                        variant="primary"
                                        className="py-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        以此方案开局
                                    </GameButton>
                                </div>
                                <div className={isMobile ? 'grid grid-cols-3 gap-2 text-[11px]' : 'grid grid-cols-3 gap-2'}>
                                    <button
                                        type="button"
                                        onClick={() => onEdit(preset)}
                                        className={isMobile ? 'text-wuxia-cyan' : 'text-[11px] text-wuxia-cyan hover:text-white'}
                                    >
                                        {isMobile ? '编辑' : '编辑信息'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onOverwrite(preset)}
                                        disabled={actionsDisabled}
                                        className={`${isMobile ? 'text-wuxia-gold' : 'text-[11px] text-wuxia-gold hover:text-white'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {isMobile ? '覆盖' : '覆盖保存'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onDelete(preset.id)}
                                        className={isMobile ? 'text-red-400' : 'text-[11px] text-red-400 hover:text-red-200'}
                                    >
                                        删除
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
