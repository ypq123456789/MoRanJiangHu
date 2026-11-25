import type { 存档结构 } from '../types';
import * as dbService from './dbService';
import { 导出ZIP存档文件, 解析ZIP存档文件 } from './saveArchiveService';
import { 上传Blob到图床, buildImageHostProxyUrl } from './imageHostService';
import { 创建并记录ObjectURL, 延迟释放并记录ObjectURL } from '../utils/objectUrlLifecycle';
import {
    读取对象存储同步配置,
    增量同步到对象存储,
    type 对象存储同步配置
} from './objectStorageSync';
import { 读取存档游玩回合数 } from '../utils/saveTurn';
import {
    创建图片资源引用,
    解析图片资源引用ID,
    是否图片资源引用,
    是否远程图片地址,
    注册远程图片兜底引用,
    读取远程图片兜底映射,
    读取图片资源远程兜底地址
} from '../utils/imageAssets';
import {
    云端游玩会话存储键,
    云端游玩对象存储模式键,
    读取云端游玩原始存储模式,
    写入云端游玩存储模式,
    清除云端游玩存储模式 as 清除云端游玩存储模式标记
} from '../utils/cloudPlayStorageMode';

const CLOUD_PLAY_API_PATH = '/api/cloud-play';
const IMAGE_HOST_DOWNLOAD_PROXY_PATH = '/api/image-host/download';
const SESSION_KEY = 云端游玩会话存储键;
const OBJECT_STORAGE_MODE_KEY = 云端游玩对象存储模式键;
const RISK_ACK_KEY = 'moranjianghu.cloudPlay.riskAcknowledged.v1';
const MANIFEST_CACHE_PREFIX = 'moranjianghu.cloudPlay.manifestCache.v1.';
const PBKDF2_ITERATIONS = 160000;
const CLOUD_PLAY_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export const 云端游玩风险提示文本 = '云端游玩所有数据都存在云端，公益项目使用TG图床，如果频道被封可能存在数据丢失的风险，请做好本地备份工作，数据丢失概不负责。';

export type 云端游玩账号 = {
    userId: string;
    username: string;
    password: string;
    clientSalt: string;
    manifestUrl?: string;
    manifestUpdatedAt?: string;
};

export type 云端存档摘要 = {
    cloudId: string;
    syncHash: string;
    seriesId?: string;
    rootCloudId?: string;
    parentCloudId?: string;
    title: string;
    type: 'auto' | 'manual';
    timestamp: number;
    savedAt: string;
    location: string;
    gameTime: string;
    historyCount: number;
    turnCount?: number;
    packageUrl: string;
    packageSize?: number;
    sha256: string;
    packageFormat?: 'zip' | 'snapshot' | 'delta';
    baseCloudId?: string;
    parentSyncHash?: string;
    rootSyncHash?: string;
    depth?: number;
    branchInput?: string;
    deletedAt?: string;
};

export type 云端存档清单 = {
    format: 'moranjianghu-cloud-play';
    version: 1;
    userId: string;
    username: string;
    updatedAt: string;
    saves: 云端存档摘要[];
};

export type 云端上传阶段 = 'manifest' | 'package' | 'encrypt' | 'upload-save' | 'upload-manifest' | 'done';

export interface 云端上传进度 {
    stage: 云端上传阶段;
    current?: number;
    total?: number;
    uploadBytes?: number;
    attempt?: number;
    maxAttempts?: number;
    percent?: number;
    message: string;
}

type ApiUser = Omit<云端游玩账号, 'password'>;
type JsonPath = Array<string | number>;
type JsonPatchOp = { path: JsonPath; value?: unknown; delete?: true };
type 云端存档包 = {
    format: 'moranjianghu-cloud-play-save-package';
    version: 1;
    kind: 'snapshot' | 'delta';
    baseCloudId?: string;
    baseSyncHash?: string;
    save?: 存档结构;
    gamePatch?: JsonPatchOp[];
    historyBaseLength?: number;
    historyAppend?: unknown[];
    historyReplace?: unknown[];
    imageFallbacks?: 云端图片兜底项[];
};
type 云端图片兜底项 = { id: string; remoteUrl: string };
type 差分基准 = { summary: 云端存档摘要; save: 存档结构 } | null;
type 持久云端游玩会话 = {
    expiresAt: number;
    session: 云端游玩账号;
};
export type 云端游玩存储模式 = 'tg' | 'object';
export type 云端下载阶段 = 'manifest' | 'download' | 'decrypt' | 'restore' | 'done';

export interface 云端下载进度 {
    stage: 云端下载阶段;
    current?: number;
    total?: number;
    attempt?: number;
    maxAttempts?: number;
    message: string;
}

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const 短文本哈希 = (value: string): string => {
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

const 构建存档系列ID = (save: Partial<存档结构>): string => {
    const existing = readString((save.元数据 as any)?.存档系列ID);
    if (existing) return existing;
    const history = Array.isArray(save.历史记录) ? save.历史记录 : [];
    const firstHistory = history[0] || null;
    const seed = {
        title: readString(save.角色数据?.姓名),
        initialTime: (save as any)?.游戏初始时间 || null,
        firstHistory,
        firstLocation: (save as any)?.环境信息?.具体地点 || (save as any)?.环境信息?.小地点 || ''
    };
    return `series-${短文本哈希(JSON.stringify(seed))}`;
};

const 读取摘要系列ID = (item: 云端存档摘要): string => (
    readString(item.seriesId) || readString(item.rootCloudId) || `legacy-${readString(item.title) || 'unknown'}`
);

const 读取清单缓存键 = (session: 云端游玩账号): string => `${MANIFEST_CACHE_PREFIX}${session.userId || session.username}`;

const 缓存云端清单 = (session: 云端游玩账号, manifest: 云端存档清单): void => {
    try {
        localStorage.setItem(读取清单缓存键(session), JSON.stringify(manifest));
    } catch {
        // ignore local cache failures
    }
};

export const 读取缓存云端存档清单 = (session: 云端游玩账号): 云端存档清单 | null => {
    try {
        const parsed = JSON.parse(localStorage.getItem(读取清单缓存键(session)) || 'null');
        if (parsed?.format !== 'moranjianghu-cloud-play' || !Array.isArray(parsed?.saves)) return null;
        return 规范化云端存档清单({
            format: 'moranjianghu-cloud-play',
            version: 1,
            userId: readString(parsed.userId) || session.userId,
            username: readString(parsed.username) || session.username,
            updatedAt: readString(parsed.updatedAt) || new Date().toISOString(),
            saves: parsed.saves
        });
    } catch {
        return null;
    }
};

const randomBytes = (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length));

