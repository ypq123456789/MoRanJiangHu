
import { 存档结构 } from '../types';
import { 创建图片资源引用, 解析图片资源引用ID, 是否图片资源引用, 注册图片资源缓存, 批量注册图片资源缓存, 清空图片资源缓存 } from '../utils/imageAssets';
import { 获取设置项定义, 设置分类定义表, 设置键, type 设置分类类型 } from '../utils/settingsSchema';
import { 默认功能模型占位, 规范化接口设置 } from '../utils/apiConfig';

const DB_NAME = 'WuxiaGameDB';
const STORE_NAME = 'saves';
const SETTINGS_STORE = 'settings';
const IMAGE_ASSETS_STORE = 'image_assets';
const VERSION = 2;
const 自动存档最大保留数 = 5;
const 存档导出版本 = 1;
const 存档保护设置键 = 设置键.存档保护;
const 图片资源迁移版本键 = 设置键.图片资源迁移版本;
const 设置记录版本 = 2;

const 深拷贝 = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const 文本编码器 = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const 图片资源签名缓存 = new Map<string, string>();
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
}): string => {
    const type = save?.类型 === 'auto' ? 'auto' : 'manual';
    const ts = Math.max(0, Math.floor(safeNumber(save?.时间戳, 0)));
    const name = typeof save?.角色数据?.姓名 === 'string' ? save.角色数据.姓名.trim() : '';
    const envTime = 读取环境时间文本(save?.环境信息);
    const historyCount = Array.isArray(save?.历史记录) ? save.历史记录.length : 0;
    return `${type}|${ts}|${name}|${envTime}|${historyCount}`;
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
        当前角色锚点ID: typeof raw.当前角色锚点ID === 'string' ? raw.当前角色锚点ID : undefined
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
            if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(IMAGE_ASSETS_STORE)) {
                db.createObjectStore(IMAGE_ASSETS_STORE, { keyPath: 'id' });
            }
        };
    });
};

