import * as dbService from './dbService';
import {
    读取云端游玩会话,
    加密字节,
    解密字节,
    callCloudPlayApi,
    type 云端游玩账号
} from './cloudPlayService';
import { 解析图片资源引用ID } from '../utils/imageAssets';

/**
 * 云端设置联机同步
 *
 * 账号登录后，把本机「全部设置 + 设置引用的图片资源」加密打包上传到云端账号；
 * 登录 / 回到前台 / 应用启动时下载云端设置，按每个设置项的 updatedAt 做
 * last-write-wins 合并（不会用整包覆盖丢掉另一端的独有设置）。
 *
 * 密文使用云端游玩账号相同的 PBKDF2 + AES-GCM 密钥派生，服务端只见密文。
 *
 * 内存约束（v1.0.715）：设置包可能携带大量图片资源（dataUrl 很大），
 * 打包 / 哈希 / 加密 / base64 每一步都会产生大字符串。因此：
 * 1. 上传前先用「本地指纹」预检——指纹只由设置值哈希 + 资源 ID 列表构成，
 *    不读取图片资源正文、不整包 stringify；无变化时直接跳过整个同步循环。
 * 2. 同步循环单飞（同一时刻最多一个循环），期间新变更只记 pendingUpload。
 * 3. 自动上传循环之间强制最小间隔，避免高频保存时连续重负载。
 * 4. 哈希一律逐项计算（每项一个小字符串），绝不把整个包 stringify 一遍。
 */

const 云端设置格式 = 'moranjianghu-cloud-play-settings';
const 云端设置版本 = 1;
const 同步状态键前缀 = 'moranjianghu.cloudPlay.settingsSync.v1.';
const 自动上传防抖毫秒 = 1800;
const 前台同步冷却毫秒 = 10 * 1000;
/** 两次自动上传循环之间的最小间隔：留出 GC 喘息时间，避免连续重负载拖垮页面。 */
const 自动上传最小间隔毫秒 = 15 * 1000;

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

// ── 全局同步状态（面板数据源） ──────────────────────────────────────

const 当前同步状态: {
    running: boolean;
    stage: 云端设置进度阶段;
    message: string;
    direction: 'upload' | 'download' | 'both' | null;
    settingCount: number;
    assetCount: number;
    changed: number;
    lastError?: string;
} = {
    running: false,
    stage: 'idle',
    message: '',
    direction: null,
    settingCount: 0,
    assetCount: 0,
    changed: 0
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

const 更新同步状态 = (patch: Partial<Omit<云端设置同步状态, 'pendingUpload' | 'lastUploadAt' | 'lastDownloadAt' | 'updatedAt'>>): void => {
    if ('running' in patch) 当前同步状态.running = Boolean(patch.running);
    if (patch.stage !== undefined) 当前同步状态.stage = patch.stage;
    if (patch.message !== undefined) 当前同步状态.message = patch.message;
    if (patch.direction !== undefined) 当前同步状态.direction = patch.direction;
    if (patch.settingCount !== undefined) 当前同步状态.settingCount = patch.settingCount;
    if (patch.assetCount !== undefined) 当前同步状态.assetCount = patch.assetCount;
    if (patch.changed !== undefined) 当前同步状态.changed = patch.changed;
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
            .filter((item: any) => 读取字符串(item?.key) && 安全数字(item?.deletedAt, 0) > cutoff)
            .map((item: any) => ({ key: 读取字符串(item.key), deletedAt: 安全数字(item.deletedAt, 0) }));
    } catch {
        return [];
    }
};

const 写入本地墓碑 = (session: 云端游玩账号, deletions: 删除墓碑[]): void => {
    try {
        const merged = new Map<string, number>();
        [...读取本地墓碑(session), ...deletions].forEach((item) => {
            if (item.key) merged.set(item.key, Math.max(merged.get(item.key) || 0, item.deletedAt));
        });
        localStorage.setItem(墓碑存储键(session), JSON.stringify(
            Array.from(merged.entries()).map(([key, deletedAt]) => ({ key, deletedAt }))
        ));
    } catch {
        // ignore
    }
};

const 记录删除墓碑 = (key: string): void => {
    const session = 读取云端游玩会话();
    if (!session || !key) return;
    写入本地墓碑(session, [{ key, deletedAt: Date.now() }]);
};

