import React from 'react';

export interface SavedCollectionSectionProps {
    title: string;
    itemCount: number;
    loading: boolean;
    cloudSyncing?: boolean;
    loadingText: string;
    cloudSyncText?: string;
    variant: 'desktop' | 'mobile';
    children: React.ReactNode;
}

/**
 * 已保存自定义列表容器（自定义身份/天赋共用），在数据加载或云端同步未完成时显示明确的加载提示。
 */
export const SavedCollectionSection: React.FC<SavedCollectionSectionProps> = ({
    title,
    itemCount,
    loading,
    cloudSyncing = false,
    loadingText,
    cloudSyncText,
    variant,
    children
}) => {
    const syncBusy = Boolean(loading || cloudSyncing);
    if (!syncBusy && itemCount <= 0) {
        return null;
    }

    const isMobile = variant === 'mobile';
    const message = cloudSyncing ? (cloudSyncText || loadingText) : loadingText;

    return (
        <div className={`${isMobile ? 'mb-4' : 'mb-5'} rounded-2xl border border-gray-800 bg-black/25 p-4`}>
            <div className="flex items-center justify-between gap-3">
                <div className={`${isMobile ? 'text-[10px]' : 'text-[11px]'} tracking-[0.25em] text-gray-500 font-mono`}>
                    {title}
                </div>
                {syncBusy && itemCount > 0 && (
                    <span role="status" className="text-[11px] text-wuxia-cyan/90 animate-pulse">
                        {cloudSyncing ? '云端同步中…' : '加载中…'}
                    </span>
                )}
            </div>
            {itemCount <= 0 ? (
                <div
                    role="status"
                    aria-live="polite"
                    className="mt-3 rounded-xl border border-gray-800 bg-black/30 px-4 py-3 flex items-center gap-2.5 text-xs text-gray-300"
                >
                    <span className="h-2 w-2 rounded-full bg-wuxia-cyan animate-pulse shrink-0" />
                    <span>{message}</span>
                </div>
            ) : (
                <div className={`mt-3 ${isMobile ? 'space-y-2' : 'space-y-2'}`}>
                    {children}
                </div>
            )}
        </div>
    );
};

/** 统一返回“附加小说数据集”在不同加载阶段的占位符与辅助说明。 */
export const 获取小说数据集加载文案 = (
    loading: boolean,
    datasetCount: number
): { placeholder: string; emptyHint: string } => {
    if (datasetCount > 0) {
        return {
            placeholder: '选择附加小说数据集',
            emptyHint: ''
        };
    }
    if (loading) {
        return {
            placeholder: '正在加载小说分解数据集…',
            emptyHint: '正在读取已导入的小说分解数据集，请稍候…'
        };
    }
    return {
        placeholder: '暂无已导入的小说分解数据',
        emptyHint: '还没有可选的数据集，请先在首页的小说分解工作台导入 TXT / EPUB 或分解 JSON。'
    };
};