const bytesToBase64 = (bytes: Uint8Array): string => {
    if (bytes.length === 0) return '';
    // 24576 = 3 * 8192：3 的整数倍保证非末块独立 btoa 无 '=' 填充，避免拼接超大中间字符串或触发 Blink btoa 上限
    const chunkSize = 24576;
    const parts: string[] = [];
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
        parts.push(btoa(String.fromCharCode.apply(null, chunk as unknown as number[])));
    }
    return parts.join('');
};

const base64ToBytes = (value: string): Uint8Array => {
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

const arrayBufferToBytes = (buffer: ArrayBuffer): Uint8Array => new Uint8Array(buffer);

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const buildCloudSaveDownloadUrl = (targetUrl: string): string => {
    try {
        const url = new URL(targetUrl);
        if (!/(^|\.)(?:image1|image)\.bacon159\.pp\.ua$/i.test(url.hostname)) return targetUrl;
        return `${buildImageHostProxyUrl(IMAGE_HOST_DOWNLOAD_PROXY_PATH)}?type=file&url=${encodeURIComponent(targetUrl)}`;
    } catch {
        return targetUrl;
    }
};

const isRetryableDownloadFailure = (status: number, message = ''): boolean => {
    if (status === 0 || status === 408 || status === 425 || status === 429) return true;
    if (status >= 500) return true;
    return /network|timeout|fetch|aborted|temporar/i.test(message);
};

const fetchCloudSaveBytes = async (
    targetUrl: string,
    maxAttempts = 5,
    onProgress?: (progress: 云端下载进度) => void
): Promise<Uint8Array> => {
    const downloadUrl = buildCloudSaveDownloadUrl(targetUrl);
    let lastStatus = 0;
    let lastMessage = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        onProgress?.({
            stage: 'download',
            attempt,
            maxAttempts,
            message: attempt === 1 ? '正在下载云端存档...' : `下载暂时失败，正在第 ${attempt}/${maxAttempts} 次重试...`
        });
        try {
            const response = await fetch(downloadUrl, {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    Accept: 'application/octet-stream,*/*;q=0.8'
                }
            });
            lastStatus = response.status;
            if (response.ok) {
                const bytes = arrayBufferToBytes(await response.arrayBuffer());
                onProgress?.({
                    stage: 'download',
                    attempt,
                    maxAttempts,
                    message: '云端存档下载完成，正在校验...'
                });
                return bytes;
            }
            lastMessage = (await response.text().catch(() => '')).slice(0, 180) || `HTTP ${response.status}`;
            if (attempt >= maxAttempts || !isRetryableDownloadFailure(response.status, lastMessage)) break;
        } catch (error: any) {
            lastStatus = 0;
            lastMessage = error?.message || String(error);
            if (attempt >= maxAttempts || !isRetryableDownloadFailure(0, lastMessage)) break;
        }
        await sleep(Math.min(12000, 1200 * attempt * attempt));
    }
    throw new Error(`下载云端存档失败：HTTP ${lastStatus || 0}。TG 图床下载链路连续失败（${lastMessage || '无响应'}），可稍后重试，或切换对象存储/先下载到本地备份。`);
};

const 深拷贝 = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const 检查图床图片可用 = async (remoteUrl: string): Promise<boolean> => {
    const normalized = readString(remoteUrl);
    if (!是否远程图片地址(normalized)) return false;
    try {
        const response = await fetch(`${buildImageHostProxyUrl(IMAGE_HOST_DOWNLOAD_PROXY_PATH)}?url=${encodeURIComponent(normalized)}`, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                Accept: 'image/*,*/*;q=0.8',
                Range: 'bytes=0-0'
            }
        });
        if (!response.ok) return false;
        const contentType = response.headers.get('Content-Type') || '';
        return !contentType || /^image\//i.test(contentType) || contentType.includes('octet-stream');
    } catch {
        return false;
    }
};

const 准备云端包图片兜底 = async (save: 存档结构): Promise<云端图片兜底项[]> => {
    const refs = new Map<string, string>();
    const remoteFallbacks = 读取远程图片兜底映射();
    const seen = new WeakSet<object>();

    const visit = (value: unknown): void => {
        const text = readString(value);
        if (text) {
            if (是否图片资源引用(text)) {
                const id = 解析图片资源引用ID(text);
                if (id && !refs.has(id)) refs.set(id, '');
                return;
            }
            if (是否远程图片地址(text)) {
                const id = readString(remoteFallbacks[text]);
                if (id && !refs.has(id)) refs.set(id, text);
            }
            return;
        }
        if (!value || typeof value !== 'object') return;
        if (seen.has(value as object)) return;
        seen.add(value as object);
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        Object.values(value as Record<string, unknown>).forEach(visit);
    };

    visit(save);
    const fallbacks: 云端图片兜底项[] = [];
    for (const [id, discoveredRemoteUrl] of refs.entries()) {
        const ref = 创建图片资源引用(id);
        let remoteUrl = readString(discoveredRemoteUrl) || 读取图片资源远程兜底地址(ref);
        if (!remoteUrl) continue;
        if (await 检查图床图片可用(remoteUrl)) {
            注册远程图片兜底引用(remoteUrl, id);
            fallbacks.push({ id, remoteUrl });
        }
    }
    return fallbacks;
};

const 恢复云端包图片兜底 = (pack: 云端存档包): void => {
    const fallbacks = Array.isArray(pack.imageFallbacks) ? pack.imageFallbacks : [];
    if (fallbacks.length === 0) return;
    for (const item of fallbacks) {
        const id = readString(item?.id);
        const remoteUrl = readString(item?.remoteUrl);
        if (id && 是否远程图片地址(remoteUrl)) 注册远程图片兜底引用(remoteUrl, id);
    }
};

