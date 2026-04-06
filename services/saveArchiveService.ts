import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { 存档结构 } from '../types';
import * as dbService from './dbService';
import { 是否图片资源引用 } from '../utils/imageAssets';

const ZIP存档版本 = 1;
const 图片目录名 = '图片';
const 聊天记录目录名 = '聊天记录';
const 游戏数据目录名 = '游戏数据';

type ZIP清单项 = {
    key: string;
    类型: 存档结构['类型'];
    时间戳: number;
    标题: string;
    游戏数据文件: string;
    聊天记录文件: string;
    图片文件数: number;
};

type ZIP清单结构 = {
    format: 'wuxia-save-zip';
    version: number;
    exportedAt: string;
    saves: ZIP清单项[];
};

type 图片二进制结构 = {
    bytes: Uint8Array;
    mimeType: string;
};

const 读取文本 = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

const 深拷贝 = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const pad2 = (value: number): string => Math.trunc(value).toString().padStart(2, '0');

const 安全文件名 = (value: string, fallback: string): string => {
    const normalized = (value || '')
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || fallback;
};

const 构建存档键 = (save: 存档结构, index: number): string => {
    const date = new Date(save.时间戳 || Date.now());
    const stamp = Number.isNaN(date.getTime())
        ? `${Date.now()}`
        : `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
    const title = 安全文件名(读取文本(save.角色数据?.姓名), `save_${index + 1}`);
    return `${save.类型}_${stamp}_${title}`;
};

const 是DataUrl图片 = (value: string): boolean => /^data:image\//i.test(value);
const 是远程图片地址 = (value: string): boolean => /^https?:\/\//i.test(value);
const 是可导出图片地址 = (value: string): boolean => 是DataUrl图片(value) || 是远程图片地址(value) || 是否图片资源引用(value);

const 从Mime推断扩展名 = (mimeType: string, fallback = 'png'): string => {
    const normalized = (mimeType || '').toLowerCase();
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('gif')) return 'gif';
    if (normalized.includes('bmp')) return 'bmp';
    return fallback;
};

const 从来源推断扩展名 = (source: string, mimeType?: string): string => {
    const fromMime = 从Mime推断扩展名(mimeType || '', '');
    if (fromMime) return fromMime;
    if (是DataUrl图片(source)) {
        const matched = source.match(/^data:(image\/[a-zA-Z0-9.+-]+);/i);
        return 从Mime推断扩展名(matched?.[1] || '', 'png');
    }
    try {
        const pathname = new URL(source).pathname.toLowerCase();
        if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'jpg';
        if (pathname.endsWith('.webp')) return 'webp';
        if (pathname.endsWith('.gif')) return 'gif';
        if (pathname.endsWith('.bmp')) return 'bmp';
    } catch {
        return 'png';
    }
    return 'png';
};

const Uint8数组转DataUrl = (bytes: Uint8Array, mimeType: string): string => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
};

const 下载图片二进制 = async (source: string): Promise<图片二进制结构> => {
    if (是否图片资源引用(source)) {
        const dataUrl = await dbService.读取图片资源(source);
        if (!dataUrl) {
            throw new Error('读取图片失败: 资源引用不存在');
        }
        return 下载图片二进制(dataUrl);
    }
    const response = await fetch(source);
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`读取图片失败: ${response.status}${detail ? ` - ${detail.slice(0, 200)}` : ''}`);
    }
    const blob = await response.blob();
    const mimeType = 读取文本(blob.type) || (
        是DataUrl图片(source)
            ? (source.match(/^data:(image\/[a-zA-Z0-9.+-]+);/i)?.[1] || 'image/png')
            : 'image/png'
    );
    return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mimeType
    };
};

const 处理导出对象图片 = async (
    value: unknown,
    saveKey: string,
    files: Record<string, Uint8Array>,
    sourceToPath: Map<string, string>,
    sourceToBytes: Map<string, Promise<图片二进制结构>>,
    pathSegments: string[] = []
): Promise<void> => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            await 处理导出对象图片(value[index], saveKey, files, sourceToPath, sourceToBytes, [...pathSegments, `${index}`]);
        }
        return;
    }

    const target = value as Record<string, unknown>;
    const hasImageAssetShape = Object.prototype.hasOwnProperty.call(target, '本地路径') || Object.prototype.hasOwnProperty.call(target, '图片URL');

    const 注册图片文件 = async (source: string, hint: string): Promise<string> => {
        const normalizedSource = 读取文本(source);
        if (!normalizedSource || !是可导出图片地址(normalizedSource)) return normalizedSource;
        const cachedPath = sourceToPath.get(normalizedSource);
        if (cachedPath) return cachedPath;

        let task = sourceToBytes.get(normalizedSource);
        if (!task) {
            task = 下载图片二进制(normalizedSource);
            sourceToBytes.set(normalizedSource, task);
        }

        try {
            const { bytes, mimeType } = await task;
            const extension = 从来源推断扩展名(normalizedSource, mimeType);
            const fileName = 安全文件名(hint, 'image');
            const archivePath = `${图片目录名}/${saveKey}/${fileName}.${extension}`;
            sourceToPath.set(normalizedSource, archivePath);
            files[archivePath] = bytes;
            return archivePath;
        } catch {
            sourceToBytes.delete(normalizedSource);
            return normalizedSource;
        }
    };

    if (hasImageAssetShape) {
        const localPath = 读取文本(target.本地路径);
        const imageUrl = 读取文本(target.图片URL);
        const preferredSource = 是可导出图片地址(localPath)
            ? localPath
            : (是可导出图片地址(imageUrl) ? imageUrl : '');
        if (preferredSource) {
            const archivePath = await 注册图片文件(preferredSource, [...pathSegments, 'asset'].join('_'));
            if (archivePath !== preferredSource) {
                target.本地路径 = archivePath;
                if (是DataUrl图片(imageUrl)) {
                    delete target.图片URL;
                }
            }
        }
    }

    const entries = Object.entries(target);
    for (const [key, child] of entries) {
        if (key === '本地路径' || key === '图片URL') continue;

        if ((key === '背景图片' || key.endsWith('图片URL')) && typeof child === 'string') {
            const source = 读取文本(child);
            if (!是可导出图片地址(source)) continue;
            const archivePath = await 注册图片文件(source, [...pathSegments, key].join('_'));
            if (archivePath !== source) {
                target[key] = archivePath;
            }
            continue;
        }

        await 处理导出对象图片(child, saveKey, files, sourceToPath, sourceToBytes, [...pathSegments, key]);
    }
};

const 还原导入对象图片 = async (
    value: unknown,
    archiveImages: Map<string, string>
): Promise<void> => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
        for (const item of value) {
            await 还原导入对象图片(item, archiveImages);
        }
        return;
    }

    const target = value as Record<string, unknown>;
    const localPath = 读取文本(target.本地路径);
    if (localPath && archiveImages.has(localPath)) {
        target.本地路径 = await dbService.保存图片资源(archiveImages.get(localPath) || localPath);
        delete target.图片URL;
    }
    const imageUrl = 读取文本(target.图片URL);
    if (imageUrl && archiveImages.has(imageUrl)) {
        target.图片URL = await dbService.保存图片资源(archiveImages.get(imageUrl) || imageUrl);
    }

    for (const [key, child] of Object.entries(target)) {
        if (key === '本地路径' || key === '图片URL') continue;
        if ((key === '背景图片' || key.endsWith('图片URL')) && typeof child === 'string') {
            const archivePath = 读取文本(child);
            if (archiveImages.has(archivePath)) {
                target[key] = await dbService.保存图片资源(archiveImages.get(archivePath) || archivePath);
            }
            continue;
        }
        await 还原导入对象图片(child, archiveImages);
    }
};

export const 导出ZIP存档文件 = async (): Promise<Blob> => {
    const payload = await dbService.导出存档数据();
    const saves = Array.isArray(payload.saves) ? payload.saves : [];
    if (saves.length === 0) {
        throw new Error('当前没有可导出的存档');
    }

    const files: Record<string, Uint8Array> = {};
    const manifest: ZIP清单结构 = {
        format: 'wuxia-save-zip',
        version: ZIP存档版本,
        exportedAt: new Date().toISOString(),
        saves: []
    };

    for (let index = 0; index < saves.length; index += 1) {
        const save = 深拷贝(saves[index]);
        const saveKey = 构建存档键(save, index);
        const gameDataPath = `${游戏数据目录名}/${saveKey}.json`;
        const historyPath = `${聊天记录目录名}/${saveKey}.json`;
        const sourceToPath = new Map<string, string>();
        const sourceToBytes = new Map<string, Promise<图片二进制结构>>();

        const gameData = 深拷贝(save) as any;
        delete gameData.id;
        gameData.历史记录 = [];

        await 处理导出对象图片(gameData, saveKey, files, sourceToPath, sourceToBytes, ['save', saveKey]);

        files[gameDataPath] = strToU8(JSON.stringify(gameData, null, 2));
        files[historyPath] = strToU8(JSON.stringify({
            version: ZIP存档版本,
            records: Array.isArray(save.历史记录) ? save.历史记录 : []
        }, null, 2));

        manifest.saves.push({
            key: saveKey,
            类型: save.类型,
            时间戳: save.时间戳,
            标题: 读取文本(save.角色数据?.姓名) || '未知角色',
            游戏数据文件: gameDataPath,
            聊天记录文件: historyPath,
            图片文件数: Array.from(sourceToPath.values()).length
        });
    }

    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    return new Blob([zipSync(files)], { type: 'application/zip' });
};

export const 解析ZIP存档文件 = async (file: Blob): Promise<dbService.存档导出结构> => {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const entries = unzipSync(buffer);
    const manifestEntry = entries['manifest.json'];
    if (!manifestEntry) {
        throw new Error('ZIP 内缺少 manifest 清单');
    }

    let manifest: ZIP清单结构;
    try {
        manifest = JSON.parse(strFromU8(manifestEntry));
    } catch (error: any) {
        throw new Error(`manifest 解析失败：${error?.message || '格式错误'}`);
    }

    if (manifest?.format !== 'wuxia-save-zip' || !Array.isArray(manifest?.saves)) {
        throw new Error('ZIP 清单格式无效');
    }

    const saves: 存档结构[] = [];
    for (const item of manifest.saves) {
        const gameDataEntry = entries[item.游戏数据文件];
        const historyEntry = entries[item.聊天记录文件];
        if (!gameDataEntry) {
            throw new Error(`缺少游戏数据文件：${item.游戏数据文件}`);
        }
        if (!historyEntry) {
            throw new Error(`缺少聊天记录文件：${item.聊天记录文件}`);
        }

        let gameData: any;
        let historyPayload: any;
        try {
            gameData = JSON.parse(strFromU8(gameDataEntry));
        } catch (error: any) {
            throw new Error(`游戏数据解析失败：${item.游戏数据文件} - ${error?.message || '格式错误'}`);
        }
        try {
            historyPayload = JSON.parse(strFromU8(historyEntry));
        } catch (error: any) {
            throw new Error(`聊天记录解析失败：${item.聊天记录文件} - ${error?.message || '格式错误'}`);
        }

        const archiveImages = new Map<string, string>();
        Object.entries(entries).forEach(([path, bytes]) => {
            if (!path.startsWith(`${图片目录名}/${item.key}/`)) return;
            const lower = path.toLowerCase();
            const mimeType = lower.endsWith('.jpg') || lower.endsWith('.jpeg')
                ? 'image/jpeg'
                : lower.endsWith('.webp')
                    ? 'image/webp'
                    : lower.endsWith('.gif')
                        ? 'image/gif'
                        : lower.endsWith('.bmp')
                            ? 'image/bmp'
                            : 'image/png';
            archiveImages.set(path, Uint8数组转DataUrl(bytes, mimeType));
        });

        await 还原导入对象图片(gameData, archiveImages);

        saves.push({
            ...(gameData || {}),
            id: Number(gameData?.id) || 0,
            历史记录: Array.isArray(historyPayload?.records) ? historyPayload.records : []
        } as 存档结构);
    }

    return {
        version: manifest.version,
        exportedAt: 读取文本(manifest.exportedAt) || new Date().toISOString(),
        saves
    };
};
