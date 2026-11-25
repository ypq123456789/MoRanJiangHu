import * as dbService from './dbService';
import { recordDiagnosticLog } from './diagnosticLog';
import { submitLightweightDiagnosticReport } from './diagnosticReport';
import {
    读取云端游玩会话,
    加密字节,
    解密字节,
    callCloudPlayApi,
    type 云端游玩账号
} from './cloudPlayService';
import { 解析图片资源引用ID } from '../utils/imageAssets';
import { 设置键 } from '../utils/settingsSchema';

/**
 * 云端设置联机同步
 *
 * 账号登录后，把本机「多端通用设置 + 设置引用的小体积图片资源」加密打包上传到云端账号；
 * 登录 / 回到前台 / 应用启动时下载云端设置，按每个设置项的 updatedAt 做
 * last-write-wins 合并（不会用整包覆盖丢掉另一端的独有设置）。
 *
 * 严格内存与主线程约束：
 * 1. 绝不对 settings / image_assets 执行 store.getAll()：先只读键列表（<1KB），
 *    在反序列化前直接排除小说拆分原文库、后台拆分任务、NPC 撤销快照等本机百 MB 级数据。
 * 2. 逐键读取、单次序列化算哈希，超预算项立即丢弃引用让 GC 回收，绝不让多项大对象并存。
 * 3. 核心设置（含自定义开局预设/天赋/背景、API、游戏设置、主题等）优先打包，不被大体积世界书或图档挤占。
 * 4. 图片资源仅同步 data:image/*（跳过 data:audio/* 音频大文件）并设单张/总计硬上限。
 * 5. Base64 编解码采用 3 字节对齐（24KB）分块直出，消除逐字节拼接卡死与 Blink 384MB btoa 空串陷阱。
 * 6. 加密上传各阶段就地释放上一阶段缓冲区，峰值内存稳定控制在数十 MB 以内。
 */

const 云端设置格式 = 'moranjianghu-cloud-play-settings';
const 云端设置版本 = 1;
const 同步状态键前缀 = 'moranjianghu.cloudPlay.settingsSync.v1.';
const 自动上传防抖毫秒 = 1800;
const 启动初始同步延迟毫秒 = 1800;
const 前台同步冷却毫秒 = 10 * 1000;
/** 两次自动上传循环之间的最小间隔：留出 GC 喘息时间，避免连续重负载拖垮页面。 */
const 自动上传最小间隔毫秒 = 15 * 1000;

/** 严格体积预算（保障密文远低于服务端 24MB 上限，且绝不触发浏览器内存峰值） */
export const 单条设置最大同步字节数 = 4 * 1024 * 1024;
export const 设置总计最大同步字节数 = 8 * 1024 * 1024;
export const 单张图片资源最大同步字符数 = 2 * 1024 * 1024;
export const 图片资源总计最大同步字符数 = 6 * 1024 * 1024;
export const 设置包最大明文字节数 = 12 * 1024 * 1024;

/**
 * 本机专属 / 百 MB 级工作台与备份键：
 * 在调用 IndexedDB store.get(key) 之前直接跳过，确保浏览器绝不会把整本小说原文等反序列化进内存。
 */
const 云端设置本地排除键集合 = new Set<string>([
    设置键.小说分解数据集,
    设置键.小说分解任务,
    设置键.小说分解注入快照,
    设置键.小说模式包完善进度,
    设置键.NPC变量备份,
    设置键.开局提示词基线,
    设置键.图片资源迁移版本,
    'github_sync_token',
    'github_sync_repo'
]);

/** 核心优先同步键：无论世界书或场景图档多大，始终优先保证这些轻量关键设置入包。 */
const 高优先级设置键顺序: readonly string[] = [
    设置键.自定义开局预设,
    设置键.自定义天赋,
    设置键.自定义背景,
    设置键.应用主题,
    设置键.API配置,
    设置键.游戏设置,
    设置键.视觉设置,
    设置键.记忆设置,
    设置键.图片管理设置,
    设置键.自然文风设置,
    设置键.变量审查设置,
    设置键.存档保护,
    设置键.NPC变量自动备份,
    设置键.节日配置,
    设置键.提示词池,
    设置键.内置提示词,
    设置键.WebDAV同步配置,
    设置键.对象存储同步配置
];
const 高优先级设置键权重 = new Map<string, number>(
    高优先级设置键顺序.map((key, index) => [key, index])
);

/** 可能较大的次优先级键放到最后扫描，避免挤占核心配置预算。 */
const 低优先级大体积设置键集合 = new Set<string>([
    设置键.世界书列表,
    设置键.世界书预设组,
    设置键.音乐曲库,
    设置键.场景图片档案
]);

export const 是否跳过云端同步设置键 = (key: string): boolean => {
    const normalized = typeof key === 'string' ? key.trim() : '';
    return !normalized || 云端设置本地排除键集合.has(normalized);
};

const 排序待扫描设置键 = (keys: string[]): string[] => {
    const unique = Array.from(new Set(keys.map((k) => (typeof k === 'string' ? k.trim() : '')).filter((k) => !是否跳过云端同步设置键(k))));
    return unique.sort((a, b) => {
        const pa = 高优先级设置键权重.has(a) ? 高优先级设置键权重.get(a)! : (低优先级大体积设置键集合.has(a) ? 2000 : 1000);
        const pb = 高优先级设置键权重.has(b) ? 高优先级设置键权重.get(b)! : (低优先级大体积设置键集合.has(b) ? 2000 : 1000);
        if (pa !== pb) return pa - pb;
        return a.localeCompare(b);
    });
};

export type 云端设置进度阶段 = 'idle' | 'collect' | 'encrypt' | 'upload' | 'download' | 'decrypt' | 'merge' | 'done' | 'error';

export interface 云端设置同步进度 {
    stage: 云端设置进度阶段;
    message: string;
    settingCount?: number;
    assetCount?: number;
    changed?: number;
}

export interface 云端设置同步结果 {
    ok: boolean;
    direction?: 'upload' | 'download' | 'both';
    settingCount?: number;
    assetCount?: number;
    changed?: number;
    skipped?: boolean;
    skippedKeys?: string[];
    error?: string;
}

/** 面板可见的全局同步状态：后台静默同步也会更新，供状态面板订阅展示。 */
export interface 云端设置同步状态 {
    running: boolean;
    stage: 云端设置进度阶段;
    message: string;
    direction: 'upload' | 'download' | 'both' | null;
    settingCount: number;
    assetCount: number;
    changed: number;
    skippedOversizedCount?: number;
    skippedOversizedKeys?: string[];
    pendingUpload: boolean;
    lastUploadAt?: string;
    lastDownloadAt?: string;
    lastError?: string;
    updatedAt: string;
}

