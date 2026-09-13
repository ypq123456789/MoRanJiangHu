
import { 存档结构 } from '../types';
import type { 题材模式类型, 游戏设置结构 } from '../models/system';
import { 创建图片资源引用, 解析图片资源引用ID, 是否图片资源引用, 注册图片资源缓存, 批量注册图片资源缓存, 清空图片资源缓存, 注册远程图片兜底引用, 读取远程图片兜底映射, 读取远程图片兜底资源ID集合 } from '../utils/imageAssets';
import { 当前为对象存储云端游玩模式 } from '../utils/cloudPlayStorageMode';
import { 获取设置项定义, 设置分类定义表, 设置键, type 设置分类类型 } from '../utils/settingsSchema';
import { 默认功能模型占位, 规范化接口设置 } from '../utils/apiConfig';
import { isNativeCapacitorEnvironment } from '../utils/nativeRuntime';
import { buildSaveDebugSummary, recordSaveLoadError, recordSaveLoadTrace } from '../utils/saveLoadTrace';
import { 修复本地存档谱系列表, 补全存档谱系元数据, 是系统占位历史消息 } from '../utils/saveLineage';
import { 读取存档游玩回合数 } from '../utils/saveTurn';

import { recordDiagnosticLog } from './diagnosticLog';
import { buildImageHostProxyUrl, 上传DataUrl到图床 } from './imageHostService';

// 逐任务容错：单个任务失败只把对应槽位置为 undefined，整体永不 reject。
// 返回 Array<T | undefined>，失败槽位为 undefined（调用方据此计为 skipped）。
const 并发限制 = <T>(tasks: Array<() => Promise<T>>, limit: number): Promise<Array<T | undefined>> => {
    const 实际限制 = Math.max(1, limit);
    return new Promise((resolve) => {
        const results: Array<T | undefined> = new Array(tasks.length);
        let nextIndex = 0;
        let running = 0;
        let completed = 0;
        const runNext = () => {
            while (running < 实际限制 && nextIndex < tasks.length) {
                const idx = nextIndex++;
                running++;
                tasks[idx]().then(
                    (value) => { results[idx] = value; },
                    (err) => { console.warn('[并发限制] 单任务失败，已跳过：', err); results[idx] = undefined; }
                ).finally(() => {
                    running--;
                    completed++;
                    if (completed === tasks.length) resolve(results);
                    else runNext();
                });
            }
            if (tasks.length === 0) resolve(results);
        };
        runNext();
    });
};

const DB_NAME = 'WuxiaGameDB';
const STORE_NAME = 'saves';
const SAVE_SUMMARIES_STORE = 'save_summaries';
const SETTINGS_STORE = 'settings';
const IMAGE_ASSETS_STORE = 'image_assets';
const USER_IMAGE_GALLERY_STORE = 'user_image_gallery';
const VERSION = 4;
const 默认自动存档最大保留数 = 15;
const 最小自动存档最大保留数 = 5;
const 最大自动存档最大保留数 = 50;
const 存档导出版本 = 1;
// 延迟访问 设置键 以避免循环依赖问题
const get存档保护设置键 = () => 设置键.存档保护;
const get图片资源迁移版本键 = () => 设置键.图片资源迁移版本;
const 设置记录版本 = 2;
const 远程图片本地备份ID前缀 = 'remote_backup_';
const 图片缓存预热最大条目数 = 24;
const 图片缓存预热最大字符数 = 18 * 1024 * 1024;
const 图床本地兜底最大图片字节数 = 4 * 1024 * 1024;

const 深拷贝 = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const 文本编码器 = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const 图片资源签名缓存 = new Map<string, string>();
let 正在自动迁移本地图片到图床 = false;

/** 延迟上传队列：生成图片后先写入本地，返回主界面时批量上传到图床 */
const 延迟上传队列: Array<{ dataUrl: string; id: string; signature?: string }> = [];
let 延迟上传中 = false;
const 延迟上传监听器 = new Set<(pending: number) => void>();

export const 订阅延迟上传队列 = (listener: (pending: number) => void): (() => void) => {
    延迟上传监听器.add(listener);
    listener(延迟上传队列.length);
    return () => { 延迟上传监听器.delete(listener); };
};

const 通知延迟上传监听器 = () => {
    const count = 延迟上传队列.length;
    延迟上传监听器.forEach((fn) => { try { fn(count); } catch { /* */ } });
};

export const 获取延迟上传队列数量 = (): number => 延迟上传队列.length;

export const 执行延迟上传队列 = async (): Promise<void> => {
    if (延迟上传中 || 延迟上传队列.length === 0) return;
    延迟上传中 = true;
    while (延迟上传队列.length > 0) {
        const item = 延迟上传队列.shift()!;
        通知延迟上传监听器();
        try {
            await 上传图片资源到图床并登记(item.dataUrl, item.id, item.signature);
        } catch (error) {
            console.warn('延迟图床上传失败，已跳过', item.id, error);
        }
    }
    延迟上传中 = false;
    通知延迟上传监听器();
};
const 是DataUrl图片 = (value: string): boolean => /^data:image\//i.test(value);
const 是远程地址 = (value: string): boolean => /^https?:\/\//i.test(value);
const 是图床图片地址 = (value: string): boolean => {
    try {
        const url = new URL(value);
        return /^https?:$/i.test(url.protocol)
            && (/(^|\.)(?:image1|image)\.bacon159\.pp\.ua$/i.test(url.hostname)
                || /(^|\.)picui\.ogmua\.cn$/i.test(url.hostname)
                || /^imgurloss\.xqd\.cn$/i.test(url.hostname))
            && (/^\/file\//i.test(url.pathname) || /^\/api\/v1\/file\//i.test(url.pathname) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(url.pathname));
    } catch {
        return false;
    }
};
const 本地图片图床迁移状态缓存键 = 'moranjianghu.legacyImageMigrationStatus';
const 旧存档谱系迁移状态缓存键 = 'moranjianghu.saveLineageMigrationStatus.v1';
const 图床备份下载失败跳过缓存键 = 'moranjianghu.imageHostBackupDownloadFailures.v1';
const 图床备份下载失败跳过最大数量 = 600;
const 图床备份下载失败跳过有效期毫秒 = 6 * 60 * 60 * 1000;
const 图床上传失败跳过缓存键 = 'moranjianghu.imageHostUploadFailures.v1';
const 图床上传失败跳过最大数量 = 600;
const 图床上传失败跳过有效期毫秒 = 6 * 60 * 60 * 1000;
const 图床备份下载代理路径 = '/api/image-host/download';

export type 本地图片图床迁移阶段 = 'idle' | 'scanning' | 'running' | 'completed' | 'partial_failed' | 'failed';

export interface 本地图片图床迁移状态 {
    stage: 本地图片图床迁移阶段;
    scannedAssets: number;
    referencedAssets: number;
    totalAssets: number;
    processedAssets: number;
    migratedAssets: number;
    updatedSaves: number;
    updatedSettings: number;
    cleanedAssets: number;
    failedAssets: number;
    remoteImageAssets: number;
    backupTotalAssets: number;
    backupProcessedAssets: number;
    backedUpAssets: number;
    localBackupMissingAssets: number;
    retryLater: boolean;
    lastMessage: string;
    lastError?: string;
    startedAt?: string;
    updatedAt?: string;
    completedAt?: string;
    assetDetails?: 本地图片图床迁移资源状态[];
}

export interface 本地图片图床迁移资源状态 {
    key: string;
    label: string;
    remoteUrl?: string;
    localAssetId?: string;
    hasRemote: boolean;
    hasLocal: boolean;
    status: 'pending_upload' | 'uploaded' | 'pending_backup' | 'backed_up' | 'local_only' | 'remote_only' | 'complete' | 'failed';
    error?: string;
}

export type 旧存档谱系迁移阶段 = 'idle' | 'scanning' | 'running' | 'completed' | 'failed';

export interface 旧存档谱系迁移状态 {
    stage: 旧存档谱系迁移阶段;
    totalSaves: number;
    legacySaves: number;
    convertedSaves: number;
    skippedSaves: number;
    failedSaves: number;
    currentSaveTitle?: string;
    lastMessage: string;
    lastError?: string;
    startedAt?: string;
    updatedAt?: string;
    completedAt?: string;
}

const 创建默认旧存档谱系迁移状态 = (): 旧存档谱系迁移状态 => ({
    stage: 'idle',
    totalSaves: 0,
    legacySaves: 0,
    convertedSaves: 0,
    skippedSaves: 0,
    failedSaves: 0,
    lastMessage: '等待扫描旧存档谱系'
});

let 旧存档谱系迁移状态缓存: 旧存档谱系迁移状态 = 创建默认旧存档谱系迁移状态();
let 正在迁移旧存档谱系 = false;
const 旧存档谱系迁移监听器 = new Set<(status: 旧存档谱系迁移状态) => void>();

const 写入旧存档谱系迁移状态 = (patch: Partial<旧存档谱系迁移状态>): 旧存档谱系迁移状态 => {
    旧存档谱系迁移状态缓存 = {
        ...旧存档谱系迁移状态缓存,
        ...patch,
        updatedAt: new Date().toISOString()
    };
    try {
        localStorage.setItem(旧存档谱系迁移状态缓存键, JSON.stringify(旧存档谱系迁移状态缓存));
    } catch {
        // ignore local progress cache failures
    }
    旧存档谱系迁移监听器.forEach((listener) => {
        try {
            listener(旧存档谱系迁移状态缓存);
        } catch (error) {
            console.warn('旧存档谱系迁移监听器执行失败:', error);
        }
    });
    return 旧存档谱系迁移状态缓存;
};

export const 读取旧存档谱系迁移状态 = (): 旧存档谱系迁移状态 => {
    try {
        const parsed = JSON.parse(localStorage.getItem(旧存档谱系迁移状态缓存键) || 'null');
        if (parsed && typeof parsed === 'object') {
            旧存档谱系迁移状态缓存 = {
                ...创建默认旧存档谱系迁移状态(),
                ...parsed
            };
        }
    } catch {
        // ignore invalid cache
    }
    return 旧存档谱系迁移状态缓存;
};

export const 订阅旧存档谱系迁移状态 = (listener: (status: 旧存档谱系迁移状态) => void): (() => void) => {
    旧存档谱系迁移监听器.add(listener);
    listener(读取旧存档谱系迁移状态());
    return () => 旧存档谱系迁移监听器.delete(listener);
};

export interface 本地图片资源统计 {
    totalAssets: number;
    referencedAssets: number;
    localImageAssets: number;
    localImageBytes: number;
    remoteImageAssets: number;
    migrationStatus: 本地图片图床迁移状态;
}

const 创建默认本地图片图床迁移状态 = (): 本地图片图床迁移状态 => ({
    stage: 'idle',
    scannedAssets: 0,
    referencedAssets: 0,
    totalAssets: 0,
    processedAssets: 0,
    migratedAssets: 0,
    updatedSaves: 0,
    updatedSettings: 0,
    cleanedAssets: 0,
    failedAssets: 0,
    remoteImageAssets: 0,
    backupTotalAssets: 0,
    backupProcessedAssets: 0,
    backedUpAssets: 0,
    localBackupMissingAssets: 0,
    retryLater: false,
    lastMessage: '等待自动扫描旧存档图片',
    assetDetails: []
});

const 读取本地图片图床迁移状态缓存 = (): 本地图片图床迁移状态 => {
    const fallback = 创建默认本地图片图床迁移状态();
    if (typeof localStorage === 'undefined') return fallback;
    try {
        const raw = localStorage.getItem(本地图片图床迁移状态缓存键);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw) as Partial<本地图片图床迁移状态>;
        if (!parsed || typeof parsed !== 'object') return fallback;
        return { ...fallback, ...parsed };
    } catch {
        return fallback;
    }
};

let 本地图片图床迁移状态缓存 = 读取本地图片图床迁移状态缓存();
const 本地图片图床迁移状态监听器 = new Set<(status: 本地图片图床迁移状态) => void>();

const 更新本地图片图床迁移状态 = (patch: Partial<本地图片图床迁移状态>): void => {
    const updatedAt = new Date().toISOString();
    本地图片图床迁移状态缓存 = { ...本地图片图床迁移状态缓存, ...patch, updatedAt };
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem(本地图片图床迁移状态缓存键, JSON.stringify(本地图片图床迁移状态缓存));
        } catch {
            // 本地缓存不可用时只保留内存状态。
        }
    }
    本地图片图床迁移状态监听器.forEach((listener) => {
        try {
            listener(本地图片图床迁移状态缓存);
        } catch (error) {
            console.warn('旧存档图片迁移状态监听器执行失败:', error);
        }
    });
};

export const 获取本地图片图床迁移状态 = (): 本地图片图床迁移状态 => ({ ...本地图片图床迁移状态缓存 });

export const 订阅本地图片图床迁移状态 = (listener: (status: 本地图片图床迁移状态) => void): (() => void) => {
    本地图片图床迁移状态监听器.add(listener);
    listener(获取本地图片图床迁移状态());
    return () => {
        本地图片图床迁移状态监听器.delete(listener);
    };
};

const 创建空本地图片资源统计 = (): 本地图片资源统计 => ({
    totalAssets: 0,
    referencedAssets: 0,
    localImageAssets: 0,
    localImageBytes: 0,
    remoteImageAssets: 0,
    migrationStatus: 获取本地图片图床迁移状态()
});

const safeNumber = (value: unknown, fallback: number): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
};

const 估算字符串字节数 = (value: string): number => {
    if (!value) return 0;
    if (!文本编码器) return value.length * 2;
    const chunkSize = 32768;
    let total = 0;
    for (let index = 0; index < value.length; index += chunkSize) {
        total += 文本编码器.encode(value.slice(index, index + chunkSize)).length;
    }
    return total;
};

const 估算设置摘要 = (key: string, value: unknown): string => {
    if (value === null || value === undefined) return '空值';
    if (typeof value === 'boolean') return value ? '已开启' : '已关闭';
    if (typeof value === 'string') return value.trim() ? `${value.trim().slice(0, 24)}${value.trim().length > 24 ? '...' : ''}` : '空字符串';
    if (Array.isArray(value)) {
        switch (key) {
            case 设置键.提示词池:
                return `${value.length} 条提示词`;
            case 设置键.内置提示词:
                return `${value.length} 条内置提示词`;
            case 设置键.节日配置:
                return `${value.length} 个节日`;
            case 设置键.小说分解数据集:
                return `${value.length} 组分解数据`;
            case 设置键.小说分解任务:
                return `${value.length} 个分解任务`;
            case 设置键.小说分解注入快照:
                return `${value.length} 个注入快照`;
            case 设置键.音乐曲库:
                return `${value.length} 首曲目`;
            case 设置键.世界书列表:
                return `${value.length} 本世界书`;
            case 设置键.世界书预设组:
                return `${value.length} 个预设组`;
            case 设置键.自定义天赋:
                return `${value.length} 个自定义天赋`;
            case 设置键.自定义背景:
                return `${value.length} 个自定义背景`;
            case 设置键.自定义开局预设:
                return `${value.length} 个开局预设`;
            default:
                return `${value.length} 项`;
        }
    }
    if (typeof value === 'object') {
        const objectKeys = Object.keys(value as Record<string, unknown>).length;
        if (key === 设置键.场景图片档案) {
            return `${objectKeys} 个场景条目`;
        }
        return `${objectKeys} 个字段`;
    }
    return String(value);
};

const 估算对象字节数 = (value: unknown, seen: WeakSet<object> = new WeakSet()): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'string') return 估算字符串字节数(value);
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (typeof value === 'bigint') return value.toString().length;
    if (typeof value !== 'object') return 0;
    if (value instanceof Uint8Array) return value.byteLength;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (seen.has(value)) return 0;
    seen.add(value);

    if (Array.isArray(value)) {
        return value.reduce((total, item) => total + 1 + 估算对象字节数(item, seen), 2);
    }

    return Object.entries(value as Record<string, unknown>).reduce((total, [key, child]) => (
        total + 估算字符串字节数(key) + 估算对象字节数(child, seen) + 2
    ), 2);
};