const 去除存档易变字段 = (save: 存档结构): any => {
    const copy: any = 深拷贝(save);
    delete copy.id;
    if (copy.元数据 && typeof copy.元数据 === 'object') {
        delete copy.元数据.存档哈希;
        delete copy.元数据.存档父节点哈希;
        delete copy.元数据.存档根节点哈希;
        delete copy.元数据.存档谱系深度;
        delete copy.元数据.存档分支输入;
        delete copy.元数据.现实保存时间戳;
        delete copy.元数据.现实保存时间ISO;
        delete copy.元数据.自动存档签名;
        delete copy.元数据.自动存档节点ID;
        delete copy.元数据.对象存储哈希;
        delete copy.元数据.对象存储存档ID;
        delete copy.元数据.对象存储同步时间;
    }
    copy.历史记录 = [];
    return copy;
};

const 是否普通对象 = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const 构建JsonPatch = (base: unknown, next: unknown, path: JsonPath = [], out: JsonPatchOp[] = []): JsonPatchOp[] => {
    if (Object.is(base, next)) return out;
    if (Array.isArray(base) || Array.isArray(next) || !是否普通对象(base) || !是否普通对象(next)) {
        if (JSON.stringify(base) !== JSON.stringify(next)) out.push({ path, value: next });
        return out;
    }
    const keys = new Set([...Object.keys(base), ...Object.keys(next)]);
    keys.forEach((key) => {
        if (!(key in next)) {
            out.push({ path: [...path, key], delete: true });
            return;
        }
        构建JsonPatch((base as any)[key], (next as any)[key], [...path, key], out);
    });
    return out;
};

const 应用JsonPatch = (base: unknown, patch: JsonPatchOp[] = []): any => {
    const root = 深拷贝(base);
    patch.forEach((op) => {
        if (!Array.isArray(op.path) || op.path.length === 0) return;
        let target: any = root;
        for (let index = 0; index < op.path.length - 1; index += 1) {
            const key = op.path[index];
            if (!target[key] || typeof target[key] !== 'object') target[key] = {};
            target = target[key];
        }
        const key = op.path[op.path.length - 1];
        if (op.delete) delete target[key];
        else target[key] = op.value;
    });
    return root;
};

const 历史记录是否前缀 = (base: unknown[], next: unknown[]): boolean => {
    if (base.length > next.length) return false;
    for (let index = 0; index < base.length; index += 1) {
        if (JSON.stringify(base[index]) !== JSON.stringify(next[index])) return false;
    }
    return true;
};

const 规范化云端存档清单 = (manifest: 云端存档清单): 云端存档清单 => {
    const byId = new Map<string, 云端存档摘要>();
    const sorted = [...manifest.saves]
        .filter((item) => item && !item.deletedAt)
        .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    sorted.forEach((raw) => {
        const seriesId = 读取摘要系列ID(raw);
        const parentCloudId = readString(raw.parentCloudId || raw.baseCloudId);
        const parent = parentCloudId ? byId.get(parentCloudId) : undefined;
        const rootCloudId = readString(raw.rootCloudId) || parent?.rootCloudId || parent?.cloudId || raw.cloudId;
        byId.set(raw.cloudId, {
            ...raw,
            seriesId,
            parentCloudId: parent?.cloudId || '',
            baseCloudId: parent?.cloudId || raw.baseCloudId,
            rootCloudId,
            depth: parent ? Number(parent.depth || 0) + 1 : 0
        });
    });
    return {
        ...manifest,
        saves: [...byId.values()].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    };
};

const 编码云端存档包 = (pack: 云端存档包): Uint8Array => TEXT_ENCODER.encode(JSON.stringify(pack));

const 解码云端存档包 = (bytes: Uint8Array): 云端存档包 | null => {
    try {
        const payload = JSON.parse(TEXT_DECODER.decode(bytes));
        if (payload?.format !== 'moranjianghu-cloud-play-save-package') return null;
        return payload as 云端存档包;
    } catch {
        return null;
    }
};

const 查找差分基准 = async (
    save: 存档结构,
    manifest: 云端存档清单
): Promise<差分基准> => {
    const localSaves = await dbService.读取存档列表().catch(() => []);
    const currentHash = dbService.计算存档同步哈希(save);
    const seriesId = 构建存档系列ID(save);
    const parentHash = readString((save.元数据 as any)?.存档父节点哈希);
    if (parentHash) {
        const explicitSummary = manifest.saves.find((item) => item.syncHash === parentHash && 读取摘要系列ID(item) === seriesId);
        const explicitLocal = explicitSummary
            ? localSaves.find((item) => dbService.计算存档同步哈希(item) === explicitSummary.syncHash)
            : undefined;
        if (explicitSummary && explicitLocal) return { summary: explicitSummary, save: explicitLocal };
    }
    const nextHistoryCount = Array.isArray(save.历史记录) ? save.历史记录.length : 0;
    const candidates = 规范化云端存档清单(manifest).saves
        .filter((item) => item.syncHash !== currentHash && 读取摘要系列ID(item) === seriesId)
        .filter((item) => Number(item.historyCount || 0) <= nextHistoryCount)
        .sort((a, b) => Number(b.historyCount || 0) - Number(a.historyCount || 0) || Number(b.timestamp || 0) - Number(a.timestamp || 0));
    for (const summary of candidates) {
        const local = localSaves.find((item) => dbService.计算存档同步哈希(item) === summary.syncHash);
        if (local) return { summary, save: local };
    }
    return null;
};