type 设置条目 = {
    key: string;
    value: unknown;
    updatedAt: number;
};

type 图片资源条目 = {
    id: string;
    dataUrl: string;
    createdAt: number;
};

type 删除墓碑 = { key: string; deletedAt: number };

type 云端设置包 = {
    format: typeof 云端设置格式;
    version: number;
    userId: string;
    savedAt: string;
    settings: 设置条目[];
    assets: 图片资源条目[];
    deletions?: 删除墓碑[];
};

type 同步状态 = {
    lastUploadAt?: string;
    lastDownloadAt?: string;
    lastUploadHash?: string;
    lastUploadFingerprint?: string;
    pendingUpload?: boolean;
};

const 文本编码器 = new TextEncoder();
const 文本解码器 = new TextDecoder();

const 读取字符串 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const 安全数字 = (value: unknown, fallback = 0): number => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const 是同步图片DataUrl = (value: string): boolean => /^data:image\//i.test(value);

/** 零分配估算 UTF-8 字节数，避免为超长字符串分配临时 Uint8Array。 */
const 估算UTF8字节数 = (text: string): number => {
    let bytes = 0;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code < 0x80) bytes += 1;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff) {
            bytes += 4;
            index += 1;
        } else {
            bytes += 3;
        }
    }
    return bytes;
};

const 让出主线程 = (): Promise<void> => new Promise((resolve) => {
    setTimeout(resolve, 0);
});

// ── 全局同步状态（面板数据源） ──────────────────────────────────────

const 当前同步状态: {
    running: boolean;
    stage: 云端设置进度阶段;
    message: string;
    direction: 'upload' | 'download' | 'both' | null;
    settingCount: number;
    assetCount: number;
    changed: number;
    skippedOversizedCount: number;
    skippedOversizedKeys: string[];
    lastError?: string;
} = {
    running: false,
    stage: 'idle',
    message: '',
    direction: null,
    settingCount: 0,
    assetCount: 0,
    changed: 0,
    skippedOversizedCount: 0,
    skippedOversizedKeys: []
};

type 同步状态监听器 = (status: 云端设置同步状态) => void;
const 同步状态监听器集合 = new Set<同步状态监听器>();

const 构建同步状态快照 = (): 云端设置同步状态 => {
    const session = 读取云端游玩会话();
    const stored = session ? 读取同步状态(session) : {};
    return {
        running: 当前同步状态.running,
        stage: 当前同步状态.stage,
        message: 当前同步状态.message,
        direction: 当前同步状态.direction,
        settingCount: 当前同步状态.settingCount,
        assetCount: 当前同步状态.assetCount,
        changed: 当前同步状态.changed,
        skippedOversizedCount: 当前同步状态.skippedOversizedCount,
        skippedOversizedKeys: [...当前同步状态.skippedOversizedKeys],
        pendingUpload: stored.pendingUpload === true,
        lastUploadAt: stored.lastUploadAt,
        lastDownloadAt: stored.lastDownloadAt,
        lastError: 当前同步状态.lastError,
        updatedAt: new Date().toISOString()
    };
};

const 通知同步状态监听器 = (): void => {
    const snapshot = 构建同步状态快照();
    同步状态监听器集合.forEach((fn) => {
        try { fn(snapshot); } catch (error) { console.warn('同步状态监听失败:', error); }
    });
};

const 更新同步状态 = (
    patch: Partial<Omit<云端设置同步状态, 'pendingUpload' | 'lastUploadAt' | 'lastDownloadAt' | 'updatedAt'>>
): void => {
    if ('running' in patch) 当前同步状态.running = Boolean(patch.running);
    if (patch.stage !== undefined) 当前同步状态.stage = patch.stage;
    if (patch.message !== undefined) 当前同步状态.message = patch.message;
    if (patch.direction !== undefined) 当前同步状态.direction = patch.direction;
    if (patch.settingCount !== undefined) 当前同步状态.settingCount = patch.settingCount;
    if (patch.assetCount !== undefined) 当前同步状态.assetCount = patch.assetCount;
    if (patch.changed !== undefined) 当前同步状态.changed = patch.changed;
    if (patch.skippedOversizedCount !== undefined) 当前同步状态.skippedOversizedCount = patch.skippedOversizedCount;
    if (patch.skippedOversizedKeys !== undefined) 当前同步状态.skippedOversizedKeys = [...patch.skippedOversizedKeys];
    if ('lastError' in patch) 当前同步状态.lastError = patch.lastError;
    通知同步状态监听器();
};

/** 订阅全局同步状态（含后台静默同步）。返回取消订阅函数。 */
export const 订阅云端设置同步状态 = (listener: 同步状态监听器): (() => void) => {
    同步状态监听器集合.add(listener);
    listener(构建同步状态快照());
    return () => { 同步状态监听器集合.delete(listener); };
};

/** 读取当前全局同步状态快照。 */
export const 读取云端设置同步状态 = (): 云端设置同步状态 => 构建同步状态快照();

// ── 本地同步状态（localStorage，按账号隔离） ─────────────────────────

const 同步状态键 = (session: 云端游玩账号): string => `${同步状态键前缀}${session.userId || session.username}`;

