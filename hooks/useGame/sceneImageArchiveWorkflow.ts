import type { 场景图片档案, 视觉设置结构 } from '../../types';
import { 规范化视觉设置 } from '../../utils/visualSettings';
import { 获取图片展示地址, 压缩图片资源字段 } from '../../utils/imageAssets';

type 场景图片档案工作流依赖 = {
    获取场景图历史上限: () => number;
    读取场景图片档案设置: () => Promise<unknown>;
    保存场景图片档案设置: (archive: 场景图片档案) => Promise<unknown> | unknown;
    同步场景图片档案: (archive: 场景图片档案) => void;
    获取当前场景图片档案: () => 场景图片档案;
    清理未引用图片资源: () => Promise<unknown>;
    获取当前视觉设置: () => 视觉设置结构;
    应用视觉设置到状态: (value: Partial<视觉设置结构> | null | undefined) => void;
    深拷贝: <T,>(value: T) => T;
    加载图片AI服务: () => Promise<any>;
};

export const 生成场景生图记录ID = (): string => `scene_img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const 规范化场景图片档案 = (raw?: any): 场景图片档案 => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const history = Array.isArray(source?.生图历史)
        ? source.生图历史
        : (source?.最近生图结果 ? [source.最近生图结果] : []);
    const normalizedHistory = history
        .filter((item: any) => item && typeof item === 'object')
        .map((item: any) => {
            const normalizedItem = 压缩图片资源字段(item);
            return {
                ...normalizedItem,
                id: typeof normalizedItem?.id === 'string' && normalizedItem.id.trim() ? normalizedItem.id.trim() : 生成场景生图记录ID(),
                构图: '场景' as const
            };
        })
        .sort((a: any, b: any) => (b?.生成时间 || 0) - (a?.生成时间 || 0))
        .reduce((acc: any[], item: any) => {
            if (!acc.some((existing: any) => existing.id === item.id)) {
                acc.push(item);
            }
            return acc;
        }, [] as any[]);
    const fallbackRecent = normalizedHistory[0];
    const recentSource = source?.最近生图结果 && typeof source.最近生图结果 === 'object'
        ? source.最近生图结果
        : fallbackRecent;
    const 最近生图结果 = recentSource
        ? {
            ...压缩图片资源字段(recentSource),
            id: typeof recentSource?.id === 'string' && recentSource.id.trim()
                ? recentSource.id.trim()
                : (fallbackRecent?.id || 生成场景生图记录ID()),
            构图: '场景' as const
        }
        : undefined;
    const currentWallpaperImageId = typeof source?.当前壁纸图片ID === 'string' ? source.当前壁纸图片ID.trim() : '';
    const normalizedCurrentWallpaperImageId = currentWallpaperImageId && (
        normalizedHistory.some((item: any) => item?.id === currentWallpaperImageId)
        || 最近生图结果?.id === currentWallpaperImageId
    )
        ? currentWallpaperImageId
        : (
            normalizedHistory.find((item: any) => item?.状态 === 'success' && 获取图片展示地址(item))?.id
            || (最近生图结果?.状态 === 'success' && 获取图片展示地址(最近生图结果) ? 最近生图结果.id : undefined)
        );
    const normalized: 场景图片档案 = {};
    if (最近生图结果) normalized.最近生图结果 = 最近生图结果;
    if (normalizedHistory.length > 0) normalized.生图历史 = normalizedHistory;
    if (normalizedCurrentWallpaperImageId) normalized.当前壁纸图片ID = normalizedCurrentWallpaperImageId;
    return normalized;
};

export const 按场景图上限裁剪档案 = (raw: any, maxCount: number): { 档案: 场景图片档案; 删除数量: number } => {
    const normalized = 规范化场景图片档案(raw);
    const history = Array.isArray(normalized.生图历史) ? normalized.生图历史 : [];
    if (history.length <= maxCount) {
        return { 档案: normalized, 删除数量: 0 };
    }
    const trimmedHistory = history.slice(0, maxCount);
    const trimmedArchive = 规范化场景图片档案({
        ...normalized,
        生图历史: trimmedHistory,
        最近生图结果: trimmedHistory[0] || normalized.最近生图结果
    });
    return {
        档案: trimmedArchive,
        删除数量: Math.max(0, history.length - trimmedHistory.length)
    };
};

export const 创建场景图片档案工作流 = (deps: 场景图片档案工作流依赖) => {
    const 写入场景图片档案 = (updater: (archive: 场景图片档案) => 场景图片档案) => {
        const { 档案: nextArchive, 删除数量 } = 按场景图上限裁剪档案(
            updater(deps.获取当前场景图片档案() || {}),
            deps.获取场景图历史上限()
        );
        deps.同步场景图片档案(nextArchive);
        void deps.保存场景图片档案设置(nextArchive);
        if (删除数量 > 0) {
            void deps.清理未引用图片资源().catch((error) => {
                console.error('清理超限场景图片资源失败', error);
            });
        }
    };

    const 加载场景图片档案 = async () => {
        try {
            const savedArchive = await deps.读取场景图片档案设置();
            const normalized = 规范化场景图片档案(savedArchive);
            deps.同步场景图片档案(normalized);
            if (savedArchive && typeof savedArchive === 'object') {
                await deps.保存场景图片档案设置(normalized);
            }
        } catch (error) {
            console.error('读取场景图片档案失败', error);
        }
    };

    const 读取当前视觉设置 = (): 视觉设置结构 => (
        规范化视觉设置(deps.深拷贝(deps.获取当前视觉设置() || {}))
    );

    const 应用场景图片为壁纸 = async (imageId: string) => {
        if (!imageId) return;
        const archive = deps.获取当前场景图片档案() || {};
        const history = Array.isArray(archive?.生图历史) ? archive.生图历史 : [];
        const target = history.find((item: any) => item?.id === imageId && item?.状态 === 'success');
        const backgroundImage = 获取图片展示地址(target);
        if (!target || !backgroundImage) return;
        deps.应用视觉设置到状态({
            ...读取当前视觉设置(),
            背景图片: backgroundImage
        });
        写入场景图片档案((currentArchive) => ({
            ...currentArchive,
            当前壁纸图片ID: imageId
        }));
    };

    const 清除场景壁纸 = async () => {
        const archive = deps.获取当前场景图片档案() || {};
        const currentWallpaperId = typeof archive?.当前壁纸图片ID === 'string' ? archive.当前壁纸图片ID.trim() : '';
        if (!currentWallpaperId) return;
        deps.应用视觉设置到状态({
            ...读取当前视觉设置(),
            背景图片: ''
        });
        写入场景图片档案((currentArchive) => ({
            ...currentArchive,
            当前壁纸图片ID: undefined
        }));
    };

    const 设置常驻壁纸 = async (imageUrl: string) => {
        const normalized = typeof imageUrl === 'string' ? imageUrl.trim() : '';
        const currentVisual = 读取当前视觉设置();
        deps.应用视觉设置到状态({
            ...currentVisual,
            常驻壁纸: normalized,
            背景图片: normalized || currentVisual?.背景图片 || ''
        });
    };

    const 清除常驻壁纸 = async () => {
        deps.应用视觉设置到状态({
            ...读取当前视觉设置(),
            常驻壁纸: ''
        });
    };

    const 应用常驻壁纸为背景 = async () => {
        const currentVisual = 读取当前视觉设置();
        const persistent = typeof currentVisual?.常驻壁纸 === 'string' ? currentVisual.常驻壁纸.trim() : '';
        if (!persistent || currentVisual?.背景图片 === persistent) return;
        deps.应用视觉设置到状态({
            ...currentVisual,
            背景图片: persistent
        });
    };

    const 删除场景图片记录 = async (imageId: string) => {
        if (!imageId) return;
        const currentArchive = deps.获取当前场景图片档案() || {};
        const currentHistory = Array.isArray(currentArchive?.生图历史) ? currentArchive.生图历史 : [];
        const nextHistory = currentHistory.filter((item: any) => item?.id !== imageId);
        if (nextHistory.length === currentHistory.length) return;

        const nextArchive = 规范化场景图片档案({
            最近生图结果: nextHistory[0],
            生图历史: nextHistory,
            当前壁纸图片ID: currentArchive?.当前壁纸图片ID === imageId ? undefined : currentArchive?.当前壁纸图片ID
        });
        deps.同步场景图片档案(nextArchive);
        await deps.保存场景图片档案设置(nextArchive);

        if (currentArchive?.当前壁纸图片ID === imageId) {
            const fallbackBackground = 获取图片展示地址(nextHistory.find((item: any) => item?.状态 === 'success'));
            deps.应用视觉设置到状态({
                ...读取当前视觉设置(),
                背景图片: fallbackBackground || ''
            });
        }
    };

    const 清空场景图片历史 = async () => {
        const currentArchive = deps.获取当前场景图片档案() || {};
        const nextArchive: 场景图片档案 = 规范化场景图片档案({
            最近生图结果: currentArchive?.最近生图结果,
            生图历史: [],
            当前壁纸图片ID: currentArchive?.当前壁纸图片ID
        });
        deps.同步场景图片档案(nextArchive);
        await deps.保存场景图片档案设置(nextArchive);
    };

    const 保存场景图片本地副本 = async (imageId: string) => {
        if (!imageId) return;
        const archive = deps.获取当前场景图片档案() || {};
        const history = Array.isArray(archive?.生图历史) ? archive.生图历史 : [];
        const target = history.find((item: any) => item?.id === imageId);
        if (!target) return;
        const imageAIService = await deps.加载图片AI服务();
        const localized = await imageAIService.persistImageAssetLocally({
            图片URL: target?.图片URL,
            本地路径: target?.本地路径
        });
        if (!localized.本地路径) return;
        const nextArchive = 规范化场景图片档案({
            ...archive,
            最近生图结果: archive?.最近生图结果?.id === imageId
                ? {
                    ...archive.最近生图结果,
                    图片URL: localized.图片URL || archive?.最近生图结果?.图片URL,
                    本地路径: localized.本地路径
                }
                : archive?.最近生图结果,
            生图历史: history.map((item: any) => (
                item?.id === imageId
                    ? {
                        ...item,
                        图片URL: localized.图片URL || item?.图片URL,
                        本地路径: localized.本地路径
                    }
                    : item
            ))
        });
        deps.同步场景图片档案(nextArchive);
        await deps.保存场景图片档案设置(nextArchive);

        if (archive?.当前壁纸图片ID === imageId) {
            const backgroundImage = localized.本地路径 || localized.图片URL || '';
            if (backgroundImage) {
                deps.应用视觉设置到状态({
                    ...读取当前视觉设置(),
                    背景图片: backgroundImage
                });
            }
        }
    };

    return {
        加载场景图片档案,
        写入场景图片档案,
        应用场景图片为壁纸,
        清除场景壁纸,
        设置常驻壁纸,
        清除常驻壁纸,
        应用常驻壁纸为背景,
        删除场景图片记录,
        清空场景图片历史,
        保存场景图片本地副本
    };
};
