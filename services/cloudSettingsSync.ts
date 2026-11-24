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
 */

const 云端设置格式 = 'moranjianghu-cloud-play-settings';
const 云端设置版本 = 1;
const 同步状态键前缀 = 'moranjianghu.cloudPlay.settingsSync.v1.';
const 自动上传防抖毫秒 = 1800;
const 前台同步冷却毫秒 = 10 * 1000;

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
    error?: string;
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
};

const 文本编码器 = new TextEncoder();
const 文本解码器 = new TextDecoder();

const 读取字符串 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const 安全数字 = (value: unknown, fallback = 0): number => (Number.isFinite(Number(value)) ? Number(value) : fallback);

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

const 快照哈希 = (pack: 云端设置包): string => {
    // savedAt 每次构建都会变，不能进入哈希，否则永远无法跳过无变化的上传。
    return 快照哈希文本(JSON.stringify({
        settings: pack.settings.map((item) => [item.key, item.value, item.updatedAt]),
        assets: pack.assets.map((item) => [item.id, item.dataUrl, item.createdAt]),
        deletions: (pack.deletions || []).map((item) => [item.key, item.deletedAt])
    }));
};

const 构建本地设置包 = async (session: 云端游玩账号): Promise<{ pack: 云端设置包; plain: string }> => {
    const manifest = await dbService.获取设置管理清单();
    const settings: 设置条目[] = [];
    const assetIds = new Set<string>();
    for (const item of manifest) {
        if (!item.key) continue;
        let value: unknown = null;
        try {
            value = await dbService.读取设置(item.key);
        } catch {
            continue;
        }
        settings.push({
            key: item.key,
            value,
            updatedAt: Math.max(0, 安全数字(item.updatedAt, 0))
        });
        收集图片资源引用ID(value, assetIds);
    }
    const assets = await dbService.读取图片资源原始列表(Array.from(assetIds));
    const pack: 云端设置包 = {
        format: 云端设置格式,
        version: 云端设置版本,
        userId: session.userId,
        savedAt: new Date().toISOString(),
        settings,
        assets,
        deletions: 读取本地墓碑(session)
    };
    return { pack, plain: JSON.stringify(pack) };
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

const 合并设置包到本地 = async (session: 云端游玩账号, pack: 云端设置包): Promise<{ changed: number; assetCount: number }> => {
    const localManifest = await dbService.获取设置管理清单();
    const localTimes = new Map<string, number>();
    localManifest.forEach((item) => {
        localTimes.set(item.key, Math.max(0, 安全数字(item.updatedAt, 0)));
    });

    let changed = 0;
    // 先应用删除墓碑：本地该键的更新时间早于删除时间才删，避免覆盖删除后重建的新值。
    const remoteDeletions = pack.deletions || [];
    for (const deletion of remoteDeletions) {
        const localTime = localTimes.get(deletion.key);
        if (localTime === undefined || localTime < deletion.deletedAt) {
            await dbService.静默删除设置(deletion.key);
            localTimes.delete(deletion.key);
            changed += 1;
        }
    }
    if (remoteDeletions.length > 0) 写入本地墓碑(session, remoteDeletions);

    for (const item of pack.settings) {
        const localTime = localTimes.get(item.key);
        const localExists = localTimes.has(item.key);
        // 本地更新或相同 => 保留本地，避免覆盖另一端刚改的内容
        if (localExists && localTime !== undefined && localTime >= item.updatedAt) continue;
        await dbService.静默保存设置(item.key, item.value, item.updatedAt);
        changed += 1;
    }

    const assetCount = await dbService.写入图片资源原始列表(pack.assets);
    return { changed, assetCount };
};

const 上传设置到云端 = async (
    session: 云端游玩账号,
    onProgress?: (progress: 云端设置同步进度) => void
): Promise<{ ok: boolean; settingCount: number; assetCount: number; error?: string }> => {
    try {
        onProgress?.({ stage: 'collect', message: '正在整理本机设置...' });
        const { pack, plain } = await 构建本地设置包(session);
        const hash = 快照哈希(pack);
        if (读取同步状态(session).lastUploadHash === hash) {
            onProgress?.({ stage: 'done', message: '设置无变化，已跳过上传', settingCount: pack.settings.length, assetCount: pack.assets.length });
            return { ok: true, settingCount: pack.settings.length, assetCount: pack.assets.length };
        }
        onProgress?.({ stage: 'encrypt', message: '正在加密设置数据...', settingCount: pack.settings.length, assetCount: pack.assets.length });
        const payload = await 打包为密文(plain, session);
        onProgress?.({ stage: 'upload', message: '正在上传设置到云端...', settingCount: pack.settings.length, assetCount: pack.assets.length });
        await callCloudPlayApi('settings-upload', {
            username: session.username,
            password: session.password,
            payload
        });
        const now = new Date().toISOString();
        写入同步状态(session, { lastUploadAt: now, lastUploadHash: hash });
        onProgress?.({ stage: 'done', message: '设置已同步到云端', settingCount: pack.settings.length, assetCount: pack.assets.length });
        return { ok: true, settingCount: pack.settings.length, assetCount: pack.assets.length };
    } catch (error: any) {
        const message = error?.message || String(error);
        onProgress?.({ stage: 'error', message: `设置上传失败：${message}` });
        return { ok: false, settingCount: 0, assetCount: 0, error: message };
    }
};

const 下载并合并云端设置 = async (
    session: 云端游玩账号,
    onProgress?: (progress: 云端设置同步进度) => void,
    options?: { silent?: boolean }
): Promise<{ ok: boolean; exists: boolean; changed: number; assetCount: number; settingCount: number; error?: string }> => {
    try {
        if (!options?.silent) onProgress?.({ stage: 'download', message: '正在读取云端设置...' });
        const payload = await callCloudPlayApi('settings-download', {
            username: session.username,
            password: session.password
        });
        if (!payload?.exists || !读取字符串(payload.payload)) {
            if (!options?.silent) onProgress?.({ stage: 'done', message: '云端暂无设置，将以本机设置为准' });
            return { ok: true, exists: false, changed: 0, assetCount: 0, settingCount: 0 };
        }
        if (!options?.silent) onProgress?.({ stage: 'decrypt', message: '正在解密云端设置...' });
        const pack = await 解密为设置包(读取字符串(payload.payload), session);
        if (!pack) throw new Error('云端设置包格式无效。');
        if (!options?.silent) onProgress?.({ stage: 'merge', message: '正在合并云端设置...', settingCount: pack.settings.length, assetCount: pack.assets.length });
        const { changed, assetCount } = await 合并设置包到本地(session, pack);
        写入同步状态(session, { lastDownloadAt: new Date().toISOString() });
        if (!options?.silent) {
            onProgress?.({
                stage: 'done',
                message: changed > 0 ? `已从云端恢复 ${changed} 项设置` : '云端设置已是最新',
                settingCount: pack.settings.length,
                assetCount,
                changed
            });
        }
        return { ok: true, exists: true, changed, assetCount, settingCount: pack.settings.length };
    } catch (error: any) {
        const message = error?.message || String(error);
        if (!options?.silent) onProgress?.({ stage: 'error', message: `设置下载失败：${message}` });
        return { ok: false, exists: false, changed: 0, assetCount: 0, settingCount: 0, error: message };
    }
};

/** 登录后完整双向同步：先合并云端设置，再把合并后的结果上传。 */
export const 同步云端设置 = async (
    session: 云端游玩账号,
    onProgress?: (progress: 云端设置同步进度) => void
): Promise<云端设置同步结果> => {
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
};

/** 手动触发上传（设置变更后由自动同步调用）。 */
export const 上传本机设置 = async (
    onProgress?: (progress: 云端设置同步进度) => void
): Promise<云端设置同步结果> => {
    const session = 读取云端游玩会话();
    if (!session) return { ok: false, error: '尚未登录云端游玩账号' };
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
};

/** 手动触发下载合并（回到前台 / 应用启动时调用）。 */
export const 拉取云端设置 = async (
    onProgress?: (progress: 云端设置同步进度) => void,
    options?: { silent?: boolean }
): Promise<云端设置同步结果> => {
    const session = 读取云端游玩会话();
    if (!session) return { ok: false, error: '尚未登录云端游玩账号' };
    const result = await 下载并合并云端设置(session, onProgress, options);
    return {
        ok: result.ok,
        direction: 'download',
        settingCount: result.settingCount,
        assetCount: result.assetCount,
        changed: result.changed,
        error: result.error
    };
};

let 自动上传定时器: ReturnType<typeof setTimeout> | null = null;
let 上次前台同步 = 0;
let 取消订阅设置变更: (() => void) | null = null;
let 已启动 = false;

const 安排自动上传 = (): void => {
    if (!读取云端游玩会话()) return;
    if (自动上传定时器) clearTimeout(自动上传定时器);
    自动上传定时器 = setTimeout(() => {
        自动上传定时器 = null;
        void 上传本机设置().catch((error) => console.warn('云端设置自动上传失败:', error));
    }, 自动上传防抖毫秒);
};

const 处理页面可见 = (): void => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (!读取云端游玩会话()) return;
    const now = Date.now();
    if (now - 上次前台同步 < 前台同步冷却毫秒) return;
    上次前台同步 = now;
    void 拉取云端设置(undefined, { silent: true })
        .then((result) => {
            if (result.ok && result.changed && result.changed > 0) {
                // 云端有更新：把合并后的最新设置回传，保证其它设备也能看到本端保留的项
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
    // 启动时拉取一次云端设置（静默），确保多端设置一致
    void 拉取云端设置(undefined, { silent: true }).catch(() => undefined);
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
};