const 读取同步状态 = (session: 云端游玩账号): 同步状态 => {
    try {
        const parsed = JSON.parse(localStorage.getItem(同步状态键(session)) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const 写入同步状态 = (session: 云端游玩账号, next: 同步状态): void => {
    try {
        localStorage.setItem(同步状态键(session), JSON.stringify({ ...读取同步状态(session), ...next }));
        通知同步状态监听器();
    } catch {
        // 本地状态写入失败不影响同步本身
    }
};

const 墓碑存储键 = (session: 云端游玩账号): string => `${同步状态键前缀}deletions.${session.userId || session.username}`;
const 墓碑保留天数 = 30;

const 读取本地墓碑 = (session: 云端游玩账号): 删除墓碑[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(墓碑存储键(session)) || '[]');
        if (!Array.isArray(parsed)) return [];
        const cutoff = Date.now() - 墓碑保留天数 * 24 * 60 * 60 * 1000;
        return parsed
            .filter((item: any) => {
                const key = 读取字符串(item?.key);
                return Boolean(key) && !是否跳过云端同步设置键(key) && 安全数字(item?.deletedAt, 0) > cutoff;
            })
            .map((item: any) => ({ key: 读取字符串(item.key), deletedAt: 安全数字(item.deletedAt, 0) }));
    } catch {
        return [];
    }
};

const 写入本地墓碑 = (session: 云端游玩账号, deletions: 删除墓碑[]): void => {
    try {
        const merged = new Map<string, number>();
        [...读取本地墓碑(session), ...deletions].forEach((item) => {
            if (item.key && !是否跳过云端同步设置键(item.key)) {
                merged.set(item.key, Math.max(merged.get(item.key) || 0, item.deletedAt));
            }
        });
        localStorage.setItem(墓碑存储键(session), JSON.stringify(
            Array.from(merged.entries()).map(([key, deletedAt]) => ({ key, deletedAt }))
        ));
    } catch {
        // ignore
    }
};

const 记录删除墓碑 = (key: string): void => {
    if (是否跳过云端同步设置键(key)) return;
    const session = 读取云端游玩会话();
    if (!session) return;
    写入本地墓碑(session, [{ key: key.trim(), deletedAt: Date.now() }]);
};

/** 云端回填独立通道：useGameState / 开局向导据此刷新内存状态，不经过 订阅设置变更，避免自动上传回环。 */
type 云端回填监听器 = (keys: string[]) => void;
const 云端回填监听器集合 = new Set<云端回填监听器>();

export const 订阅云端设置回填 = (listener: 云端回填监听器): (() => void) => {
    云端回填监听器集合.add(listener);
    return () => { 云端回填监听器集合.delete(listener); };
};

const 通知云端设置回填 = (keys: string[]): void => {
    if (keys.length === 0) return;
    云端回填监听器集合.forEach((fn) => {
        try { fn(keys); } catch (error) { console.warn('云端设置回填通知失败:', error); }
    });
};

// ── 分块编解码工具（零超大中间字符串） ──────────────────────────────

export const base64编码 = (bytes: Uint8Array): string => {
    if (bytes.length === 0) return '';
    // 24576 = 3 * 8192：3 的整数倍保证非末块独立 btoa 无 '=' 填充，
    // 既不构造整块超大 binary 字符串，也不触发 Blink >=384MB btoa 空串与 WebView 参数栈限制。
    const chunkSize = 24576;
    const parts: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const sub = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
        parts.push(btoa(String.fromCharCode.apply(null, sub as unknown as number[])));
    }
    return parts.join('');
};

export const base64解码 = (value: string): Uint8Array => {
    const normalized = value.replace(/\s+/g, '');
    if (!normalized) return new Uint8Array(0);
    const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
    const totalBytes = Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
    const bytes = new Uint8Array(totalBytes);
    const chunkChars = 32768; // 4 * 8192
    let writeOffset = 0;
    for (let offset = 0; offset < normalized.length; offset += chunkChars) {
        const binary = atob(normalized.slice(offset, offset + chunkChars));
        for (let index = 0; index < binary.length; index += 1) {
            bytes[writeOffset] = binary.charCodeAt(index);
            writeOffset += 1;
        }
    }
    return writeOffset === bytes.length ? bytes : bytes.subarray(0, writeOffset);
};

const 收集图片资源引用ID = (value: unknown, refs: Set<string>, seen: WeakSet<object> = new WeakSet()): void => {
    const refId = 解析图片资源引用ID(value);
    if (refId) {
        refs.add(refId);
        return;
    }
    if (!value || typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);
    if (Array.isArray(value)) {
        value.forEach((item) => 收集图片资源引用ID(item, refs, seen));
        return;
    }
    Object.values(value as Record<string, unknown>).forEach((child) => 收集图片资源引用ID(child, refs, seen));
};

/** 云端包损坏（密钥变更 / 旧版残留 / 半截数据）：可自愈——以本机设置为准覆盖上传。 */
class 云端设置包损坏错误 extends Error {}

/** 判断上传失败是否属于网络/服务端瞬态故障（只有瞬态故障才置 pendingUpload 自动重试，避免本地永久错误死循环）。 */
const 是否可自动重试上传错误 = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error || '');
    if (/缺少加密凭据|用户名或密码错误|账号已切换|加密结果为空|设置内容过大|设置内容为空/.test(message)) {
        return false;
    }
    return true;
};

// ── 同步诊断埋点（远程可查，仅记录体积/阶段/错误，绝不记录密码或设置正文） ──

const 诊断去重键 = 'moranjianghu.cloudSettingsSync.diagnosticReported';
const 记录同步诊断 = (stage: string, detail: Record<string, unknown>): void => {
    recordDiagnosticLog('info', [`[cloud-settings-sync] ${stage}`, detail]);
};

/** 同步失败时自动上报一次诊断（同一错误只报一次），便于远程定位用户侧问题。 */
const 上报同步失败诊断 = (stage: string, error: unknown, detail: Record<string, unknown>): void => {
    const reason = error instanceof Error ? error.message : String(error);
    const dedupe = `${stage}:${reason}`;
    try {
        const last = localStorage.getItem(诊断去重键) || '';
        if (last === dedupe) return;
        localStorage.setItem(诊断去重键, dedupe);
    } catch { /* 存储失败仍尝试上报 */ }
    recordDiagnosticLog('error', [
        `[cloud-settings-sync] ${stage} 失败`,
        { reason, ...detail }
    ]);
    void submitLightweightDiagnosticReport(`cloud-settings-sync ${stage}`).catch(() => undefined);
};

/** 简易非加密哈希，仅用于判断本地设置快照是否变化，避免重复上传。 */
const 快照哈希文本 = (value: string): string => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
};

/** 把多个小哈希组合成一个总指纹，避免构造整包大字符串。 */
const 组合哈希 = (parts: string[]): string => 快照哈希文本(parts.join('\u0001'));

const 规范化设置包 = (raw: any, session: 云端游玩账号): 云端设置包 | null => {
    if (!raw || raw.format !== 云端设置格式 || !Array.isArray(raw.settings)) return null;
    const settings: 设置条目[] = [];
    const seenKeys = new Set<string>();
    for (const item of raw.settings) {
        const key = 读取字符串(item?.key);
        if (!key || seenKeys.has(key) || 是否跳过云端同步设置键(key)) continue;
        seenKeys.add(key);
        settings.push({
            key,
            value: item.value,
            updatedAt: Math.max(0, 安全数字(item?.updatedAt, 0))
        });
    }
    const rawAssets = Array.isArray(raw.assets) ? raw.assets : [];
    const assets: 图片资源条目[] = [];
    const seenAssetIds = new Set<string>();
    for (const item of rawAssets) {
        const id = 读取字符串(item?.id);
        const dataUrl = 读取字符串(item?.dataUrl);
        if (!id || !dataUrl || seenAssetIds.has(id) || !是同步图片DataUrl(dataUrl)) continue;
        seenAssetIds.add(id);
        assets.push({
            id,
            dataUrl,
            createdAt: Math.max(0, 安全数字(item?.createdAt, Date.now()))
        });
    }
    const rawDeletions = Array.isArray(raw.deletions) ? raw.deletions : [];
    const deletions: 删除墓碑[] = rawDeletions
        .map((item: any) => ({ key: 读取字符串(item?.key), deletedAt: 安全数字(item?.deletedAt, 0) }))
        .filter((item: 删除墓碑) => Boolean(item.key) && !是否跳过云端同步设置键(item.key) && item.deletedAt > 0);

    return {
        format: 云端设置格式,
        version: 云端设置版本,
        userId: 读取字符串(raw.userId) || session.userId,
        savedAt: 读取字符串(raw.savedAt) || new Date().toISOString(),
        settings,
        assets,
        deletions
    };
};

