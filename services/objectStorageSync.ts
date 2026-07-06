import { RELEASE_INFO } from '../data/releaseInfo';
import type { 存档结构 } from '../types';
import { 设置键 } from '../utils/settingsSchema';
import { 构建同步API地址 } from '../utils/nativeRuntime';
import { 读取存档游玩回合数 } from '../utils/saveTurn';
import { extractSettingsSyncData, restoreSettingsSyncData, type 云同步恢复结果 } from './githubSync';
import { 导出ZIP存档文件, 解析ZIP存档文件 } from './saveArchiveService';
import * as dbService from './dbService';
import { recordDiagnosticLog } from './diagnosticLog';

const OBJECT_STORAGE_ROOT_DIR = 'MoRanJiangHu';
const OBJECT_STORAGE_SAVES_DIR = 'saves';
const OBJECT_STORAGE_CHUNKS_DIR = 'chunks';
const OBJECT_STORAGE_MANIFEST_FILE = 'manifest.json';
const OBJECT_STORAGE_MANIFEST_FORMAT = 'moranjianghu-object-storage-manifest';
const OBJECT_STORAGE_PACKAGE_FORMAT = 'moranjianghu-object-storage-save-package';
const OBJECT_STORAGE_SETTINGS_PACKAGE_FORMAT = 'moranjianghu-object-storage-settings-package';
const OBJECT_STORAGE_MANIFEST_VERSION = 1;
const OBJECT_STORAGE_SETTINGS_FILE = 'settings.json';
const OBJECT_STORAGE_PROXY_PATH = '/api/object-storage-proxy';
const OBJECT_STORAGE_CDN_PROXY_BASE = 'https://cdn.bacon159.pp.ua';
const PRIMARY_SYNC_API_BASE = 'https://msjh.bacon159.pp.ua';
const BACKUP_SYNC_API_BASE = 'https://msjh.bacon.de5.net';
const OBJECT_STORAGE_FALLBACK_CHUNK_THRESHOLD = 700 * 1024;
const OBJECT_STORAGE_CHUNK_BASE64_SIZE = 768 * 1024;
const OBJECT_STORAGE_UPLOAD_CONCURRENCY = 3;

export interface 对象存储同步配置 {
    endpoint: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    username?: string;
    prefix?: string;
}

export interface 对象存储云存档元数据 {
    id: string;
    fileName: string;
    syncKey?: string;
    title: string;
    type: 'manual' | 'auto';
    saveTimestamp: number;
    savedAt: string;
    syncedAt: string;
    deviceType: 'phone' | 'computer';
    deviceLabel: string;
    appVersion: string;
    versionCode: number;
    hash: string;
    size: number;
    location: string;
    gameTime: string;
    turnCount?: number;
    seriesId?: string;
    parentHash?: string;
    rootHash?: string;
    lineageDepth?: number;
    branchInput?: string;
    openingSnippet?: string;
    autoNodeId?: string;
    autoSignature?: string;
    bundledSaveCount?: number;
}

interface 对象存储清单结构 {
    format: typeof OBJECT_STORAGE_MANIFEST_FORMAT;
    version: number;
    updatedAt: string;
    saves: 对象存储云存档元数据[];
    settings?: 对象存储设置同步元数据 | null;
}

interface 对象存储分片引用 {
    fileName: string;
    size: number;
}

interface 对象存储内联存档包 {
    format: typeof OBJECT_STORAGE_PACKAGE_FORMAT;
    version: number;
    metadata: 对象存储云存档元数据;
    archiveBase64: string;
}

interface 对象存储分片存档包 {
    format: typeof OBJECT_STORAGE_PACKAGE_FORMAT;
    version: number;
    metadata: 对象存储云存档元数据;
    storage: 'chunks';
    chunkDir: string;
    totalBase64Length: number;
    chunks: 对象存储分片引用[];
}

type 对象存储存档包 = 对象存储内联存档包 | 对象存储分片存档包;

export interface 对象存储增量同步结果 {
    uploaded: number;
    skipped: number;
    updated: number;
    deduped: number;
    total: number;
}

export interface 对象存储设置同步元数据 {
    fileName: string;
    syncedAt: string;
    deviceType: 'phone' | 'computer';
    deviceLabel: string;
    appVersion: string;
    versionCode: number;
    hash: string;
    size: number;
}

interface 对象存储内联设置包 {
    format: typeof OBJECT_STORAGE_SETTINGS_PACKAGE_FORMAT;
    version: number;
    metadata: 对象存储设置同步元数据;
    archiveBase64: string;
}

interface 对象存储分片设置包 {
    format: typeof OBJECT_STORAGE_SETTINGS_PACKAGE_FORMAT;
    version: number;
    metadata: 对象存储设置同步元数据;
    storage: 'chunks';
    chunkDir: string;
    totalBase64Length: number;
    chunks: 对象存储分片引用[];
}

type 对象存储设置包 = 对象存储内联设置包 | 对象存储分片设置包;

export interface 对象存储同步摘要 {
    saveCount: number;
    updatedAt: string | null;
    settings: 对象存储设置同步元数据 | null;
}

export interface 对象存储同步进度 {
    stage: 'prepare' | 'directory' | 'upload' | 'download' | 'manifest' | 'done';
    message: string;
    current?: number;
    total?: number;
}

export type 对象存储同步进度回调 = (progress: 对象存储同步进度) => void;

type 已打包对象存储存档 = {
    save: 存档结构;
    bundledSaves: 存档结构[];
    archiveBase64: string;
    metadata: 对象存储云存档元数据;
    metadataKey: string;
};

type 待上传对象存储存档 = 已打包对象存储存档 & {
    isUpdate: boolean;
};

const 读取文本 = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

const 提取历史文本 = (item: any): string => {
    if (!item || typeof item !== 'object') return '';
    const direct = 读取文本(item.content);
    if (direct) return direct;
    const parts = Array.isArray(item.parts) ? item.parts : [];
    return parts
        .map((part: any) => 读取文本(part?.text || part?.content))
        .filter(Boolean)
        .join('\n')
        .trim();
};

const 规范化首回合片段 = (value: unknown, length = 20): string => (
    读取文本(value)
        .replace(/<[^>]+>/g, '')
        .replace(/【[^】]{1,12}】/g, '')
        .replace(/\s+/g, '')
        .slice(0, length)
);

const 读取首回合片段 = (save: Partial<存档结构>, length = 20): string => {
    const history = Array.isArray(save.历史记录) ? save.历史记录 : [];
    const firstAssistant = history.find((item: any) => item?.role === 'assistant' && 规范化首回合片段(提取历史文本(item), length));
    const firstAny = firstAssistant || history.find((item: any) => 规范化首回合片段(提取历史文本(item), length));
    return 规范化首回合片段(提取历史文本(firstAny), length);
};

const 深拷贝 = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const 哈希尾号 = (value: unknown, length = 8): string => {
    const text = 读取文本(value).replace(/[^a-f0-9]/gi, '');
    return text ? text.slice(-length).toLowerCase() : '';
};

const 记录对象存储日志 = (message: string, detail?: Record<string, unknown>, level: 'info' | 'warn' | 'error' | 'debug' = 'info'): void => {
    const safeDetail = detail ? { ...detail } : undefined;
    recordDiagnosticLog(level, [
        `[对象存储同步] ${message}`,
        safeDetail
    ]);
};

const 构建云存档日志摘要 = (item: Partial<对象存储云存档元数据>): Record<string, unknown> => ({
    id: 读取文本(item.id).slice(0, 80),
    fileName: 读取文本(item.fileName).slice(0, 120),
    syncKey: 读取元数据同步键(item),
    hashTail: 哈希尾号(item.hash),
    title: 读取文本(item.title).slice(0, 40),
    type: item.type,
    saveTimestamp: item.saveTimestamp,
    savedAt: item.savedAt,
    syncedAt: item.syncedAt,
    deviceType: item.deviceType,
    deviceLabel: item.deviceLabel,
    appVersion: item.appVersion,
    size: item.size
});

const 并发映射 = async <T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
    const results = new Array<R>(items.length);
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length || 1));

    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await worker(items[index], index);
        }
    }));

    return results;
};

const 安全同步键片段 = (value: unknown, fallback = 'unknown'): string => {
    const text = 读取文本(value).toLowerCase();
    return (text || fallback)
        .replace(/\s+/g, ' ')
        .replace(/[|]/g, '/')
        .slice(0, 80);
};

const 构建存档同步键 = (save: Partial<存档结构>): string => {
    const type = save?.类型 === 'auto' ? 'auto' : 'manual';
    const autoNodeId = 读取文本((save?.元数据 as any)?.自动存档节点ID);
    const autoSignature = 读取文本((save?.元数据 as any)?.自动存档签名);
    const timestamp = Math.max(0, Math.floor(Number(save?.时间戳 || 0)));
    const title = 安全同步键片段(save?.角色数据?.姓名, '未知角色');
    if (type === 'auto' && autoNodeId) {
        const seriesId = 安全同步键片段((save?.元数据 as any)?.存档系列ID, 'unknown-series');
        return `auto-node|${seriesId}|${安全同步键片段(autoNodeId)}|${title}`;
    }
    if (type === 'auto' && autoSignature.startsWith('node:')) {
        const seriesId = 安全同步键片段((save?.元数据 as any)?.存档系列ID, 'unknown-series');
        return `auto-node|${seriesId}|${安全同步键片段(autoSignature.slice(5))}|${title}`;
    }
    return `${type}|${timestamp}|${title}`;
};

const 读取元数据同步键 = (item: Partial<对象存储云存档元数据>): string => {
    const existing = 读取文本(item.syncKey);
    if (existing) return existing;
    const autoNodeId = 读取文本(item.autoNodeId);
    if (item.type === 'auto' && autoNodeId) {
        const seriesId = 安全同步键片段(item.seriesId, 'unknown-series');
        return `auto-node|${seriesId}|${安全同步键片段(autoNodeId)}|${安全同步键片段(item.title, '未知角色')}`;
    }
    const type = item.type === 'auto' ? 'auto' : 'manual';
    const timestamp = Math.max(0, Math.floor(Number(item.saveTimestamp || 0)));
    const title = 安全同步键片段(item.title, '未知角色');
    return `${type}|${timestamp}|${title}`;
};