const 构建存档上传包 = async (
    save: 存档结构,
    manifest: 云端存档清单,
    forcedBase?: 差分基准
): Promise<{ pack: 云端存档包; packageFormat: 'snapshot' | 'delta'; baseCloudId?: string; baseSyncHash?: string }> => {
    const base = forcedBase === undefined ? await 查找差分基准(save, manifest) : forcedBase;
    const imageFallbacks = await 准备云端包图片兜底(save);
    if (!base) {
        return {
            packageFormat: 'snapshot',
            pack: {
                format: 'moranjianghu-cloud-play-save-package',
                version: 1,
                kind: 'snapshot',
                save,
                imageFallbacks
            }
        };
    }
    const baseGame = 去除存档易变字段(base.save);
    const nextGame = 去除存档易变字段(save);
    const baseHistory = Array.isArray(base.save.历史记录) ? base.save.历史记录 : [];
    const nextHistory = Array.isArray(save.历史记录) ? save.历史记录 : [];
    const prefix = 历史记录是否前缀(baseHistory, nextHistory);
    return {
        packageFormat: 'delta',
        baseCloudId: base.summary.cloudId,
        baseSyncHash: base.summary.syncHash,
        pack: {
            format: 'moranjianghu-cloud-play-save-package',
            version: 1,
            kind: 'delta',
            baseCloudId: base.summary.cloudId,
            baseSyncHash: base.summary.syncHash,
            gamePatch: 构建JsonPatch(baseGame, nextGame),
            historyBaseLength: prefix ? baseHistory.length : 0,
            historyAppend: prefix ? nextHistory.slice(baseHistory.length) : undefined,
            historyReplace: prefix ? undefined : nextHistory,
            imageFallbacks
        }
    };
};