// ── 逐键流式扫描（兼容测试替身） ────────────────────────────────────

const 读取待同步设置键列表 = async (): Promise<{
    keys: string[];
    fallbackRecords: Map<string, { key: string; value: any; updatedAt: number }> | null;
}> => {
    const dbAny = dbService as typeof dbService & {
        读取设置键列表?: () => Promise<string[]>;
        读取单条设置记录?: (key: string) => Promise<{ key: string; value: any; updatedAt: number } | null>;
    };
    if (typeof dbAny.读取设置键列表 === 'function' && typeof dbAny.读取单条设置记录 === 'function') {
        const rawKeys = await dbAny.读取设置键列表();
        return { keys: 排序待扫描设置键(rawKeys), fallbackRecords: null };
    }
    const snapshot = await dbService.读取设置一致性快照();
    const map = new Map<string, { key: string; value: any; updatedAt: number }>();
    snapshot.forEach((item) => {
        const key = 读取字符串(item?.key);
        if (!key || 是否跳过云端同步设置键(key)) return;
        map.set(key, { key, value: item.value, updatedAt: Math.max(0, 安全数字(item.updatedAt, 0)) });
    });
    return { keys: 排序待扫描设置键(Array.from(map.keys())), fallbackRecords: map };
};

const 按键读取单条设置 = async (
    key: string,
    fallbackRecords: Map<string, { key: string; value: any; updatedAt: number }> | null
): Promise<{ key: string; value: any; updatedAt: number } | null> => {
    if (fallbackRecords) return fallbackRecords.get(key) || null;
    const record = await dbService.读取单条设置记录(key);
    if (!record) return null;
    return {
        key: record.key,
        value: record.value,
        updatedAt: Math.max(0, 安全数字(record.updatedAt, 0))
    };
};

const 按ID读取单条图片资源 = async (
    id: string,
    batchFallbackCache?: Map<string, 图片资源条目> | null
): Promise<图片资源条目 | null> => {
    if (batchFallbackCache) return batchFallbackCache.get(id) || null;
    const dbAny = dbService as typeof dbService & {
        读取单条图片资源原始记录?: (assetId: string) => Promise<图片资源条目 | null>;
    };
    if (typeof dbAny.读取单条图片资源原始记录 === 'function') {
        return dbAny.读取单条图片资源原始记录(id);
    }
    const list = await dbService.读取图片资源原始列表([id]);
    return list[0] || null;
};

type 扫描结果 = {
    fingerprint: string;
    settingHashParts: string[];
    assetIds: string[];
    settings: 设置条目[];
    skippedKeys: string[];
    totalSettingBytes: number;
};

/**
 * 逐键扫描可同步设置：
 * - retainValues=false（预检模式）：每次在内存里只存活 1 个设置项，算完哈希立即释放，峰值内存仅为单条设置大小。
 * - retainValues=true（打包模式）：保留在预算内的设置项，超预算项立即跳过并释放引用。
 */
const 扫描可同步设置 = async (
    session: 云端游玩账号,
    options: { retainValues: boolean }
): Promise<扫描结果> => {
    const { keys, fallbackRecords } = await 读取待同步设置键列表();
    const settingHashParts: string[] = [];
    const assetIdSet = new Set<string>();
    const settings: 设置条目[] = [];
    const skippedKeys: string[] = [];
    let totalSettingBytes = 0;
    let lastYieldAt = Date.now();

    for (const key of keys) {
        const record = await 按键读取单条设置(key, fallbackRecords);
        if (!record) continue;

        let serialized = '';
        try {
            serialized = JSON.stringify(record.value) ?? 'null';
        } catch {
            skippedKeys.push(key);
            continue;
        }

        const itemBytes = 估算UTF8字节数(serialized) + 估算UTF8字节数(key) + 48;
        if (itemBytes > 单条设置最大同步字节数 || totalSettingBytes + itemBytes > 设置总计最大同步字节数) {
            skippedKeys.push(key);
            serialized = '';
            if (Date.now() - lastYieldAt >= 16) {
                await 让出主线程();
                lastYieldAt = Date.now();
            }
            continue;
        }

        totalSettingBytes += itemBytes;
        const valueHash = 快照哈希文本(serialized);
        serialized = '';
        settingHashParts.push(`s:${key}:${record.updatedAt}:${valueHash}`);
        收集图片资源引用ID(record.value, assetIdSet);

        if (options.retainValues) {
            settings.push({
                key,
                value: record.value,
                updatedAt: record.updatedAt
            });
        }

        if (Date.now() - lastYieldAt >= 16) {
            await 让出主线程();
            lastYieldAt = Date.now();
        }
    }

    const sortedAssetIds = Array.from(assetIdSet).sort();
    const fingerprintParts = [...settingHashParts];
    sortedAssetIds.forEach((id) => fingerprintParts.push(`a:${id}`));
    读取本地墓碑(session).forEach((item) => fingerprintParts.push(`d:${item.key}:${item.deletedAt}`));

    return {
        fingerprint: 组合哈希(fingerprintParts),
        settingHashParts,
        assetIds: sortedAssetIds,
        settings,
        skippedKeys,
        totalSettingBytes
    };
};

/** 上传预检：逐键计算指纹，不保留设置值、不读取图片正文，无变化零网络零打包开销。 */
const 计算本地指纹 = async (session: 云端游玩账号): Promise<string> => (
    (await 扫描可同步设置(session, { retainValues: false })).fingerprint
);

// ── 打包 / 解包 ─────────────────────────────────────────────────────

type 本地打包结果 = {
    pack: 云端设置包;
    fingerprint: string;
    hash: string;
    skippedKeys: string[];
    skippedAssets: string[];
    totalSettingBytes: number;
    totalAssetChars: number;
};