const 是否自动节点同步键 = (value: unknown): boolean => 读取文本(value).startsWith('auto-node|');

const 读取自动存档语义键 = (item: Partial<对象存储云存档元数据>): string => {
    if (item.type !== 'auto') return '';
    const syncKey = 读取元数据同步键(item);
    if (是否自动节点同步键(syncKey)) return `auto-node:${syncKey}`;
    const series = 安全同步键片段(item.seriesId || item.rootHash, 'unknown-series');
    const turn = Math.max(0, Math.floor(Number(item.turnCount || 0)));
    const location = 安全同步键片段(item.location, '未知地点');
    const gameTime = 安全同步键片段(item.gameTime, '未知时间');
    const title = 安全同步键片段(item.title, '未知角色');
    if (!turn && location === '未知地点' && gameTime === '未知时间') return '';
    return `auto-semantic:${series}|${turn}|${gameTime}|${location}|${title}`;
};

const 读取元数据排序时间 = (item: 对象存储云存档元数据): number => {
    const syncedAt = Date.parse(读取文本(item.syncedAt));
    if (Number.isFinite(syncedAt)) return syncedAt;
    const savedAt = Date.parse(读取文本(item.savedAt));
    if (Number.isFinite(savedAt)) return savedAt;
    return Number(item.saveTimestamp || 0);
};

const 比较云存档新旧 = (a: 对象存储云存档元数据, b: 对象存储云存档元数据): number => {
    const byTime = 读取元数据排序时间(a) - 读取元数据排序时间(b);
    if (byTime !== 0) return byTime;
    return Number(a.versionCode || 0) - Number(b.versionCode || 0);
};

const 整理对象存储清单存档列表 = (saves: 对象存储云存档元数据[]): { saves: 对象存储云存档元数据[]; removed: number } => {
    const byUniqueKey = new Map<string, 对象存储云存档元数据>();
    let removed = 0;

    for (const item of saves) {
        const id = 读取文本(item?.id);
        const fileName = 读取文本(item?.fileName);
        if (!id || !fileName) {
            removed += 1;
            continue;
        }

        const normalized: 对象存储云存档元数据 = {
            ...item,
            id,
            fileName,
            syncKey: 读取元数据同步键(item)
        };
        const hash = 读取文本(normalized.hash);
        const uniqueKey = 读取自动存档语义键(normalized)
            || (hash ? `hash:${hash}` : `legacy:${normalized.id || 读取元数据同步键(normalized)}`);
        const previous = byUniqueKey.get(uniqueKey);
        if (!previous || 比较云存档新旧(normalized, previous) >= 0) {
            byUniqueKey.set(uniqueKey, normalized);
        }
        if (previous) removed += 1;
    }

    const nextSaves = Array.from(byUniqueKey.values())
        .sort((a, b) => Number(b.saveTimestamp || 0) - Number(a.saveTimestamp || 0));
    return { saves: nextSaves, removed };
};

const 读取清单回合数 = (item: Partial<对象存储云存档元数据>): number | null => {
    const value = Number(item.turnCount);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
};

const 读取清单时间戳 = (item: Partial<对象存储云存档元数据>): number => {
    const savedAt = Date.parse(读取文本(item.savedAt));
    if (Number.isFinite(savedAt)) return savedAt;
    const timestamp = Number(item.saveTimestamp || 0);
    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
    const syncedAt = Date.parse(读取文本(item.syncedAt));
    return Number.isFinite(syncedAt) ? syncedAt : 0;
};

const 比较清单进度顺序 = (a: 对象存储云存档元数据, b: 对象存储云存档元数据): number => {
    const leftTurn = 读取清单回合数(a);
    const rightTurn = 读取清单回合数(b);
    if (leftTurn !== null || rightTurn !== null) {
        const turnDiff = (leftTurn ?? Number.MAX_SAFE_INTEGER) - (rightTurn ?? Number.MAX_SAFE_INTEGER);
        if (turnDiff !== 0) return turnDiff;
    }
    const timeDiff = 读取清单时间戳(a) - 读取清单时间戳(b);
    if (timeDiff !== 0) return timeDiff;
    return 读取元数据排序时间(a) - 读取元数据排序时间(b);
};

const 分析新谱系清单 = (items: 对象存储云存档元数据[]): {
    roots: 对象存储云存档元数据[];
    missingParents: number;
    invalidRoots: number;
    needsRepair: boolean;
} => {
    const hashes = new Set(items.map((item) => 读取文本(item.hash)).filter(Boolean));
    const roots = items.filter((item) => {
        const parentHash = 读取文本(item.parentHash);
        return !parentHash || !hashes.has(parentHash);
    });
    const missingParents = items.filter((item) => {
        const parentHash = 读取文本(item.parentHash);
        return parentHash && !hashes.has(parentHash);
    }).length;
    const invalidRoots = roots.filter((item) => 读取清单回合数(item) !== 0).length;
    return {
        roots,
        missingParents,
        invalidRoots,
        needsRepair: missingParents > 0 || invalidRoots > 0 || roots.length > 1
    };
};

const 计算清单短哈希 = (value: string): string => {
    let left = 0x811c9dc5;
    let right = 0x01000193;
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        left ^= code;
        left = Math.imul(left, 0x01000193);
        right ^= code + index;
        right = Math.imul(right, 0x811c9dc5);
    }
    return `${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0).toString(16).padStart(8, '0')}`;
};

const 串联对象存储谱系节点 = (
    nodes: 对象存储云存档元数据[],
    seriesId: string,
    repaired: Set<对象存储云存档元数据>
): number => {
    const ordered = Array.from(new Map(nodes.map((item) => [读取文本(item.hash) || item.id, item])).values())
        .filter((item) => 读取文本(item.hash))
        .sort(比较清单进度顺序);
    const rootHash = 读取文本(ordered[0]?.hash);
    if (!rootHash) return 0;
    ordered.forEach((item, index) => {
        item.seriesId = seriesId;
        item.rootHash = rootHash;
        item.parentHash = index === 0 ? '' : 读取文本(ordered[index - 1].hash);
        item.lineageDepth = index;
        item.turnCount = index;
        item.branchInput = index === 0 ? '开局' : (读取文本(item.branchInput) || '继续游玩');
        repaired.add(item);
    });
    return ordered.length;
};

const 修复对象存储清单谱系 = (saves: 对象存储云存档元数据[]): {
    saves: 对象存储云存档元数据[];
    changed: boolean;
    repairedGroups: number;
    repairedNodes: number;
} => {
    const next = saves.map((item) => ({ ...item }));
    const byHash = new Map(next.map((item) => [读取文本(item.hash), item]).filter(([hash]) => Boolean(hash)) as Array<[string, 对象存储云存档元数据]>);
    const bySeries = new Map<string, 对象存储云存档元数据[]>();
    next.forEach((item) => {
        const seriesId = 读取文本(item.seriesId);
        if (!seriesId) return;
        bySeries.set(seriesId, [...(bySeries.get(seriesId) || []), item]);
    });

    const invalidSeries = new Map<string, 对象存储云存档元数据[]>();
    bySeries.forEach((items, seriesId) => {
        if (分析新谱系清单(items).needsRepair) invalidSeries.set(seriesId, items);
    });
    if (!invalidSeries.size) return { saves, changed: false, repairedGroups: 0, repairedNodes: 0 };

    const repaired = new Set<对象存储云存档元数据>();
    let repairedGroups = 0;
    let repairedNodes = 0;

    const continuationByTitle = new Map<string, 对象存储云存档元数据[]>();
    invalidSeries.forEach((items) => {
        if (items.every((item) => 读取文本(item.branchInput) === '开局')) return;
        const title = 读取文本(items[0]?.title) || '未知角色';
        continuationByTitle.set(title, [...(continuationByTitle.get(title) || []), ...items]);
    });

    continuationByTitle.forEach((items, title) => {
        const seriesIds = new Set(items.map((item) => 读取文本(item.seriesId)).filter(Boolean));
        if (seriesIds.size <= 1 && items.every((item) => 读取文本(item.parentHash) || 读取清单回合数(item) === 0)) return;
        const referencedLegacyRoots = Array.from(new Set(items.flatMap((item) => [读取文本(item.rootHash), 读取文本(item.parentHash)]).filter(Boolean)))
            .map((hash) => byHash.get(hash))
            .filter((item): item is 对象存储云存档元数据 => Boolean(item && !读取文本(item.seriesId)));
        const orderedSeed = [...referencedLegacyRoots, ...items].sort(比较清单进度顺序);
        const rootHash = 读取文本(orderedSeed[0]?.hash) || 计算清单短哈希(`${title}|${items.map((item) => 读取文本(item.hash)).join('|')}`).slice(0, 16);
        const count = 串联对象存储谱系节点(
            orderedSeed,
            `series-recovered-${rootHash.slice(0, 16)}`,
            repaired
        );
        if (count > 0) {
            repairedGroups += 1;
            repairedNodes += count;
        }
    });

    invalidSeries.forEach((items, seriesId) => {
        const remaining = items.filter((item) => !repaired.has(item));
        if (!remaining.length) return;
        const count = 串联对象存储谱系节点(remaining, seriesId, repaired);
        if (count > 0) {
            repairedGroups += 1;
            repairedNodes += count;
        }
    });

    return {
        saves: next,
        changed: repairedNodes > 0,
        repairedGroups,
        repairedNodes
    };
};

const 规范化配置 = (value: unknown): 对象存储同步配置 | null => {
    const raw = value as (Partial<对象存储同步配置> & { url?: string; password?: string }) | null;
    if (!raw || typeof raw !== 'object') return null;
    const endpoint = 读取文本(raw.endpoint || raw.url || 'https://s3.hi168.com').replace(/\/+$/, '');
    const bucket = 读取文本(raw.bucket || raw.username);
    const accessKey = 读取文本(raw.accessKey);
    const secretKey = typeof raw.secretKey === 'string' ? raw.secretKey : (typeof raw.password === 'string' ? raw.password : '');
    const username = 读取文本(raw.username);
    const prefix = 读取文本(raw.prefix || OBJECT_STORAGE_ROOT_DIR).replace(/^\/+|\/+$/g, '') || OBJECT_STORAGE_ROOT_DIR;
    if (!endpoint || !bucket || !accessKey || !secretKey) return null;
    return { endpoint, bucket, accessKey, secretKey, username, prefix };
};