const 导入加密密钥 = async (session: 云端游玩账号): Promise<CryptoKey> => {
    const material = await crypto.subtle.importKey(
        'raw',
        TEXT_ENCODER.encode(`${session.username}\n${session.password}`),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: TEXT_ENCODER.encode(session.clientSalt),
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
};

export const 加密字节 = async (bytes: Uint8Array, session: 云端游玩账号): Promise<Uint8Array> => {
    const iv = randomBytes(12);
    const key = await 导入加密密钥(session);
    const encrypted = arrayBufferToBytes(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    const ivB64 = bytesToBase64(iv);
    const dataB64 = bytesToBase64(encrypted);
    const json = `{"format":"moranjianghu-cloud-play-encrypted","version":1,"algorithm":"AES-GCM","kdf":"PBKDF2-SHA256","iterations":${PBKDF2_ITERATIONS},"iv":"${ivB64}","data":"${dataB64}"}`;
    return TEXT_ENCODER.encode(json);
};

export const 解密字节 = async (payloadBytes: Uint8Array, session: 云端游玩账号): Promise<Uint8Array> => {
    const payload = JSON.parse(TEXT_DECODER.decode(payloadBytes));
    if (payload?.format !== 'moranjianghu-cloud-play-encrypted') throw new Error('云端存档包格式不受支持。');
    const iv = base64ToBytes(readString(payload.iv));
    const data = base64ToBytes(readString(payload.data));
    const key = await 导入加密密钥(session);
    return arrayBufferToBytes(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data));
};

export const callCloudPlayApi = async (action: string, body: Record<string, unknown>): Promise<any> => {
    const response = await fetch(`${buildImageHostProxyUrl(CLOUD_PLAY_API_PATH)}?action=${encodeURIComponent(action)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body)
    });
    const text = await response.text();
    let payload: any = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = null;
    }
    if (!response.ok || payload?.ok === false) {
        throw new Error(readString(payload?.error) || text.slice(0, 160) || `HTTP ${response.status}`);
    }
    return payload;
};

const 保存会话 = (session: 云端游玩账号): void => {
    const payload: 持久云端游玩会话 = {
        expiresAt: Date.now() + CLOUD_PLAY_SESSION_TTL_MS,
        session
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
};

export const 设置云端游玩存储模式 = (mode: 云端游玩存储模式 | 'local'): void => {
    写入云端游玩存储模式(mode);
};

const 读取有效云端会话载荷 = (): 持久云端游玩会话 | null => {
    try {
        const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        const payload: 持久云端游玩会话 = parsed?.session ? parsed : {
            session: parsed,
            expiresAt: 0
        };
        if (!payload?.session?.username || !payload.session?.password || !payload.session?.clientSalt) return null;
        if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
        return payload;
    } catch {
        localStorage.removeItem(SESSION_KEY);
        return null;
    }
};

export const 读取云端游玩会话 = (): 云端游玩账号 | null => {
    return 读取有效云端会话载荷()?.session || null;
};

export const 清除云端游玩会话 = (): void => {
    localStorage.removeItem(SESSION_KEY);
};

export const 启用对象存储云端游玩模式 = (): void => {
    设置云端游玩存储模式('object');
};

export const 清除对象存储云端游玩模式 = (): void => {
    清除云端游玩存储模式标记();
};

export const 已启用对象存储云端游玩模式 = (): boolean => {
    const stored = 读取云端游玩原始存储模式();
    return stored === 'object' || stored === 'true';
};

export const 读取云端游玩存储模式 = (): 云端游玩存储模式 | null => {
    const stored = 读取云端游玩原始存储模式();
    if (stored === 'local') return null;
    if (stored === 'object' || stored === 'true') return 'object';
    if (stored === 'tg') return 读取云端游玩会话() ? 'tg' : null;
    return 读取云端游玩会话() ? 'tg' : null;
};

export const 读取对象存储云端游玩配置 = async (): Promise<对象存储同步配置 | null> => {
    if (读取云端游玩存储模式() !== 'object') return null;
    return 读取对象存储同步配置();
};

export const 准备开启云端新存档 = (preferredMode: 云端游玩存储模式): 云端游玩存储模式 | null => {
    if (preferredMode === 'object') {
        设置云端游玩存储模式('object');
        return 'object';
    }
    if (读取云端游玩会话()) {
        设置云端游玩存储模式('tg');
        return 'tg';
    }
    return null;
};

export const 已确认云端游玩风险 = (): boolean => localStorage.getItem(RISK_ACK_KEY) === 'true';

export const 设置云端游玩风险确认 = (): void => {
    localStorage.setItem(RISK_ACK_KEY, 'true');
};

export const 注册云端游玩账号 = async (username: string, password: string): Promise<云端游玩账号> => {
    const payload = await callCloudPlayApi('register', { username, password });
    const user = payload.user as ApiUser;
    const session = { ...user, password };
    保存会话(session);
    设置云端游玩存储模式('tg');
    return session;
};

export const 登录云端游玩账号 = async (username: string, password: string): Promise<云端游玩账号> => {
    const payload = await callCloudPlayApi('login', { username, password });
    const user = payload.user as ApiUser;
    const session = { ...user, password };
    保存会话(session);
    设置云端游玩存储模式('tg');
    return session;
};

const 更新云端清单地址 = async (session: 云端游玩账号, manifestUrl: string): Promise<云端游玩账号> => {
    const payload = await callCloudPlayApi('update-manifest', {
        username: session.username,
        password: session.password,
        manifestUrl
    });
    const user = payload.user as ApiUser;
    const nextSession = { ...session, ...user, password: session.password };
    保存会话(nextSession);
    return nextSession;
};

const 空清单 = (session: 云端游玩账号): 云端存档清单 => ({
    format: 'moranjianghu-cloud-play',
    version: 1,
    userId: session.userId,
    username: session.username,
    updatedAt: new Date().toISOString(),
    saves: []
});

export const 读取云端存档清单 = async (session: 云端游玩账号): Promise<云端存档清单> => {
    const manifestUrl = readString(session.manifestUrl);
    if (!manifestUrl) return 空清单(session);
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`读取云端存档清单失败：HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.format !== 'moranjianghu-cloud-play' || !Array.isArray(payload?.saves)) {
        throw new Error('云端存档清单格式无效。');
    }
    const manifest = 规范化云端存档清单({
        format: 'moranjianghu-cloud-play',
        version: 1,
        userId: readString(payload.userId) || session.userId,
        username: readString(payload.username) || session.username,
        updatedAt: readString(payload.updatedAt) || new Date().toISOString(),
        saves: payload.saves
    });
    缓存云端清单(session, manifest);
    return manifest;
};

const 读取地点文本 = (save: Partial<存档结构>): string => {
    const env: any = save.环境信息 || {};
    return [env.具体地点, env.小地点, env.中地点, env.大地点]
        .map(readString)
        .find(Boolean) || '未知地点';
};

const 读取时间文本 = (save: Partial<存档结构>): string => {
    const env: any = save.环境信息 || {};
    const direct = readString(env.时间);
    if (direct) return direct;
    const values = [env.年, env.月, env.日, env.时, env.分].map((item) => Number(item));
    if (values.every(Number.isFinite)) {
        const pad2 = (value: number) => Math.trunc(value).toString().padStart(2, '0');
        return `${Math.trunc(values[0])}:${pad2(values[1])}:${pad2(values[2])}:${pad2(values[3])}:${pad2(values[4])}`;
    }
    return '未知时间';
};

const 构建云端摘要 = (
    save: 存档结构,
    packageUrl: string,
    packageSize: number | undefined,
    sha256: string,
    options?: { packageFormat?: 'zip' | 'snapshot' | 'delta'; baseCloudId?: string; parentCloudId?: string; rootCloudId?: string; depth?: number }
): 云端存档摘要 => {
    const syncHash = dbService.计算存档同步哈希(save);
    const seriesId = 构建存档系列ID(save);
    const parentCloudId = readString(options?.parentCloudId || options?.baseCloudId);
    const cloudId = `${save.类型 === 'auto' ? 'auto' : 'manual'}-${syncHash.slice(0, 16)}`;
    return {
        cloudId,
        syncHash,
        seriesId,
        rootCloudId: readString(options?.rootCloudId) || (parentCloudId ? '' : cloudId),
        parentCloudId,
        title: readString(save.角色数据?.姓名) || '未知角色',
        type: save.类型 === 'auto' ? 'auto' : 'manual',
        timestamp: Number(save.时间戳) || Date.now(),
        savedAt: new Date(Number(save.元数据?.现实保存时间戳 || save.时间戳 || Date.now())).toISOString(),
        location: 读取地点文本(save),
        gameTime: 读取时间文本(save),
        historyCount: Array.isArray(save.历史记录) ? save.历史记录.length : 0,
        turnCount: 读取存档游玩回合数(save),
        packageUrl,
        packageSize,
        sha256,
        packageFormat: options?.packageFormat,
        baseCloudId: options?.baseCloudId || parentCloudId,
        parentSyncHash: readString((save.元数据 as any)?.存档父节点哈希),
        rootSyncHash: readString((save.元数据 as any)?.存档根节点哈希) || syncHash,
        depth: Math.max(0, Math.floor(Number(options?.depth || 0))),
        branchInput: readString((save.元数据 as any)?.存档分支输入) || (parentCloudId ? '继续游玩' : '开局')
    };
};

const 补全云端存档谱系元数据 = (save: 存档结构, item: 云端存档摘要): 存档结构 => {
    const syncHash = readString(item.syncHash) || dbService.计算存档同步哈希(save);
    const metadata: Record<string, any> = {
        ...(save.元数据 || {})
    };
    if (syncHash) metadata.存档哈希 = syncHash;
    const seriesId = readString(item.seriesId);
    if (seriesId) metadata.存档系列ID = seriesId;
    metadata.存档父节点哈希 = readString(item.parentSyncHash) || readString(metadata.存档父节点哈希);
    metadata.存档根节点哈希 = readString(item.rootSyncHash) || readString(metadata.存档根节点哈希) || syncHash;
    const depth = Number(item.depth);
    if (Number.isFinite(depth)) metadata.存档谱系深度 = Math.max(0, Math.floor(depth));
    const branchInput = readString(item.branchInput);
    if (branchInput) metadata.存档分支输入 = branchInput;
    const turnCount = Number(item.turnCount);
    if (Number.isFinite(turnCount) && turnCount >= 0) metadata.游戏回合数 = Math.floor(turnCount);
    metadata.存档谱系版本 = 1;
    return {
        ...save,
        类型: item.type === 'auto' ? 'auto' : (save.类型 || 'manual'),
        时间戳: Number(save.时间戳 || item.timestamp || Date.now()),
        元数据: metadata as any
    } as 存档结构;
};

const 上传清单 = async (
    session: 云端游玩账号,
    manifest: 云端存档清单,
    onProgress?: (progress: 云端上传进度) => void
): Promise<云端游玩账号> => {
    const prepared = 规范化云端存档清单(manifest);
    const normalized: 云端存档清单 = {
        ...prepared,
        format: 'moranjianghu-cloud-play',
        version: 1,
        userId: session.userId,
        username: session.username,
        updatedAt: new Date().toISOString(),
        saves: [...prepared.saves].sort((a, b) => b.timestamp - a.timestamp)
    };
    const blob = new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json' });
    const uploaded = await 上传Blob到图床(blob, {
        fileName: `moranjianghu-cloud-manifest-${session.userId}-${Date.now()}.json`,
        maxAttempts: 4,
        onProgress: (progress) => onProgress?.({
            stage: 'upload-manifest',
            uploadBytes: progress.uploadBytes,
            attempt: progress.attempt,
            maxAttempts: progress.maxAttempts,
            percent: progress.stage === 'success' ? 95 : 85,
            message: progress.message.replace('文件', '云端清单')
        })
    });
    const nextSession = await 更新云端清单地址(session, uploaded.url);
    缓存云端清单(nextSession, normalized);
    return nextSession;
};

export const 上传单个存档到云端 = async (
    session: 云端游玩账号,
    save: 存档结构,
    currentManifest?: 云端存档清单,
    onProgress?: (progress: 云端上传进度) => void
): Promise<{ session: 云端游玩账号; manifest: 云端存档清单; uploaded: boolean }> => {
    onProgress?.({ stage: 'manifest', percent: 5, message: '正在读取云端存档清单' });
    const manifest = currentManifest || await 读取云端存档清单(session);
    const syncHash = dbService.计算存档同步哈希(save);
    if (manifest.saves.some((item) => item.syncHash === syncHash)) {
        onProgress?.({ stage: 'done', percent: 100, message: '云端已有相同存档，已跳过上传' });
        return { session, manifest, uploaded: false };
    }
    onProgress?.({ stage: 'package', percent: 20, message: '正在生成增量云端存档包' });
    const packagePlan = await 构建存档上传包(save, manifest);
    const packageBytes = 编码云端存档包(packagePlan.pack);
    onProgress?.({
        stage: 'encrypt',
        percent: 35,
        uploadBytes: packageBytes.byteLength,
        message: packagePlan.packageFormat === 'delta'
            ? `正在加密差分存档包 ${Math.round(packageBytes.byteLength / 1024)}KB`
            : `正在加密完整快照 ${Math.round(packageBytes.byteLength / 1024)}KB`
    });
    const encryptedBytes = await 加密字节(packageBytes, session);
    const encryptedHash = await sha256Hex(encryptedBytes);
    const packageBlob = new Blob([encryptedBytes], { type: 'application/octet-stream' });
    const uploaded = await 上传Blob到图床(packageBlob, {
        fileName: `moranjianghu-cloud-save-${session.userId}-${syncHash.slice(0, 12)}.mjc`,
        maxAttempts: 4,
        onProgress: (progress) => onProgress?.({
            stage: 'upload-save',
            uploadBytes: progress.uploadBytes,
            attempt: progress.attempt,
            maxAttempts: progress.maxAttempts,
            percent: progress.stage === 'success' ? 75 : 40 + Math.min(25, (progress.attempt / Math.max(1, progress.maxAttempts)) * 25),
            message: progress.message.replace('文件', '加密存档包')
        })
    });
    const baseSummary = packagePlan.baseCloudId ? manifest.saves.find((item) => item.cloudId === packagePlan.baseCloudId) : undefined;
    const nextManifest: 云端存档清单 = {
        ...manifest,
        saves: [
            构建云端摘要(save, uploaded.url, uploaded.size, encryptedHash, {
                packageFormat: packagePlan.packageFormat,
                baseCloudId: packagePlan.baseCloudId,
                parentCloudId: packagePlan.baseCloudId,
                rootCloudId: baseSummary?.rootCloudId || baseSummary?.cloudId,
                depth: baseSummary ? Number(baseSummary.depth || 0) + 1 : 0
            }),
            ...manifest.saves.filter((item) => item.syncHash !== syncHash)
        ]
    };
    const nextSession = await 上传清单(session, nextManifest, onProgress);
    const resultManifest = { ...nextManifest, updatedAt: new Date().toISOString() };
    缓存云端清单(nextSession, resultManifest);
    onProgress?.({ stage: 'done', percent: 100, message: '云端存档同步完成' });
    return { session: nextSession, manifest: resultManifest, uploaded: true };
};

let 后台同步队列: Promise<unknown> = Promise.resolve();
let tg图床后台同步冷却到 = 0;

const 是否TG图床临时不可用 = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error || '');
    return /TG图床上游暂时不可用|HTTP\s+5\d\d|error code:\s*1102|Service Unavailable/i.test(message);
};