const 构建本地设置包 = async (session: 云端游玩账号): Promise<本地打包结果> => {
    const scan = await 扫描可同步设置(session, { retainValues: true });
    const assets: 图片资源条目[] = [];
    const skippedAssets: string[] = [];
    let totalAssetChars = 0;
    let lastYieldAt = Date.now();

    const dbAny = dbService as typeof dbService & {
        读取单条图片资源原始记录?: (assetId: string) => Promise<图片资源条目 | null>;
    };
    let batchFallbackCache: Map<string, 图片资源条目> | null = null;
    if (typeof dbAny.读取单条图片资源原始记录 !== 'function' && scan.assetIds.length > 0) {
        const list = await dbService.读取图片资源原始列表(scan.assetIds);
        batchFallbackCache = new Map(list.map((item) => [item.id, item]));
    }

    for (const id of scan.assetIds) {
        const item = await 按ID读取单条图片资源(id, batchFallbackCache);
        if (!item || !item.dataUrl) continue;
        // 仅同步图片 dataUrl，跳过音乐曲库外置化的 data:audio/* 大音频与超预算大图
        if (!是同步图片DataUrl(item.dataUrl)) {
            skippedAssets.push(id);
            continue;
        }
        const len = item.dataUrl.length;
        if (len > 单张图片资源最大同步字符数 || totalAssetChars + len > 图片资源总计最大同步字符数) {
            skippedAssets.push(id);
            continue;
        }
        totalAssetChars += len;
        assets.push({
            id: item.id,
            dataUrl: item.dataUrl,
            createdAt: Math.max(0, 安全数字(item.createdAt, Date.now()))
        });
        if (Date.now() - lastYieldAt >= 16) {
            await 让出主线程();
            lastYieldAt = Date.now();
        }
    }

    const deletions = 读取本地墓碑(session);
    const hashParts = [...scan.settingHashParts];
    assets.forEach((item) => hashParts.push(`a:${item.id}:${item.dataUrl.length}:${item.createdAt}`));
    deletions.forEach((item) => hashParts.push(`d:${item.key}:${item.deletedAt}`));
    const hash = 组合哈希(hashParts);

    const pack: 云端设置包 = {
        format: 云端设置格式,
        version: 云端设置版本,
        userId: session.userId,
        savedAt: new Date().toISOString(),
        settings: scan.settings,
        assets,
        deletions
    };

    记录同步诊断('collect', {
        settings: scan.settings.length,
        settingKeys: scan.settings.map((item) => item.key).slice(0, 40),
        settingBytes: scan.totalSettingBytes,
        skippedKeys: scan.skippedKeys.slice(0, 20),
        assetRefs: scan.assetIds.length,
        assetsLoaded: assets.length,
        skippedAssets: skippedAssets.length,
        assetChars: totalAssetChars,
        deletions: deletions.length
    });

    return {
        pack,
        fingerprint: scan.fingerprint,
        hash,
        skippedKeys: scan.skippedKeys,
        skippedAssets,
        totalSettingBytes: scan.totalSettingBytes,
        totalAssetChars
    };
};

const 解密为设置包 = async (payload: string, session: 云端游玩账号): Promise<云端设置包 | null> => {
    try {
        const encryptedBytes = base64解码(payload);
        const plainBytes = await 解密字节(encryptedBytes, session);
        const parsed = JSON.parse(文本解码器.decode(plainBytes));
        return 规范化设置包(parsed, session);
    } catch (error: any) {
        throw new 云端设置包损坏错误(`云端设置包无法解密：${error?.message || String(error)}`);
    }
};

const 按键条件静默删除 = async (key: string, maxUpdatedAt: number): Promise<boolean> => {
    const dbAny = dbService as typeof dbService & {
        条件静默删除设置?: (targetKey: string, targetMaxUpdatedAt: number) => Promise<boolean>;
        读取单条设置记录?: (targetKey: string) => Promise<{ key: string; value: any; updatedAt: number } | null>;
    };
    if (typeof dbAny.条件静默删除设置 === 'function') {
        return dbAny.条件静默删除设置(key, maxUpdatedAt);
    }
    if (typeof dbAny.读取单条设置记录 === 'function') {
        const existing = await dbAny.读取单条设置记录(key);
        if (!existing || existing.updatedAt >= maxUpdatedAt) return false;
        await dbService.静默删除设置(key);
        return true;
    }
    const manifest = await dbService.获取设置管理清单();
    const matched = manifest.find((item) => item.key === key);
    const localTime = matched ? Math.max(0, 安全数字(matched.updatedAt, 0)) : undefined;
    if (localTime === undefined) {
        await dbService.静默删除设置(key);
        return true;
    }
    if (localTime < maxUpdatedAt) {
        await dbService.静默删除设置(key);
        return true;
    }
    return false;
};

const 合并设置包到本地 = async (
    session: 云端游玩账号,
    pack: 云端设置包
): Promise<{ changed: number; assetCount: number; changedKeys: string[] }> => {
    let changed = 0;
    const changedKeys: string[] = [];

    // 1. 先应用删除墓碑（逐键条件删除，绝不调用全表 getAll 扫描）
    const remoteDeletions = (pack.deletions || []).filter((d) => !是否跳过云端同步设置键(d.key));
    for (const deletion of remoteDeletions) {
        const deleted = await 按键条件静默删除(deletion.key, deletion.deletedAt);
        if (deleted) {
            changed += 1;
            changedKeys.push(deletion.key);
        }
    }
    if (remoteDeletions.length > 0) 写入本地墓碑(session, remoteDeletions);

    // 2. 先写图片资源再写设置：同 ID 资源只接受较新 createdAt，逐项比对避免全量加载
    const assetsToWrite: 图片资源条目[] = [];
    const dbAny = dbService as typeof dbService & {
        读取单条图片资源原始记录?: (assetId: string) => Promise<图片资源条目 | null>;
    };
    if (pack.assets.length > 0) {
        if (typeof dbAny.读取单条图片资源原始记录 === 'function') {
            for (const item of pack.assets) {
                if (!是同步图片DataUrl(item.dataUrl) || item.dataUrl.length > 单张图片资源最大同步字符数) continue;
                const local = await dbAny.读取单条图片资源原始记录(item.id);
                if (!local || local.createdAt < item.createdAt) {
                    assetsToWrite.push(item);
                }
            }
        } else {
            const localAssets = await dbService.读取图片资源原始列表(pack.assets.map((item) => item.id));
            const localAssetTimes = new Map(localAssets.map((item) => [item.id, item.createdAt]));
            pack.assets.forEach((item) => {
                if (!是同步图片DataUrl(item.dataUrl) || item.dataUrl.length > 单张图片资源最大同步字符数) return;
                const localTime = localAssetTimes.get(item.id);
                if (localTime === undefined || localTime < item.createdAt) {
                    assetsToWrite.push(item);
                }
            });
        }
    }
    const assetCount = assetsToWrite.length > 0 ? await dbService.写入图片资源原始列表(assetsToWrite) : 0;

    // 3. 逐键条件写入设置（条件静默保存设置在同一事务内原子比较 updatedAt）
    for (const item of pack.settings) {
        if (是否跳过云端同步设置键(item.key)) continue;
        const applied = await dbService.条件静默保存设置(item.key, item.value, item.updatedAt);
        if (applied) {
            changed += 1;
            changedKeys.push(item.key);
        }
    }

    return { changed, assetCount, changedKeys: Array.from(new Set(changedKeys)) };
};