export const 读取对象存储同步配置 = async (): Promise<对象存储同步配置 | null> => (
    规范化配置(await dbService.读取设置(设置键.对象存储同步配置))
);

export const 保存对象存储同步配置 = async (config: 对象存储同步配置): Promise<void> => {
    const normalized = 规范化配置(config);
    if (!normalized) throw new Error('请填写对象存储端点、存储桶、Access Key 和 Secret Key');
    await dbService.保存设置(设置键.对象存储同步配置, normalized);
};

const 编码对象键段 = (segment: string): string => encodeURIComponent(segment).replace(/%2F/gi, '/');

const 读取对象存储前缀 = (config: 对象存储同步配置): string => (
    读取文本(config.prefix || OBJECT_STORAGE_ROOT_DIR).replace(/^\/+|\/+$/g, '') || OBJECT_STORAGE_ROOT_DIR
);

const 构建对象键 = (config: 对象存储同步配置, segments: string[] = []): string => (
    [读取对象存储前缀(config), ...segments.map(编码对象键段).filter(Boolean)]
        .join('/')
        .replace(/\/+/g, '/')
        .replace(/^\/+/, '')
);

const 文本编码器 = new TextEncoder();

const 对象键路径编码 = (value: string): string => value
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(decodeURIComponent(part)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');

const 构建直连对象存储地址 = (config: 对象存储同步配置, segments: string[] = []): URL => {
    const endpoint = new URL(config.endpoint.replace(/\/+$/, ''));
    const key = 构建对象键(config, segments);
    endpoint.pathname = [endpoint.pathname.replace(/\/+$/, ''), encodeURIComponent(config.bucket), 对象键路径编码(key)]
        .filter(Boolean)
        .join('/')
        .replace(/\/+/g, '/');
    endpoint.search = '';
    return endpoint;
};

const body转ArrayBuffer = async (body?: BodyInit | null): Promise<ArrayBuffer> => {
    if (!body) return new ArrayBuffer(0);
    if (typeof body === 'string') return 文本编码器.encode(body).buffer as ArrayBuffer;
    if (body instanceof ArrayBuffer) return body;
    if (ArrayBuffer.isView(body)) {
        return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    }
    if (body instanceof Blob) return body.arrayBuffer();
    throw new Error('对象存储直连暂不支持该请求体类型');
};

const 字节转Hex = (bytes: ArrayBuffer): string => Array.from(new Uint8Array(bytes)).map((item) => item.toString(16).padStart(2, '0')).join('');

const sha256Hex = async (data: ArrayBuffer | string): Promise<string> => {
    const bytes = typeof data === 'string' ? 文本编码器.encode(data) : data;
    return 字节转Hex(await crypto.subtle.digest('SHA-256', bytes));
};

const hmacSha256 = async (key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> => {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', cryptoKey, 文本编码器.encode(data));
};

const 构建签名密钥 = async (secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> => {
    const kDate = await hmacSha256(文本编码器.encode(`AWS4${secretKey}`), dateStamp);
    const kRegion = await hmacSha256(kDate, region);
    const kService = await hmacSha256(kRegion, service);
    return hmacSha256(kService, 'aws4_request');
};

const 格式化Amz时间 = (date: Date): { amzDate: string; dateStamp: string } => {
    const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    return { amzDate: iso, dateStamp: iso.slice(0, 8) };
};

const 构建对象存储授权头 = async (params: {
    method: string;
    url: URL;
    bodyHash: string;
    accessKey: string;
    secretKey: string;
    amzDate: string;
    dateStamp: string;
    contentType?: string;
}): Promise<string> => {
    const region = 'auto';
    const service = 's3';
    const canonicalHeaders = [
        params.contentType ? `content-type:${params.contentType}\n` : '',
        `host:${params.url.host}\n`,
        `x-amz-content-sha256:${params.bodyHash}\n`,
        `x-amz-date:${params.amzDate}\n`
    ].join('');
    const signedHeaders = `${params.contentType ? 'content-type;' : ''}host;x-amz-content-sha256;x-amz-date`;
    const canonicalRequest = [params.method, params.url.pathname, '', canonicalHeaders, signedHeaders, params.bodyHash].join('\n');
    const credentialScope = `${params.dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', params.amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');
    const signingKey = await 构建签名密钥(params.secretKey, params.dateStamp, region, service);
    const signature = 字节转Hex(await hmacSha256(signingKey, stringToSign));
    return `AWS4-HMAC-SHA256 Credential=${params.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
};

const 读取错误详情 = async (response: Response): Promise<string> => {
    const text = await response.text().catch(() => '');
    return text ? ` - ${text.replace(/\s+/g, ' ').slice(0, 180)}` : '';
};

type 对象存储空列表诊断输入 = {
    endpoint: string;
    bucket: string;
    prefix: string;
    manifestStatus?: number | null;
    listStatus?: number | null;
    listedKeyCount?: number | null;
};

const 构建空云存档诊断 = (input: 对象存储空列表诊断输入): string => {
    const endpointHost = (() => {
        try { return new URL(input.endpoint).host; } catch { return input.endpoint; }
    })();
    const prefix = 读取文本(input.prefix || OBJECT_STORAGE_ROOT_DIR).replace(/^\/+|\/+$/g, '') || OBJECT_STORAGE_ROOT_DIR;
    const manifestPath = `${prefix}/${OBJECT_STORAGE_MANIFEST_FILE}`;
    const savesPath = `${prefix}/${OBJECT_STORAGE_SAVES_DIR}/`;
    const manifestText = Number.isFinite(Number(input.manifestStatus)) ? `manifest HTTP ${input.manifestStatus}` : 'manifest 未确认';
    const listText = Number.isFinite(Number(input.listStatus)) ? `ListObjectsV2 HTTP ${input.listStatus}` : 'ListObjectsV2 未确认';
    const countText = Number.isFinite(Number(input.listedKeyCount)) ? `目录对象 ${input.listedKeyCount} 个` : '目录对象未确认';
    return [
        `未识别到对象存储云存档：程序会先读取 ${manifestPath}，清单缺失时再通过 S3 ListObjectsV2 扫描 ${savesPath}。`,
        `当前检查结果：端点 ${endpointHost}，桶 ${input.bucket || '未填写'}，${manifestText}，${listText}，${countText}。`,
        '请确认端点是 Backblaze B2 的 S3 API 端点，而不是只支持下载加速的 CDN/EdgeOne 域名；同时确认目录前缀正好是 MoRanJiangHu。'
    ].join('\n');
};

const 构建对象存储代理地址 = (): string => {
    const configured = 构建同步API地址(OBJECT_STORAGE_PROXY_PATH);
    if (/^https?:\/\//i.test(configured)) return configured;
    if (typeof window === 'undefined') return configured;

    const hostname = window.location.hostname.toLowerCase();
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (hostname && hostname !== 'msjh.bacon159.pp.ua' && !isLocalhost) {
        return `${PRIMARY_SYNC_API_BASE}${OBJECT_STORAGE_PROXY_PATH}`;
    }
    return configured;
};

const 构建对象存储代理地址列表 = (): string[] => {
    const configured = 构建对象存储代理地址();
    const candidates = [
        `${OBJECT_STORAGE_CDN_PROXY_BASE}${OBJECT_STORAGE_PROXY_PATH}`,
        configured,
        `${PRIMARY_SYNC_API_BASE}${OBJECT_STORAGE_PROXY_PATH}`,
        `${BACKUP_SYNC_API_BASE}${OBJECT_STORAGE_PROXY_PATH}`
    ];
    return Array.from(new Set(candidates.filter(Boolean)));
};

const 读取端点主机 = (endpoint: string): string => {
    try {
        return new URL(endpoint).hostname.toLowerCase();
    } catch {
        return '';
    }
};

const 是否应强制走对象存储代理 = (config: 对象存储同步配置): boolean => {
    const host = 读取端点主机(config.endpoint);
    if (!host) return false;
    return host.endsWith('.backblazeb2.com') || host === 'backblazeb2.com';
};

const 等待 = (ms: number): Promise<void> => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const 是否可重试代理错误 = (status: number, detail: string): boolean => (
    status === 502 && /network connection lost|fetch failed|networkerror|connection reset|econnreset|timeout/i.test(detail)
);

const 克隆响应 = async (response: Response): Promise<Response> => (
    new Response(await response.text().catch(() => ''), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
    })
);

const 是否对象存储锁定响应 = (response: Response): boolean => response.status === 423;

let 最近对象存储列表诊断: { status: number; keyCount: number; segments: string[] } | null = null;

const objectStorageFetch = async (
    config: 对象存储同步配置,
    method: string,
    segments: string[] = [],
    init?: { headers?: Record<string, string>; body?: BodyInit | null }
): Promise<Response> => {
    const objectKey = 构建对象键(config, segments);
    const methodUpper = method.toUpperCase();

    try {
        if (methodUpper === 'LIST' || 是否应强制走对象存储代理(config)) {
            throw new Error(methodUpper === 'LIST'
                ? 'LIST uses Worker proxy for S3 ListObjectsV2 compatibility'
                : 'Endpoint is configured to prefer object storage proxy');
        }
        const directUrl = 构建直连对象存储地址(config, segments);
        const body = methodUpper === 'GET' || methodUpper === 'HEAD' ? undefined : init?.body ?? null;
        const bodyBuffer = await body转ArrayBuffer(body);
        const contentType = 读取文本(init?.headers?.['Content-Type']) || (body ? 'application/octet-stream' : '');
        const bodyHash = await sha256Hex(bodyBuffer);
        const { amzDate, dateStamp } = 格式化Amz时间(new Date());
        const headers = new Headers();
        headers.set('x-amz-content-sha256', bodyHash);
        headers.set('x-amz-date', amzDate);
        if (contentType) headers.set('Content-Type', contentType);
        headers.set('Authorization', await 构建对象存储授权头({
            method: methodUpper,
            url: directUrl,
            bodyHash,
            accessKey: config.accessKey,
            secretKey: config.secretKey,
            amzDate,
            dateStamp,
            contentType
        }));
        const response = await fetch(directUrl, { method: methodUpper, headers, body, cache: 'no-store' });
        记录对象存储日志('对象存储直连请求完成', {
            method: methodUpper,
            key: objectKey,
            status: response.status,
            ok: response.ok
        }, response.ok || response.status === 404 ? 'debug' : 'warn');
        return response;
    } catch (error) {
        记录对象存储日志('对象存储直连请求失败，切换 Worker 代理', {
            method,
            key: objectKey,
            error: error instanceof Error ? error.message : String(error)
        }, 'debug');
        // 直连可能被对象存储 CORS、浏览器策略或网络环境拦截；保留 Worker 代理作为兼容兜底。
    }

    let lastTransientFailure: Response | null = null;
    const proxyUrls = 构建对象存储代理地址列表();
    for (let attempt = 0; attempt < 3; attempt += 1) {
        for (const proxyUrl of proxyUrls) {
            let response: Response;
            try {
                response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: {
                        'X-Object-Storage-Method': method,
                        'X-Object-Storage-Endpoint': config.endpoint,
                        'X-Object-Storage-Bucket': config.bucket,
                        'X-Object-Storage-Key': objectKey,
                        'X-Object-Storage-Access-Key': config.accessKey,
                        'X-Object-Storage-Secret-Key': config.secretKey,
                        'Cache-Control': 'no-store',
                        Pragma: 'no-cache',
                        'X-MSJH-No-Cache': `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                        ...(config.username ? { 'X-Object-Storage-Username': config.username } : {}),
                        ...init?.headers
                    },
                    body: init?.body ?? null,
                    cache: 'no-store'
                });
            } catch (error) {
                记录对象存储日志('对象存储代理请求网络失败，尝试下一个代理域名', {
                    method,
                    key: objectKey,
                    proxyHost: (() => {
                        try { return new URL(proxyUrl, window.location.href).host; } catch { return proxyUrl; }
                    })(),
                    attempt: attempt + 1,
                    error: error instanceof Error ? error.message : String(error)
                }, 'warn');
                const rawMessage = error instanceof Error ? error.message : String(error);
                lastTransientFailure = new Response(
                    `网络连接失败：${rawMessage}。请先关闭 VPN、系统代理或浏览器代理后重试；如果仍失败，请切换网络或稍后再试。`,
                    { status: 502 }
                );
                continue;
            }
            记录对象存储日志('对象存储代理请求完成', {
                method,
                key: objectKey,
                proxyHost: (() => {
                    try { return new URL(proxyUrl, window.location.href).host; } catch { return proxyUrl; }
                })(),
                attempt: attempt + 1,
                status: response.status,
                ok: response.ok
            }, response.ok || response.status === 404 ? 'debug' : 'warn');
            if (response.status !== 502) return response;

            const cloned = await 克隆响应(response);
            const detail = await cloned.clone().text().catch(() => '');
            if (!是否可重试代理错误(response.status, detail)) return cloned;
            lastTransientFailure = cloned;
        }
        await 等待(450 * (attempt + 1));
    }
    return lastTransientFailure || new Response('对象存储 proxy request failed', { status: 502 });
};

const 列出对象存储键 = async (config: 对象存储同步配置, segments: string[] = []): Promise<string[]> => {
    const response = await objectStorageFetch(config, 'LIST', segments);
    if (!response.ok) {
        最近对象存储列表诊断 = { status: response.status, keyCount: 0, segments };
        记录对象存储日志('对象存储 LIST 请求失败，将跳过目录扫描兜底', {
            prefix: 读取对象存储前缀(config),
            bucket: config.bucket,
            segments,
            status: response.status
        }, response.status === 404 ? 'debug' : 'warn');
        return [];
    }

    const xml = await response.text().catch(() => '');
    const keys = Array.from(xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g))
        .map((match) => match[1] || '')
        .map((value) => value
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim())
        .filter(Boolean);
    const uniqueKeys = Array.from(new Set(keys));
    最近对象存储列表诊断 = { status: response.status, keyCount: uniqueKeys.length, segments };
    return uniqueKeys;
};

const 确保集合 = async (_config: 对象存储同步配置, _segments: string[]): Promise<void> => {
    return;
};

const 确保对象存储目录结构 = async (_config: 对象存储同步配置): Promise<void> => {
    return;
};

const 确保多级集合 = async (_config: 对象存储同步配置, _segments: string[]): Promise<void> => {
    return;
};

const 去除扩展名 = (fileName: string): string => fileName.replace(/\.[^.]+$/, '');

const 是否分片包 = (payload: unknown): payload is 对象存储分片存档包 | 对象存储分片设置包 => {
    const raw = payload as Partial<对象存储分片存档包 | 对象存储分片设置包> | null;
    return raw?.storage === 'chunks'
        && !!读取文本(raw.chunkDir)
        && Array.isArray(raw.chunks)
        && raw.chunks.every((item) => 读取文本(item?.fileName) && Number(item?.size) > 0);
};

const 读取包Base64 = async (
    config: 对象存储同步配置,
    payload: 对象存储存档包 | 对象存储设置包,
    onProgress?: 对象存储同步进度回调
): Promise<string> => {
    if ('archiveBase64' in payload && 读取文本(payload.archiveBase64)) return payload.archiveBase64;
    if (!是否分片包(payload)) throw new Error('对象存储 分片包格式无效');

    const chunks: string[] = [];
    const total = payload.chunks.length;
    for (let index = 0; index < total; index += 1) {
        const chunk = payload.chunks[index];
        onProgress?.({
            stage: 'download',
            current: index + 1,
            total,
            message: `正在下载分片 ${index + 1}/${total}`
        });
        const response = await objectStorageFetch(config, 'GET', [OBJECT_STORAGE_CHUNKS_DIR, payload.chunkDir, chunk.fileName]);
        if (!response.ok) {
            throw new Error(`下载 对象存储 分片失败：${response.status}${await 读取错误详情(response)}`);
        }
        chunks.push(await response.text());
    }
    const value = chunks.join('');
    if (Number(payload.totalBase64Length) > 0 && value.length !== Number(payload.totalBase64Length)) {
        throw new Error('对象存储 分片包不完整');
    }
    return value;
};

const 写入包 = async (
    config: 对象存储同步配置,
    targetSegments: string[],
    payload: Omit<对象存储存档包, 'archiveBase64' | 'storage' | 'chunkDir' | 'totalBase64Length' | 'chunks'> | Omit<对象存储设置包, 'archiveBase64' | 'storage' | 'chunkDir' | 'totalBase64Length' | 'chunks'>,
    archiveBase64: string,
    chunkScope: 'saves' | 'settings',
    onProgress?: 对象存储同步进度回调
): Promise<void> => {
    const inlineBody = JSON.stringify({ ...payload, archiveBase64 });
    try {
        onProgress?.({ stage: 'upload', current: 1, total: 1, message: '正在上传完整数据包 1/1' });
        const response = await objectStorageFetch(config, 'PUT', targetSegments, {
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: inlineBody
        });
        if (!response.ok) {
            throw new Error(`上传 对象存储 数据包失败：${response.status}${await 读取错误详情(response)}`);
        }
        return;
    } catch (error) {
        if (inlineBody.length <= OBJECT_STORAGE_FALLBACK_CHUNK_THRESHOLD) {
            throw error;
        }
        onProgress?.({ stage: 'upload', message: '完整数据包上传失败，正在切换分片上传' });
    }

    const targetFileName = targetSegments[targetSegments.length - 1] || 'package.json';
    const chunkDir = `${chunkScope}/${安全文件名(去除扩展名(targetFileName), 'package')}`;
    const chunkDirSegments = [OBJECT_STORAGE_CHUNKS_DIR, ...chunkDir.split('/')];
    onProgress?.({ stage: 'directory', message: '正在准备 对象存储 分片目录' });
    await 确保多级集合(config, chunkDirSegments);

    const chunks: 对象存储分片引用[] = [];
    const total = Math.ceil(archiveBase64.length / OBJECT_STORAGE_CHUNK_BASE64_SIZE);
    for (let index = 0; index < total; index += 1) {
        const part = archiveBase64.slice(index * OBJECT_STORAGE_CHUNK_BASE64_SIZE, (index + 1) * OBJECT_STORAGE_CHUNK_BASE64_SIZE);
        const fileName = `part-${String(index + 1).padStart(4, '0')}.txt`;
        onProgress?.({
            stage: 'upload',
            current: index + 1,
            total,
            message: `正在上传分片 ${index + 1}/${total}`
        });
        const response = await objectStorageFetch(config, 'PUT', [...chunkDirSegments, fileName], {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: part
        });
        if (!response.ok) {
            throw new Error(`上传 对象存储 分片失败：${response.status}${await 读取错误详情(response)}`);
        }
        chunks.push({ fileName, size: part.length });
    }

    onProgress?.({ stage: 'manifest', message: '正在写入 对象存储 分片索引' });
    const response = await objectStorageFetch(config, 'PUT', targetSegments, {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
            ...payload,
            storage: 'chunks',
            chunkDir,
            totalBase64Length: archiveBase64.length,
            chunks
        }, null, 2)
    });
    if (!response.ok) {
        throw new Error(`上传 对象存储 分片索引失败：${response.status}${await 读取错误详情(response)}`);
    }
};

const 读取存档谱系哈希 = (save: Partial<存档结构> | null | undefined): string => (
    读取文本((save?.元数据 as any)?.存档哈希) || dbService.计算存档同步哈希(save as Partial<存档结构>)
);

const 收集存档祖先节点 = (save: 存档结构, allSaves: 存档结构[]): 存档结构[] => {
    const byHash = new Map<string, 存档结构>();
    allSaves.forEach((item) => {
        const hash = 读取存档谱系哈希(item);
        if (hash) byHash.set(hash, item);
    });

    const ancestors: 存档结构[] = [];
    const visited = new Set<string>();
    let parentHash = 读取文本((save.元数据 as any)?.存档父节点哈希);

    while (parentHash && !visited.has(parentHash)) {
        visited.add(parentHash);
        const parent = byHash.get(parentHash);
        if (!parent) break;
        ancestors.unshift(parent);
        parentHash = 读取文本((parent.元数据 as any)?.存档父节点哈希);
    }

    return ancestors;
};

const 合并显式存档及祖先节点 = (targetSaves: 存档结构[], allSaves: 存档结构[]): 存档结构[] => {
    const byHash = new Map<string, 存档结构>();
    const append = (item: 存档结构) => {
        const hash = 读取存档谱系哈希(item);
        const key = hash || `id:${item.id ?? ''}|time:${item.时间戳 || 0}`;
        if (!byHash.has(key)) byHash.set(key, item);
    };
    targetSaves.forEach((save) => {
        收集存档祖先节点(save, allSaves).forEach(append);
        append(save);
    });
    return Array.from(byHash.values()).sort((a, b) => {
        const depthDiff = Number((a.元数据 as any)?.存档谱系深度 || 0) - Number((b.元数据 as any)?.存档谱系深度 || 0);
        if (depthDiff !== 0) return depthDiff;
        return Number(a.时间戳 || 0) - Number(b.时间戳 || 0);
    });
};

const 打包对象存储存档 = async (save: 存档结构, allSaves: 存档结构[] = [save]): Promise<已打包对象存储存档> => {
    const saveCopy = 深拷贝(save);
    const bundledSaves = [
        ...收集存档祖先节点(save, allSaves),
        save
    ].map((item) => 深拷贝(item));
    const archiveBlob = await 导出ZIP存档文件({ saves: bundledSaves, includeImages: true });
    const archiveBytes = new Uint8Array(await archiveBlob.arrayBuffer());
    const metadata = await 构建云存档元数据(saveCopy, archiveBytes);
    metadata.bundledSaveCount = bundledSaves.length;
    return {
        save: saveCopy,
        bundledSaves,
        archiveBase64: 字节转Base64(archiveBytes),
        metadata,
        metadataKey: 读取元数据同步键(metadata)
    };
};

const 上传对象存储存档包 = async (
    config: 对象存储同步配置,
    item: 待上传对象存储存档,
    onProgress?: 对象存储同步进度回调
): Promise<void> => {
    const packagePayload: 对象存储存档包 = {
        format: OBJECT_STORAGE_PACKAGE_FORMAT,
        version: OBJECT_STORAGE_MANIFEST_VERSION,
        metadata: item.metadata,
        archiveBase64: ''
    };
    const { archiveBase64: _unused, ...packageBase } = packagePayload;
    await 写入包(config, [OBJECT_STORAGE_SAVES_DIR, item.metadata.fileName], packageBase, item.archiveBase64, 'saves', onProgress);
};

const 从存档包恢复清单 = async (
    keys: string[],
    readPackage: (fileName: string) => Promise<对象存储存档包 | null>
): Promise<对象存储清单结构> => {
    const saves: 对象存储云存档元数据[] = [];
    const saveFileNames = keys
        .map((key) => {
            const normalized = key.replace(/\\/g, '/');
            const marker = `/${OBJECT_STORAGE_SAVES_DIR}/`;
            const markerIndex = normalized.indexOf(marker);
            if (markerIndex >= 0) return normalized.slice(markerIndex + marker.length);
            const prefix = `${OBJECT_STORAGE_SAVES_DIR}/`;
            return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : '';
        })
        .filter((fileName) => fileName && fileName.toLowerCase().endsWith('.json') && !fileName.includes('/'));

    for (const fileName of Array.from(new Set(saveFileNames))) {
        const payload = await readPackage(fileName).catch(() => null);
        if (payload?.format !== OBJECT_STORAGE_PACKAGE_FORMAT || !payload.metadata?.id || !payload.metadata.fileName) {
            continue;
        }
        saves.push({
            ...payload.metadata,
            fileName: payload.metadata.fileName || fileName,
            syncKey: 读取元数据同步键(payload.metadata)
        });
    }

    const cleaned = 整理对象存储清单存档列表(saves);
    const repaired = 修复对象存储清单谱系(cleaned.saves);
    return {
        format: OBJECT_STORAGE_MANIFEST_FORMAT,
        version: OBJECT_STORAGE_MANIFEST_VERSION,
        updatedAt: new Date().toISOString(),
        saves: repaired.saves,
        settings: null
    };
};

const 尝试从存档包恢复远端清单 = async (config: 对象存储同步配置): Promise<对象存储清单结构 | null> => {
    const keys = await 列出对象存储键(config, [OBJECT_STORAGE_SAVES_DIR]);
    if (keys.length <= 0) return null;

    const recovered = await 从存档包恢复清单(keys, async (fileName) => {
        const response = await objectStorageFetch(config, 'GET', [OBJECT_STORAGE_SAVES_DIR, fileName]);
        if (!response.ok) return null;
        return await response.json().catch(() => null) as 对象存储存档包 | null;
    });
    if (recovered.saves.length <= 0) return null;

    const writeBack = await objectStorageFetch(config, 'PUT', [OBJECT_STORAGE_MANIFEST_FILE], {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(recovered, null, 2)
    });
    记录对象存储日志(writeBack.ok ? '已从存档包恢复对象存储清单并写回' : '已从存档包恢复对象存储清单，但写回失败', {
        prefix: 读取对象存储前缀(config),
        bucket: config.bucket,
        recoveredCount: recovered.saves.length,
        writeBackStatus: writeBack.status
    }, writeBack.ok ? 'warn' : 'error');
    return recovered;
};

const 读取远端清单 = async (config: 对象存储同步配置): Promise<对象存储清单结构> => {
    const response = await objectStorageFetch(config, 'GET', [OBJECT_STORAGE_MANIFEST_FILE]);
    if (response.status === 404) {
        最近对象存储列表诊断 = null;
        const recovered = await 尝试从存档包恢复远端清单(config);
        if (recovered) return recovered;
        const diagnostic = 构建空云存档诊断({
            endpoint: config.endpoint,
            bucket: config.bucket,
            prefix: 读取对象存储前缀(config),
            manifestStatus: response.status,
            listStatus: 最近对象存储列表诊断?.status ?? null,
            listedKeyCount: 最近对象存储列表诊断?.keyCount ?? null
        });
        记录对象存储日志('云端清单不存在，将使用空清单', {
            prefix: 读取对象存储前缀(config),
            bucket: config.bucket,
            diagnostic
        }, 'warn');
        return {
            format: OBJECT_STORAGE_MANIFEST_FORMAT,
            version: OBJECT_STORAGE_MANIFEST_VERSION,
            updatedAt: new Date().toISOString(),
            saves: [],
            settings: null
        };
    }
    if (!response.ok) {
        throw new Error(`读取 对象存储 云存档清单失败：${response.status}${await 读取错误详情(response)}`);
    }
    const parsed = await response.json().catch(() => null) as 对象存储清单结构 | null;
    if (parsed?.format !== OBJECT_STORAGE_MANIFEST_FORMAT || !Array.isArray(parsed?.saves)) {
        最近对象存储列表诊断 = null;
        const recovered = await 尝试从存档包恢复远端清单(config);
        if (recovered) return recovered;
        throw new Error('对象存储 云存档清单格式无效');
    }
    const cleaned = 整理对象存储清单存档列表(parsed.saves);
    const repaired = 修复对象存储清单谱系(cleaned.saves);
    if (repaired.changed) {
        const repairedManifest: 对象存储清单结构 = {
            format: OBJECT_STORAGE_MANIFEST_FORMAT,
            version: Number(parsed.version) || OBJECT_STORAGE_MANIFEST_VERSION,
            updatedAt: new Date().toISOString(),
            saves: repaired.saves,
            settings: parsed.settings?.fileName ? parsed.settings : null
        };
        const repairResponse = await objectStorageFetch(config, 'PUT', [OBJECT_STORAGE_MANIFEST_FILE], {
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(repairedManifest, null, 2)
        });
        if (!repairResponse.ok) {
            记录对象存储日志('对象存储清单谱系自动修复写回失败，将仅使用内存修复结果', {
                prefix: 读取对象存储前缀(config),
                bucket: config.bucket,
                status: repairResponse.status,
                repairedGroups: repaired.repairedGroups,
                repairedNodes: repaired.repairedNodes
            }, 'warn');
        } else {
            记录对象存储日志('对象存储清单谱系已自动修复并写回', {
                prefix: 读取对象存储前缀(config),
                bucket: config.bucket,
                repairedGroups: repaired.repairedGroups,
                repairedNodes: repaired.repairedNodes
            }, 'warn');
        }
    }
    记录对象存储日志('已读取云端清单', {
        prefix: 读取对象存储前缀(config),
        bucket: config.bucket,
        rawCount: parsed.saves.length,
        cleanedCount: repaired.saves.length,
        removed: cleaned.removed,
        repairedGroups: repaired.repairedGroups,
        repairedNodes: repaired.repairedNodes,
        updatedAt: parsed.updatedAt,
        sample: repaired.saves.slice(0, 8).map(构建云存档日志摘要)
    }, cleaned.removed > 0 || repaired.changed ? 'warn' : 'info');
    return {
        format: OBJECT_STORAGE_MANIFEST_FORMAT,
        version: Number(parsed.version) || OBJECT_STORAGE_MANIFEST_VERSION,
        updatedAt: repaired.changed ? new Date().toISOString() : (读取文本(parsed.updatedAt) || new Date().toISOString()),
        saves: repaired.saves,
        settings: parsed.settings?.fileName ? parsed.settings : null
    };
};

const 写入远端清单 = async (config: 对象存储同步配置, manifest: 对象存储清单结构): Promise<void> => {
    const cleaned = 整理对象存储清单存档列表(manifest.saves);
    const normalized = 修复对象存储清单谱系(cleaned.saves);
    const nextSaves = normalized.saves;
    const response = await objectStorageFetch(config, 'PUT', [OBJECT_STORAGE_MANIFEST_FILE], {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
            ...manifest,
            updatedAt: new Date().toISOString(),
            saves: nextSaves
        }, null, 2)
    });
    if (!response.ok) {
        throw new Error(`写入 对象存储 云存档清单失败：${response.status}${await 读取错误详情(response)}`);
    }
    记录对象存储日志('已写入云端清单', {
        prefix: 读取对象存储前缀(config),
        bucket: config.bucket,
        saveCount: nextSaves.length,
        removed: cleaned.removed,
        repairedGroups: normalized.repairedGroups,
        repairedNodes: normalized.repairedNodes,
        sample: nextSaves.slice(0, 8).map(构建云存档日志摘要)
    }, cleaned.removed > 0 || normalized.changed ? 'warn' : 'info');
};

const 安全文件名 = (value: string, fallback: string): string => {
    const normalized = value
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80);
    return normalized || fallback;
};

const pad2 = (value: number): string => Math.trunc(value).toString().padStart(2, '0');

const 格式化时间戳 = (timestamp: number): string => {
    const date = new Date(timestamp || Date.now());
    if (Number.isNaN(date.getTime())) return `${Date.now()}`;
    return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
};

const 读取地点文本 = (save: 存档结构): string => {
    const env = save.环境信息 || ({} as any);
    const list = [env.具体地点, env.小地点, env.中地点, env.大地点]
        .map((item: unknown) => 读取文本(item))
        .filter(Boolean);
    return list[0] || '未知地点';
};

const 读取时间文本 = (save: 存档结构): string => {
    const env = save.环境信息 || ({} as any);
    const text = 读取文本(env.时间);
    if (text) return text;
    return 格式化时间戳(Number(save.时间戳 || Date.now()));
};

const 获取设备类型 = (): 对象存储云存档元数据['deviceType'] => {
    if (typeof navigator === 'undefined') return 'computer';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ? 'phone' : 'computer';
};

const 获取设备标签 = (): string => (
    获取设备类型() === 'phone' ? '手机' : '电脑'
);

const 字节转Base64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
};

const base64转字节 = (value: string): Uint8Array => {
    const binary = atob(value.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
};

const 计算SHA256 = async (bytes: Uint8Array): Promise<string> => {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
        return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('');
    }
    let hash = 2166136261;
    for (const byte of bytes) {
        hash ^= byte;
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

const 构建云存档元数据 = async (save: 存档结构, archiveBytes: Uint8Array): Promise<对象存储云存档元数据> => {
    const title = 读取文本(save.角色数据?.姓名) || '未知角色';
    const hash = dbService.计算存档同步哈希(save) || await 计算SHA256(archiveBytes);
    const stamp = 格式化时间戳(Number(save.时间戳 || Date.now()));
    const id = `${save.类型 === 'auto' ? 'auto' : 'manual'}_${stamp}_${hash.slice(0, 12)}`;
    const parentHash = 读取文本((save.元数据 as any)?.存档父节点哈希);
    const rootHash = 读取文本((save.元数据 as any)?.存档根节点哈希) || hash;
    const computedTurnCount = 读取存档游玩回合数(save);
    const lineageDepth = Math.max(0, Math.floor(Number((save.元数据 as any)?.存档谱系深度 || 0)));
    const isLineageRoot = !parentHash;
    return {
        id,
        fileName: `${安全文件名(id, 'save')}.json`,
        syncKey: 构建存档同步键(save),
        title,
        type: save.类型 === 'auto' ? 'auto' : 'manual',
        saveTimestamp: Number(save.时间戳 || Date.now()),
        savedAt: new Date(Number(save.时间戳 || Date.now())).toISOString(),
        syncedAt: new Date().toISOString(),
        deviceType: 获取设备类型(),
        deviceLabel: 获取设备标签(),
        appVersion: RELEASE_INFO.versionName,
        versionCode: RELEASE_INFO.versionCode,
        hash,
        size: archiveBytes.length,
        location: 读取地点文本(save),
        gameTime: 读取时间文本(save),
        turnCount: isLineageRoot ? 0 : computedTurnCount,
        seriesId: 读取文本((save.元数据 as any)?.存档系列ID),
        parentHash,
        rootHash: isLineageRoot ? hash : rootHash,
        lineageDepth: isLineageRoot ? 0 : lineageDepth,
        branchInput: 读取文本((save.元数据 as any)?.存档分支输入) || (isLineageRoot ? '开局' : '继续游玩'),
        openingSnippet: 读取文本((save.元数据 as any)?.首回合正文片段) || 读取首回合片段(save),
        autoNodeId: 读取文本((save.元数据 as any)?.自动存档节点ID) || undefined,
        autoSignature: 读取文本((save.元数据 as any)?.自动存档签名) || undefined
    };
};

export const 测试对象存储连接 = async (config: 对象存储同步配置): Promise<void> => {
    const normalized = 规范化配置(config);
    if (!normalized) throw new Error('请填写对象存储端点、存储桶、Access Key 和 Secret Key');
    await 确保对象存储目录结构(normalized);
    await 读取远端清单(normalized);
};

export const 读取对象存储同步摘要 = async (config: 对象存储同步配置): Promise<对象存储同步摘要> => {
    const normalized = 规范化配置(config);
    if (!normalized) throw new Error('请填写对象存储端点、存储桶、Access Key 和 Secret Key');
    await 确保对象存储目录结构(normalized);
    const manifest = await 读取远端清单(normalized);
    return {
        saveCount: manifest.saves.length,
        updatedAt: manifest.updatedAt || null,
        settings: manifest.settings || null
    };
};

export const 诊断对象存储空云存档 = async (config: 对象存储同步配置): Promise<string> => {
    const normalized = 规范化配置(config);
    if (!normalized) return '';

    const manifestResponse = await objectStorageFetch(normalized, 'GET', [OBJECT_STORAGE_MANIFEST_FILE]);
    if (manifestResponse.ok) {
        const parsed = await manifestResponse.json().catch(() => null) as Partial<对象存储清单结构> | null;
        const saves = Array.isArray(parsed?.saves) ? parsed.saves : [];
        if (saves.length > 0) return '';
    }

    const keys = await 列出对象存储键(normalized, [OBJECT_STORAGE_SAVES_DIR]);
    if (keys.length > 0) return '';

    return 构建空云存档诊断({
        endpoint: normalized.endpoint,
        bucket: normalized.bucket,
        prefix: 读取对象存储前缀(normalized),
        manifestStatus: manifestResponse.status,
        listStatus: 最近对象存储列表诊断?.status ?? null,
        listedKeyCount: keys.length
    });
};

export const 列出对象存储云存档 = async (config: 对象存储同步配置): Promise<对象存储云存档元数据[]> => {
    const normalized = 规范化配置(config);
    if (!normalized) throw new Error('请填写对象存储端点、存储桶、Access Key 和 Secret Key');
    await 确保对象存储目录结构(normalized);
    const manifest = await 读取远端清单(normalized);
    return [...manifest.saves].sort((a, b) => Number(b.saveTimestamp || 0) - Number(a.saveTimestamp || 0));
};

const 构建设置元数据 = async (bytes: Uint8Array): Promise<对象存储设置同步元数据> => ({
    fileName: OBJECT_STORAGE_SETTINGS_FILE,
    syncedAt: new Date().toISOString(),
    deviceType: 获取设备类型(),
    deviceLabel: 获取设备标签(),
    appVersion: RELEASE_INFO.versionName,
    versionCode: RELEASE_INFO.versionCode,
    hash: await 计算SHA256(bytes),
    size: bytes.length
});

export const 上传设置到对象存储 = async (config: 对象存储同步配置, onProgress?: 对象存储同步进度回调): Promise<对象存储设置同步元数据> => {
    const normalized = 规范化配置(config);
    if (!normalized) throw new Error('请填写对象存储端点、存储桶、Access Key 和 Secret Key');
    onProgress?.({ stage: 'directory', message: '正在准备 对象存储 目录' });
    await 确保对象存储目录结构(normalized);
    onProgress?.({ stage: 'manifest', message: '正在读取云端清单' });
    const manifest = await 读取远端清单(normalized);
    onProgress?.({ stage: 'prepare', message: '正在打包本机设置' });
    const bytes = await extractSettingsSyncData();
    const metadata = await 构建设置元数据(bytes);
    const packagePayload: 对象存储设置包 = {
        format: OBJECT_STORAGE_SETTINGS_PACKAGE_FORMAT,
        version: OBJECT_STORAGE_MANIFEST_VERSION,
        metadata
    };
    await 写入包(normalized, [metadata.fileName], packagePayload, 字节转Base64(bytes), 'settings', onProgress);
    manifest.settings = metadata;
    onProgress?.({ stage: 'manifest', message: '正在更新云端清单' });
    await 写入远端清单(normalized, manifest);
    onProgress?.({ stage: 'done', message: '对象存储 设置上传完成' });
    return metadata;
};

export const 下载设置自对象存储 = async (config: 对象存储同步配置, onProgress?: 对象存储同步进度回调): Promise<云同步恢复结果> => {
    const normalized = 规范化配置(config);
    if (!normalized) throw new Error('请填写对象存储端点、存储桶、Access Key 和 Secret Key');
    onProgress?.({ stage: 'manifest', message: '正在读取云端清单' });
    const manifest = await 读取远端清单(normalized);
    const fileName = manifest.settings?.fileName || OBJECT_STORAGE_SETTINGS_FILE;
    const response = await objectStorageFetch(normalized, 'GET', [fileName]);
    if (!response.ok) {
        throw new Error(`下载 对象存储 设置包失败：${response.status}${await 读取错误详情(response)}`);
    }
    const payload = await response.json().catch(() => null) as 对象存储设置包 | null;
    if (payload?.format !== OBJECT_STORAGE_SETTINGS_PACKAGE_FORMAT) {
        throw new Error('对象存储 设置包格式无效');
    }
    const archiveBase64 = await 读取包Base64(normalized, payload, onProgress);
    onProgress?.({ stage: 'done', message: '对象存储 设置下载完成' });
    return restoreSettingsSyncData(base64转字节(archiveBase64));
};

export const 增量同步到对象存储 = async (config: 对象存储同步配置, saves?: 存档结构[], onProgress?: 对象存储同步进度回调): Promise<对象存储增量同步结果> => {
    const normalized = 规范化配置(config);
    if (!normalized) throw new Error('请填写对象存储端点、存储桶、Access Key 和 Secret Key');
    记录对象存储日志('开始上传本地存档到对象存储', {
        prefix: 读取对象存储前缀(normalized),
        bucket: normalized.bucket,
        explicitSaveCount: Array.isArray(saves) ? saves.length : null
    });
    onProgress?.({ stage: 'directory', message: '正在准备 对象存储 目录' });
    await 确保对象存储目录结构(normalized);
    onProgress?.({ stage: 'manifest', message: '正在读取云端清单' });
    const manifest = await 读取远端清单(normalized);
    const cleanedBeforeUpload = 整理对象存储清单存档列表(manifest.saves);
    manifest.saves = cleanedBeforeUpload.saves;
    const requestedSaves = Array.isArray(saves) ? saves : await dbService.读取存档列表();
    const allLocalSaves = Array.isArray(saves)
        ? await dbService.读取存档列表().catch(() => requestedSaves)
        : requestedSaves;
    const localSaves = Array.isArray(saves)
        ? 合并显式存档及祖先节点(requestedSaves, allLocalSaves)
        : requestedSaves;
    记录对象存储日志('本地存档列表已读取', {
        localCount: localSaves.length,
        requestedCount: requestedSaves.length,
        remoteCount: manifest.saves.length,
        remoteDedupedBeforeUpload: cleanedBeforeUpload.removed,
        localSample: localSaves.slice(0, 8).map((save) => ({
            id: save.id,
            type: save.类型,
            timestamp: save.时间戳,
            title: save.角色数据?.姓名,
            hashTail: dbService.计算存档摘要短哈希(save)
        }))
    });
    const knownHashes = new Set(manifest.saves.map((item) => 读取文本(item.hash)).filter(Boolean));
    const remoteBySyncKey = new Map<string, 对象存储云存档元数据>();
    manifest.saves.forEach((item) => {
        const key = 读取元数据同步键(item);
        const previous = remoteBySyncKey.get(key);
        if (!previous || Number(item.saveTimestamp || 0) > Number(previous.saveTimestamp || 0)) {
            remoteBySyncKey.set(key, item);
        }
    });
    let updated = 0;
    let skipped = 0;
    let deduped = cleanedBeforeUpload.removed;
    const uploadQueue: 待上传对象存储存档[] = [];

    const savesNeedingPackaging: typeof localSaves = [];

    for (let index = 0; index < localSaves.length; index += 1) {
        const save = localSaves[index];
        const localHash = dbService.计算存档同步哈希(save);
        const localSyncKey = 构建存档同步键(save);
        onProgress?.({ stage: 'prepare', current: index + 1, total: localSaves.length, message: `正在对比云端存档 ${index + 1}/${localSaves.length}` });

        if (localHash && knownHashes.has(localHash)) {
            记录对象存储日志('上传前跳过：云端已有相同内容哈希，未打包本地存档', {
                id: save.id,
                type: save.类型,
                timestamp: save.时间戳,
                title: save.角色数据?.姓名,
                hashTail: 哈希尾号(localHash)
            }, 'debug');
            manifest.saves = manifest.saves.map((item) => item.hash === localHash ? { ...item, syncKey: item.syncKey || localSyncKey } : item);
            skipped += 1;
            continue;
        }

        savesNeedingPackaging.push(save);
    }

    记录对象存储日志('本地存档哈希预对比完成', {
        localCount: localSaves.length,
        skippedBeforePackaging: skipped,
        packageQueueCount: savesNeedingPackaging.length,
        remoteKnownHashCount: knownHashes.size
    });

    const packagedSaves = await 并发映射(savesNeedingPackaging, OBJECT_STORAGE_UPLOAD_CONCURRENCY, async (save, index) => {
        onProgress?.({ stage: 'prepare', current: index + 1, total: savesNeedingPackaging.length, message: `正在打包待上传存档 ${index + 1}/${savesNeedingPackaging.length}` });
        return 打包对象存储存档(save, localSaves);
    });

    for (let index = 0; index < packagedSaves.length; index += 1) {
        const packaged = packagedSaves[index];
        const { metadata, metadataKey } = packaged;
        onProgress?.({ stage: 'prepare', current: index + 1, total: packagedSaves.length, message: `正在复核待上传存档 ${index + 1}/${packagedSaves.length}` });
        if (knownHashes.has(metadata.hash)) {
            记录对象存储日志('上传前跳过：云端已有相同内容哈希', 构建云存档日志摘要(metadata), 'debug');
            manifest.saves = manifest.saves.map((item) => item.hash === metadata.hash ? { ...item, syncKey: item.syncKey || metadata.syncKey } : item);
            skipped += 1;
            continue;
        }
        const remoteSameSave = remoteBySyncKey.get(metadataKey);
        const isUpdate = Boolean(remoteSameSave);
        if (remoteSameSave) {
            记录对象存储日志(是否自动节点同步键(metadataKey)
                ? '上传前发现同一自动存档节点，将更新云端节点'
                : '上传前发现同同步键但内容哈希不同，将作为独立云端版本保留', {
                local: 构建云存档日志摘要(metadata),
                remote: 构建云存档日志摘要(remoteSameSave)
            }, 'info');
        }
        uploadQueue.push({ ...packaged, isUpdate });
    }

    await 并发映射(uploadQueue, OBJECT_STORAGE_UPLOAD_CONCURRENCY, async (item, index) => {
        onProgress?.({ stage: 'upload', current: index + 1, total: uploadQueue.length, message: `正在上传云端存档 ${index + 1}/${uploadQueue.length}` });
        记录对象存储日志('正在上传云端存档包', {
            index: index + 1,
            total: uploadQueue.length,
            isUpdate: item.isUpdate,
            metadata: 构建云存档日志摘要(item.metadata)
        });
        await 上传对象存储存档包(normalized, item, onProgress);
    });

    for (const item of uploadQueue) {
        const { metadata, metadataKey, isUpdate } = item;
        const beforeFilter = manifest.saves.length;
        manifest.saves = manifest.saves.filter((item) => {
            if (item.hash === metadata.hash || item.id === metadata.id) return false;
            if (isUpdate && 是否自动节点同步键(metadataKey) && 读取元数据同步键(item) === metadataKey) return false;
            return true;
        });
        deduped += Math.max(0, beforeFilter - manifest.saves.length);
        manifest.saves.push(metadata);
        knownHashes.add(metadata.hash);
        remoteBySyncKey.set(metadataKey, metadata);
        if (isUpdate) updated += 1;
    }

    const finalCleaned = 整理对象存储清单存档列表(manifest.saves);
    manifest.saves = finalCleaned.saves;
    deduped += finalCleaned.removed;
    onProgress?.({ stage: 'manifest', message: '正在更新云端清单' });
    await 写入远端清单(normalized, manifest);
    onProgress?.({ stage: 'done', message: '对象存储 存档同步完成' });
    记录对象存储日志('上传同步完成', {
        uploaded: uploadQueue.length,
        skipped,
        updated,
        deduped,
        total: localSaves.length,
        finalRemoteCount: manifest.saves.length
    });
    return { uploaded: uploadQueue.length, skipped, updated, deduped, total: localSaves.length };
};

export const 下载对象存储云存档 = async (
    config: 对象存储同步配置,
    item: 对象存储云存档元数据,
    onProgress?: 对象存储同步进度回调
): Promise<{ save: 存档结构; saves: 存档结构[]; metadata: 对象存储云存档元数据 }> => {
    const normalized = 规范化配置(config);
    if (!normalized) throw new Error('请填写对象存储端点、存储桶、Access Key 和 Secret Key');
    const fileName = 读取文本(item.fileName);
    if (!fileName) throw new Error('云存档文件名无效');
    const response = await objectStorageFetch(normalized, 'GET', [OBJECT_STORAGE_SAVES_DIR, fileName]);
    if (!response.ok) {
        throw new Error(`下载 对象存储 云存档失败：${response.status}${await 读取错误详情(response)}`);
    }
    const payload = await response.json().catch(() => null) as 对象存储存档包 | null;
    if (payload?.format !== OBJECT_STORAGE_PACKAGE_FORMAT) {
        throw new Error('对象存储 云存档包格式无效');
    }
    const archiveBase64 = await 读取包Base64(normalized, payload, onProgress);
    const archiveBytes = base64转字节(archiveBase64);
    const archive = new Blob([archiveBytes], { type: 'application/zip' });
    const parsed = await 解析ZIP存档文件(archive);
    const parsedSaves = Array.isArray(parsed.saves) ? parsed.saves : [];
    const metadata = payload.metadata || item;
    const targetHash = 读取文本(metadata?.hash);
    const save = parsedSaves.find((candidate) => targetHash && dbService.计算存档同步哈希(candidate) === targetHash)
        || parsedSaves[parsedSaves.length - 1]
        || null;
    if (!save) throw new Error('对象存储 云存档包中没有有效存档');
    save.元数据 = {
        ...(save.元数据 || {}),
        存档哈希: 读取文本(metadata?.hash) || 读取文本(save.元数据?.存档哈希),
        存档系列ID: 读取文本(metadata?.seriesId) || 读取文本(save.元数据?.存档系列ID),
        存档父节点哈希: 读取文本(metadata?.parentHash) || 读取文本(save.元数据?.存档父节点哈希),
        存档根节点哈希: 读取文本(metadata?.rootHash) || 读取文本(save.元数据?.存档根节点哈希) || 读取文本(metadata?.hash),
        存档谱系深度: Number.isFinite(Number(metadata?.lineageDepth)) ? Math.max(0, Math.floor(Number(metadata?.lineageDepth))) : save.元数据?.存档谱系深度,
        存档分支输入: 读取文本(metadata?.branchInput) || 读取文本(save.元数据?.存档分支输入),
        首回合正文片段: 读取文本(metadata?.openingSnippet) || 读取文本((save.元数据 as any)?.首回合正文片段),
        存档谱系版本: 1,
        游戏回合数: Number.isFinite(Number(metadata?.turnCount)) ? Math.max(0, Math.floor(Number(metadata?.turnCount))) : 读取存档游玩回合数(save),
        对象存储哈希: metadata?.hash || item.hash,
        对象存储存档ID: metadata?.id || item.id,
        对象存储同步时间: metadata?.syncedAt || item.syncedAt
    };
    记录对象存储日志('已下载并解析云端存档包', {
        metadata: 构建云存档日志摘要(payload.metadata || item),
        save: {
            type: save.类型,
            timestamp: save.时间戳,
            roleName: save.角色数据?.姓名,
            location: save.环境信息?.具体地点,
            gameTime: save.环境信息?.时间,
            historyCount: Array.isArray(save.历史记录) ? save.历史记录.length : 0,
            bundledSaveCount: parsedSaves.length,
            localShortHash: dbService.计算存档摘要短哈希(save)
        }
    });
    onProgress?.({ stage: 'done', message: '对象存储 云存档下载完成' });
    return { save, saves: parsedSaves, metadata: payload.metadata || item };
};

export const 删除对象存储云存档 = async (
    config: 对象存储同步配置,
    target: 对象存储云存档元数据,
    onProgress?: 对象存储同步进度回调
): Promise<{ removed: boolean; deletedObjects: number; warnings: string[]; saves: 对象存储云存档元数据[] }> => {
    const normalized = 规范化配置(config);
    if (!normalized) throw new Error('请填写对象存储端点、存储桶、Access Key 和 Secret Key');
    const targetId = 读取文本(target.id);
    const targetHash = 读取文本(target.hash);
    const targetFileName = 读取文本(target.fileName);
    if (!targetId && !targetHash && !targetFileName) throw new Error('云存档信息无效，无法删除');

    onProgress?.({ stage: 'manifest', message: '正在读取对象存储云端清单' });
    const manifest = await 读取远端清单(normalized);
    const matched = manifest.saves.find((item) => (
        (targetId && item.id === targetId)
        || (targetHash && item.hash === targetHash)
        || (targetFileName && item.fileName === targetFileName)
    ));
    if (!matched) {
        return { removed: false, deletedObjects: 0, warnings: [], saves: manifest.saves };
    }

    const warnings: string[] = [];
    let deletedObjects = 0;
    const deleteObject = async (segments: string[], label: string) => {
        const response = await objectStorageFetch(normalized, 'DELETE', segments);
        if (response.ok || response.status === 404 || response.status === 204) {
            deletedObjects += response.status === 404 ? 0 : 1;
            return;
        }
        warnings.push(`${label} 删除失败：HTTP ${response.status}${await 读取错误详情(response)}`);
    };

    onProgress?.({ stage: 'download', message: '正在读取云端存档包索引' });
    const packageResponse = await objectStorageFetch(normalized, 'GET', [OBJECT_STORAGE_SAVES_DIR, matched.fileName]);
    let packagePayload: 对象存储存档包 | null = null;
    if (packageResponse.ok) {
        packagePayload = await packageResponse.json().catch(() => null) as 对象存储存档包 | null;
    } else if (packageResponse.status !== 404) {
        warnings.push(`读取待删除存档包失败：HTTP ${packageResponse.status}${await 读取错误详情(packageResponse)}`);
    }

    if (packagePayload && 是否分片包(packagePayload)) {
        const total = packagePayload.chunks.length;
        for (let index = 0; index < total; index += 1) {
            const chunk = packagePayload.chunks[index];
            onProgress?.({
                stage: 'download',
                current: index + 1,
                total,
                message: `正在删除云端分片 ${index + 1}/${total}`
            });
            await deleteObject([OBJECT_STORAGE_CHUNKS_DIR, packagePayload.chunkDir, chunk.fileName], `分片 ${chunk.fileName}`);
        }
    }

    onProgress?.({ stage: 'download', message: '正在删除云端存档包' });
    await deleteObject([OBJECT_STORAGE_SAVES_DIR, matched.fileName], '存档包');

    const beforeCount = manifest.saves.length;
    manifest.saves = manifest.saves.filter((item) => item.id !== matched.id && item.hash !== matched.hash && item.fileName !== matched.fileName);
    onProgress?.({ stage: 'manifest', message: '正在更新对象存储云端清单' });
    await 写入远端清单(normalized, manifest);
    onProgress?.({ stage: 'done', message: '对象存储 云存档删除完成' });
    return {
        removed: manifest.saves.length < beforeCount,
        deletedObjects,
        warnings,
        saves: manifest.saves
    };
};

export const 增量导入对象存储云存档 = async (
    config: 对象存储同步配置,
    items?: 对象存储云存档元数据[],
    onProgress?: 对象存储同步进度回调
): Promise<dbService.存档导入结果> => {
    const normalized = 规范化配置(config);
    if (!normalized) throw new Error('请填写对象存储端点、存储桶、Access Key 和 Secret Key');
    记录对象存储日志('开始增量导入云端存档', {
        prefix: 读取对象存储前缀(normalized),
        bucket: normalized.bucket,
        providedItemCount: Array.isArray(items) ? items.length : null
    });
    onProgress?.({ stage: 'manifest', message: '正在读取云端清单' });
    const manifest = Array.isArray(items)
        ? { saves: 整理对象存储清单存档列表(items).saves }
        : await 读取远端清单(normalized);
    const saves: 存档结构[] = [];
    const localSaves = await dbService.读取存档列表();
    const localHashSet = new Set(localSaves.map((save) => dbService.计算存档同步哈希(save)).filter(Boolean));
    const localSyncKeyStats = new Map<string, number>();
    localSaves.forEach((save) => {
        const key = 构建存档同步键(save);
        localSyncKeyStats.set(key, (localSyncKeyStats.get(key) || 0) + 1);
    });
    const cloudSaves = [...manifest.saves].sort((a, b) => Number(b.saveTimestamp || 0) - Number(a.saveTimestamp || 0));
    const downloadQueue = cloudSaves.filter((item) => {
        const cloudHash = 读取文本(item.hash);
        return !cloudHash || !localHashSet.has(cloudHash);
    });
    const skippedByLocalHash = cloudSaves.length - downloadQueue.length;
    记录对象存储日志('准备下载云端存档', {
        localCount: localSaves.length,
        cloudCount: cloudSaves.length,
        downloadQueueCount: downloadQueue.length,
        skippedByLocalHash,
        localSample: localSaves.slice(0, 8).map((save) => ({
            id: save.id,
            syncKey: 构建存档同步键(save),
            hashTail: dbService.计算存档摘要短哈希(save),
            syncHashTail: 哈希尾号(dbService.计算存档同步哈希(save)),
            timestamp: save.时间戳,
            title: save.角色数据?.姓名
        })),
        cloudSample: cloudSaves.slice(0, 12).map((item) => ({
            ...构建云存档日志摘要(item),
            localSameSyncKeyCount: localSyncKeyStats.get(读取元数据同步键(item)) || 0
        }))
    });
    for (let index = 0; index < downloadQueue.length; index += 1) {
        const item = downloadQueue[index];
        onProgress?.({
            stage: 'download',
            current: index + 1,
            total: downloadQueue.length,
            message: `正在下载云端存档 ${index + 1}/${downloadQueue.length}`
        });
        const { save, saves: downloadedSaves } = await 下载对象存储云存档(normalized, item);
        let addedFromPackage = 0;
        const packageSaves = downloadedSaves.length > 0 ? downloadedSaves : [save];
        for (const candidate of packageSaves) {
            const saveHash = dbService.计算存档同步哈希(candidate);
            if (saveHash && localHashSet.has(saveHash)) {
                continue;
            }
            if (saveHash) localHashSet.add(saveHash);
            saves.push(candidate);
            addedFromPackage += 1;
        }
        if (addedFromPackage <= 0) {
            记录对象存储日志('下载后跳过：本地已有云包内全部存档哈希', {
                cloud: 构建云存档日志摘要(item),
                saveHashTail: 哈希尾号(dbService.计算存档同步哈希(save))
            }, 'debug');
        }
    }
    if (saves.length <= 0) {
        onProgress?.({ stage: 'done', message: '对象存储 云存档增量导入完成' });
        记录对象存储日志('云端没有可下载存档', { cloudCount: cloudSaves.length, skippedByLocalHash }, 'warn');
        return { total: cloudSaves.length, imported: 0, skipped: skippedByLocalHash };
    }
    onProgress?.({ stage: 'prepare', message: '正在合并并去重导入本地存档', current: saves.length, total: saves.length });
    const result = await dbService.导入存档数据({ saves }, { 覆盖现有: false });
    onProgress?.({ stage: 'done', message: '对象存储 云存档增量导入完成' });
    记录对象存储日志('云端存档导入完成', {
        cloudCount: cloudSaves.length,
        downloadQueueCount: downloadQueue.length,
        skippedByLocalHash,
        downloaded: saves.length,
        imported: result.imported,
        skippedByLocalDedupe: result.skipped,
        downloadedSample: saves.slice(0, 12).map((save) => ({
            type: save.类型,
            timestamp: save.时间戳,
            title: save.角色数据?.姓名,
            location: save.环境信息?.具体地点,
            gameTime: save.环境信息?.时间,
            historyCount: Array.isArray(save.历史记录) ? save.历史记录.length : 0,
            hashTail: dbService.计算存档摘要短哈希(save),
            objectHashTail: 哈希尾号(save.元数据?.对象存储哈希)
        }))
    }, result.imported === 0 && cloudSaves.length > 0 ? 'warn' : 'info');
    return {
        total: cloudSaves.length,
        imported: result.imported,
        skipped: result.skipped + skippedByLocalHash
    };
};

export const __objectStorageSyncTestUtils = {
    recoverManifestFromSavePackages: 从存档包恢复清单,
    buildEmptyCloudSaveDiagnostic: 构建空云存档诊断
};