export const 后台同步存档到云端 = (save: 存档结构): void => {
    const mode = 读取云端游玩存储模式();
    if (mode === 'object') {
        后台同步队列 = 后台同步队列
            .catch(() => undefined)
            .then(async () => {
                const objectStorageConfig = await 读取对象存储云端游玩配置();
                if (!objectStorageConfig) return;
                await 增量同步到对象存储(objectStorageConfig, [save], undefined, {
                    includeImages: false,
                    includeAncestors: false
                });
            })
            .catch((error) => {
                console.warn('对象存储云端游玩自动同步失败:', error);
            });
        return;
    }
    if (mode !== 'tg') return;
    const session = 读取云端游玩会话();
    if (!session) return;
    if (Date.now() < tg图床后台同步冷却到) return;
    后台同步队列 = 后台同步队列
        .catch(() => undefined)
        .then(async () => {
            if (Date.now() < tg图床后台同步冷却到) return;
            const result = await 上传单个存档到云端(session, save);
            if (result.session) 保存会话(result.session);
        })
        .catch((error) => {
            if (是否TG图床临时不可用(error)) {
                tg图床后台同步冷却到 = Date.now() + 2 * 60 * 1000;
            }
            console.warn('云端游玩自动同步失败:', error);
        });
};

export const 等待云端后台同步完成 = async (): Promise<void> => {
    await 后台同步队列;
};