// ── 上传 ────────────────────────────────────────────────────────────

const 上传设置到云端 = async (
    session: 云端游玩账号,
    onProgress?: (progress: 云端设置同步进度) => void
): Promise<{ ok: boolean; settingCount: number; assetCount: number; skippedKeys?: string[]; error?: string }> => {
    const generation = 生命周期代次;
    try {
        if (!session?.password || !session?.clientSalt) {
            throw new Error('云端账号会话缺少加密凭据，请退出后重新登录云端账号再同步。');
        }
        更新同步状态({ stage: 'collect', message: '正在整理本机设置...', direction: 'upload' });
        onProgress?.({ stage: 'collect', message: '正在整理本机设置...' });

        const built = await 构建本地设置包(session);
        const settingCount = built.pack.settings.length;
        const assetCount = built.pack.assets.length;
        const skippedOversizedKeys = [...built.skippedKeys];
        const skippedOversizedCount = built.skippedKeys.length + built.skippedAssets.length;

        if (!任务仍有效(generation, session)) {
            return { ok: false, settingCount: 0, assetCount: 0, error: '账号已切换，本次上传已取消' };
        }

        const state = 读取同步状态(session);
        if (state.lastUploadHash === built.hash) {
            写入同步状态(session, { lastUploadFingerprint: built.fingerprint, pendingUpload: false });
            更新同步状态({
                stage: 'done',
                message: '设置无变化，已跳过上传',
                settingCount,
                assetCount,
                skippedOversizedCount,
                skippedOversizedKeys,
                lastError: undefined
            });
            onProgress?.({ stage: 'done', message: '设置无变化，已跳过上传', settingCount, assetCount });
            return { ok: true, settingCount, assetCount, skippedKeys: skippedOversizedKeys };
        }

        更新同步状态({
            stage: 'encrypt',
            message: '正在加密设置数据...',
            settingCount,
            assetCount,
            skippedOversizedCount,
            skippedOversizedKeys
        });
        onProgress?.({ stage: 'encrypt', message: '正在加密设置数据...', settingCount, assetCount });

        // 逐阶段立即释放上一阶段大对象引用，确保堆内最多只存在当前阶段与下一阶段两份数据
        let plain = JSON.stringify(built.pack);
        built.pack.settings = [];
        built.pack.assets = [];
        const plainChars = plain.length;

        let plainBytes = 文本编码器.encode(plain);
        plain = '';
        const plainByteLength = plainBytes.byteLength;

        if (plainByteLength > 设置包最大明文字节数) {
            plainBytes = new Uint8Array(0);
            throw new Error(`设置内容过大（${Math.round(plainByteLength / 1024 / 1024)}MB），已中止上传以保护浏览器内存。`);
        }

        let encryptedBytes: Uint8Array = new Uint8Array(0);
        let encryptError = '';
        try {
            encryptedBytes = await 加密字节(plainBytes, session);
        } catch (error: any) {
            encryptError = error?.message || String(error);
        }
        plainBytes = new Uint8Array(0);

        const encryptedByteLength = encryptedBytes.byteLength;
        const payload = encryptedByteLength > 0 ? base64编码(encryptedBytes) : '';
        encryptedBytes = new Uint8Array(0);

        记录同步诊断('encrypt', {
            plainChars,
            plainBytes: plainByteLength,
            encryptedBytes: encryptedByteLength,
            finalBase64Length: payload.length,
            encryptError,
            skippedKeys: skippedOversizedKeys,
            skippedAssets: built.skippedAssets.length,
            saltChars: session.clientSalt.length,
            passwordChars: session.password.length,
            cryptoAvailable: typeof crypto !== 'undefined' && Boolean(crypto.subtle)
        });

        if (!payload) {
            throw new Error(
                `本机设置加密结果为空，已中止上传（未损坏云端数据）。诊断：明文 ${plainByteLength} 字节 / 密文 ${encryptedByteLength} 字节 / 错误 ${encryptError || '无'}`
            );
        }

        更新同步状态({ stage: 'upload', message: '正在上传设置到云端...' });
        onProgress?.({ stage: 'upload', message: '正在上传设置到云端...', settingCount, assetCount });
        await callCloudPlayApi('settings-upload', {
            username: session.username,
            password: session.password,
            payload
        });
        if (!任务仍有效(generation, session)) {
            return { ok: false, settingCount: 0, assetCount: 0, error: '账号已切换，本次上传已取消' };
        }

        const now = new Date().toISOString();
        写入同步状态(session, {
            lastUploadAt: now,
            lastUploadHash: built.hash,
            lastUploadFingerprint: built.fingerprint,
            pendingUpload: false
        });
        const doneMessage = skippedOversizedCount > 0
            ? `设置已同步到云端（已自动跳过 ${skippedOversizedCount} 项超大本地资源）`
            : '设置已同步到云端';
        更新同步状态({
            stage: 'done',
            message: doneMessage,
            settingCount,
            assetCount,
            skippedOversizedCount,
            skippedOversizedKeys,
            lastError: undefined
        });
        onProgress?.({ stage: 'done', message: doneMessage, settingCount, assetCount });
        return { ok: true, settingCount, assetCount, skippedKeys: skippedOversizedKeys };
    } catch (error: any) {
        const message = error?.message || String(error);
        const retryable = 是否可自动重试上传错误(error);
        if (任务仍有效(generation, session)) {
            写入同步状态(session, { pendingUpload: retryable });
        }
        const statusMsg = retryable
            ? `设置上传失败：${message}，将在恢复网络后重试`
            : `设置上传失败：${message}`;
        更新同步状态({ stage: 'error', message: statusMsg, lastError: message });
        onProgress?.({ stage: 'error', message: statusMsg });
        上报同步失败诊断('upload', error, {
            message,
            retryable,
            account: session.username,
            cryptoAvailable: typeof crypto !== 'undefined' && Boolean(crypto.subtle)
        });
        return { ok: false, settingCount: 0, assetCount: 0, error: message };
    }
};