export const 保存图片资源 = async (dataUrl: string, preferredId?: string): Promise<string> => {
    const normalized = typeof dataUrl === 'string' ? dataUrl.trim() : '';
    if (!normalized) {
        throw new Error('保存图片资源失败：图片内容为空');
    }
    const signature = 生成图片资源签名(normalized);
    const cachedRef = signature ? 图片资源签名缓存.get(signature) : '';
    if (cachedRef) return cachedRef;
    const id = (typeof preferredId === 'string' ? preferredId.trim() : '') || 生成图片资源ID();
    const db = await 初始化数据库();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([IMAGE_ASSETS_STORE], 'readwrite');
        const store = transaction.objectStore(IMAGE_ASSETS_STORE);
        const request = store.put({
            id,
            dataUrl: normalized,
            createdAt: Date.now()
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
    注册图片资源缓存(id, normalized);
    const ref = 创建图片资源引用(id);
    if (signature) {
        图片资源签名缓存.set(signature, ref);
    }
    return ref;
};

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

export const 预热图片资源缓存 = async (): Promise<number> => {
    const db = await 初始化数据库();
    const entries = await new Promise<Array<{ id: string; dataUrl: string }>>((resolve, reject) => {
        const transaction = db.transaction([IMAGE_ASSETS_STORE], 'readonly');
        const store = transaction.objectStore(IMAGE_ASSETS_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(
            (Array.isArray(request.result) ? request.result : [])
                .map((item: any) => ({
                    id: typeof item?.id === 'string' ? item.id.trim() : '',
                    dataUrl: typeof item?.dataUrl === 'string' ? item.dataUrl.trim() : ''
                }))
                .filter((item) => item.id && item.dataUrl)
        );
        request.onerror = () => reject(request.error);
    });
    清空图片资源缓存();
    图片资源签名缓存.clear();
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
                if ((key === '本地路径' || key === '图片URL' || key === '背景图片' || key === '头像图片URL' || key.endsWith('图片URL') || key.endsWith('音频URL')) && /^data:(image|audio)\//i.test(text)) {
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

const 读取已引用图片资源ID集合 = async (): Promise<Set<string>> => {
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

    const refs = new Set<string>();
    saves.forEach((save) => 收集图片资源引用ID(save, refs));
    settings.forEach((item) => 收集图片资源引用ID(item?.value, refs));
    return refs;
};

export const 清理未引用图片资源 = async (): Promise<number> => {
    try {
        const [referencedIds, assetEntries] = await Promise.all([
            读取已引用图片资源ID集合(),
            读取全部图片资源记录()
        ]);
        const unusedIds = assetEntries
            .map((item) => item.id)
            .filter((id) => !referencedIds.has(id));
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

export const 维护自动存档 = async (db: IDBDatabase, maxKeep: number = 自动存档最大保留数): Promise<void> => {
    const keepCount = Math.max(0, Math.floor(maxKeep));
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const allSaves: 存档结构[] = request.result;
            const autoSaves = allSaves.filter(s => s.类型 === 'auto');
            
            // Sort by timestamp asc (oldest first)
            autoSaves.sort((a, b) => a.时间戳 - b.时间戳);

            if (autoSaves.length > keepCount) {
                const toDelete = autoSaves.slice(0, autoSaves.length - keepCount);
                toDelete.forEach(s => {
                    store.delete(s.id);
                });
            }
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
};

const 删除重复自动存档签名 = async (db: IDBDatabase, signature: string): Promise<void> => {
    const target = (signature || '').trim();
    if (!target) return;
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const allSaves: 存档结构[] = request.result;
            allSaves
                .filter((s) => s.类型 === 'auto' && (s.元数据?.自动存档签名 || '').trim() === target)
                .forEach((s) => {
                    store.delete(s.id);
                });
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
};

export const 保存存档 = async (存档: Omit<存档结构, 'id'>): Promise<number> => {
    const db = await 初始化数据库();
    const normalized = 清洗导入存档(存档);
    if (!normalized) {
        throw new Error('保存存档失败：存档数据结构不完整');
    }
    const persistedSave = await 外置化图片字段(normalized) as Omit<存档结构, 'id'>;

    if (persistedSave.类型 === 'auto') {
        const signature = (persistedSave.元数据?.自动存档签名 || '').trim();
        if (signature) {
            await 删除重复自动存档签名(db, signature);
        }
        await 维护自动存档(db, 自动存档最大保留数 - 1);
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(persistedSave);

        request.onsuccess = () => resolve(request.result as number);
        request.onerror = () => reject(request.error);
    });
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
    options?: { 覆盖现有?: boolean }
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
    if (options?.覆盖现有 && await 读取存档保护状态()) {
        throw new Error('存档保护已开启，请先在“设置-数据存储”中关闭后再执行覆盖导入。');
    }
    const existingSaves = options?.覆盖现有 ? [] : await 读取存档列表();
    const dedupeKeySet = new Set(existingSaves.map((item) => 构建存档去重键(item)));

    let imported = 0;
    let skipped = 0;

    const persistedCandidates: Array<Omit<存档结构, 'id'>> = [];
    for (const item of normalizedCandidates) {
        persistedCandidates.push(await 外置化图片字段(item) as Omit<存档结构, 'id'>);
    }

    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        if (options?.覆盖现有) {
            store.clear();
            dedupeKeySet.clear();
        }

        persistedCandidates.forEach((item) => {
            const key = 构建存档去重键(item);
            if (dedupeKeySet.has(key)) {
                skipped += 1;
                return;
            }
            dedupeKeySet.add(key);
            store.add(item);
            imported += 1;
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });

    await 维护自动存档(db, 自动存档最大保留数);

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

export const 读取存档 = async (id: number): Promise<存档结构> => {
    const db = await 初始化数据库();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const 删除存档 = async (id: number): Promise<void> => {
    if (await 读取存档保护状态()) {
        throw new Error('存档保护已开启，请先在“设置-数据存储”中关闭后再删除存档。');
    }
    const db = await 初始化数据库();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
    await 清理未引用图片资源();
};

export const 清空存档数据 = async (): Promise<void> => {
    if (await 读取存档保护状态()) {
        throw new Error('存档保护已开启，请先在“设置-数据存储”中关闭后再清空存档。');
    }
    const db = await 初始化数据库();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
    await 清理未引用图片资源();
};

export const 删除最近自动存档 = async (): Promise<void> => {
    if (await 读取存档保护状态()) {
        throw new Error('存档保护已开启，请先在“设置-数据存储”中关闭后再删除存档。');
    }
    const db = await 初始化数据库();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const allSaves: 存档结构[] = request.result;
            const latestAuto = allSaves
                .filter((s) => s.类型 === 'auto')
                .sort((a, b) => b.时间戳 - a.时间戳)[0];
            if (!latestAuto) {
                resolve();
                return;
            }
            const delReq = store.delete(latestAuto.id);
            delReq.onsuccess = () => resolve();
            delReq.onerror = () => reject(delReq.error);
        };
        request.onerror = () => reject(request.error);
    });
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
    const migrated = await 读取设置(图片资源迁移版本键);
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

    await 保存设置(图片资源迁移版本键, true);
    return { saves: migratedSaves, settings: migratedSettings };
};

export const 读取存档保护状态 = async (): Promise<boolean> => {
    const value = await 读取设置(存档保护设置键);
    return value === true;
};

export const 设置存档保护状态 = async (enabled: boolean): Promise<void> => {
    await 保存设置(存档保护设置键, enabled === true);
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

const 自定义背景天赋保护键 = [
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

export const 清空全部设置 = async (options?: { 保留APIKey?: boolean; 保留自定义背景天赋?: boolean }): Promise<void> => {
    const keepKeys = new Set<string>();
    if (options?.保留APIKey) keepKeys.add(设置键.API配置);
    if (options?.保留自定义背景天赋) {
        自定义背景天赋保护键.forEach((key) => keepKeys.add(key));
    }
    if (await 读取存档保护状态()) {
        keepKeys.add(存档保护设置键);
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

export const 获取详细存储信息 = async (): Promise<StorageBreakdown> => {
    const db = await 初始化数据库();

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
        自定义背景天赋保护键.forEach((key) => keepKeys.add(key));
    }
    if (存档保护开启) {
        keepKeys.add(存档保护设置键);
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