/** 云端回填独立通道：useGameState 据此刷新内存状态，不经过 订阅设置变更，避免自动上传回环。 */
type 云端回填监听器 = (keys: string[]) => void;
const 云端回填监听器 = new Set<云端回填监听器>();

export const 订阅云端设置回填 = (listener: 云端回填监听器): (() => void) => {
    云端回填监听器.add(listener);
    return () => { 云端回填监听器.delete(listener); };
};

const 通知云端设置回填 = (keys: string[]): void => {
    if (keys.length === 0) return;
    云端回填监听器.forEach((fn) => {
        try { fn(keys); } catch (error) { console.warn('云端设置回填通知失败:', error); }
    });
};

// ── 编解码工具 ──────────────────────────────────────────────────────

const base64编码 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
};

const base64解码 = (value: string): Uint8Array => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
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

/** 简易非加密哈希，仅用于判断本地设置快照是否变化，避免重复上传。 */
const 快照哈希文本 = (value: string): string => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
};

const 哈希JSON值 = (value: unknown): string => {
    try {
        return 快照哈希文本(JSON.stringify(value) || '');
    } catch {
        return 'unserializable';
    }
};

/** 把多个小哈希组合成一个总指纹，避免构造整包大字符串。 */
const 组合哈希 = (parts: string[]): string => 快照哈希文本(parts.join('\u0001'));