export const 确保本地存档已同步到云端 = async (save: 存档结构): Promise<'local' | 'object' | 'tg'> => {
    const mode = 读取云端游玩存储模式();
    if (!mode) return 'local';

    if (mode === 'object') {
        const objectStorageConfig = await 读取对象存储云端游玩配置();
        if (!objectStorageConfig) throw new Error('对象存储云端游玩已开启，但未读取到对象存储配置。');
        await 增量同步到对象存储(objectStorageConfig, [save]);
        return 'object';
    }

    const session = 读取云端游玩会话();
    if (!session) throw new Error('TG 图床云端游玩已开启，但登录会话已失效。');
    const result = await 上传单个存档到云端(session, save);
    if (result.session) 保存会话(result.session);
    return 'tg';
};

export const 确保最新本地存档已同步到云端 = async (): Promise<'local' | 'object' | 'tg' | 'none'> => {
    const mode = 读取云端游玩存储模式();
    if (!mode) return 'local';

    const saves = await dbService.读取存档列表();
    const latestSave = [...saves]
        .sort((a, b) => Number(b?.时间戳 || 0) - Number(a?.时间戳 || 0))[0];
    if (!latestSave) return 'none';

    return 确保本地存档已同步到云端(latestSave);
};

export const 复制全部本地存档到云端 = async (
    session: 云端游玩账号,
    onProgress?: (progress: 云端上传进度) => void
): Promise<{ uploaded: number; skipped: number; total: number; session: 云端游玩账号 }> => {
    const localSaves = await dbService.读取存档列表();
    onProgress?.({ stage: 'manifest', current: 0, total: localSaves.length, percent: 3, message: '正在读取云端存档清单' });
    let manifest = await 读取云端存档清单(session);
    let activeSession = session;
    let uploaded = 0;
    let skipped = 0;
    const knownHashes = new Set(manifest.saves.map((item) => item.syncHash));
    for (let index = 0; index < localSaves.length; index += 1) {
        const save = localSaves[index];
        const syncHash = dbService.计算存档同步哈希(save);
        if (knownHashes.has(syncHash)) {
            skipped += 1;
            continue;
        }
        const label = readString(save.角色数据?.姓名) || '未知角色';
        onProgress?.({ stage: 'package', current: index + 1, total: localSaves.length, percent: Math.round((index / Math.max(1, localSaves.length)) * 100), message: `正在复制 ${index + 1}/${localSaves.length}：${label}` });
        const result = await 上传单个存档到云端(activeSession, save, manifest, (progress) => {
            onProgress?.({
                ...progress,
                current: index + 1,
                total: localSaves.length,
                message: `${label}：${progress.message}`
            });
        });
        activeSession = result.session;
        manifest = result.manifest;
        knownHashes.add(syncHash);
        if (result.uploaded) uploaded += 1;
        else skipped += 1;
    }
    保存会话(activeSession);
    return { uploaded, skipped, total: localSaves.length, session: activeSession };
};

export const 上传本地存档到云端 = async (
    session: 云端游玩账号,
    save: 存档结构,
    onProgress?: (progress: 云端上传进度) => void
): Promise<{ uploaded: boolean; session: 云端游玩账号; manifest: 云端存档清单 }> => {
    onProgress?.({ stage: 'manifest', current: 0, total: 1, percent: 3, message: '正在读取云端存档清单' });
    const manifest = await 读取云端存档清单(session);
    const syncHash = dbService.计算存档同步哈希(save);
    if (manifest.saves.some((item) => item.syncHash === syncHash)) {
        保存会话(session);
        onProgress?.({ stage: 'done', current: 1, total: 1, percent: 100, message: '云端已有相同存档，已直接切换到云端游玩。' });
        return { uploaded: false, session, manifest };
    }
    const result = await 上传单个存档到云端(session, save, manifest, (progress) => {
        onProgress?.({ ...progress, current: 1, total: 1 });
    });
    保存会话(result.session);
    return result;
};

const 下载并解密云端存档字节 = async (
    session: 云端游玩账号,
    item: 云端存档摘要,
    onProgress?: (progress: 云端下载进度) => void
): Promise<Uint8Array> => {
    const encryptedBytes = await fetchCloudSaveBytes(item.packageUrl, 5, onProgress);
    const hash = await sha256Hex(encryptedBytes);
    if (item.sha256 && hash !== item.sha256) throw new Error('云端存档校验失败，文件可能不完整。');
    onProgress?.({ stage: 'decrypt', message: '校验通过，正在解密云端存档...' });
    return 解密字节(encryptedBytes, session);
};

const 从云端存档包还原存档 = async (
    session: 云端游玩账号,
    item: 云端存档摘要,
    manifest: 云端存档清单,
    seen = new Set<string>(),
    onProgress?: (progress: 云端下载进度) => void
): Promise<存档结构> => {
    if (seen.has(item.cloudId)) throw new Error('云端差分存档链存在循环引用，无法还原。');
    seen.add(item.cloudId);
    onProgress?.({
        stage: 'restore',
        current: seen.size,
        message: `正在还原时间树节点 ${seen.size}：${item.title || '云端存档'}`
    });
    const bytes = await 下载并解密云端存档字节(session, item, onProgress);
    const cloudPack = 解码云端存档包(bytes);
    if (!cloudPack) {
        const payload = await 解析ZIP存档文件(new Blob([bytes], { type: 'application/zip' }));
        const save = payload.saves[0];
        if (!save) throw new Error('云端存档包内没有可读取的存档。');
        return save;
    }
    恢复云端包图片兜底(cloudPack);
    if (cloudPack.kind === 'snapshot') {
        if (!cloudPack.save) throw new Error('云端快照存档内容为空。');
        return 补全云端存档谱系元数据(cloudPack.save, item);
    }
    const baseCloudId = readString(cloudPack.baseCloudId || item.baseCloudId);
    const base = manifest.saves.find((candidate) => candidate.cloudId === baseCloudId || candidate.syncHash === cloudPack.baseSyncHash);
    if (!base) throw new Error('云端差分存档缺少上一版本，无法还原。');
    const baseSave = await 从云端存档包还原存档(session, base, manifest, seen, onProgress);
    const restoredGame = 应用JsonPatch(去除存档易变字段(baseSave), cloudPack.gamePatch || []);
    const baseHistory = Array.isArray(baseSave.历史记录) ? baseSave.历史记录 : [];
    const nextHistory = Array.isArray(cloudPack.historyReplace)
        ? cloudPack.historyReplace
        : [
            ...baseHistory.slice(0, Number(cloudPack.historyBaseLength) || baseHistory.length),
            ...(Array.isArray(cloudPack.historyAppend) ? cloudPack.historyAppend : [])
        ];
    return 补全云端存档谱系元数据({
        ...(restoredGame || {}),
        id: Number((restoredGame as any)?.id) || 0,
        历史记录: nextHistory
    } as 存档结构, item);
};