// ── 下载 ────────────────────────────────────────────────────────────

const 下载并合并云端设置 = async (
    session: 云端游玩账号,
    onProgress?: (progress: 云端设置同步进度) => void,
    options?: { silent?: boolean }
): Promise<{ ok: boolean; exists: boolean; changed: number; assetCount: number; settingCount: number; corrupt?: boolean; error?: string }> => {
    const generation = 生命周期代次;
    const emit = (progress: 云端设置同步进度): void => {
        更新同步状态({
            stage: progress.stage,
            message: progress.message,
            settingCount: progress.settingCount,
            assetCount: progress.assetCount,
            changed: progress.changed,
            direction: 'download'
        });
        if (!options?.silent) onProgress?.(progress);
    };
    try {
        emit({ stage: 'download', message: '正在读取云端设置...' });
        const payload = await callCloudPlayApi('settings-download', {
            username: session.username,
            password: session.password
        });
        if (!payload?.exists || !读取字符串(payload.payload)) {
            emit({ stage: 'done', message: '云端暂无设置，将以本机设置为准' });
            return { ok: true, exists: false, changed: 0, assetCount: 0, settingCount: 0 };
        }
        emit({ stage: 'decrypt', message: '正在解密云端设置...' });
        const pack = await 解密为设置包(读取字符串(payload.payload), session);
        if (!pack) throw new 云端设置包损坏错误('云端设置包格式无效。');
        if (!任务仍有效(generation, session)) {
            return { ok: false, exists: false, changed: 0, assetCount: 0, settingCount: 0, error: '账号已切换，本次下载已取消' };
        }
        const totalSettingCount = pack.settings.length;
        emit({ stage: 'merge', message: '正在合并云端设置...', settingCount: totalSettingCount, assetCount: pack.assets.length });
        const { changed, assetCount, changedKeys } = await 合并设置包到本地(session, pack);
        pack.settings = [];
        pack.assets = [];
        通知云端设置回填(changedKeys);
        写入同步状态(session, { lastDownloadAt: new Date().toISOString() });
        emit({
            stage: 'done',
            message: changed > 0 ? `已从云端恢复 ${changed} 项设置` : '云端设置已是最新',
            settingCount: totalSettingCount,
            assetCount,
            changed
        });
        return { ok: true, exists: true, changed, assetCount, settingCount: totalSettingCount };
    } catch (error: any) {
        const message = error?.message || String(error);
        if (error instanceof 云端设置包损坏错误) {
            if (!任务仍有效(generation, session)) {
                return { ok: false, exists: false, changed: 0, assetCount: 0, settingCount: 0, error: '账号已切换，本次下载已取消' };
            }
            写入同步状态(session, { lastUploadHash: '', lastUploadFingerprint: '', pendingUpload: true });
            更新同步状态({
                stage: 'done',
                message: '云端设置数据损坏，将以本机设置为准重新上传',
                lastError: undefined
            });
            if (!options?.silent) onProgress?.({ stage: 'done', message: '云端设置数据损坏，将以本机设置为准重新上传' });
            return { ok: true, exists: false, changed: 0, assetCount: 0, settingCount: 0, corrupt: true };
        }
        更新同步状态({ stage: 'error', message: `设置下载失败：${message}`, lastError: message });
        if (!options?.silent) onProgress?.({ stage: 'error', message: `设置下载失败：${message}` });
        上报同步失败诊断('download', error, { message, account: session.username });
        return { ok: false, exists: false, changed: 0, assetCount: 0, settingCount: 0, error: message };
    }
};

// ── 对外入口 ────────────────────────────────────────────────────────

/** 登录后完整双向同步：先合并云端设置，再把合并后的结果上传。 */
export const 同步云端设置 = async (
    session: 云端游玩账号,
    onProgress?: (progress: 云端设置同步进度) => void
): Promise<云端设置同步结果> => {
    const 持锁代次 = 获取同步循环锁();
    if (持锁代次 === null) return { ok: false, direction: 'both', error: '已有同步任务进行中，请稍后再试' };
    更新同步状态({ running: true, direction: 'both', lastError: undefined });
    try {
        const download = await 下载并合并云端设置(session, onProgress);
        if (!download.ok) return { ok: false, direction: 'download', error: download.error };
        const upload = await 上传设置到云端(session, onProgress);
        if (!upload.ok) return { ok: false, direction: 'upload', error: upload.error };
        return {
            ok: true,
            direction: 'both',
            settingCount: upload.settingCount,
            assetCount: upload.assetCount,
            changed: download.changed,
            skippedKeys: upload.skippedKeys
        };
    } finally {
        释放同步循环锁(持锁代次);
    }
};

/**
 * 上传本机设置（设置变更后由自动同步调用，也可手动触发）。
 * 单飞 + 逐键轻量指纹预检：无变化时直接跳过，不拉取、不打包、不加密。
 */
export const 上传本机设置 = async (
    onProgress?: (progress: 云端设置同步进度) => void
): Promise<云端设置同步结果> => {
    const session = 读取云端游玩会话();
    if (!session) return { ok: false, error: '尚未登录云端游玩账号' };
    if (同步循环进行中) {
        同步循环有等待变更 = true;
        写入同步状态(session, { pendingUpload: true });
        return { ok: true, direction: 'upload', skipped: true };
    }
    const 持锁代次 = 获取同步循环锁();
    if (持锁代次 === null) return { ok: true, direction: 'upload', skipped: true };
    更新同步状态({ running: true, direction: 'upload', lastError: undefined });
    try {
        const fingerprint = await 计算本地指纹(session);
        const precheck = 读取同步状态(session);
        if (precheck.lastUploadFingerprint === fingerprint && precheck.pendingUpload !== true) {
            更新同步状态({ stage: 'done', message: '设置无变化，已跳过同步', direction: 'upload' });
            onProgress?.({ stage: 'done', message: '设置无变化，已跳过同步' });
            return { ok: true, direction: 'upload', skipped: true };
        }
        const pull = await 下载并合并云端设置(session, onProgress, { silent: true });
        if (!pull.ok) return { ok: false, direction: 'download', error: pull.error };
        const result = await 上传设置到云端(session, onProgress);
        return {
            ok: result.ok,
            direction: 'upload',
            settingCount: result.settingCount,
            assetCount: result.assetCount,
            skippedKeys: result.skippedKeys,
            error: result.error
        };
    } finally {
        释放同步循环锁(持锁代次);
    }
};