const 规范化设置包 = (raw: any, session: 云端游玩账号): 云端设置包 | null => {
    if (!raw || raw.format !== 云端设置格式 || !Array.isArray(raw.settings)) return null;
    const settings: 设置条目[] = [];
    const seenKeys = new Set<string>();
    for (const item of raw.settings) {
        const key = 读取字符串(item?.key);
        if (!key || seenKeys.has(key)) continue;
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
        if (!id || !dataUrl || seenAssetIds.has(id)) continue;
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
        .filter((item: 删除墓碑) => Boolean(item.key) && item.deletedAt > 0);

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

/**
 * 设置包哈希：逐项计算，绝不把整个包 JSON.stringify 一遍
 * （整包 stringify 会瞬间复制所有 dataUrl，是内存峰值的主要来源）。
 * 图片资源用「ID + 长度 + 时间」代替正文参与哈希。
 */
const 快照哈希 = (pack: 云端设置包): string => {
    const parts: string[] = [];
    pack.settings.forEach((item) => parts.push(`s:${item.key}:${item.updatedAt}:${哈希JSON值(item.value)}`));
    pack.assets.forEach((item) => parts.push(`a:${item.id}:${item.dataUrl.length}:${item.createdAt}`));
    (pack.deletions || []).forEach((item) => parts.push(`d:${item.key}:${item.deletedAt}`));
    return 组合哈希(parts);
};

// ── 本地指纹（上传预检用，不读取图片资源正文） ───────────────────────

type 指纹扫描结果 = { parts: string[]; assetIds: Set<string>; settingCount: number; settings: 设置条目[] };

const 扫描设置指纹 = async (): Promise<指纹扫描结果> => {
    // 🔴 同一只读事务读取 key/value/updatedAt，避免值与时间戳来自不同时刻。
    const snapshot = await dbService.读取设置一致性快照();
    const parts: string[] = [];
    const assetIds = new Set<string>();
    const settings: 设置条目[] = [];
    snapshot.forEach((item) => {
        if (!item.key) return;
        const entry: 设置条目 = {
            key: item.key,
            value: item.value,
            updatedAt: Math.max(0, 安全数字(item.updatedAt, 0))
        };
        settings.push(entry);
        parts.push(`s:${entry.key}:${entry.updatedAt}:${哈希JSON值(entry.value)}`);
        收集图片资源引用ID(entry.value, assetIds);
    });
    return { parts, assetIds, settingCount: settings.length, settings };
};

const 组合本地指纹 = (session: 云端游玩账号, scan: 指纹扫描结果): string => {
    const parts = [...scan.parts];
    Array.from(scan.assetIds).sort().forEach((id) => parts.push(`a:${id}`));
    读取本地墓碑(session).forEach((item) => parts.push(`d:${item.key}:${item.deletedAt}`));
    return 组合哈希(parts);
};

/** 上传预检：只扫设置值哈希 + 资源 ID，不读取图片正文，无变化即可跳过整个同步循环。 */
const 计算本地指纹 = async (session: 云端游玩账号): Promise<string> => 组合本地指纹(session, await 扫描设置指纹());

// ── 打包 / 解包 ─────────────────────────────────────────────────────

const 构建本地设置包 = async (session: 云端游玩账号): Promise<{ pack: 云端设置包; fingerprint: string }> => {
    const scan = await 扫描设置指纹();
    const fingerprint = 组合本地指纹(session, scan);
    const assets = await dbService.读取图片资源原始列表(Array.from(scan.assetIds));
    const pack: 云端设置包 = {
        format: 云端设置格式,
        version: 云端设置版本,
        userId: session.userId,
        savedAt: new Date().toISOString(),
        settings: scan.settings,
        assets,
        deletions: 读取本地墓碑(session)
    };
    return { pack, fingerprint };
};

const 打包为密文 = async (plain: string, session: 云端游玩账号): Promise<string> => {
    const encrypted = await 加密字节(文本编码器.encode(plain), session);
    return base64编码(encrypted);
};

const 解密为设置包 = async (payload: string, session: 云端游玩账号): Promise<云端设置包 | null> => {
    const encryptedBytes = base64解码(payload);
    const plainBytes = await 解密字节(encryptedBytes, session);
    const parsed = JSON.parse(文本解码器.decode(plainBytes));
    return 规范化设置包(parsed, session);
};

const 合并设置包到本地 = async (session: 云端游玩账号, pack: 云端设置包): Promise<{ changed: number; assetCount: number; changedKeys: string[] }> => {
    const localManifest = await dbService.获取设置管理清单();
    const localTimes = new Map<string, number>();
    localManifest.forEach((item) => {
        localTimes.set(item.key, Math.max(0, 安全数字(item.updatedAt, 0)));
    });

    let changed = 0;
    const changedKeys: string[] = [];
    // 先应用删除墓碑：本地该键的更新时间早于删除时间才删，避免覆盖删除后重建的新值。
    const remoteDeletions = pack.deletions || [];
    for (const deletion of remoteDeletions) {
        const localTime = localTimes.get(deletion.key);
        if (localTime === undefined || localTime < deletion.deletedAt) {
            await dbService.静默删除设置(deletion.key);
            localTimes.delete(deletion.key);
            changed += 1;
            changedKeys.push(deletion.key);
        }
    }
    if (remoteDeletions.length > 0) 写入本地墓碑(session, remoteDeletions);

    // 🔴 先写图片资源再写设置：设置引用的资源必须已存在；同 ID 资源只接受较新 createdAt，
    //    避免本地已更新的图片被云端旧包覆盖。
    const localAssets = await dbService.读取图片资源原始列表(pack.assets.map((item) => item.id));
    const localAssetTimes = new Map(localAssets.map((item) => [item.id, item.createdAt]));
    const assetsToWrite = pack.assets.filter((item) => {
        const localTime = localAssetTimes.get(item.id);
        return localTime === undefined || localTime < item.createdAt;
    });
    const assetCount = await dbService.写入图片资源原始列表(assetsToWrite);

    for (const item of pack.settings) {
        const localTime = localTimes.get(item.key);
        const localExists = localTimes.has(item.key);
        // 本地更新或相同 => 保留本地，避免覆盖另一端刚改的内容
        if (localExists && localTime !== undefined && localTime >= item.updatedAt) continue;
        // 🔴 读比写在同一 readwrite 事务内，避免 await 期间本地被并发保存后仍被旧值覆盖
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
): Promise<{ ok: boolean; settingCount: number; assetCount: number; error?: string }> => {
    const generation = 生命周期代次;
    try {
        更新同步状态({ stage: 'collect', message: '正在整理本机设置...', direction: 'upload' });
        onProgress?.({ stage: 'collect', message: '正在整理本机设置...' });
        const { pack, fingerprint } = await 构建本地设置包(session);
        if (!任务仍有效(generation, session)) return { ok: false, settingCount: 0, assetCount: 0, error: '账号已切换，本次上传已取消' };
        const hash = 快照哈希(pack);
        const state = 读取同步状态(session);
        if (state.lastUploadHash === hash) {
            写入同步状态(session, { lastUploadFingerprint: fingerprint, pendingUpload: false });
            更新同步状态({
                stage: 'done',
                message: '设置无变化，已跳过上传',
                settingCount: pack.settings.length,
                assetCount: pack.assets.length,
                lastError: undefined
            });
            onProgress?.({ stage: 'done', message: '设置无变化，已跳过上传', settingCount: pack.settings.length, assetCount: pack.assets.length });
            return { ok: true, settingCount: pack.settings.length, assetCount: pack.assets.length };
        }
        更新同步状态({
            stage: 'encrypt',
            message: '正在加密设置数据...',
            settingCount: pack.settings.length,
            assetCount: pack.assets.length
        });
        onProgress?.({ stage: 'encrypt', message: '正在加密设置数据...', settingCount: pack.settings.length, assetCount: pack.assets.length });
        // 整包 JSON 只在这里构造一次；加密完立刻释放引用，缩短大字符串存活时间。
        let plain = JSON.stringify(pack);
        const payload = await 打包为密文(plain, session);
        plain = '';
        更新同步状态({ stage: 'upload', message: '正在上传设置到云端...' });
        onProgress?.({ stage: 'upload', message: '正在上传设置到云端...', settingCount: pack.settings.length, assetCount: pack.assets.length });
        await callCloudPlayApi('settings-upload', {
            username: session.username,
            password: session.password,
            payload
        });
        if (!任务仍有效(generation, session)) return { ok: false, settingCount: 0, assetCount: 0, error: '账号已切换，本次上传已取消' };
        const now = new Date().toISOString();
        写入同步状态(session, {
            lastUploadAt: now,
            lastUploadHash: hash,
            lastUploadFingerprint: fingerprint,
            pendingUpload: false
        });
        更新同步状态({
            stage: 'done',
            message: '设置已同步到云端',
            settingCount: pack.settings.length,
            assetCount: pack.assets.length,
            lastError: undefined
        });
        onProgress?.({ stage: 'done', message: '设置已同步到云端', settingCount: pack.settings.length, assetCount: pack.assets.length });
        return { ok: true, settingCount: pack.settings.length, assetCount: pack.assets.length };
    } catch (error: any) {
        const message = error?.message || String(error);
        if (任务仍有效(generation, session)) 写入同步状态(session, { pendingUpload: true });
        更新同步状态({ stage: 'error', message: `设置上传失败：${message}，将在恢复网络后重试`, lastError: message });
        onProgress?.({ stage: 'error', message: `设置上传失败：${message}，将在恢复网络后重试` });
        return { ok: false, settingCount: 0, assetCount: 0, error: message };
    }
};

// ── 下载 ────────────────────────────────────────────────────────────

const 下载并合并云端设置 = async (
    session: 云端游玩账号,
    onProgress?: (progress: 云端设置同步进度) => void,
    options?: { silent?: boolean }
): Promise<{ ok: boolean; exists: boolean; changed: number; assetCount: number; settingCount: number; error?: string }> => {
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
        if (!pack) throw new Error('云端设置包格式无效。');
        if (!任务仍有效(generation, session)) return { ok: false, exists: false, changed: 0, assetCount: 0, settingCount: 0, error: '账号已切换，本次下载已取消' };
        emit({ stage: 'merge', message: '正在合并云端设置...', settingCount: pack.settings.length, assetCount: pack.assets.length });
        const { changed, assetCount, changedKeys } = await 合并设置包到本地(session, pack);
        通知云端设置回填(changedKeys);
        写入同步状态(session, { lastDownloadAt: new Date().toISOString() });
        emit({
            stage: 'done',
            message: changed > 0 ? `已从云端恢复 ${changed} 项设置` : '云端设置已是最新',
            settingCount: pack.settings.length,
            assetCount,
            changed
        });
        return { ok: true, exists: true, changed, assetCount, settingCount: pack.settings.length };
    } catch (error: any) {
        const message = error?.message || String(error);
        更新同步状态({ stage: 'error', message: `设置下载失败：${message}`, lastError: message });
        if (!options?.silent) onProgress?.({ stage: 'error', message: `设置下载失败：${message}` });
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
            changed: download.changed
        };
    } finally {
        // 完整同步期间若有新变更被单飞跳过，退出时补排一次上传；
        // 否则本轮上传成功清掉 pendingUpload 后，新值要等到下一次变更才会被传上去。
        释放同步循环锁(持锁代次);
    }
};

/**
 * 上传本机设置（设置变更后由自动同步调用，也可手动触发）。
 * 🔴 单飞：同一时刻最多一个循环；期间的新变更只记 pendingUpload，循环结束后再排队。
 * 🔴 指纹预检：本地指纹与上次成功上传一致且无待重试时，直接跳过（不拉取、不打包、不加密）。
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
        // 🔴 指纹预检：不读取图片正文、不整包 stringify，无变化直接返回
        const fingerprint = await 计算本地指纹(session);
        const precheck = 读取同步状态(session);
        if (precheck.lastUploadFingerprint === fingerprint && precheck.pendingUpload !== true) {
            更新同步状态({ stage: 'done', message: '设置无变化，已跳过同步', direction: 'upload' });
            onProgress?.({ stage: 'done', message: '设置无变化，已跳过同步' });
            return { ok: true, direction: 'upload', skipped: true };
        }
        // 🔴 上传前必须先合并云端：否则离线期间其它设备新增/修改的设置会被本机整包覆盖。
        // 静默合并且用 静默保存设置，不会触发自动上传造成回环。
        const pull = await 下载并合并云端设置(session, onProgress, { silent: true });
        if (!pull.ok) return { ok: false, direction: 'download', error: pull.error };
        const result = await 上传设置到云端(session, onProgress);
        return {
            ok: result.ok,
            direction: 'upload',
            settingCount: result.settingCount,
            assetCount: result.assetCount,
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
        // 与其它入口统一：释放锁时若循环期间有被单飞跳过的新变更，同样补排自动上传。
        释放同步循环锁(持锁代次);
    }
};

// ── 自动同步调度 ────────────────────────────────────────────────────

let 自动上传定时器: ReturnType<typeof setTimeout> | null = null;
let 上次前台同步 = 0;
let 取消订阅设置变更: (() => void) | null = null;
let 已启动 = false;
let 生命周期代次 = 0;
/** 单飞标记：一个完整同步循环（拉取+打包+加密+上传）正在进行。 */
let 同步循环进行中 = false;
/** 循环进行中出现的新变更；循环结束后自动再排一次队。 */
let 同步循环有等待变更 = false;
/** 锁所有权代次：只有持锁任务自己（且生命周期代次未变）才能释放锁。 */
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
    // 代次不匹配说明期间发生过退出登录（强制释放过锁），旧循环不得触碰新循环的锁。
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
    // 两次自动循环之间强制最小间隔，避免高频保存连续触发重负载
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
                // 云端有更新，或上次上传失败：把合并后的最新设置回传
                void 上传本机设置().catch(() => undefined);
            }
        })
        .catch((error) => console.warn('云端设置前台同步失败:', error));
};