export const 下载云端存档包 = async (
    session: 云端游玩账号,
    item: 云端存档摘要,
    onProgress?: (progress: 云端下载进度) => void
): Promise<dbService.存档导出结构> => {
    onProgress?.({ stage: 'manifest', message: '正在读取云端时间树清单...' });
    const manifest = await 读取云端存档清单(session).catch(() => 读取缓存云端存档清单(session) || 空清单(session));
    const save = await 从云端存档包还原存档(session, item, manifest, new Set<string>(), onProgress);
    onProgress?.({ stage: 'done', message: '云端存档已读取完成，正在进入游戏...' });
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        saves: [save]
    };
};

const 重新上传存档节点包 = async (
    session: 云端游玩账号,
    save: 存档结构,
    manifest: 云端存档清单,
    previous: 云端存档摘要,
    base: 差分基准
): Promise<云端存档摘要> => {
    const packagePlan = await 构建存档上传包(save, manifest, base);
    const packageBytes = 编码云端存档包(packagePlan.pack);
    const encryptedBytes = await 加密字节(packageBytes, session);
    const encryptedHash = await sha256Hex(encryptedBytes);
    const packageBlob = new Blob([encryptedBytes], { type: 'application/octet-stream' });
    const uploaded = await 上传Blob到图床(packageBlob, {
        fileName: `moranjianghu-cloud-save-${session.userId}-${previous.syncHash.slice(0, 12)}-rebased.mjc`,
        maxAttempts: 4
    });
    const parent = base?.summary;
    return {
        ...构建云端摘要(save, uploaded.url, uploaded.size, encryptedHash, {
            packageFormat: packagePlan.packageFormat,
            baseCloudId: parent?.cloudId,
            parentCloudId: parent?.cloudId,
            rootCloudId: parent?.rootCloudId || parent?.cloudId || previous.cloudId,
            depth: parent ? Number(parent.depth || 0) + 1 : 0
        }),
        cloudId: previous.cloudId,
        syncHash: previous.syncHash,
        savedAt: previous.savedAt,
        timestamp: previous.timestamp,
        type: previous.type
    };
};

export const 删除云端存档节点 = async (
    session: 云端游玩账号,
    target: 云端存档摘要
): Promise<{ session: 云端游玩账号; manifest: 云端存档清单; removed: boolean; rebased: number }> => {
    const manifest = 规范化云端存档清单(await 读取云端存档清单(session));
    const targetItem = manifest.saves.find((item) => item.cloudId === target.cloudId || item.syncHash === target.syncHash);
    if (!targetItem) return { session, manifest, removed: false, rebased: 0 };

    const targetSave = await 从云端存档包还原存档(session, targetItem, manifest);
    const parent = targetItem.parentCloudId ? manifest.saves.find((item) => item.cloudId === targetItem.parentCloudId) : undefined;
    const children = manifest.saves
        .filter((item) => item.parentCloudId === targetItem.cloudId || item.baseCloudId === targetItem.cloudId)
        .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    const nextById = new Map(manifest.saves.map((item) => [item.cloudId, item]));
    nextById.delete(targetItem.cloudId);

    let promotedParent = parent;
    let promotedSave: 存档结构 | null = null;
    let rebased = 0;
    for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        const childSave = await 从云端存档包还原存档(session, child, manifest);
        let base: 差分基准 = null;
        if (parent) {
            base = { summary: parent, save: await 从云端存档包还原存档(session, parent, manifest) };
        } else if (promotedParent && promotedSave) {
            base = { summary: promotedParent, save: promotedSave };
        }
        const rebasedChild = await 重新上传存档节点包(session, childSave, manifest, child, base);
        const normalizedChild: 云端存档摘要 = parent
            ? rebasedChild
            : index === 0
                ? {
                    ...rebasedChild,
                    packageFormat: 'snapshot',
                    baseCloudId: '',
                    parentCloudId: '',
                    rootCloudId: child.cloudId,
                    depth: 0
                }
                : rebasedChild;
        nextById.set(child.cloudId, normalizedChild);
        if (!parent && index === 0) {
            promotedParent = normalizedChild;
            promotedSave = childSave;
        }
        rebased += 1;
    }

    const nextManifest = 规范化云端存档清单({
        ...manifest,
        saves: [...nextById.values()]
    });
    const nextSession = await 上传清单(session, nextManifest);
    const resultManifest = 规范化云端存档清单({ ...nextManifest, updatedAt: new Date().toISOString() });
    缓存云端清单(nextSession, resultManifest);
    void targetSave;
    return { session: nextSession, manifest: resultManifest, removed: true, rebased };
};

export const 导入云端存档到本地 = async (session: 云端游玩账号, item: 云端存档摘要): Promise<dbService.存档导入结果> => {
    const payload = await 下载云端存档包(session, item);
    return dbService.导入存档数据(payload, { 覆盖现有: false });
};

export const 保存云端存档为本地文件 = async (session: 云端游玩账号, item: 云端存档摘要): Promise<void> => {
    const payload = await 下载云端存档包(session, item);
    const blob = await 导出ZIP存档文件({ saves: payload.saves, includeImages: true });
    const safeTitle = (item.title || 'cloud-save').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 40) || 'cloud-save';
    const url = 创建并记录ObjectURL(blob, {
        source: 'cloudPlayService.保存云端存档为本地文件',
        kind: 'cloud-save-export',
        detail: { saveId: item.id, title: item.title, syncHash: item.syncHash }
    });
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `墨染江湖_云端存档_${safeTitle}_${item.syncHash.slice(0, 8)}.zip`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    } finally {
        延迟释放并记录ObjectURL(url, {
            source: 'cloudPlayService.保存云端存档为本地文件',
            kind: 'cloud-save-export',
            detail: { reason: 'download-clicked', saveId: item.id }
        }, 1000);
    }
};