const pad2 = (n: number): string => Math.trunc(n).toString().padStart(2, '0');
const 生成图片资源ID = (): string => `img_asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const 生成图片资源签名 = (dataUrl: string): string => {
    const text = typeof dataUrl === 'string' ? dataUrl.trim() : '';
    if (!text) return '';
    return `${text.length}:${text.slice(0, 96)}:${text.slice(-96)}`;
};

type 保存图片资源选项 = {
    preferredId?: string;
    returnRemote?: boolean;
};

const 读取已登记图床地址 = (assetIdOrRef: string): string => {
    const id = 解析图片资源引用ID(assetIdOrRef) || (typeof assetIdOrRef === 'string' ? assetIdOrRef.trim() : '');
    if (!id) return '';
    const entry = Object.entries(读取远程图片兜底映射()).find(([, fallbackId]) => fallbackId === id);
    return entry?.[0] || '';
};

const 上传图片资源到图床并登记 = async (
    dataUrl: string,
    id: string,
    signature?: string
): Promise<string> => {
    if (!是DataUrl图片(dataUrl)) return '';
    if (当前为对象存储云端游玩模式()) return '';
    if (signature && 是否跳过图床上传(signature)) return '';
    try {
        const uploaded = await 上传DataUrl到图床(dataUrl, { fileName: `${id}.png` });
        if (uploaded?.url) {
            if (signature) 清除图床上传失败跳过(signature);
            注册远程图片兜底引用(uploaded.url, id);
            return uploaded.url;
        }
    } catch (error: any) {
        const message = error?.message || String(error);
        if (signature) 标记图床上传失败跳过(signature, id, message);
        recordDiagnosticLog('warn', '图片资源已保存本地，图床上传稍后重试', {
            id,
            error: message
        });
    }
    return '';
};

const 生成远程图片备份ID = (remoteUrl: string): string => {
    let hash = 2166136261;
    for (let index = 0; index < remoteUrl.length; index += 1) {
        hash ^= remoteUrl.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `remote_backup_${(hash >>> 0).toString(36)}_${remoteUrl.length.toString(36)}`;
};

const 是否远程图片本地备份ID = (value: unknown): boolean => (
    typeof value === 'string' && value.trim().startsWith(远程图片本地备份ID前缀)
);

const 读取图床备份下载失败跳过映射 = (): Record<string, { message: string; failedAt: string }> => {
    if (typeof localStorage === 'undefined') return {};
    try {
        const parsed = JSON.parse(localStorage.getItem(图床备份下载失败跳过缓存键) || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const now = Date.now();
        let changed = false;
        const freshEntries = Object.entries(parsed as Record<string, { message?: string; failedAt?: string }>)
            .filter(([, item]) => {
                const failedAtMs = item?.failedAt ? Date.parse(item.failedAt) : 0;
                const fresh = Number.isFinite(failedAtMs) && now - failedAtMs < 图床备份下载失败跳过有效期毫秒;
                if (!fresh) changed = true;
                return fresh;
            })
            .map(([key, item]) => [key, { message: String(item?.message || ''), failedAt: String(item?.failedAt || '') }]);
        const records = Object.fromEntries(freshEntries) as Record<string, { message: string; failedAt: string }>;
        if (changed) 写入图床备份下载失败跳过映射(records);
        return records;
    } catch {
        return {};
    }
};

const 写入图床备份下载失败跳过映射 = (records: Record<string, { message: string; failedAt: string }>): void => {
    if (typeof localStorage === 'undefined') return;
    try {
        const entries = Object.entries(records);
        const trimmed = entries.length > 图床备份下载失败跳过最大数量
            ? Object.fromEntries(entries.slice(entries.length - 图床备份下载失败跳过最大数量))
            : records;
        localStorage.setItem(图床备份下载失败跳过缓存键, JSON.stringify(trimmed));
    } catch {
        // 跳过记录只是为了避免重复请求；写入失败不影响存档主流程。
    }
};

const 是否跳过图床备份下载 = (remoteUrl: string): boolean => {
    const normalized = typeof remoteUrl === 'string' ? remoteUrl.trim() : '';
    if (!normalized) return false;
    return Boolean(读取图床备份下载失败跳过映射()[normalized]);
};

const 标记图床备份下载失败跳过 = (remoteUrl: string, message: string): void => {
    const normalized = typeof remoteUrl === 'string' ? remoteUrl.trim() : '';
    if (!normalized) return;
    写入图床备份下载失败跳过映射({
        ...读取图床备份下载失败跳过映射(),
        [normalized]: {
            message: message.slice(0, 300),
            failedAt: new Date().toISOString()
        }
    });
};

const 读取图床上传失败跳过映射 = (): Record<string, { id: string; message: string; failedAt: string }> => {
    if (typeof localStorage === 'undefined') return {};
    try {
        const parsed = JSON.parse(localStorage.getItem(图床上传失败跳过缓存键) || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const now = Date.now();
        let changed = false;
        const freshEntries = Object.entries(parsed as Record<string, { id?: string; message?: string; failedAt?: string }>)
            .filter(([, item]) => {
                const failedAtMs = item?.failedAt ? Date.parse(item.failedAt) : 0;
                const fresh = Number.isFinite(failedAtMs) && now - failedAtMs < 图床上传失败跳过有效期毫秒;
                if (!fresh) changed = true;
                return fresh;
            })
            .map(([key, item]) => [key, {
                id: String(item?.id || ''),
                message: String(item?.message || ''),
                failedAt: String(item?.failedAt || '')
            }]);
        const records = Object.fromEntries(freshEntries) as Record<string, { id: string; message: string; failedAt: string }>;
        if (changed) 写入图床上传失败跳过映射(records);
        return records;
    } catch {
        return {};
    }
};

const 写入图床上传失败跳过映射 = (records: Record<string, { id: string; message: string; failedAt: string }>): void => {
    if (typeof localStorage === 'undefined') return;
    try {
        const entries = Object.entries(records);
        const trimmed = entries.length > 图床上传失败跳过最大数量
            ? Object.fromEntries(entries.slice(entries.length - 图床上传失败跳过最大数量))
            : records;
        localStorage.setItem(图床上传失败跳过缓存键, JSON.stringify(trimmed));
    } catch {
        // 上传失败冷却只用于避免启动时反复重试；写入失败不影响正常迁移。
    }
};

const 图床上传连续失败计数 = new Map<string, number>();
const 图床上传冷却连续失败阈值 = 3;

const 是否跳过图床上传 = (signature: string): boolean => {
    const normalized = typeof signature === 'string' ? signature.trim() : '';
    if (!normalized) return false;
    return (图床上传连续失败计数.get(normalized) || 0) >= 图床上传冷却连续失败阈值;
};

const 清除图床上传失败跳过 = (signature: string): void => {
    const normalized = typeof signature === 'string' ? signature.trim() : '';
    if (!normalized) return;
    图床上传连续失败计数.delete(normalized);
    try {
        const records = 读取图床上传失败跳过映射();
        if (records[normalized]) {
            delete records[normalized];
            写入图床上传失败跳过映射(records);
        }
    } catch { /* 不影响主流程 */ }
};

const 标记图床上传失败跳过 = (signature: string, id: string, message: string): void => {
    const normalized = typeof signature === 'string' ? signature.trim() : '';
    if (!normalized) return;
    const n = (图床上传连续失败计数.get(normalized) || 0) + 1;
    图床上传连续失败计数.set(normalized, n);
    // 保留持久化记录用于诊断展示
    写入图床上传失败跳过映射({
        ...读取图床上传失败跳过映射(),
        [normalized]: {
            id: id.slice(0, 160),
            message: message.slice(0, 300),
            failedAt: new Date().toISOString()
        }
    });
};

export const 重试失败图床上传 = async (): Promise<void> => {
    图床上传连续失败计数.clear();
    try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(图床上传失败跳过缓存键);
    } catch { /* ignore */ }
    const db = await 初始化数据库();
    const all = await new Promise<Array<{ id: string; dataUrl: string }>>((resolve, reject) => {
        const tx = db.transaction([IMAGE_ASSETS_STORE], 'readonly');
        const req = tx.objectStore(IMAGE_ASSETS_STORE).getAll();
        req.onsuccess = () => resolve((req.result as Array<{ id: string; dataUrl: string }>) || []);
        req.onerror = () => reject(req.error);
    });
    for (const asset of all) {
        if (是DataUrl图片(asset.dataUrl)) {
            延迟上传队列.push({ dataUrl: asset.dataUrl, id: asset.id });
        }
    }
    通知延迟上传监听器();
    await 执行延迟上传队列();
};

const blob转DataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('读取图片备份失败'));
    reader.readAsDataURL(blob);
});

const 下载远程图片为DataUrl = async (remoteUrl: string): Promise<string> => {
    const response = await fetch(`${buildImageHostProxyUrl(图床备份下载代理路径)}?url=${encodeURIComponent(remoteUrl)}`, {
        method: 'GET',
        cache: 'no-store'
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`下载图床图片失败：${response.status}${text ? ` - ${text.slice(0, 120)}` : ''}`);
    }
    const contentType = response.headers.get('Content-Type') || '';
    if (!/^image\//i.test(contentType)) {
        throw new Error(`下载图床图片失败：响应不是图片 (${contentType || 'unknown'})`);
    }
    const contentLength = Number(response.headers.get('Content-Length') || response.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > 图床本地兜底最大图片字节数) {
        throw new Error(`下载图床图片失败：图片过大 (${Math.round(contentLength / 1024)}KB)`);
    }
    const blob = await response.blob();
    if (blob.size > 图床本地兜底最大图片字节数) {
        throw new Error(`下载图床图片失败：图片过大 (${Math.round(blob.size / 1024)}KB)`);
    }
    const dataUrl = await blob转DataUrl(blob);
    if (!是DataUrl图片(dataUrl)) throw new Error('下载图床图片失败：图片内容无效');
    return dataUrl;
};

const 清理最旧图片资源记录 = async (limit: number): Promise<number> => {
    const db = await 初始化数据库();
    const all = await new Promise<Array<{ id: string; createdAt?: number }>>((resolve, reject) => {
        const transaction = db.transaction([IMAGE_ASSETS_STORE], 'readonly');
        const store = transaction.objectStore(IMAGE_ASSETS_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve((request.result as Array<{ id: string; createdAt?: number }>) || []);
        request.onerror = () => reject(request.error);
    });
    const oldest = all
        .slice()
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .slice(0, limit)
        .map((it) => it.id)
        .filter(Boolean);
    if (oldest.length === 0) return 0;
    return 删除图片资源记录(new Set(oldest));
};

const 写入图片资源记录 = async (id: string, dataUrl: string): Promise<void> => {
    const db = await 初始化数据库();
    const attempt = (): Promise<void> => new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([IMAGE_ASSETS_STORE], 'readwrite');
        const store = transaction.objectStore(IMAGE_ASSETS_STORE);
        const request = store.put({
            id,
            dataUrl,
            createdAt: Date.now()
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
    try {
        await attempt();
    } catch (error: any) {
        const isQuota = /QuotaExceeded|quota/i.test(error?.name || error?.message || '');
        if (!isQuota) throw error;
        recordDiagnosticLog('warn', '图片资源写入配额超限，尝试清理最旧资源', { id });
        await 清理最旧图片资源记录(20);
        try {
            await attempt();
        } catch (retryError: any) {
            throw new Error(`保存图片资源失败：本地存储空间不足，已尝试清理旧图片仍无法写入（${retryError?.message || retryError}）`);
        }
    }
    注册图片资源缓存(id, dataUrl);
};

const 读取环境时间文本 = (env: any): string => {
    if (typeof env?.时间 === 'string' && env.时间.trim()) return env.时间.trim();
    const 年 = Number(env?.年);
    const 月 = Number(env?.月);
    const 日 = Number(env?.日);
    const 时 = Number(env?.时);
    const 分 = Number(env?.分);
    if ([年, 月, 日, 时, 分].every(Number.isFinite)) {
        return `${Math.trunc(年)}:${pad2(月)}:${pad2(日)}:${pad2(时)}:${pad2(分)}`;
    }
    return '';
};

const 构建存档去重键 = (save: {
    类型?: unknown;
    时间戳?: unknown;
    角色数据?: any;
    环境信息?: any;
    历史记录?: unknown;
    元数据?: any;
}): string => {
    const metadataHash = 计算存档同步哈希(save as Partial<存档结构>);
    if (metadataHash) return `hash|${metadataHash}`;
    const type = save?.类型 === 'auto' ? 'auto' : 'manual';
    const ts = Math.max(0, Math.floor(safeNumber(save?.时间戳, 0)));
    const name = typeof save?.角色数据?.姓名 === 'string' ? save.角色数据.姓名.trim() : '';
    const envTime = 读取环境时间文本(save?.环境信息);
    const historyCount = Array.isArray(save?.历史记录) ? save.历史记录.length : 0;
    return `${type}|${ts}|${name}|${envTime}|${historyCount}`;
};

const 计算文本短哈希 = (text: string): string => {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

const 稳定序列化 = (value: any): any => {
    if (Array.isArray(value)) return value.map((item) => 稳定序列化(item));
    if (!value || typeof value !== 'object') return value;
    const result: Record<string, any> = {};
    Object.keys(value).sort().forEach((key) => {
        if (key === 'id') return;
        if (key === '存档哈希') return;
        if (key.startsWith('对象存储')) return;
        if (key.startsWith('WebDAV')) return;
        result[key] = 稳定序列化(value[key]);
    });
    return result;
};

const 计算稳定文本哈希 = (text: string): string => {
    let left = 2166136261;
    let right = 2166136261 ^ 0x9e3779b9;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        left ^= code;
        left = Math.imul(left, 16777619);
        right ^= code + index;
        right = Math.imul(right, 2246822519);
    }
    return `${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0).toString(16).padStart(8, '0')}`;
};

export const 计算存档同步哈希 = (save: Partial<存档结构> | null | undefined): string => {
    const metadataHash = typeof save?.元数据?.存档哈希 === 'string' && save.元数据.存档哈希.trim()
        ? save.元数据.存档哈希.trim().replace(/[^a-f0-9]/gi, '').toLowerCase()
        : '';
    if (metadataHash) return metadataHash;
    return 计算稳定文本哈希(JSON.stringify(稳定序列化(save || {})));
};

export const 计算存档摘要短哈希 = (save: Partial<存档结构> | null | undefined): string => {
    const metadataHash = 计算存档同步哈希(save);
    if (metadataHash) return metadataHash.replace(/[^a-f0-9]/gi, '').slice(-8).toLowerCase() || metadataHash.slice(-8);
    return 计算文本短哈希(JSON.stringify({
        id: typeof save?.id === 'number' ? save.id : null,
        key: 构建存档去重键(save || {}),
        realSavedAt: save?.元数据?.现实保存时间戳 || null,
        schemaVersion: save?.元数据?.schemaVersion || null
    }));
};

export type 存档摘要结构 = Pick<存档结构, 'id' | '类型' | '时间戳' | '元数据' | '游戏初始时间' | '角色数据' | '环境信息'>;

const 构建存档摘要记录 = (save: Partial<存档结构> | null | undefined, id?: number): 存档摘要结构 | null => {
    const saveId = typeof id === 'number'
        ? id
        : (typeof save?.id === 'number' ? save.id : undefined);
    if (typeof saveId !== 'number') return null;
    const timestamp = Math.max(0, Math.floor(safeNumber(save?.时间戳, 0)));
    const metadata = save?.元数据 && typeof save.元数据 === 'object' ? { ...save.元数据 } : undefined;
    if (metadata && !metadata.现实保存时间戳 && timestamp > 0) {
        metadata.现实保存时间戳 = timestamp;
        metadata.现实保存时间ISO = new Date(timestamp).toISOString();
    }
    if (metadata) {
        metadata.游戏回合数 = 读取存档游玩回合数({ ...save, 元数据: metadata });
    }
    return {
        id: saveId,
        类型: save?.类型 === 'auto' ? 'auto' : 'manual',
        时间戳: timestamp,
        元数据: metadata,
        游戏初始时间: save?.游戏初始时间,
        角色数据: save?.角色数据
            ? {
                姓名: save.角色数据.姓名,
                境界: save.角色数据.境界,
                境界层级: save.角色数据.境界层级
            } as any
            : undefined,
        环境信息: save?.环境信息
            ? {
                时间: (save.环境信息 as any).时间,
                年: (save.环境信息 as any).年,
                月: (save.环境信息 as any).月,
                日: (save.环境信息 as any).日,
                时: (save.环境信息 as any).时,
                分: (save.环境信息 as any).分,
                大地点: save.环境信息.大地点,
                中地点: save.环境信息.中地点,
                小地点: save.环境信息.小地点,
                具体地点: save.环境信息.具体地点
            } as any
            : undefined
    };
};

const 清洗导入存档 = (raw: any): Omit<存档结构, 'id'> | null => {
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.角色数据 || typeof raw.角色数据 !== 'object') return null;
    if (!raw.环境信息 || typeof raw.环境信息 !== 'object') return null;

    const 类型: 'manual' | 'auto' = raw.类型 === 'auto' ? 'auto' : 'manual';
    const 时间戳 = Math.max(1, Math.floor(safeNumber(raw.时间戳, Date.now())));
    const history = Array.isArray(raw.历史记录) ? raw.历史记录 : [];
    const 元数据 = raw.元数据 && typeof raw.元数据 === 'object' ? raw.元数据 : undefined;

    const normalized: Omit<存档结构, 'id'> = {
        类型,
        时间戳,
        描述: typeof raw.描述 === 'string' ? raw.描述 : undefined,
        元数据: 元数据 ? 深拷贝(元数据) : undefined,
        游戏初始时间: typeof raw.游戏初始时间 === 'string' ? raw.游戏初始时间 : undefined,
        角色数据: 深拷贝(raw.角色数据),
        环境信息: 深拷贝(raw.环境信息),
        历史记录: 深拷贝(history),
        社交: Array.isArray(raw.社交) ? 深拷贝(raw.社交) : undefined,
        世界: raw.世界 && typeof raw.世界 === 'object' ? 深拷贝(raw.世界) : undefined,
        战斗: raw.战斗 && typeof raw.战斗 === 'object' ? 深拷贝(raw.战斗) : undefined,
        玩家门派: raw.玩家门派 && typeof raw.玩家门派 === 'object' ? 深拷贝(raw.玩家门派) : undefined,
        任务列表: Array.isArray(raw.任务列表) ? 深拷贝(raw.任务列表) : undefined,
        约定列表: Array.isArray(raw.约定列表) ? 深拷贝(raw.约定列表) : undefined,
        剧情: raw.剧情 && typeof raw.剧情 === 'object' ? 深拷贝(raw.剧情) : undefined,
        剧情规划: raw.剧情规划 && typeof raw.剧情规划 === 'object' ? 深拷贝(raw.剧情规划) : undefined,
        女主剧情规划: raw.女主剧情规划 && typeof raw.女主剧情规划 === 'object' ? 深拷贝(raw.女主剧情规划) : undefined,
        同人剧情规划: raw.同人剧情规划 && typeof raw.同人剧情规划 === 'object' ? 深拷贝(raw.同人剧情规划) : undefined,
        同人女主剧情规划: raw.同人女主剧情规划 && typeof raw.同人女主剧情规划 === 'object' ? 深拷贝(raw.同人女主剧情规划) : undefined,
        记忆系统: raw.记忆系统 && typeof raw.记忆系统 === 'object' ? 深拷贝(raw.记忆系统) : undefined,
        openingConfig: raw.openingConfig && typeof raw.openingConfig === 'object' ? 深拷贝(raw.openingConfig) : undefined,
        游戏设置: raw.游戏设置 && typeof raw.游戏设置 === 'object' ? 深拷贝(raw.游戏设置) : undefined,
        记忆配置: raw.记忆配置 && typeof raw.记忆配置 === 'object' ? 深拷贝(raw.记忆配置) : undefined,
        视觉设置: raw.视觉设置 && typeof raw.视觉设置 === 'object' ? 深拷贝(raw.视觉设置) : undefined,
        场景图片档案: raw.场景图片档案 && typeof raw.场景图片档案 === 'object' ? 深拷贝(raw.场景图片档案) : undefined,
        核心提示词快照: raw.核心提示词快照 && typeof raw.核心提示词快照 === 'object' ? 深拷贝(raw.核心提示词快照) : undefined,
        角色锚点列表: Array.isArray(raw.角色锚点列表) ? 深拷贝(raw.角色锚点列表) : undefined,
        当前角色锚点ID: typeof raw.当前角色锚点ID === 'string' ? raw.当前角色锚点ID : undefined,
        拍卖行: raw.拍卖行 && typeof raw.拍卖行 === 'object' ? 深拷贝(raw.拍卖行) : undefined
    };

    normalized.元数据 = {
        ...(normalized.元数据 || {}),
        历史记录条数: Array.isArray(normalized.历史记录) ? normalized.历史记录.length : 0,
        游戏回合数: 读取存档游玩回合数(normalized),
        存档哈希: 计算存档同步哈希(normalized)
    };
    return normalized;
};

export const 初始化数据库 = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(SAVE_SUMMARIES_STORE)) {
                db.createObjectStore(SAVE_SUMMARIES_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(IMAGE_ASSETS_STORE)) {
                db.createObjectStore(IMAGE_ASSETS_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(USER_IMAGE_GALLERY_STORE)) {
                const store = db.createObjectStore(USER_IMAGE_GALLERY_STORE, { keyPath: 'id' });
                store.createIndex('by_item_mode_workshop', ['itemName', 'mode', 'workshopModuleId'], { unique: false });
                store.createIndex('by_mode', 'mode', { unique: false });
            }
        };
    });
};

export const 保存图片资源 = async (dataUrl: string, preferredIdOrOptions?: string | 保存图片资源选项): Promise<string> => {
    const normalized = typeof dataUrl === 'string' ? dataUrl.trim() : '';
    if (!normalized) {
        throw new Error('保存图片资源失败：图片内容为空');
    }
    if (是远程地址(normalized)) {
        return normalized;
    }
    const options: 保存图片资源选项 = typeof preferredIdOrOptions === 'object' && preferredIdOrOptions !== null
        ? preferredIdOrOptions
        : { preferredId: typeof preferredIdOrOptions === 'string' ? preferredIdOrOptions : undefined };
    const returnRemote = options.returnRemote === true;
    const signature = 生成图片资源签名(normalized);
    const cachedRef = signature ? 图片资源签名缓存.get(signature) : '';
    if (cachedRef) {
        if (!returnRemote) return cachedRef;
        const cachedRemote = 读取已登记图床地址(cachedRef);
        if (cachedRemote) return cachedRemote;
        const cachedDataUrl = await 读取图片资源(cachedRef);
        if (是DataUrl图片(cachedDataUrl)) {
            const cachedId = 解析图片资源引用ID(cachedRef);
            const uploaded = await 上传图片资源到图床并登记(cachedDataUrl, cachedId || 生成图片资源ID(), signature);
            if (uploaded) return uploaded;
        }
        return cachedRef;
    }
    const id = (typeof options.preferredId === 'string' ? options.preferredId.trim() : '') || 生成图片资源ID();
    await 写入图片资源记录(id, normalized);
    注册图片资源缓存(id, normalized);
    const ref = 创建图片资源引用(id);
    if (signature) {
        图片资源签名缓存.set(signature, ref);
    }
    if (returnRemote) {
        const uploaded = await 上传图片资源到图床并登记(normalized, id, signature);
        if (uploaded) return uploaded;
        return ref;
    }
    延迟上传队列.push({ dataUrl: normalized, id, signature });
    通知延迟上传监听器();
    return ref;
};

export const 保存图片资源并返回同步地址 = async (dataUrl: string, preferredId?: string): Promise<string> => (
    保存图片资源(dataUrl, { preferredId, returnRemote: true })
);

export const 读取图片资源 = async (refOrId: string): Promise<string> => {
    const id = 解析图片资源引用ID(refOrId) || (typeof refOrId === 'string' ? refOrId.trim() : '');
    if (!id) return '';
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IMAGE_ASSETS_STORE], 'readonly');
        const store = transaction.objectStore(IMAGE_ASSETS_STORE);
        const request = store.get(id);
        request.onsuccess = () => {
            const dataUrl = typeof request.result?.dataUrl === 'string' ? request.result.dataUrl.trim() : '';
            if (dataUrl) {
                注册图片资源缓存(id, dataUrl);
                const signature = 生成图片资源签名(dataUrl);
                if (signature) {
                    图片资源签名缓存.set(signature, 创建图片资源引用(id));
                }
            }
            resolve(dataUrl);
        };
        request.onerror = () => reject(request.error);
    });
};

export const 预热图片资源缓存 = async (options?: { limit?: number; maxChars?: number; clearExisting?: boolean }): Promise<number> => {
    const db = await 初始化数据库();
    const limit = Math.max(0, Math.floor(options?.limit ?? (isNativeCapacitorEnvironment() ? 0 : 图片缓存预热最大条目数)));
    const maxChars = Math.max(0, Math.floor(options?.maxChars ?? 图片缓存预热最大字符数));
    const shouldClearExisting = options?.clearExisting !== false;
    if (limit <= 0 || maxChars <= 0) {
        if (shouldClearExisting) {
            清空图片资源缓存();
            图片资源签名缓存.clear();
        }
        return 0;
    }
    const entries = await new Promise<Array<{ id: string; dataUrl: string }>>((resolve, reject) => {
        const transaction = db.transaction([IMAGE_ASSETS_STORE], 'readonly');
        const store = transaction.objectStore(IMAGE_ASSETS_STORE);
        const request = store.openCursor(null, 'prev');
        const collected: Array<{ id: string; dataUrl: string }> = [];
        let usedChars = 0;
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || collected.length >= limit || usedChars >= maxChars) {
                resolve(collected);
                return;
            }
            const item: any = cursor.value;
            const id = typeof item?.id === 'string' ? item.id.trim() : '';
            const dataUrl = typeof item?.dataUrl === 'string' ? item.dataUrl.trim() : '';
            if (id && dataUrl && usedChars + dataUrl.length <= maxChars) {
                collected.push({ id, dataUrl });
                usedChars += dataUrl.length;
            }
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
    if (shouldClearExisting) {
        清空图片资源缓存();
        图片资源签名缓存.clear();
    }
    批量注册图片资源缓存(entries);
    entries.forEach((item) => {
        const signature = 生成图片资源签名(item.dataUrl);
        if (signature) {
            图片资源签名缓存.set(signature, 创建图片资源引用(item.id));
        }
    });
    return entries.length;
};

const 外置化图片字段 = async (value: unknown, seen: WeakSet<object> = new WeakSet()): Promise<unknown> => {
    if (!value || typeof value !== 'object') {
        if (typeof value === 'string') {
            const text = value.trim();
            if (/^data:image\//i.test(text)) {
                return await 保存图片资源(text);
            }
        }
        return value;
    }
    if (seen.has(value as object)) return value;
    seen.add(value as object);

    if (Array.isArray(value)) {
        const nextList = [];
        for (const item of value) {
            nextList.push(await 外置化图片字段(item, seen));
        }
        return nextList;
    }

    const source = value as Record<string, unknown>;
    const next: Record<string, unknown> = { ...source };
    for (const [key, child] of Object.entries(source)) {
        if (typeof child === 'string') {
            const text = child.trim();
            if (text) {
                if (/^data:(image|audio)\//i.test(text)) {
                    next[key] = await 保存图片资源(text);
                    continue;
                }
                if ((key === '本地路径' || key === '图片URL' || key === '背景图片' || key === '头像图片URL' || key.endsWith('图片URL') || key.endsWith('音频URL')) && 是否图片资源引用(text)) {
                    next[key] = 创建图片资源引用(解析图片资源引用ID(text));
                    continue;
                }
            }
        }
        if (child && typeof child === 'object') {
            next[key] = await 外置化图片字段(child, seen);
        }
    }
    return next;
};

const 收集图片资源引用ID = (
    value: unknown,
    refs: Set<string>,
    seen: WeakSet<object> = new WeakSet()
): void => {
    if (typeof value === 'string') {
        const refId = 解析图片资源引用ID(value);
        if (refId) refs.add(refId);
        return;
    }
    if (!value || typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    if (Array.isArray(value)) {
        value.forEach((item) => 收集图片资源引用ID(item, refs, seen));
        return;
    }

    Object.values(value as Record<string, unknown>).forEach((child) => {
        收集图片资源引用ID(child, refs, seen);
    });
};

const 收集图床图片地址 = (
    value: unknown,
    urls: Set<string>,
    seen: WeakSet<object> = new WeakSet()
): void => {
    if (typeof value === 'string') {
        const text = value.trim();
        if (是图床图片地址(text)) urls.add(text);
        return;
    }
    if (!value || typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    if (Array.isArray(value)) {
        value.forEach((item) => 收集图床图片地址(item, urls, seen));
        return;
    }

    Object.values(value as Record<string, unknown>).forEach((child) => {
        收集图床图片地址(child, urls, seen);
    });
};

const 读取存档设置图片引用快照 = async (): Promise<{ referencedIds: Set<string>; directReferencedIds: Set<string>; remoteUrls: Set<string> }> => {
    // Use cursor iteration instead of getAll() to reduce peak memory usage.
    // getAll() loads all saves into a single array, doubling memory for large saves;
    // cursor processes one record at a time and lets GC reclaim earlier entries.
    const db = await 初始化数据库();
    const referencedIds = new Set<string>();
    const remoteUrls = new Set<string>();

    // Iterate saves via cursor
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) { resolve(); return; }
            const save = cursor.value;
            收集图片资源引用ID(save, referencedIds);
            收集图床图片地址(save, remoteUrls);
            cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
    });

    // Iterate settings via cursor
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([SETTINGS_STORE], 'readonly');
        const store = transaction.objectStore(SETTINGS_STORE);
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) { resolve(); return; }
            const item = cursor.value;
            if (typeof item?.key === 'string') {
                收集图片资源引用ID(item?.value, referencedIds);
                收集图床图片地址(item?.value, remoteUrls);
            }
            cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
    });

    const directReferencedIds = new Set(referencedIds);
    读取远程图片兜底资源ID集合().forEach((id) => referencedIds.add(id));
    return { referencedIds, directReferencedIds, remoteUrls };
};

const 读取全部图片资源记录 = async (): Promise<Array<{ id: string; dataUrl?: string }>> => {
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IMAGE_ASSETS_STORE], 'readonly');
        const store = transaction.objectStore(IMAGE_ASSETS_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(
            (Array.isArray(request.result) ? request.result : [])
                .filter((item: any) => typeof item?.id === 'string')
                .map((item: any) => ({
                    id: item.id.trim(),
                    dataUrl: typeof item?.dataUrl === 'string' ? item.dataUrl.trim() : undefined
                }))
                .filter((item) => item.id)
        );
        request.onerror = () => reject(request.error);
    });
};

const 构建图片资源签名 = (dataUrl?: string): string => {
    const normalized = typeof dataUrl === 'string' ? dataUrl.trim() : '';
    if (!是DataUrl图片(normalized)) return '';
    return 生成图片资源签名(normalized);
};

const 删除图片资源记录 = async (ids: Set<string>): Promise<number> => {
    const targets = Array.from(ids).map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean);
    if (targets.length <= 0) return 0;
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([IMAGE_ASSETS_STORE], 'readwrite');
        const store = transaction.objectStore(IMAGE_ASSETS_STORE);
        targets.forEach((id) => store.delete(id));
        transaction.oncomplete = () => resolve(targets.length);
        transaction.onerror = () => reject(transaction.error);
    });
};

const 构建图床兜底签名映射 = (
    assetMap: Map<string, { id: string; dataUrl?: string }>,
    fallbackMap: Record<string, string>
): Map<string, string> => {
    const result = new Map<string, string>();
    Object.entries(fallbackMap).forEach(([remoteUrl, localAssetId]) => {
        const signature = 构建图片资源签名(assetMap.get(localAssetId)?.dataUrl);
        if (signature && !result.has(signature)) result.set(signature, remoteUrl);
    });
    return result;
};

const 构建待上传本地图片候选 = (
    assetEntries: Array<{ id: string; dataUrl?: string }>,
    directReferencedIds: Set<string>,
    fallbackMap: Record<string, string>,
    remoteUrlBySignature: Map<string, string>,
    reusedRemoteUrls?: Map<string, string>
): Array<{ id: string; dataUrl?: string }> => {
    const fallbackIds = new Set(Object.values(fallbackMap).map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean));
    return assetEntries.filter((item) => {
        if (!directReferencedIds.has(item.id)) return false;
        if (fallbackIds.has(item.id) || 是否远程图片本地备份ID(item.id)) return false;
        if (typeof item.dataUrl !== 'string' || !是DataUrl图片(item.dataUrl)) return false;
        const signature = 构建图片资源签名(item.dataUrl);
        if (signature && 是否跳过图床上传(signature)) return false;
        const reusedRemoteUrl = signature ? remoteUrlBySignature.get(signature) : '';
        if (reusedRemoteUrl) {
            reusedRemoteUrls?.set(item.id, reusedRemoteUrl);
            return false;
        }
        return true;
    });
};

const 查找重复本地图片资源 = (
    assetEntries: Array<{ id: string; dataUrl?: string }>,
    directReferencedIds: Set<string>,
    fallbackMap: Record<string, string>
): { replacements: Map<string, string>; remoteFallbackUpdates: Map<string, string>; cleanupIds: Set<string> } => {
    const groups = new Map<string, Array<{ id: string; dataUrl?: string }>>();
    assetEntries.forEach((item) => {
        const signature = 构建图片资源签名(item.dataUrl);
        if (!signature) return;
        const list = groups.get(signature) || [];
        list.push(item);
        groups.set(signature, list);
    });

    const remoteByAssetId = new Map<string, string>();
    Object.entries(fallbackMap).forEach(([remoteUrl, assetId]) => {
        if (assetId) remoteByAssetId.set(assetId, remoteUrl);
    });

    const replacements = new Map<string, string>();
    const remoteFallbackUpdates = new Map<string, string>();
    const cleanupIds = new Set<string>();
    groups.forEach((items) => {
        if (items.length <= 1) return;
        const keeper = items.find((item) => directReferencedIds.has(item.id) && !是否远程图片本地备份ID(item.id))
            || items.find((item) => remoteByAssetId.has(item.id))
            || items.find((item) => !是否远程图片本地备份ID(item.id))
            || items[0];
        if (!keeper?.id) return;
        items.forEach((item) => {
            if (item.id === keeper.id) return;
            if (directReferencedIds.has(item.id)) {
                replacements.set(创建图片资源引用(item.id), 创建图片资源引用(keeper.id));
            }
            const remoteUrl = remoteByAssetId.get(item.id);
            if (remoteUrl) remoteFallbackUpdates.set(remoteUrl, keeper.id);
            if (!directReferencedIds.has(item.id) || replacements.has(创建图片资源引用(item.id)) || remoteUrl) {
                cleanupIds.add(item.id);
            }
        });
    });
    return { replacements, remoteFallbackUpdates, cleanupIds };
};

const 读取已引用图片资源ID集合 = async (): Promise<Set<string>> => {
    return (await 读取存档设置图片引用快照()).referencedIds;
};

export const 读取图片资源兜底地址 = async (assetIdOrRef: string): Promise<string> => {
    const dataUrl = await 读取图片资源(assetIdOrRef);
    return 是DataUrl图片(dataUrl) ? dataUrl : '';
};

export const 确保远程图片本地兜底 = async (remoteUrl: string): Promise<string> => {
    const normalized = typeof remoteUrl === 'string' ? remoteUrl.trim() : '';
    if (!是图床图片地址(normalized)) return '';
    const fallbackMap = 读取远程图片兜底映射();
    const existingId = fallbackMap[normalized] || '';
    if (existingId) {
        const existingDataUrl = await 读取图片资源(existingId);
        if (是DataUrl图片(existingDataUrl)) return existingDataUrl;
    }
    const dataUrl = await 下载远程图片为DataUrl(normalized);
    const backupId = existingId || 生成远程图片备份ID(normalized);
    await 写入图片资源记录(backupId, dataUrl);
    注册远程图片兜底引用(normalized, backupId);
    return dataUrl;
};

export const 读取本地图片资源统计 = async (): Promise<本地图片资源统计> => {
    try {
        const [referenceSnapshot, assetEntries] = await Promise.all([
            读取存档设置图片引用快照(),
            读取全部图片资源记录()
        ]);
        const referencedIds = referenceSnapshot.referencedIds;
        const referencedEntries = assetEntries.filter((item) => referencedIds.has(item.id));
        const localEntries = referencedEntries.filter((item) => 是DataUrl图片(item.dataUrl || ''));
        return {
            totalAssets: assetEntries.length,
            referencedAssets: referencedIds.size,
            localImageAssets: localEntries.length,
            localImageBytes: localEntries.reduce((total, item) => total + 估算字符串字节数(item.dataUrl || ''), 0),
            remoteImageAssets: referenceSnapshot.remoteUrls.size,
            migrationStatus: 获取本地图片图床迁移状态()
        };
    } catch (error) {
        console.warn('读取本地图片资源统计失败:', error);
        return 创建空本地图片资源统计();
    }
};

const 构建迁移资源状态列表 = (
    localCandidates: Array<{ id: string; dataUrl?: string }>,
    remoteUrls: Set<string>,
    assetMap: Map<string, { id: string; dataUrl?: string }>,
    fallbackMap: Record<string, string>,
    failures: Map<string, string> = new Map(),
    uploadedUrls: Map<string, string> = new Map()
): 本地图片图床迁移资源状态[] => {
    const details: 本地图片图床迁移资源状态[] = [];
    localCandidates.forEach((item) => {
        const remoteUrl = uploadedUrls.get(item.id) || '';
        details.push({
            key: item.id,
            label: item.id,
            remoteUrl: remoteUrl || undefined,
            localAssetId: item.id,
            hasRemote: Boolean(remoteUrl),
            hasLocal: 是DataUrl图片(item.dataUrl || ''),
            status: failures.has(item.id) ? 'failed' : remoteUrl ? 'complete' : 'pending_upload',
            error: failures.get(item.id)
        });
    });
    Array.from(remoteUrls).forEach((remoteUrl) => {
        const localAssetId = fallbackMap[remoteUrl] || '';
        const localAsset = localAssetId ? assetMap.get(localAssetId) : undefined;
        const hasLocal = Boolean(localAsset && 是DataUrl图片(localAsset.dataUrl || ''));
        const error = failures.get(remoteUrl);
        details.push({
            key: remoteUrl,
            label: remoteUrl.split('/').pop()?.slice(0, 48) || remoteUrl,
            remoteUrl,
            localAssetId: localAssetId || undefined,
            hasRemote: true,
            hasLocal,
            status: error ? 'failed' : hasLocal ? 'complete' : 'pending_backup',
            error
        });
    });
    return details.slice(0, 160);
};

export const 读取本地图片图床迁移资源状态列表 = async (): Promise<本地图片图床迁移资源状态[]> => {
    const [referenceSnapshot, assetEntries] = await Promise.all([
        读取存档设置图片引用快照(),
        读取全部图片资源记录()
    ]);
    const assetMap = new Map(assetEntries.map((item) => [item.id, item]));
    const fallbackMap = 读取远程图片兜底映射();
    const remoteUrlBySignature = 构建图床兜底签名映射(assetMap, fallbackMap);
    const localCandidates = 构建待上传本地图片候选(
        assetEntries,
        referenceSnapshot.directReferencedIds,
        fallbackMap,
        remoteUrlBySignature
    );
    return 构建迁移资源状态列表(localCandidates, referenceSnapshot.remoteUrls, assetMap, fallbackMap);
};

const 替换本地图片资源引用 = (value: unknown, replacements: Map<string, string>): { value: unknown; changed: boolean } => {
    if (typeof value === 'string') {
        const replacement = replacements.get(value);
        return replacement ? { value: replacement, changed: true } : { value, changed: false };
    }
    if (!value || typeof value !== 'object') {
        return { value, changed: false };
    }
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((item) => {
            const result = 替换本地图片资源引用(item, replacements);
            if (result.changed) changed = true;
            return result.value;
        });
        return changed ? { value: next, changed } : { value, changed: false };
    }

    let changed = false;
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
        const result = 替换本地图片资源引用(child, replacements);
        if (result.changed) changed = true;
        next[key] = result.value;
    });
    return changed ? { value: next, changed } : { value, changed: false };
};

export interface 本地图片图床自动迁移结果 {
    scannedAssets: number;
    migratedAssets: number;
    updatedSaves: number;
    updatedSettings: number;
    cleanedAssets: number;
    failedAssets: Array<{ id: string; message: string }>;
    skipped: boolean;
}

export const 自动迁移本地图片到图床 = async (): Promise<本地图片图床自动迁移结果> => {
    if (正在自动迁移本地图片到图床) {
        更新本地图片图床迁移状态({
            stage: 'running',
            lastMessage: '旧存档图片正在后台自动迁移'
        });
        return {
            scannedAssets: 0,
            migratedAssets: 0,
            updatedSaves: 0,
            updatedSettings: 0,
            cleanedAssets: 0,
            failedAssets: [],
            skipped: true
        };
    }

    正在自动迁移本地图片到图床 = true;
    const startedAt = new Date().toISOString();
    更新本地图片图床迁移状态({
        stage: 'scanning',
        scannedAssets: 0,
        referencedAssets: 0,
        totalAssets: 0,
        processedAssets: 0,
        migratedAssets: 0,
        updatedSaves: 0,
        updatedSettings: 0,
        cleanedAssets: 0,
        failedAssets: 0,
        remoteImageAssets: 0,
        backupTotalAssets: 0,
        backupProcessedAssets: 0,
        backedUpAssets: 0,
        localBackupMissingAssets: 0,
        retryLater: false,
        lastError: undefined,
        startedAt,
        completedAt: undefined,
        assetDetails: [],
        lastMessage: '正在扫描旧存档本地图片与图床备份'
    });
    try {
        const [referenceSnapshot, assetEntries] = await Promise.all([
            读取存档设置图片引用快照(),
            读取全部图片资源记录()
        ]);
        const referencedIds = referenceSnapshot.referencedIds;
        const remoteUrls = referenceSnapshot.remoteUrls;
        const assetMap = new Map(assetEntries.map((item) => [item.id, item]));
        const fallbackMap = 读取远程图片兜底映射();
        const remoteUrlBySignature = 构建图床兜底签名映射(assetMap, fallbackMap);
        const reusedRemoteUrls = new Map<string, string>();
        const candidates = 构建待上传本地图片候选(
            assetEntries,
            referenceSnapshot.directReferencedIds,
            fallbackMap,
            remoteUrlBySignature,
            reusedRemoteUrls
        );
        const duplicatePlan = 查找重复本地图片资源(assetEntries, referenceSnapshot.directReferencedIds, fallbackMap);
        duplicatePlan.remoteFallbackUpdates.forEach((keeperId, remoteUrl) => {
            注册远程图片兜底引用(remoteUrl, keeperId);
            fallbackMap[remoteUrl] = keeperId;
        });
        const remoteBackupCandidates = Array.from(remoteUrls).filter((remoteUrl) => {
            if (是否跳过图床备份下载(remoteUrl)) return false;
            const localAssetId = fallbackMap[remoteUrl] || '';
            const localAsset = localAssetId ? assetMap.get(localAssetId) : undefined;
            return !localAsset || !是DataUrl图片(localAsset.dataUrl || '');
        });
        const initialDetails = 构建迁移资源状态列表(candidates, remoteUrls, assetMap, fallbackMap);
        if (candidates.length <= 0 && remoteBackupCandidates.length <= 0 && reusedRemoteUrls.size <= 0 && duplicatePlan.replacements.size <= 0 && duplicatePlan.cleanupIds.size <= 0) {
            更新本地图片图床迁移状态({
                stage: 'completed',
                scannedAssets: assetEntries.length,
                referencedAssets: referencedIds.size,
                remoteImageAssets: remoteUrls.size,
                totalAssets: 0,
                processedAssets: 0,
                migratedAssets: 0,
                backupTotalAssets: 0,
                backupProcessedAssets: 0,
                backedUpAssets: 0,
                localBackupMissingAssets: 0,
                updatedSaves: 0,
                updatedSettings: 0,
                cleanedAssets: 0,
                failedAssets: 0,
                retryLater: false,
                completedAt: new Date().toISOString(),
                assetDetails: initialDetails,
                lastMessage: '扫描完成，图床链接均已有本地兜底'
            });
            if (assetEntries.length > 0 || referencedIds.size > 0) {
                recordDiagnosticLog('debug', ['旧存档图片自动迁移扫描完成', {
                    scannedAssets: assetEntries.length,
                    referencedAssets: referencedIds.size,
                    remoteImageAssets: remoteUrls.size,
                    pendingImages: 0,
                    pendingBackups: 0
                }]);
            }
            return {
                scannedAssets: assetEntries.length,
                migratedAssets: 0,
                updatedSaves: 0,
                updatedSettings: 0,
                cleanedAssets: 0,
                failedAssets: [],
                skipped: false
            };
        }

        recordDiagnosticLog('info', ['旧存档图片自动迁移开始', {
            scannedAssets: assetEntries.length,
            referencedAssets: referencedIds.size,
            remoteImageAssets: remoteUrls.size,
            pendingImages: candidates.length,
            pendingBackups: remoteBackupCandidates.length
        }]);
        更新本地图片图床迁移状态({
            stage: 'running',
            scannedAssets: assetEntries.length,
            referencedAssets: referencedIds.size,
            remoteImageAssets: remoteUrls.size,
            totalAssets: candidates.length,
            processedAssets: 0,
            migratedAssets: 0,
            backupTotalAssets: remoteBackupCandidates.length,
            backupProcessedAssets: 0,
            backedUpAssets: 0,
            localBackupMissingAssets: remoteBackupCandidates.length,
            updatedSaves: 0,
            updatedSettings: 0,
            cleanedAssets: 0,
            failedAssets: 0,
            retryLater: false,
            lastError: undefined,
            assetDetails: initialDetails,
            lastMessage: `正在处理旧存档图片：待上传 ${candidates.length} 张，待补本地兜底 ${remoteBackupCandidates.length} 张`
        });

        const replacements = new Map<string, string>();
        duplicatePlan.replacements.forEach((target, ref) => {
            replacements.set(ref, target);
        });
        const uploadedUrls = new Map<string, string>();
        reusedRemoteUrls.forEach((remoteUrl, assetId) => {
            uploadedUrls.set(assetId, remoteUrl);
        });
        const failedAssets: Array<{ id: string; message: string }> = [];
        const failedDetailMap = new Map<string, string>();
        let processedAssets = 0;
        for (const item of candidates) {
            try {
                const uploaded = await 上传DataUrl到图床(item.dataUrl || '', { fileName: `${item.id}.png` });
                if (uploaded.url) {
                    uploadedUrls.set(item.id, uploaded.url);
                    注册远程图片兜底引用(uploaded.url, item.id);
                    const signature = 生成图片资源签名(item.dataUrl || '');
                    if (signature) 图片资源签名缓存.set(signature, 创建图片资源引用(item.id));
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const signature = 构建图片资源签名(item.dataUrl);
                if (signature) 标记图床上传失败跳过(signature, item.id, message);
                failedAssets.push({ id: item.id, message });
                failedDetailMap.set(item.id, message);
                if (failedAssets.length >= 3) break;
            } finally {
                processedAssets += 1;
                if (processedAssets === 1 || processedAssets === candidates.length || processedAssets % 5 === 0) {
                    更新本地图片图床迁移状态({
                        stage: 'running',
                        totalAssets: candidates.length,
                        processedAssets,
                        migratedAssets: replacements.size,
                        failedAssets: failedAssets.length,
                        retryLater: failedAssets.length > 0,
                        lastError: failedAssets[failedAssets.length - 1]?.message,
                        assetDetails: 构建迁移资源状态列表(candidates, remoteUrls, assetMap, 读取远程图片兜底映射(), failedDetailMap, uploadedUrls),
                        lastMessage: `旧存档图片迁移中：${processedAssets}/${candidates.length}`
                    });
                    recordDiagnosticLog('info', ['旧存档图片自动迁移进度', {
                        processedAssets,
                        totalAssets: candidates.length,
                        migratedAssets: replacements.size,
                        failedAssets: failedAssets.length
                    }]);
                }
            }
        }

        let updatedSaves = 0;
        let updatedSettings = 0;
        if (replacements.size > 0) {
            const db = await 初始化数据库();
            const [saves, settings] = await Promise.all([
                new Promise<any[]>((resolve, reject) => {
                    const transaction = db.transaction([STORE_NAME], 'readonly');
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.getAll();
                    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
                    request.onerror = () => reject(request.error);
                }),
                new Promise<Array<{ key: string; value: any; updatedAt?: number | null; category?: string }>>((resolve, reject) => {
                    const transaction = db.transaction([SETTINGS_STORE], 'readonly');
                    const store = transaction.objectStore(SETTINGS_STORE);
                    const request = store.getAll();
                    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
                    request.onerror = () => reject(request.error);
                })
            ]);

            for (const save of saves) {
                const result = 替换本地图片资源引用(save, replacements);
                if (!result.changed) continue;
                await new Promise<void>((resolve, reject) => {
                    const transaction = db.transaction([STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.put(result.value);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
                updatedSaves += 1;
            }

            for (const item of settings) {
                const result = 替换本地图片资源引用(item?.value, replacements);
                if (!result.changed || typeof item?.key !== 'string') continue;
                await new Promise<void>((resolve, reject) => {
                    const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
                    const store = transaction.objectStore(SETTINGS_STORE);
                    const request = store.put({
                        ...item,
                        value: result.value,
                        updatedAt: Date.now()
                    });
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
                updatedSettings += 1;
            }
        }

        const cleanedAssets = await 删除图片资源记录(duplicatePlan.cleanupIds).catch((error) => {
            console.warn('清理重复本地图片资源失败，已跳过本次清理:', error);
            return 0;
        });
        if (cleanedAssets > 0) {
            duplicatePlan.cleanupIds.forEach((id) => assetMap.delete(id));
        }
        if (replacements.size > 0) {
            await 预热图片资源缓存({ clearExisting: false }).catch((error) => {
                console.warn('本地图片自动迁移后预热缓存失败，已跳过缓存刷新:', error);
            });
        }
        let backupProcessedAssets = 0;
        let backedUpAssets = 0;
        for (const remoteUrl of remoteBackupCandidates) {
            try {
                const dataUrl = await 下载远程图片为DataUrl(remoteUrl);
                const backupId = fallbackMap[remoteUrl] || 生成远程图片备份ID(remoteUrl);
                await 写入图片资源记录(backupId, dataUrl);
                注册远程图片兜底引用(remoteUrl, backupId);
                fallbackMap[remoteUrl] = backupId;
                assetMap.set(backupId, { id: backupId, dataUrl });
                backedUpAssets += 1;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                标记图床备份下载失败跳过(remoteUrl, message);
                failedAssets.push({ id: remoteUrl, message });
                failedDetailMap.set(remoteUrl, message);
            } finally {
                backupProcessedAssets += 1;
                if (backupProcessedAssets === 1 || backupProcessedAssets === remoteBackupCandidates.length || backupProcessedAssets % 5 === 0) {
                    更新本地图片图床迁移状态({
                        stage: 'running',
                        backupTotalAssets: remoteBackupCandidates.length,
                        backupProcessedAssets,
                        backedUpAssets,
                        localBackupMissingAssets: Math.max(0, remoteBackupCandidates.length - backedUpAssets),
                        failedAssets: failedAssets.length,
                        retryLater: failedAssets.length > 0,
                        lastError: failedAssets[failedAssets.length - 1]?.message,
                        assetDetails: 构建迁移资源状态列表(candidates, remoteUrls, assetMap, fallbackMap, failedDetailMap, uploadedUrls),
                        lastMessage: `正在补齐图床图片本地兜底：${backupProcessedAssets}/${remoteBackupCandidates.length}`
                    });
                }
            }
        }
        let remainingFailedAssets = failedAssets;
        remainingFailedAssets = remainingFailedAssets.filter((item) => !是图床图片地址(item.id) || !是否跳过图床备份下载(item.id));
        if (failedAssets.length > 0 && replacements.size > 0) {
            const failedIds = new Set(failedAssets.map((item) => item.id));
            const [remainingReferencedIds, remainingAssetEntries] = await Promise.all([
                读取已引用图片资源ID集合(),
                读取全部图片资源记录()
            ]);
            const remainingLocalImageIds = new Set(remainingAssetEntries
                .filter((item) => failedIds.has(item.id) && remainingReferencedIds.has(item.id) && 是DataUrl图片(item.dataUrl || ''))
                .map((item) => item.id));
            remainingFailedAssets = failedAssets.filter((item) => remainingLocalImageIds.has(item.id));
        }
        更新本地图片图床迁移状态({
            stage: remainingFailedAssets.length > 0 ? 'partial_failed' : 'completed',
            scannedAssets: assetEntries.length,
            referencedAssets: referencedIds.size,
            remoteImageAssets: remoteUrls.size,
            totalAssets: candidates.length,
            processedAssets,
            migratedAssets: replacements.size,
            backupTotalAssets: remoteBackupCandidates.length,
            backupProcessedAssets,
            backedUpAssets,
            localBackupMissingAssets: Math.max(0, remoteBackupCandidates.length - backedUpAssets),
            updatedSaves,
            updatedSettings,
            cleanedAssets,
            failedAssets: remainingFailedAssets.length,
            retryLater: remainingFailedAssets.length > 0,
            lastError: remainingFailedAssets[0]?.message,
            completedAt: new Date().toISOString(),
            assetDetails: 构建迁移资源状态列表(candidates, remoteUrls, assetMap, fallbackMap, failedDetailMap, uploadedUrls),
            lastMessage: remainingFailedAssets.length > 0
                ? `旧存档图片已迁移 ${replacements.size} 张、补齐本地兜底 ${backedUpAssets} 张，${remainingFailedAssets.length} 张稍后自动重试`
                : `旧存档图片处理完成，已合并 ${replacements.size} 个重复本地引用，补齐本地兜底 ${backedUpAssets} 张`
        });
        recordDiagnosticLog(remainingFailedAssets.length > 0 ? 'warn' : 'info', ['旧存档图片自动迁移完成', {
            scannedAssets: assetEntries.length,
            processedAssets,
            migratedAssets: replacements.size,
            remoteImageAssets: remoteUrls.size,
            backedUpAssets,
            updatedSaves,
            updatedSettings,
            cleanedAssets,
            failedAssets: remainingFailedAssets.length,
            retryLater: remainingFailedAssets.length > 0
        }]);
        return {
            scannedAssets: assetEntries.length,
            migratedAssets: replacements.size,
            updatedSaves,
            updatedSettings,
            cleanedAssets,
            failedAssets: remainingFailedAssets,
            skipped: false
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        更新本地图片图床迁移状态({
            stage: 'failed',
            failedAssets: Math.max(1, 本地图片图床迁移状态缓存.failedAssets || 0),
            retryLater: true,
            lastError: message,
            completedAt: new Date().toISOString(),
            lastMessage: '旧存档图片自动迁移失败，稍后会自动重试'
        });
        throw error;
    } finally {
        正在自动迁移本地图片到图床 = false;
    }
};

export const 清理未引用图片资源 = async (): Promise<number> => {
    try {
        const [referencedIds, assetEntries] = await Promise.all([
            读取已引用图片资源ID集合(),
            读取全部图片资源记录()
        ]);
        // 收集图库引用的 assetId，防止被误删
        const galleryReferencedIds = new Set<string>();
        const db0 = await 初始化数据库();
        if (db0.objectStoreNames.contains(USER_IMAGE_GALLERY_STORE)) {
            await new Promise<void>((resolve, reject) => {
                const transaction = db0.transaction([USER_IMAGE_GALLERY_STORE], 'readonly');
                const store = transaction.objectStore(USER_IMAGE_GALLERY_STORE);
                const request = store.openCursor();
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (cursor) {
                        const galleryEntry = cursor.value as { assetId?: string; imageUrl?: string } | undefined;
                        if (galleryEntry?.assetId) {
                            galleryReferencedIds.add(galleryEntry.assetId);
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => reject(request.error);
            });
        }
        const unusedIds = assetEntries
            .map((item) => item.id)
            .filter((id) => !referencedIds.has(id) && !galleryReferencedIds.has(id));
        if (unusedIds.length <= 0) return 0;

        const db = await 初始化数据库();
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction([IMAGE_ASSETS_STORE], 'readwrite');
            const store = transaction.objectStore(IMAGE_ASSETS_STORE);
            unusedIds.forEach((id) => store.delete(id));
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });

        图片资源签名缓存.clear();
        try {
            await 预热图片资源缓存();
        } catch (error) {
            console.warn('预热图片资源缓存失败，已跳过本次缓存刷新:', error);
        }
        return unusedIds.length;
    } catch (error) {
        console.warn('清理未引用图片资源失败，已跳过本次清理:', error);
        return 0;
    }
};

export const 规范化自动存档最大保留数 = (value?: number): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const v = Math.floor(value);
        if (v >= 最小自动存档最大保留数 && v <= 最大自动存档最大保留数) return v;
    }
    return 默认自动存档最大保留数;
};

export const 维护自动存档 = async (db: IDBDatabase, maxKeep?: number): Promise<void> => {
    const keepCount = 规范化自动存档最大保留数(maxKeep);
    const toDelete = await new Promise<number[]>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();
        const autoSaves: Array<{ id: number; 时间戳: number }> = [];
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                autoSaves.sort((a, b) => a.时间戳 - b.时间戳);
                resolve(autoSaves.length > keepCount ? autoSaves.slice(0, autoSaves.length - keepCount).map((item) => item.id) : []);
                return;
            }
            const save = cursor.value as 存档结构;
            if (save?.类型 === 'auto' && typeof save.id === 'number') {
                const metadata: any = save.元数据 || {};
                const isLineageSave = Boolean(metadata.存档系列ID && metadata.存档谱系版本);
                if (isLineageSave) {
                    cursor.continue();
                    return;
                }
                autoSaves.push({ id: save.id, 时间戳: Number(save.时间戳) || 0 });
            }
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
    if (toDelete.length <= 0) return;
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
        toDelete.forEach((id) => store.delete(id));
        toDelete.forEach((id) => summaryStore.delete(id));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

const 删除重复自动存档签名 = async (db: IDBDatabase, signature: string): Promise<void> => {
    const target = (signature || '').trim();
    if (!target) return;
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
        const request = store.openCursor();
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            const save = cursor.value as 存档结构;
            const metadata: any = save?.元数据 || {};
            const sameSignature = (metadata.自动存档签名 || '').trim() === target;
            const sameNode = target.startsWith('node:')
                && typeof metadata.自动存档节点ID === 'string'
                && `node:${metadata.自动存档节点ID}` === target;
            if (save?.类型 === 'auto' && sameSignature && (!target.startsWith('node:') || sameNode)) {
                cursor.delete();
                if (typeof save.id === 'number') summaryStore.delete(save.id);
            }
            cursor.continue();
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        request.onerror = () => reject(request.error);
    });
};

const 读取对象仓库数量 = async (storeName: string): Promise<number> => {
    const db = await 初始化数据库();
    return new Promise((resolve) => {
        try {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();
            request.onsuccess = () => resolve(Number(request.result) || 0);
            request.onerror = () => resolve(0);
        } catch {
            resolve(0);
        }
    });
};

export const 保存存档 = async (存档: Omit<存档结构, 'id'>, gameSettings?: 游戏设置结构): Promise<number> => {
    const db = await 初始化数据库();
    const normalized = 清洗导入存档(存档);
    if (!normalized) {
        throw new Error('保存存档失败：存档数据结构不完整');
    }
    const historyLen = Array.isArray(normalized.历史记录) ? normalized.历史记录.length : 0;
    const metaCount = normalized?.元数据?.历史记录条数;
    if (typeof metaCount === 'number' && metaCount >= 10 && historyLen <= 2) {
        console.error('[存档异常] 保存前历史记录已截断', {
            元数据条数: metaCount,
            实际条数: historyLen,
            类型: normalized.类型,
            角色名: normalized?.角色数据?.姓名,
            时间戳: new Date(normalized.时间戳).toISOString(),
            预估大小KB: Math.round(JSON.stringify(normalized).length / 1024)
        });
    }
    // Use lightweight lineage view instead of full save list to avoid OOM on large saves
    const existingSaves = await 读取存档谱系轻量视图().catch(() => []);
    const withLineage = 补全存档谱系元数据(normalized, existingSaves);
    const persistedSave = await 外置化图片字段(withLineage) as Omit<存档结构, 'id'>;

    if (persistedSave.类型 === 'auto') {
        const signature = (persistedSave.元数据?.自动存档签名 || '').trim();
        if (signature) {
            await 删除重复自动存档签名(db, signature);
        }
        await 维护自动存档(db, gameSettings?.自动存档最大保留数);
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
        const request = store.add(persistedSave);

        request.onsuccess = () => {
            const id = request.result as number;
            const summary = 构建存档摘要记录(persistedSave, id);
            if (summary) summaryStore.put(summary);
            resolve(id);
        };
        request.onerror = () => reject(request.error);
    });
};

export const 保存存档并读取 = async (存档: Omit<存档结构, 'id'>, gameSettings?: 游戏设置结构): Promise<存档结构> => {
    const id = await 保存存档(存档, gameSettings);
    const saved = await 读取存档(id);
    return {
        ...(saved || 存档),
        id
    } as 存档结构;
};

export interface 存档导出结构 {
    version: number;
    exportedAt: string;
    saves: 存档结构[];
}

export interface 存档导入结果 {
    total: number;
    imported: number;
    skipped: number;
}

const 研发设置模板版本 = 1;

export interface 研发设置模板结构 {
    version: number;
    exportedAt: string;
    payload: {
        apiSettings: unknown;
    };
}

export interface 研发设置模板导入结果 {
    appliedKeys: string[];
}

export interface 设置备份结构 {
    version: 1;
    type: 'moranjianghu_settings_backup';
    exportedAt: number;
    settings: Array<{ key: string; value: any; updatedAt?: number | null; category?: string }>;
}

export interface 设置备份导入结果 {
    appliedKeys: string[];
    skippedKeys: string[];
}

export const 导出存档数据 = async (): Promise<存档导出结构> => {
    const saves = await 读取存档列表();
    return {
        version: 存档导出版本,
        exportedAt: new Date().toISOString(),
        saves
    };
};

export const 导入存档数据 = async (
    payload: unknown,
    options?: { 覆盖现有?: boolean; 忽略存档保护?: boolean; gameSettings?: 游戏设置结构 }
): Promise<存档导入结果> => {
    const rawList = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as any)?.saves)
            ? (payload as any).saves
            : [];

    if (!Array.isArray(rawList) || rawList.length === 0) {
        throw new Error('导入失败：未找到可导入的存档数组');
    }

    const normalizedCandidates = rawList
        .map((item) => 清洗导入存档(item))
        .filter((item): item is Omit<存档结构, 'id'> => Boolean(item));
    if (normalizedCandidates.length === 0) {
        throw new Error('导入失败：存档内容无有效条目');
    }

    const db = await 初始化数据库();
    if (options?.覆盖现有 && options?.忽略存档保护 !== true && await 读取存档保护状态()) {
        throw new Error('存档保护已开启，请先在“设置-数据存储”中关闭后再执行覆盖导入。');
    }
    const existingSaves = options?.覆盖现有 ? [] : await 读取存档列表();
    const dedupeKeySet = new Set(existingSaves.map((item) => 构建存档去重键(item)));

    let imported = 0;
    let skipped = 0;

    const persistedCandidates: Array<Omit<存档结构, 'id'>> = [];
    const lineageCandidates: Array<Partial<存档结构>> = [...existingSaves];
    const withLineageItems: Array<Omit<存档结构, 'id'>> = [];
    // 阶段1：串行补全谱系（依赖上一条结果）
    for (const item of normalizedCandidates) {
        const withLineage = 补全存档谱系元数据(item, lineageCandidates) as Omit<存档结构, 'id'>;
        withLineageItems.push(withLineage);
        lineageCandidates.push(withLineage);
    }
    // 阶段2：并行外置化图片字段，单条失败不阻塞整体，限制并发数为5
    const 外置化任务 = withLineageItems.map(item => () => 外置化图片字段(item) as Promise<Omit<存档结构, 'id'>>);
    const 外置化结果 = await 并发限制(外置化任务, 5);
    for (const item of 外置化结果) {
        if (item !== undefined) {
            persistedCandidates.push(item);
        } else {
            skipped += 1;
        }
    }

    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
        if (options?.覆盖现有) {
            store.clear();
            summaryStore.clear();
            dedupeKeySet.clear();
        }

        persistedCandidates.forEach((item) => {
            const key = 构建存档去重键(item);
            if (dedupeKeySet.has(key)) {
                skipped += 1;
                return;
            }
            dedupeKeySet.add(key);
            const request = store.add(item);
            request.onsuccess = () => {
                const summary = 构建存档摘要记录(item, request.result as number);
                if (summary) summaryStore.put(summary);
            };
            imported += 1;
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });

    await 维护自动存档(db, options?.gameSettings?.自动存档最大保留数);
    await 校正并写回本地存档谱系(db);

    return {
        total: normalizedCandidates.length,
        imported,
        skipped
    };
};

export const 读取存档列表 = async (): Promise<存档结构[]> => {
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
            const list = request.result as 存档结构[];
            // Sort by timestamp desc
            list.sort((a, b) => b.时间戳 - a.时间戳);
            resolve(list);
        };
        request.onerror = () => reject(request.error);
    });
};

export const 读取存档摘要列表 = async (options?: {
    limit?: number;
    offset?: number;
    类型?: 'auto' | 'manual';
    仅占位?: boolean;
}): Promise<存档摘要结构[]> => {
    const db = await 初始化数据库();
    const limit = Number.isFinite(options?.limit) ? Math.max(0, Math.floor(Number(options?.limit))) : 0;
    const offset = Number.isFinite(options?.offset) ? Math.max(0, Math.floor(Number(options?.offset))) : 0;
    const targetType = options?.类型;
    const 创建缺失摘要 = (id: number): 存档摘要结构 => ({
        id,
        类型: 'manual',
        时间戳: id,
        元数据: {
            历史记录条数: 0,
            历史记录是否裁剪: false,
            摘要缺失: true,
            排序占位ID: id
        } as any,
        角色数据: undefined as any,
        环境信息: undefined as any
    });

    if (limit > 0) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readonly');
            const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
            const saveStore = transaction.objectStore(STORE_NAME);
            const request = saveStore.openKeyCursor(null, 'prev');
            const summaries: 存档摘要结构[] = [];
            let skipped = 0;

            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || summaries.length >= limit) {
                    resolve(summaries);
                    return;
                }

                const id = Number(cursor.key);
                if (!Number.isFinite(id)) {
                    cursor.continue();
                    return;
                }

                if (options?.仅占位) {
                    const summary = 创建缺失摘要(id);
                    const matchesType = !targetType
                        || Boolean((summary.元数据 as any)?.摘要缺失)
                        || (targetType === 'auto' ? summary.类型 === 'auto' : summary.类型 !== 'auto');
                    if (matchesType) {
                        if (skipped < offset) {
                            skipped += 1;
                        } else if (summaries.length < limit) {
                            summaries.push(summary);
                        }
                    }
                    cursor.continue();
                    return;
                }

                const summaryRequest = summaryStore.get(id);
                summaryRequest.onsuccess = () => {
                    const summary = (summaryRequest.result && typeof summaryRequest.result.id === 'number')
                        ? summaryRequest.result as 存档摘要结构
                        : 创建缺失摘要(id);
                    const matchesType = !targetType
                        || (targetType === 'auto' ? summary.类型 === 'auto' : summary.类型 !== 'auto')
                        || Boolean((summary.元数据 as any)?.摘要缺失);
                    if (matchesType) {
                        if (skipped < offset) {
                            skipped += 1;
                        } else if (summaries.length < limit) {
                            summaries.push(summary);
                        }
                    }
                    cursor.continue();
                };
                summaryRequest.onerror = () => reject(summaryRequest.error);
            };
            request.onerror = () => reject(request.error);
        });
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readonly');
        const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
        const saveStore = transaction.objectStore(STORE_NAME);
        const summaryRequest = summaryStore.getAll();

        summaryRequest.onsuccess = () => {
            const summaries = (summaryRequest.result as 存档摘要结构[])
                .filter((item) => typeof item?.id === 'number');
            const knownIds = new Set(summaries.map((item) => item.id as number));
            const keyRequest = saveStore.openKeyCursor();
            keyRequest.onsuccess = () => {
                const cursor = keyRequest.result;
                if (!cursor) {
                    summaries.sort((a, b) => {
                        const aTime = Number(a.元数据?.现实保存时间戳 || a.时间戳 || 0);
                        const bTime = Number(b.元数据?.现实保存时间戳 || b.时间戳 || 0);
                        if (bTime !== aTime) return bTime - aTime;
                        return (Number(b.id) || 0) - (Number(a.id) || 0);
                    });
                    resolve(summaries);
                    return;
                }
                const id = Number(cursor.key);
                if (Number.isFinite(id) && !knownIds.has(id)) {
                    summaries.push(创建缺失摘要(id));
                    knownIds.add(id);
                }
                cursor.continue();
            };
            keyRequest.onerror = () => reject(keyRequest.error);
        };
        summaryRequest.onerror = () => reject(summaryRequest.error);
    });
};

export const 读取存档数量 = async (): Promise<number> => {
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();
        request.onsuccess = () => resolve(Number(request.result) || 0);
        request.onerror = () => reject(request.error);
    });
};

/**
 * 轻量存档谱系视图：只投影存档谱系校正与迁移需要的小字段。
 *
 * 历史背景：读取存档列表() 用 store.getAll() 把所有完整存档（含 base64 图片、
 * 长历史记录）一次性反序列化进内存，启动迁移与每次保存后的谱系校正都会触发它。
 * 而谱系算法实际只用到 元数据 / id / 时间戳 / 类型 / 历史长度 / 历史首条与首条
 * 用户输入签名 / 角色姓名 / 游戏初始时间 / 首地点。存档越多 + 单存档越大，完整
 * 读取越容易在移动端 WebView 触发 OOM 崩溃。
 *
 * 这里用 cursor 逐条投影，绝不把正文、图片、社交、世界等大块数据带进内存。
 */
export type 存档谱系轻量视图 = {
    id: number;
    时间戳: number;
    类型: 'auto' | 'manual';
    元数据: 存档结构['元数据'];
    游戏初始时间?: string;
    角色数据?: { 姓名?: string };
    环境信息?: {
        大地点?: string;
        中地点?: string;
        小地点?: string;
        具体地点?: string;
    };
    历史记录?: Array<Partial<NonNullable<存档结构['历史记录']>[number]>>;
};

/**
 * 从完整存档投影出谱系算法需要的轻量字段。
 * 导出此函数用于回归测试，确保大字段（图片、正文、社交、世界等）被裁剪掉。
 */
export const 投影存档谱系轻量视图 = (raw: Partial<存档结构> & { id?: number }, fallbackId?: number): 存档谱系轻量视图 => {
    const history = Array.isArray(raw?.历史记录) ? raw.历史记录 : [];
    const 投影边界消息 = (item: any): Partial<NonNullable<存档结构['历史记录']>[number]> | undefined => {
        if (!item || typeof item !== 'object') return undefined;
        const content = typeof item.content === 'string' ? item.content.slice(0, 256).trim() : '';
        return {
            role: item.role,
            ...(content ? { content } : {}),
            ...(item.structuredResponse ? { structuredResponse: {} as any } : {})
        } as Partial<NonNullable<存档结构['历史记录']>[number]>;
    };
    const firstUserInput = history
        .find((item: any) => item?.role === 'user' && typeof item?.content === 'string' && /\S/.test(item.content));
    // [修复] 必须保留"首条非系统消息"（正常开局里就是 history[1] 的开场 assistant 回复）。
    // 谱系算法用 读取首条历史签名 判断两次开局是否同一局，完整存档取到的是这条开场回复；
    // 若投影只留 [history[0]=system, 首条 user]，轻量视图取到的却是首条玩家输入，
    // 两边签名永远不等 → 是同一开局候选 恒 false → 存档节点不再合并（玩家反馈）。
    // 用 是系统占位历史消息 复用同一判定，确保投影与签名算法永不漂移。
    const firstNonSystem = history.find((item: any) => !是系统占位历史消息(item));
    const metadata = (raw?.元数据 && typeof raw.元数据 === 'object') ? { ...raw.元数据 } : ({} as 存档结构['元数据']);
    if (metadata) {
        metadata.历史记录条数 = history.length;
        metadata.游戏回合数 = 读取存档游玩回合数(raw);
    }
    const boundaryHistory = [history[0], firstNonSystem, firstUserInput]
        .filter((item, index, list) => Boolean(item) && list.indexOf(item) === index)
        .map(投影边界消息)
        .filter(Boolean) as 存档谱系轻量视图['历史记录'];
    return {
        id: typeof raw.id === 'number' ? raw.id : Number(fallbackId) || 0,
        时间戳: Number(raw?.时间戳 || 0),
        类型: raw?.类型 === 'auto' ? 'auto' : 'manual',
        元数据: metadata,
        游戏初始时间: typeof raw?.游戏初始时间 === 'string' ? raw.游戏初始时间 : undefined,
        角色数据: (raw as any)?.角色数据?.姓名 ? { 姓名: (raw as any).角色数据.姓名 } : undefined,
        环境信息: (raw as any)?.环境信息
            ? {
                大地点: typeof (raw as any).环境信息.大地点 === 'string' ? (raw as any).环境信息.大地点 : undefined,
                中地点: typeof (raw as any).环境信息.中地点 === 'string' ? (raw as any).环境信息.中地点 : undefined,
                小地点: typeof (raw as any).环境信息.小地点 === 'string' ? (raw as any).环境信息.小地点 : undefined,
                具体地点: typeof (raw as any).环境信息.具体地点 === 'string' ? (raw as any).环境信息.具体地点 : undefined
            }
            : undefined,
        // 仅保留谱系算法实际会触碰的边界元素（首条 / 首条非系统 / 首条 user），
        // 避免把整段历史正文加载进内存。
        历史记录: boundaryHistory
    };
};

const 读取存档谱系轻量视图 = async (): Promise<存档谱系轻量视图[]> => {
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const views: 存档谱系轻量视图[] = [];
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) {
                views.sort((a, b) => Number(b.时间戳 || 0) - Number(a.时间戳 || 0));
                resolve(views);
                return;
            }
            const raw = cursor.value as 存档结构;
            views.push(投影存档谱系轻量视图(raw, Number(cursor.key)));
            cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
    });
};

export const 读取存档 = async (id: number): Promise<存档结构> => {
    const db = await 初始化数据库();
    const startAt = Date.now();
    recordSaveLoadTrace('db.readSave.start', {
        id,
        native: isNativeCapacitorEnvironment()
    });
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        
        request.onsuccess = () => {
            const save = request.result as 存档结构 | undefined;
            let estimatedBytes = 0;
            try {
                estimatedBytes = save ? 估算对象字节数(save) : 0;
            } catch (error) {
                recordSaveLoadError('db.readSave.estimateError', error, { id });
            }
            recordSaveLoadTrace('db.readSave.success', {
                id,
                exists: Boolean(save),
                elapsedMs: Date.now() - startAt,
                estimatedBytes,
                save: buildSaveDebugSummary(save)
            });
            resolve(request.result);
        };
        request.onerror = () => {
            recordSaveLoadError('db.readSave.error', request.error, {
                id,
                elapsedMs: Date.now() - startAt
            });
            reject(request.error);
        };
    });
};

const 是新谱系存档 = (save: Partial<存档结构> | null | undefined): boolean => (
    Boolean(save?.元数据?.存档系列ID && save?.元数据?.存档谱系版本)
);

const 校正并写回本地存档谱系 = async (db: IDBDatabase): Promise<ReturnType<typeof 修复本地存档谱系列表<存档谱系轻量视图>>> => {
    const initial = (await 读取存档谱系轻量视图())
        .sort((a, b) => Number(a.时间戳 || 0) - Number(b.时间戳 || 0));
    const originalMetadata = new Map(initial.map((save) => [
        save.id,
        JSON.stringify(save.元数据 || {})
    ]));
    let current = initial;
    let repaired = 修复本地存档谱系列表(current);
    let repairedGroups = 0;
    let repairedNodes = 0;
    let changed = false;
    for (let index = 0; index < 4; index += 1) {
        if (!repaired.changed) break;
        changed = true;
        repairedGroups += repaired.repairedGroups;
        repairedNodes += repaired.repairedNodes;
        current = repaired.saves;
        repaired = 修复本地存档谱系列表(current);
    }
    if (changed) {
        const changedViews = current.filter((view) => (
            originalMetadata.get(view.id) !== JSON.stringify(view.元数据 || {})
        ));
        for (const view of changedViews) {
            const fullSave = await 读取存档(view.id);
            if (!fullSave) continue;
            const updatedSave: 存档结构 = {
                ...fullSave,
                元数据: {
                    ...(fullSave.元数据 || {}),
                    ...(view.元数据 || {})
                }
            };
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readwrite');
                const saveStore = transaction.objectStore(STORE_NAME);
                const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
                saveStore.put(updatedSave);
                const summary = 构建存档摘要记录(updatedSave, view.id);
                if (summary) summaryStore.put(summary);
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
            if (isNativeCapacitorEnvironment()) {
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
        }
    }
    return {
        saves: current,
        changed,
        repairedGroups,
        repairedNodes
    };
};

export const 启动旧存档谱系迁移 = async (): Promise<旧存档谱系迁移状态> => {
    if (正在迁移旧存档谱系) return 读取旧存档谱系迁移状态();
    正在迁移旧存档谱系 = true;
    const startedAt = new Date().toISOString();
    写入旧存档谱系迁移状态({
        stage: 'scanning',
        startedAt,
        completedAt: undefined,
        lastError: undefined,
        currentSaveTitle: undefined,
        totalSaves: 0,
        legacySaves: 0,
        convertedSaves: 0,
        skippedSaves: 0,
        failedSaves: 0,
        lastMessage: '正在扫描旧存档谱系...'
    });
    try {
        const db = await 初始化数据库();
        // 启动扫描改用轻量谱系视图，避免把所有完整存档（含 base64 图片、长历史）
        // 一次性读进内存。只有真正需要转换的旧存档，才在转换循环里按 id 逐条读取。
        const allSaves = await 读取存档谱系轻量视图() as unknown as 存档结构[];
        const sorted = [...allSaves].sort((a, b) => Number(a.时间戳 || 0) - Number(b.时间戳 || 0));
        const legacySaves = sorted.filter((save) => !是新谱系存档(save) && typeof save.id === 'number');
        if (legacySaves.length <= 0) {
            const repaired = await 校正并写回本地存档谱系(db);
            return 写入旧存档谱系迁移状态({
                stage: 'completed',
                totalSaves: sorted.length,
                legacySaves: 0,
                convertedSaves: repaired.repairedNodes,
                skippedSaves: Math.max(0, sorted.length - repaired.repairedNodes),
                failedSaves: 0,
                completedAt: new Date().toISOString(),
                lastMessage: repaired.changed
                    ? `本地存档谱系校正完成：已修复 ${repaired.repairedGroups} 条谱系、${repaired.repairedNodes} 个节点。`
                    : '没有需要转换的旧存档。'
            });
        }

        写入旧存档谱系迁移状态({
            stage: 'running',
            totalSaves: sorted.length,
            legacySaves: legacySaves.length,
            skippedSaves: sorted.length - legacySaves.length,
            lastMessage: `发现 ${legacySaves.length} 个旧存档，正在转换为新谱系...`
        });

        // candidates 只用到谱系元数据字段，轻量视图足以支撑补全存档谱系元数据。
        const convertedOrExisting: 存档谱系轻量视图[] = sorted.filter((save) => 是新谱系存档(save)) as unknown as 存档谱系轻量视图[];
        let converted = 0;
        let failed = 0;
        for (const saveView of legacySaves) {
            const saveId = Number(saveView.id);
            let fullSave: 存档结构 | null = null;
            try {
                fullSave = await 读取存档(saveId);
            } catch (error: any) {
                failed += 1;
                recordSaveLoadError('db.lineageMigration.readError', error, { id: saveId });
            }
            if (!fullSave) {
                写入旧存档谱系迁移状态({
                    stage: 'running',
                    convertedSaves: converted,
                    failedSaves: failed,
                    currentSaveTitle: typeof saveView.角色数据?.姓名 === 'string' ? saveView.角色数据.姓名 : '未知角色',
                    lastMessage: `正在转换旧存档：${converted + failed}/${legacySaves.length}（读取失败）`
                });
                await new Promise((resolve) => setTimeout(resolve, isNativeCapacitorEnvironment() ? 180 : 40));
                continue;
            }
            const save = fullSave;
            const title = typeof save.角色数据?.姓名 === 'string' && save.角色数据.姓名.trim()
                ? save.角色数据.姓名.trim()
                : '未知角色';
            try {
                const saveViewForHash = 投影存档谱系轻量视图(save, saveId);
                const withHash: 存档结构 = {
                    ...save,
                    元数据: {
                        ...(save.元数据 || {}),
                        历史记录条数: saveViewForHash.元数据?.历史记录条数,
                        游戏回合数: saveViewForHash.元数据?.游戏回合数,
                        存档哈希: 计算存档同步哈希(save)
                    }
                };
                const convertedSave = 补全存档谱系元数据(withHash, convertedOrExisting) as 存档结构;
                await new Promise<void>((resolve, reject) => {
                    const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readwrite');
                    const saveStore = transaction.objectStore(STORE_NAME);
                    const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
                    saveStore.put(convertedSave);
                    const summary = 构建存档摘要记录(convertedSave, convertedSave.id);
                    if (summary) summaryStore.put(summary);
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = () => reject(transaction.error);
                });
                convertedOrExisting.push(投影存档谱系轻量视图(convertedSave, convertedSave.id));
                converted += 1;
            } catch (error: any) {
                failed += 1;
                recordSaveLoadError('db.lineageMigration.itemError', error, { id: save.id, title });
            }
            写入旧存档谱系迁移状态({
                stage: 'running',
                convertedSaves: converted,
                failedSaves: failed,
                currentSaveTitle: title,
                lastMessage: `正在转换旧存档：${converted + failed}/${legacySaves.length}（${title}）`
            });
            await new Promise((resolve) => setTimeout(resolve, isNativeCapacitorEnvironment() ? 180 : 40));
        }

        const repaired = await 校正并写回本地存档谱系(db);

        return 写入旧存档谱系迁移状态({
            stage: failed > 0 ? 'failed' : 'completed',
            convertedSaves: converted + repaired.repairedNodes,
            failedSaves: failed,
            currentSaveTitle: undefined,
            completedAt: new Date().toISOString(),
            lastError: failed > 0 ? `${failed} 个旧存档暂时未转换成功，下次进入会继续重试。` : undefined,
            lastMessage: failed > 0
                ? `已转换 ${converted} 个旧存档，${failed} 个稍后重试。`
                : repaired.changed
                    ? `旧存档转换完成，并校正 ${repaired.repairedGroups} 条本地谱系、${repaired.repairedNodes} 个节点。`
                    : `旧存档转换完成：已转换 ${converted} 个。`
        });
    } catch (error: any) {
        return 写入旧存档谱系迁移状态({
            stage: 'failed',
            lastError: error?.message || String(error),
            lastMessage: `旧存档谱系转换失败：${error?.message || '未知错误'}`
        });
    } finally {
        正在迁移旧存档谱系 = false;
    }
};

export const 补全存档摘要 = async (id: number): Promise<存档摘要结构 | null> => {
    const saveId = Math.max(0, Math.floor(Number(id) || 0));
    if (!saveId) return null;
    const db = await 初始化数据库();
    const startAt = Date.now();
    recordSaveLoadTrace('db.summaryHydrate.start', {
        id: saveId,
        native: isNativeCapacitorEnvironment()
    });
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readwrite');
        const saveStore = transaction.objectStore(STORE_NAME);
        const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
        const request = saveStore.get(saveId);
        let summary: 存档摘要结构 | null = null;

        request.onsuccess = () => {
            const save = request.result as 存档结构 | undefined;
            summary = 构建存档摘要记录(save, saveId);
            recordSaveLoadTrace('db.summaryHydrate.readSuccess', {
                id: saveId,
                exists: Boolean(save),
                elapsedMs: Date.now() - startAt,
                estimatedBytes: save ? 估算对象字节数(save) : 0,
                save: buildSaveDebugSummary(save)
            });
            if (summary) {
                summaryStore.put(summary);
            }
        };
        request.onerror = () => {
            recordSaveLoadError('db.summaryHydrate.readError', request.error, {
                id: saveId,
                elapsedMs: Date.now() - startAt
            });
            reject(request.error);
        };
        transaction.oncomplete = () => {
            recordSaveLoadTrace('db.summaryHydrate.complete', {
                id: saveId,
                hasSummary: Boolean(summary),
                historyCount: summary?.元数据?.历史记录条数,
                elapsedMs: Date.now() - startAt
            });
            resolve(summary);
        };
        transaction.onerror = () => {
            recordSaveLoadError('db.summaryHydrate.transactionError', transaction.error, {
                id: saveId,
                elapsedMs: Date.now() - startAt
            });
            reject(transaction.error);
        };
    });
};

export const 删除存档 = async (id: number): Promise<void> => {
    if (await 读取存档保护状态()) {
        throw new Error('存档保护已开启，请先在”设置-数据存储”中关闭后再删除存档。');
    }
    const db = await 初始化数据库();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
        store.delete(id);
        summaryStore.delete(id);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('删除存档事务失败。'));
        transaction.onabort = () => reject(transaction.error || new Error('删除存档事务已中止。'));
    });
    await 清理未引用图片资源();
};

export const 批量删除存档 = async (ids: number[], skipCleanup?: boolean): Promise<number> => {
    if (await 读取存档保护状态()) {
        throw new Error('存档保护已开启，请先在“设置-数据存储”中关闭后再删除存档。');
    }
    const uniqueIds = Array.from(new Set(ids
        .map((id) => Math.floor(Number(id) || 0))
        .filter((id) => id > 0)
    ));
    if (uniqueIds.length <= 0) return 0;

    const db = await 初始化数据库();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
        uniqueIds.forEach((id) => {
            store.delete(id);
            summaryStore.delete(id);
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('批量删除存档事务已中止。'));
    });
    if (!skipCleanup) {
        await 清理未引用图片资源();
    }
    return uniqueIds.length;
};

export const 清空存档数据 = async (): Promise<void> => {
    if (await 读取存档保护状态()) {
        throw new Error('存档保护已开启，请先在“设置-数据存储”中关闭后再清空存档。');
    }
    const db = await 初始化数据库();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
        const request = store.clear();
        summaryStore.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
    await 清理未引用图片资源();
};

// 只读探测：返回最近一条 auto 存档的时间戳（没有则返回 0）。
// 用于快速重开时判断"最近自动存档是否属于本局开局"，避免误删历史存档。
export const 读取最近自动存档时间戳 = async (): Promise<number> => {
    const db = await 初始化数据库();
    let latestAutoTimestamp = 0;
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) {
                resolve();
                return;
            }
            const save = cursor.value as 存档结构;
            if (save.类型 === 'auto' && Number(save.时间戳 || 0) > latestAutoTimestamp) {
                latestAutoTimestamp = Number(save.时间戳 || 0);
            }
            cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
    });
    return latestAutoTimestamp;
};

export const 删除最近自动存档 = async (): Promise<void> => {
    if (await 读取存档保护状态()) {
        throw new Error('存档保护已开启，请先在”设置-数据存储”中关闭后再删除存档。');
    }
    const db = await 初始化数据库();
    // Use cursor to find latest auto save instead of getAll() to reduce memory spike.
    // No 时间戳 index available, so iterate all and track the newest auto save by ID only.
    let latestAutoId: number | null = null;
    let latestAutoTimestamp = -1;
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) {
                resolve();
                return;
            }
            const save = cursor.value as 存档结构;
            if (save.类型 === 'auto' && Number(save.时间戳 || 0) > latestAutoTimestamp) {
                latestAutoTimestamp = Number(save.时间戳 || 0);
                latestAutoId = save.id;
            }
            cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
    });
    if (latestAutoId !== null) {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME, SAVE_SUMMARIES_STORE], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
            const delReq = store.delete(latestAutoId!);
            summaryStore.delete(latestAutoId!);
            delReq.onsuccess = () => resolve();
            delReq.onerror = () => reject(delReq.error);
        });
    }
    await 清理未引用图片资源();
};

type 设置存储记录 = {
    key: string;
    value: any;
    version?: number;
    updatedAt?: number;
    category?: 设置分类类型 | string;
};

export interface 设置管理项 {
    key: string;
    label: string;
    category: 设置分类类型 | 'unknown';
    categoryLabel: string;
    description: string;
    size: number;
    summary: string;
    updatedAt: number | null;
    internal: boolean;
    known: boolean;
}

const 读取全部设置记录 = async (): Promise<设置存储记录[]> => {
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SETTINGS_STORE], 'readonly');
        const store = transaction.objectStore(SETTINGS_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(
            (Array.isArray(request.result) ? request.result : [])
                .filter((item: any) => typeof item?.key === 'string')
                .map((item: any) => ({
                    key: item.key.trim(),
                    value: item.value,
                    version: Number.isFinite(item?.version) ? Number(item.version) : undefined,
                    updatedAt: Number.isFinite(item?.updatedAt) ? Number(item.updatedAt) : undefined,
                    category: typeof item?.category === 'string' ? item.category : undefined
                }))
                .filter((item) => item.key)
        );
        request.onerror = () => reject(request.error);
    });
};

export const 保存设置 = async (key: string, value: any): Promise<void> => {
    const db = await 初始化数据库();
    const persistedValue = await 外置化图片字段(value);
    const def = 获取设置项定义(key);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
        const store = transaction.objectStore(SETTINGS_STORE);
        const request = store.put({
            key,
            value: persistedValue,
            version: 设置记录版本,
            updatedAt: Date.now(),
            category: def?.category || 'unknown'
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const 读取设置 = async (key: string): Promise<any> => {
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SETTINGS_STORE], 'readonly');
        const store = transaction.objectStore(SETTINGS_STORE);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = () => reject(request.error);
    });
};

export const 获取设置管理清单 = async (): Promise<设置管理项[]> => {
    const records = await 读取全部设置记录();
    return records
        .map((item) => {
            const def = 获取设置项定义(item.key);
            const category: 设置管理项['category'] = def?.category || 'unknown';
            return {
                key: item.key,
                label: def?.label || item.key,
                category,
                categoryLabel: category === 'unknown' ? '未登记项' : 设置分类定义表[category].label,
                description: def?.description || '该设置项尚未登记到设置 schema。',
                size: 估算对象字节数(item.value),
                summary: 估算设置摘要(item.key, item.value),
                updatedAt: Number.isFinite(item.updatedAt) ? Number(item.updatedAt) : null,
                internal: def?.internal === true,
                known: Boolean(def)
            };
        })
        .sort((a, b) => {
            const aDef = 获取设置项定义(a.key);
            const bDef = 获取设置项定义(b.key);
            const aCategoryOrder = a.category === 'unknown' ? 999 : 设置分类定义表[a.category].order;
            const bCategoryOrder = b.category === 'unknown' ? 999 : 设置分类定义表[b.category].order;
            if (aCategoryOrder !== bCategoryOrder) return aCategoryOrder - bCategoryOrder;
            const aOrder = aDef?.order ?? 9999;
            const bOrder = bDef?.order ?? 9999;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.label.localeCompare(b.label, 'zh-Hans-CN');
        });
};

export const 迁移图片资源到独立存储 = async (): Promise<{ saves: number; settings: number }> => {
    const migrated = await 读取设置(get图片资源迁移版本键());
    if (migrated === true) {
        return { saves: 0, settings: 0 };
    }

    const db = await 初始化数据库();
    const [saves, settings] = await Promise.all([
        new Promise<any[]>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
            request.onerror = () => reject(request.error);
        }),
        new Promise<Array<{ key: string; value: any }>>((resolve, reject) => {
            const transaction = db.transaction([SETTINGS_STORE], 'readonly');
            const store = transaction.objectStore(SETTINGS_STORE);
            const request = store.getAll();
            request.onsuccess = () => resolve(
                (Array.isArray(request.result) ? request.result : [])
                    .filter((item: any) => typeof item?.key === 'string')
                    .map((item: any) => ({ key: item.key, value: item.value }))
            );
            request.onerror = () => reject(request.error);
        })
    ]);

    let migratedSaves = 0;
    for (const save of saves) {
        const nextSave = await 外置化图片字段(save) as 存档结构;
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(nextSave);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
        migratedSaves += 1;
    }

    let migratedSettings = 0;
    for (const item of settings) {
        const nextValue = await 外置化图片字段(item.value);
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
            const store = transaction.objectStore(SETTINGS_STORE);
            const request = store.put({ key: item.key, value: nextValue });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
        migratedSettings += 1;
    }

    await 保存设置(get图片资源迁移版本键(), true);
    return { saves: migratedSaves, settings: migratedSettings };
};

export const 读取存档保护状态 = async (): Promise<boolean> => {
    const value = await 读取设置(get存档保护设置键());
    return value === true;
};

export const 设置存档保护状态 = async (enabled: boolean): Promise<void> => {
    await 保存设置(get存档保护设置键(), enabled === true);
};

export const 删除设置 = async (key: string): Promise<void> => {
    const db = await 初始化数据库();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
        const store = transaction.objectStore(SETTINGS_STORE);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
    await 清理未引用图片资源();
};

export const 批量删除设置 = async (keys: string[]): Promise<void> => {
    if (!Array.isArray(keys) || keys.length === 0) return;
    const db = await 初始化数据库();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
        const store = transaction.objectStore(SETTINGS_STORE);
        keys.forEach((key) => store.delete(key));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
    await 清理未引用图片资源();
};

// 延迟访问 设置键 以避免循环依赖问题
const get自定义背景天赋保护键 = () => [
    设置键.视觉设置,
    设置键.自定义天赋,
    设置键.自定义背景,
    设置键.自定义开局预设
] as const;

const 提取可保留接口配置 = (raw: unknown): unknown => {
    const normalized = 规范化接口设置(raw);
    const feature = normalized.功能模型占位;
    return {
        activeConfigId: normalized.activeConfigId,
        configs: 深拷贝(normalized.configs),
        // 这里直接保留完整的归一化功能配置，避免新增字段时因白名单遗漏导致“能改不能存”。
        功能模型占位: 深拷贝({
            ...默认功能模型占位,
            ...feature
        })
    };
};

const 读取设置保护快照 = async (keys: string[]): Promise<Array<{ key: string; value: any }>> => {
    const snapshots: Array<{ key: string; value: any }> = [];
    for (const key of keys) {
        const value = await 读取设置(key);
        if (value !== null && value !== undefined) {
            snapshots.push({
                key,
                value: key === 设置键.API配置 ? 提取可保留接口配置(value) : value
            });
        }
    }
    return snapshots;
};

const 回写设置保护快照 = async (snapshots: Array<{ key: string; value: any }>): Promise<void> => {
    for (const item of snapshots) {
        await 保存设置(item.key, item.value);
    }
};

export const 导出研发设置模板 = async (): Promise<研发设置模板结构> => {
    const rawApiSettings = await 读取设置(设置键.API配置);
    return {
        version: 研发设置模板版本,
        exportedAt: new Date().toISOString(),
        payload: {
            apiSettings: 提取可保留接口配置(rawApiSettings)
        }
    };
};

export const 导入研发设置模板 = async (payload: unknown): Promise<研发设置模板导入结果> => {
    if (!payload || typeof payload !== 'object') {
        throw new Error('导入失败：设置模板内容为空或格式不正确。');
    }

    const root = payload as Record<string, unknown>;
    const rawContainer = (root.payload && typeof root.payload === 'object')
        ? root.payload as Record<string, unknown>
        : root;
    const candidateApiSettings = rawContainer.apiSettings ?? rawContainer.api ?? root[设置键.API配置];

    if (candidateApiSettings === undefined || candidateApiSettings === null) {
        throw new Error('导入失败：未找到 apiSettings 字段。');
    }

    const sanitizedApiSettings = 提取可保留接口配置(candidateApiSettings);
    await 保存设置(设置键.API配置, sanitizedApiSettings);

    return {
        appliedKeys: [设置键.API配置]
    };
};

const 清理运行时图片缓存 = (): void => {
    清空图片资源缓存();
    图片资源签名缓存.clear();
};

const 清除浏览器侧缓存 = async (options?: { includeLocalStorage?: boolean }): Promise<void> => {
    const tasks: Promise<unknown>[] = [];

    if (typeof window !== 'undefined' && 'caches' in window) {
        tasks.push((async () => {
            const keys = await window.caches.keys();
            await Promise.allSettled(keys.map((key) => window.caches.delete(key)));
        })());
    }

    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
    }

    if (options?.includeLocalStorage && typeof localStorage !== 'undefined') {
        localStorage.clear();
    }

    await Promise.allSettled(tasks);
};

const 清除NPC图库字段 = (npc: any): any => {
    if (!npc || typeof npc !== 'object' || Array.isArray(npc)) return npc;
    const nextNpc = { ...npc };
    delete nextNpc.最近生图结果;
    delete nextNpc.图片档案;
    return nextNpc;
};

const 清除存档图库字段 = (save: 存档结构): 存档结构 => {
    const nextSave = { ...save } as 存档结构 & Record<string, unknown>;
    delete nextSave.场景图片档案;
    if (Array.isArray(save?.社交)) {
        nextSave.社交 = save.社交.map((npc: any) => 清除NPC图库字段(npc));
    }
    return nextSave as 存档结构;
};

export const 导出全部设置备份 = async (options?: { 保留APIKey?: boolean }): Promise<设置备份结构> => {
    const records = await 读取全部设置记录();
    return {
        version: 1,
        type: 'moranjianghu_settings_backup',
        exportedAt: Date.now(),
        settings: records.map((item) => ({
            key: item.key,
            value: options?.保留APIKey && item.key === 设置键.API配置 ? 提取可保留接口配置(item.value) : item.value,
            updatedAt: item.updatedAt ?? null,
            category: item.category
        }))
    };
};

export const 导入全部设置备份 = async (
    payload: unknown,
    options?: { 保留现有APIKey?: boolean }
): Promise<设置备份导入结果> => {
    if (!payload || typeof payload !== 'object') {
        throw new Error('导入失败：设置备份为空或格式不正确。');
    }
    const root = payload as Record<string, unknown>;
    const rawSettings = Array.isArray(root.settings) ? root.settings : [];
    if (root.type !== 'moranjianghu_settings_backup' || rawSettings.length === 0) {
        throw new Error('导入失败：未找到有效的设置备份列表。');
    }
    const appliedKeys: string[] = [];
    const skippedKeys: string[] = [];
    for (const item of rawSettings) {
        const key = typeof (item as any)?.key === 'string' ? (item as any).key.trim() : '';
        if (!key) continue;
        if (options?.保留现有APIKey && key === 设置键.API配置) {
            skippedKeys.push(key);
            continue;
        }
        await 保存设置(key, (item as any).value);
        appliedKeys.push(key);
    }
    return { appliedKeys, skippedKeys };
};

export const 清空全部设置 = async (options?: { 保留APIKey?: boolean; 保留自定义背景天赋?: boolean }): Promise<void> => {
    const keepKeys = new Set<string>();
    if (options?.保留APIKey) keepKeys.add(设置键.API配置);
    if (options?.保留自定义背景天赋) {
        get自定义背景天赋保护键().forEach((key) => keepKeys.add(key));
    }
    if (await 读取存档保护状态()) {
        keepKeys.add(get存档保护设置键());
    }

    const snapshots = await 读取设置保护快照(Array.from(keepKeys));
    const db = await 初始化数据库();
    const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
    transaction.objectStore(SETTINGS_STORE).clear();

    await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = async () => {
            try {
                await 回写设置保护快照(snapshots);
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        transaction.onerror = () => reject(transaction.error);
    });
    await 清理未引用图片资源();
    清理运行时图片缓存();
    await 清除浏览器侧缓存();
};

export const 清除自定义背景与天赋 = async (): Promise<void> => {
    const visualSettings = await 读取设置(设置键.视觉设置);
    if (visualSettings && typeof visualSettings === 'object') {
        const nextVisual = { ...visualSettings };
        if ('背景图片' in nextVisual) {
            (nextVisual as any).背景图片 = '';
            await 保存设置(设置键.视觉设置, nextVisual);
        }
    }
    await 批量删除设置([设置键.自定义天赋, 设置键.自定义背景, 设置键.自定义开局预设]);
    await 清理未引用图片资源();
};

export const 清除图库相关内容 = async (): Promise<void> => {
    const db = await 初始化数据库();

    const saves = await new Promise<存档结构[]>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SETTINGS_STORE], 'readwrite');
        const saveStore = transaction.objectStore(STORE_NAME);
        const settingsStore = transaction.objectStore(SETTINGS_STORE);

        saves.forEach((save) => {
            if (!save || typeof save !== 'object') return;
            saveStore.put(清除存档图库字段(save));
        });

        settingsStore.delete(设置键.场景图片档案);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });

    await 清理未引用图片资源();
};

export const 清除图片相关提示词与预设 = async (): Promise<void> => {
    const currentSettings = await 读取设置(设置键.API配置);
    const normalizedSettings = 规范化接口设置(currentSettings);
    const currentFeature = normalizedSettings.功能模型占位;
    const defaultFeature = 默认功能模型占位;

    const nextSettings = {
        ...normalizedSettings,
        功能模型占位: {
            ...currentFeature,
            画师串预设列表: defaultFeature.画师串预设列表,
            当前NPC画师串预设ID: defaultFeature.当前NPC画师串预设ID,
            当前场景画师串预设ID: defaultFeature.当前场景画师串预设ID,
            词组转化器提示词: defaultFeature.词组转化器提示词,
            模型词组转化器预设列表: defaultFeature.模型词组转化器预设列表,
            词组转化器提示词预设列表: defaultFeature.词组转化器提示词预设列表,
            当前NAI词组转化器提示词预设ID: defaultFeature.当前NAI词组转化器提示词预设ID,
            当前NPC词组转化器提示词预设ID: defaultFeature.当前NPC词组转化器提示词预设ID,
            当前场景词组转化器提示词预设ID: defaultFeature.当前场景词组转化器提示词预设ID,
            当前场景判定提示词预设ID: defaultFeature.当前场景判定提示词预设ID,
            自动角色锚点启用: defaultFeature.自动角色锚点启用,
            角色锚点列表: defaultFeature.角色锚点列表,
            当前角色锚点ID: defaultFeature.当前角色锚点ID,
            PNG画风预设列表: defaultFeature.PNG画风预设列表,
            当前PNG画风预设ID: defaultFeature.当前PNG画风预设ID,
            NovelAI负面提示词: defaultFeature.NovelAI负面提示词
        }
    };

    await 保存设置(设置键.API配置, nextSettings);
    await 清理未引用图片资源();
};

export const 清除系统缓存 = async (): Promise<void> => {
    清理运行时图片缓存();
    await 清除浏览器侧缓存();
};

export interface StorageBreakdown {
    usage: number;
    quota: number;
    details: {
        saves: number;
        settings: number;
        prompts: number;
        api: number;
        imageAssets: number;
        cache: number;
    }
}

export interface 本地数据体检报告 {
    存档数量: number;
    自动存档数量: number;
    手动存档数量: number;
    设置数量: number;
    图片资源数量: number;
    图片引用数量: number;
    孤儿图片数量: number;
    缺失图片引用数量: number;
    孤儿图片示例: string[];
    缺失图片引用示例: string[];
    建议列表: string[];
}

export const 获取本地数据体检报告 = async (): Promise<本地数据体检报告> => {
    if (isNativeCapacitorEnvironment()) {
        const [存档数量, 设置数量, 图片资源数量] = await Promise.all([
            读取对象仓库数量(STORE_NAME),
            读取对象仓库数量(SETTINGS_STORE),
            读取对象仓库数量(IMAGE_ASSETS_STORE)
        ]);
        return {
            存档数量,
            自动存档数量: 0,
            手动存档数量: 存档数量,
            设置数量,
            图片资源数量,
            图片引用数量: 0,
            孤儿图片数量: 0,
            缺失图片引用数量: 0,
            孤儿图片示例: [],
            缺失图片引用示例: [],
            建议列表: [
                '移动端已使用轻量体检，避免一次性扫描全部存档和图片导致卡死；如需清理孤儿图片，建议在桌面端执行深度体检。'
            ]
        };
    }
    const db = await 初始化数据库();
    const [saves, settings, imageAssets, referencedIds] = await Promise.all([
        new Promise<any[]>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
            request.onerror = () => reject(request.error);
        }),
        new Promise<Array<{ key: string; value: any }>>((resolve, reject) => {
            const transaction = db.transaction([SETTINGS_STORE], 'readonly');
            const store = transaction.objectStore(SETTINGS_STORE);
            const request = store.getAll();
            request.onsuccess = () => resolve(
                (Array.isArray(request.result) ? request.result : [])
                    .filter((item: any) => typeof item?.key === 'string')
                    .map((item: any) => ({ key: item.key, value: item.value }))
            );
            request.onerror = () => reject(request.error);
        }),
        读取全部图片资源记录(),
        读取已引用图片资源ID集合()
    ]);
    const assetIds = new Set(imageAssets.map((item) => item.id));
    const referencedList = Array.from(referencedIds);
    const orphanIds = imageAssets.map((item) => item.id).filter((id) => !referencedIds.has(id));
    const missingIds = referencedList.filter((id) => !assetIds.has(id));
    const 自动存档数量 = saves.filter((save) => save?.类型 === 'auto').length;
    const 手动存档数量 = saves.filter((save) => save?.类型 !== 'auto').length;
    const 建议列表 = [
        orphanIds.length > 0 ? `发现 ${orphanIds.length} 个未被存档或设置引用的图片资源，可安全清理。` : '',
        missingIds.length > 0 ? `发现 ${missingIds.length} 个图片引用缺失，相关头像或场景图可能显示为空。` : '',
        saves.length <= 0 ? '当前没有本地存档，建议进入游戏后手动保存一次。' : '',
        referencedList.length > 0 && imageAssets.length <= 0 ? '存在图片引用但图片资源库为空，可能是旧设备迁移不完整。' : '',
    ].filter(Boolean);
    if (建议列表.length === 0) {
        建议列表.push('本地数据状态正常，暂未发现需要修复的问题。');
    }
    return {
        存档数量: saves.length,
        自动存档数量,
        手动存档数量,
        设置数量: settings.length,
        图片资源数量: imageAssets.length,
        图片引用数量: referencedList.length,
        孤儿图片数量: orphanIds.length,
        缺失图片引用数量: missingIds.length,
        孤儿图片示例: orphanIds.slice(0, 5),
        缺失图片引用示例: missingIds.slice(0, 5),
        建议列表,
    };
};

export const 修复本地数据体检问题 = async (): Promise<{ 清理孤儿图片数量: number; 缺失图片引用数量: number }> => {
    const before = await 获取本地数据体检报告();
    const cleaned = await 清理未引用图片资源();
    清空图片资源缓存();
    await 预热图片资源缓存().catch(() => 0);
    return {
        清理孤儿图片数量: cleaned,
        缺失图片引用数量: before.缺失图片引用数量,
    };
};

export const 获取详细存储信息 = async (): Promise<StorageBreakdown> => {
    const db = await 初始化数据库();

    if (isNativeCapacitorEnvironment()) {
        const [settings, estimate] = await Promise.all([
            new Promise<any[]>((resolve) => {
                const settingsTx = db.transaction([SETTINGS_STORE], 'readonly');
                const settingsStore = settingsTx.objectStore(SETTINGS_STORE);
                const request = settingsStore.getAll();
                request.onsuccess = (e) => resolve((e.target as any).result || []);
                request.onerror = () => resolve([]);
            }),
            navigator.storage?.estimate ? navigator.storage.estimate().catch(() => ({ usage: 0, quota: 0 })) : Promise.resolve({ usage: 0, quota: 0 })
        ]);
        let apiSize = 0;
        let promptsSize = 0;
        let otherSettingsSize = 0;
        settings.forEach(s => {
            const size = 估算对象字节数(s);
            if (s.key === 设置键.API配置) {
                apiSize += size;
            } else if (s.key === 设置键.提示词池) {
                promptsSize += size;
            } else {
                otherSettingsSize += size;
            }
        });
        const usage = Number(estimate.usage || 0);
        const quota = Number(estimate.quota || 0);
        const knownUsage = apiSize + promptsSize + otherSettingsSize;
        return {
            usage,
            quota,
            details: {
                saves: 0,
                settings: otherSettingsSize,
                prompts: promptsSize,
                api: apiSize,
                imageAssets: 0,
                cache: Math.max(0, usage - knownUsage)
            }
        };
    }

    // 1. Calculate Saves Size
    const savesTx = db.transaction([STORE_NAME], 'readonly');
    const savesStore = savesTx.objectStore(STORE_NAME);
    const saves = await new Promise<any[]>((resolve) => {
        savesStore.getAll().onsuccess = (e) => resolve((e.target as any).result || []);
    });
    const savesSize = 估算对象字节数(saves);

    // 2. Calculate Settings, API, and Prompts Size
    const settingsTx = db.transaction([SETTINGS_STORE], 'readonly');
    const settingsStore = settingsTx.objectStore(SETTINGS_STORE);
    const settings = await new Promise<any[]>((resolve) => {
        settingsStore.getAll().onsuccess = (e) => resolve((e.target as any).result || []);
    });
    
    let apiSize = 0;
    let promptsSize = 0;
    let otherSettingsSize = 0;

    settings.forEach(s => {
        const size = 估算对象字节数(s);
        if (s.key === 设置键.API配置) {
            apiSize += size;
        } else if (s.key === 设置键.提示词池) {
            promptsSize += size;
        } else {
            otherSettingsSize += size;
        }
    });

    // 3. Calculate Image Assets Size
    const imageAssetsTx = db.transaction([IMAGE_ASSETS_STORE], 'readonly');
    const imageAssetsStore = imageAssetsTx.objectStore(IMAGE_ASSETS_STORE);
    const imageAssets = await new Promise<any[]>((resolve) => {
        imageAssetsStore.getAll().onsuccess = (e) => resolve((e.target as any).result || []);
    });
    const imageAssetsSize = 估算对象字节数(imageAssets);

    // 4. Get Total Usage
    let usage = 0;
    let quota = 0;
    if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        usage = estimate.usage || 0;
        quota = estimate.quota || 0;
    }

    // 5. Calculate overhead/cache
    const knownUsage = savesSize + apiSize + promptsSize + otherSettingsSize + imageAssetsSize;
    const systemCache = Math.max(0, usage - knownUsage);

    return {
        usage,
        quota,
        details: {
            saves: savesSize,
            settings: otherSettingsSize,
            prompts: promptsSize,
            api: apiSize,
            imageAssets: imageAssetsSize,
            cache: systemCache
        }
    };
};

export const 清空全部数据 = async (options?: { 保留APIKey?: boolean; 保留自定义背景天赋?: boolean }): Promise<void> => {
    const db = await 初始化数据库();
    const 存档保护开启 = await 读取存档保护状态();
    const keepKeys = new Set<string>();
    if (options?.保留APIKey) keepKeys.add(设置键.API配置);
    if (options?.保留自定义背景天赋) {
        get自定义背景天赋保护键().forEach((key) => keepKeys.add(key));
    }
    if (存档保护开启) {
        keepKeys.add(get存档保护设置键());
    }
    const snapshots = await 读取设置保护快照(Array.from(keepKeys));

    const transaction = db.transaction([STORE_NAME, SETTINGS_STORE], 'readwrite');
    if (!存档保护开启) {
        transaction.objectStore(STORE_NAME).clear();
    }
    transaction.objectStore(SETTINGS_STORE).clear();

    await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = async () => {
            try {
                await 回写设置保护快照(snapshots);
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        transaction.onerror = () => reject(transaction.error);
    });
    await 清理未引用图片资源();
    清理运行时图片缓存();
    await 清除浏览器侧缓存({ includeLocalStorage: true });
};

export const 强制彻底清空全部数据 = async (): Promise<void> => {
    const db = await 初始化数据库();
    const transaction = db.transaction([STORE_NAME, SETTINGS_STORE, IMAGE_ASSETS_STORE], 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.objectStore(SETTINGS_STORE).clear();
    transaction.objectStore(IMAGE_ASSETS_STORE).clear();

    await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });

    清理运行时图片缓存();
    await 清除浏览器侧缓存({ includeLocalStorage: true });
};

export const 清空数据库 = async (保留APIKey: boolean): Promise<void> => {
    await 清空全部数据({ 保留APIKey });
};

export { 收集存档树节点ID, 删除存档树并重新保存全量存档 } from './dbService_saveTree';

// ─── 用户物品图库 ─────────────────────────────────────────────────────

export interface 用户图库条目 {
    id: string;
    itemName: string;
    mode: 题材模式类型;
    workshopModuleId: string;
    assetId: string;
    imageUrl?: string;
    prompt: string;
    itemType: string;
    quality: string;
    createdAt: number;
    thumbnailDataUrl?: string;
}

export const 保存到用户图库 = async (entry: 用户图库条目): Promise<string> => {
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([USER_IMAGE_GALLERY_STORE], 'readwrite');
        const store = tx.objectStore(USER_IMAGE_GALLERY_STORE);
        const index = store.index('by_item_mode_workshop');
        const query = index.get([entry.itemName, entry.mode, entry.workshopModuleId]);
        query.onsuccess = () => {
            const existing = query.result as 用户图库条目 | undefined;
            const finalEntry = existing ? { ...entry, id: existing.id } : entry;
            const putReq = store.put(finalEntry);
            putReq.onsuccess = () => resolve(finalEntry.id);
            putReq.onerror = () => reject(putReq.error);
        };
        query.onerror = () => reject(query.error);
    });
};

export const 查询用户图库图片 = async (
    itemName: string,
    mode: 题材模式类型,
    workshopModuleId: string
): Promise<用户图库条目 | null> => {
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([USER_IMAGE_GALLERY_STORE], 'readonly');
        const store = tx.objectStore(USER_IMAGE_GALLERY_STORE);
        const index = store.index('by_item_mode_workshop');
        const req = index.get([itemName, mode, workshopModuleId]);
        req.onsuccess = () => resolve((req.result as 用户图库条目) || null);
        req.onerror = () => reject(req.error);
    });
};

export const 分页读取用户图库 = async (options: {
    limit: number;
    beforeId?: string;
}): Promise<用户图库条目[]> => {
    const db = await 初始化数据库();
    const limit = Math.max(1, Math.floor(Number(options.limit) || 1));
    const beforeId = typeof options.beforeId === 'string' ? options.beforeId.trim() : '';
    return new Promise((resolve, reject) => {
        const tx = db.transaction([USER_IMAGE_GALLERY_STORE], 'readonly');
        const store = tx.objectStore(USER_IMAGE_GALLERY_STORE);
        const entries: 用户图库条目[] = [];
        const range = beforeId ? IDBKeyRange.upperBound(beforeId, true) : null;
        const req = store.openCursor(range, 'prev');
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor || entries.length >= limit) {
                resolve(entries);
                return;
            }
            entries.push(cursor.value as 用户图库条目);
            cursor.continue();
        };
        req.onerror = () => reject(req.error);
    });
};

export const 获取用户图库全部条目 = async (): Promise<用户图库条目[]> => {
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([USER_IMAGE_GALLERY_STORE], 'readonly');
        const store = tx.objectStore(USER_IMAGE_GALLERY_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
            const entries = (req.result as 用户图库条目[]) || [];
            entries.sort((a, b) => b.createdAt - a.createdAt);
            resolve(entries);
        };
        req.onerror = () => reject(req.error);
    });
};

export const 按题材模式获取用户图库 = async (mode: 题材模式类型): Promise<用户图库条目[]> => {
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([USER_IMAGE_GALLERY_STORE], 'readonly');
        const store = tx.objectStore(USER_IMAGE_GALLERY_STORE);
        const index = store.index('by_mode');
        const req = index.getAll(mode);
        req.onsuccess = () => resolve((req.result as 用户图库条目[]) || []);
        req.onerror = () => reject(req.error);
    });
};

export const 删除用户图库条目 = async (id: string): Promise<void> => {
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([USER_IMAGE_GALLERY_STORE], 'readwrite');
        const store = tx.objectStore(USER_IMAGE_GALLERY_STORE);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};