/** 启动自动同步：监听本机设置变更防抖上传 + 回到前台时拉取云端。可安全重复调用。 */
export const 启动云端设置自动同步 = (): (() => void) => {
    if (typeof window === 'undefined') return () => undefined;
    if (已启动) return () => undefined;
    已启动 = true;
    取消订阅设置变更 = dbService.订阅设置变更((change) => {
        if (change.type === 'delete') 记录删除墓碑(change.key);
        安排自动上传();
    });
    document.addEventListener('visibilitychange', 处理页面可见);
    // 启动时拉取一次云端设置（静默），确保多端设置一致；有待上传任务时立即补传
    void 拉取云端设置(undefined, { silent: true })
        .then(() => {
            const session = 读取云端游玩会话();
            if (session && 读取同步状态(session).pendingUpload === true) {
                void 上传本机设置().catch(() => undefined);
            }
        })
        .catch(() => undefined);
    return () => {
        if (自动上传定时器) clearTimeout(自动上传定时器);
        自动上传定时器 = null;
        取消订阅设置变更?.();
        取消订阅设置变更 = null;
        document.removeEventListener('visibilitychange', 处理页面可见);
        已启动 = false;
    };
};

/** 退出登录时调用：停止监听并清空本地同步状态。 */
export const 停止云端设置自动同步 = (): void => {
    // 递增代次，使正在等待的旧账号下载/上传在恢复后失效，不能写入或上传。
    生命周期代次 += 1;
    // 🔴 强制释放同步锁：旧账号的在途网络请求可能长期不返回（callCloudPlayApi 无超时），
    // 不释放会让新账号的登录同步一直拿到"已有同步任务进行中"。旧循环恢复后因代次不匹配，
    // 其 finally 不会重复释放、也不会用旧会话补排上传。
    同步循环进行中 = false;
    同步循环持锁代次 = -1;
    同步循环有等待变更 = false;
    if (自动上传定时器) clearTimeout(自动上传定时器);
    自动上传定时器 = null;
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
        lastError: undefined
    });
};