/** 手动触发下载合并（回到前台 / 应用启动时调用）。 */
export const 拉取云端设置 = async (
    onProgress?: (progress: 云端设置同步进度) => void,
    options?: { silent?: boolean }
): Promise<云端设置同步结果> => {
    const session = 读取云端游玩会话();
    if (!session) return { ok: false, error: '尚未登录云端游玩账号' };
    if (同步循环进行中) return { ok: true, direction: 'download', skipped: true };
    const 持锁代次 = 获取同步循环锁();
    if (持锁代次 === null) return { ok: true, direction: 'download', skipped: true };
    更新同步状态({ running: true, direction: 'download', lastError: undefined });
    try {
        const result = await 下载并合并云端设置(session, onProgress, options);
        return {
            ok: result.ok,
            direction: 'download',
            settingCount: result.settingCount,
            assetCount: result.assetCount,
            changed: result.changed,
            error: result.error
        };
    } finally {
        释放同步循环锁(持锁代次);
    }
};

// ── 自动同步调度 ────────────────────────────────────────────────────

let 自动上传定时器: ReturnType<typeof setTimeout> | null = null;
let 启动初始同步定时器: ReturnType<typeof setTimeout> | null = null;
let 上次前台同步 = 0;
let 取消订阅设置变更: (() => void) | null = null;
let 已启动 = false;
let 生命周期代次 = 0;
let 同步循环进行中 = false;
let 同步循环有等待变更 = false;
let 同步循环持锁代次 = -1;
let 上次自动上传完成时间 = 0;
const 当前会话标识 = (session: 云端游玩账号): string => session.userId || session.username;

const 获取同步循环锁 = (): number | null => {
    if (同步循环进行中) return null;
    同步循环进行中 = true;
    同步循环持锁代次 = 生命周期代次;
    return 同步循环持锁代次;
};

const 释放同步循环锁 = (持锁代次: number): void => {
    if (生命周期代次 !== 持锁代次 || 同步循环持锁代次 !== 持锁代次) return;
    同步循环进行中 = false;
    更新同步状态({ running: false });
    if (同步循环有等待变更) {
        同步循环有等待变更 = false;
        安排自动上传();
    }
};

const 任务仍有效 = (generation: number, session: 云端游玩账号): boolean => {
    const live = 读取云端游玩会话();
    return generation === 生命周期代次
        && Boolean(live)
        && 当前会话标识(session) === 当前会话标识(live!);
};

const 安排自动上传 = (): void => {
    if (!读取云端游玩会话()) return;
    if (自动上传定时器) clearTimeout(自动上传定时器);
    自动上传定时器 = setTimeout(() => {
        自动上传定时器 = null;
        void 执行自动上传();
    }, 自动上传防抖毫秒);
};

const 执行自动上传 = async (): Promise<void> => {
    const session = 读取云端游玩会话();
    if (!session) return;
    const wait = 上次自动上传完成时间 + 自动上传最小间隔毫秒 - Date.now();
    if (wait > 0) {
        if (自动上传定时器) return;
        自动上传定时器 = setTimeout(() => {
            自动上传定时器 = null;
            void 执行自动上传();
        }, wait);
        return;
    }
    try {
        await 上传本机设置();
    } catch (error) {
        console.warn('云端设置自动上传失败:', error);
    } finally {
        上次自动上传完成时间 = Date.now();
    }
};

const 处理页面可见 = (): void => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (!读取云端游玩会话()) return;
    if (同步循环进行中) return;
    const now = Date.now();
    if (now - 上次前台同步 < 前台同步冷却毫秒) return;
    上次前台同步 = now;
    void 拉取云端设置(undefined, { silent: true })
        .then((result) => {
            const session = 读取云端游玩会话();
            const pending = session ? 读取同步状态(session).pendingUpload === true : false;
            if ((result.ok && result.changed && result.changed > 0) || pending) {
                void 上传本机设置().catch(() => undefined);
            }
        })
        .catch((error) => console.warn('云端设置前台同步失败:', error));
};

/** 启动自动同步：监听本机设置变更防抖上传 + 启动后空闲拉取云端 + 回到前台时拉取云端。可安全重复调用。 */
export const 启动云端设置自动同步 = (): (() => void) => {
    if (typeof window === 'undefined') return () => undefined;
    if (已启动) return () => undefined;
    已启动 = true;
    取消订阅设置变更 = dbService.订阅设置变更((change) => {
        if (是否跳过云端同步设置键(change.key)) return;
        if (change.type === 'delete') 记录删除墓碑(change.key);
        安排自动上传();
    });
    document.addEventListener('visibilitychange', 处理页面可见);
    // 延迟到首屏渲染与用户首批点击就绪后再做后台静默同步，避免与启动期 IDB 预热争抢主线程。
    启动初始同步定时器 = setTimeout(() => {
        启动初始同步定时器 = null;
        if (!已启动 || !读取云端游玩会话()) return;
        void 拉取云端设置(undefined, { silent: true })
            .then(() => {
                const session = 读取云端游玩会话();
                if (session && 读取同步状态(session).pendingUpload === true) {
                    void 上传本机设置().catch(() => undefined);
                }
            })
            .catch(() => undefined);
    }, 启动初始同步延迟毫秒);
    return () => {
        if (自动上传定时器) clearTimeout(自动上传定时器);
        自动上传定时器 = null;
        if (启动初始同步定时器) clearTimeout(启动初始同步定时器);
        启动初始同步定时器 = null;
        取消订阅设置变更?.();
        取消订阅设置变更 = null;
        document.removeEventListener('visibilitychange', 处理页面可见);
        已启动 = false;
    };
};

/** 退出登录时调用：停止监听并清空本地同步状态。 */
export const 停止云端设置自动同步 = (): void => {
    生命周期代次 += 1;
    同步循环进行中 = false;
    同步循环持锁代次 = -1;
    同步循环有等待变更 = false;
    if (自动上传定时器) clearTimeout(自动上传定时器);
    自动上传定时器 = null;
    if (启动初始同步定时器) clearTimeout(启动初始同步定时器);
    启动初始同步定时器 = null;
    取消订阅设置变更?.();
    取消订阅设置变更 = null;
    已启动 = false;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', 处理页面可见);
    try {
        const staleKeys: string[] = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key && key.startsWith(同步状态键前缀)) staleKeys.push(key);
        }
        staleKeys.forEach((key) => localStorage.removeItem(key));
    } catch {
        // ignore
    }
    更新同步状态({
        running: false,
        stage: 'idle',
        message: '',
        direction: null,
        settingCount: 0,
        assetCount: 0,
        changed: 0,
        skippedOversizedCount: 0,
        skippedOversizedKeys: [],
        lastError: undefined
    });
};
