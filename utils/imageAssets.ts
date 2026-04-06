type 图片资源结构 = {
    图片URL?: string;
    本地路径?: string;
};

const 图片资源引用前缀 = 'wuxia-asset://';
const 图片资源缓存 = new Map<string, string>();

const 读取文本 = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

export const 是否图片资源引用 = (value: unknown): boolean => (
    读取文本(value).startsWith(图片资源引用前缀)
);

export const 创建图片资源引用 = (assetId: string): string => {
    const normalized = 读取文本(assetId);
    return normalized ? `${图片资源引用前缀}${normalized}` : '';
};

export const 解析图片资源引用ID = (value: unknown): string => {
    const text = 读取文本(value);
    return text.startsWith(图片资源引用前缀) ? text.slice(图片资源引用前缀.length) : '';
};

export const 注册图片资源缓存 = (assetId: string, dataUrl: string): void => {
    const ref = 创建图片资源引用(assetId);
    const normalized = 读取文本(dataUrl);
    if (!ref || !normalized) return;
    图片资源缓存.set(ref, normalized);
};

export const 批量注册图片资源缓存 = (entries: Array<{ id: string; dataUrl: string }>): void => {
    if (!Array.isArray(entries)) return;
    entries.forEach((item) => 注册图片资源缓存(item?.id, item?.dataUrl));
};

export const 清空图片资源缓存 = (): void => {
    图片资源缓存.clear();
};

export const 读取图片资源缓存 = (value: unknown): string => {
    const ref = 读取文本(value);
    return ref ? (图片资源缓存.get(ref) || '') : '';
};

export const 获取图片展示地址 = (asset?: 图片资源结构 | null): string => {
    const local = 读取文本(asset?.本地路径);
    if (local) return 获取图片资源文本地址(local);
    const imageUrl = 读取文本(asset?.图片URL);
    if (imageUrl) return 获取图片资源文本地址(imageUrl);
    return '';
};

export const 获取图片资源文本地址 = (value: unknown): string => {
    const text = 读取文本(value);
    if (!text) return '';
    return 是否图片资源引用(text) ? 读取图片资源缓存(text) : text;
};

export const 压缩图片资源字段 = <T extends 图片资源结构 | null | undefined>(asset: T): T => {
    if (!asset || typeof asset !== 'object') return asset;
    const 本地路径 = 读取文本(asset.本地路径);
    const 图片URL = 读取文本(asset.图片URL);
    if (!本地路径 && !图片URL) return asset;
    if (!本地路径) {
        return {
            ...asset,
            图片URL: 图片URL || undefined
        };
    }
    return {
        ...asset,
        本地路径,
        图片URL: undefined
    };
};

export const 是否存在本地图片副本 = (asset?: 图片资源结构 | null): boolean => (
    读取文本(asset?.本地路径).length > 0
);

export const 是否远程图片地址 = (value: unknown): boolean => (
    /^https?:\/\//i.test(读取文本(value))
);

export const 格式化本地图片描述 = (value: unknown): string => {
    const text = 读取文本(value);
    if (!text) return '未保存本地副本';
    if (是否图片资源引用(text)) return '应用内图片资源';
    if (/^data:image\//i.test(text)) return '应用内本地缓存';
    return text;
};
