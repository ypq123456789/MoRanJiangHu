import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import * as dbService from './dbService';
import { 设置键 } from '../utils/settingsSchema';
import { 解析图片资源引用ID } from '../utils/imageAssets';

export const GITHUB_TOKEN_KEY = 'github_sync_token';
export const GITHUB_REPO_KEY = 'github_sync_repo';
export const CLOUD_ZIP_FILENAME = 'WuXia_Save_Data.zip';
export const GITHUB_REPO_DESCRIPTION = 'WuXia 私有云存档仓库';
export const GITHUB_RELEASE_TAG = 'wuxia-cloud-sync';
export const GITHUB_RELEASE_NAME = 'WuXia Cloud Sync';

const 云同步ZIP格式标识 = 'wuxia-cloud-sync-zip';
const 云同步ZIP版本 = 1;
const 图片资源存储名 = 'image_assets';
const GITHUB_API_BASE = 'https://api.github.com';
const RELEASE_UPLOAD_PROXY_PATH = '/api/github/release-upload';
const RELEASE_DOWNLOAD_PROXY_PATH = '/api/github/release-download';
const 云同步分卷大小 = 8 * 1024 * 1024;
const 云同步分卷清单文件名 = 'WuXia_Save_Data.parts.json';
const 云同步分卷前缀 = 'WuXia_Save_Data.part';

export type 云同步进度状态 = {
    direction: 'upload' | 'download' | null;
    stage: 'idle' | 'packing' | 'uploading' | 'downloading' | 'restoring';
    message: string;
    transferredBytes: number;
    totalBytes: number;
    partIndex: number;
    partCount: number;
    speedBytesPerSecond: number;
};

type 云同步进度回调 = (progress: 云同步进度状态) => void;

type 云同步ZIP清单 = {
    format: typeof 云同步ZIP格式标识;
    version: number;
    exportedAt: string;
    saves: {
        indexFile: string;
        count: number;
    };
    settings: {
        indexFile: string;
        count: number;
    };
    assets: {
        indexFile: string;
        count: number;
    };
};

type 云同步存档索引项 = {
    key: string;
    类型: 'manual' | 'auto';
    时间戳: number;
    标题: string;
    file: string;
};

type 云同步设置索引项 = {
    key: string;
    category: string;
    file: string;
};

type 云同步图片索引项 = {
    id: string;
    file: string;
    mimeType: string;
    createdAt: number;
};

type 图片资源记录 = {
    id: string;
    dataUrl: string;
    createdAt: number;
};

type GitHubUser = {
    login: string;
};

type RepoConfig = {
    owner: string;
    repo: string;
};

type ReleaseAsset = {
    id: number;
    name: string;
    size?: number;
    url?: string;
    browser_download_url?: string;
    updated_at?: string;
};

type ReleaseInfo = {
    id: number;
    upload_url: string;
    html_url?: string;
    assets?: ReleaseAsset[];
};

type 云同步分卷清单 = {
    format: 'wuxia-cloud-sync-multipart';
    version: number;
    exportedAt: string;
    fileName: typeof CLOUD_ZIP_FILENAME;
    totalSize: number;
    partSize: number;
    partCount: number;
    parts: Array<{
        name: string;
        size: number;
        index: number;
    }>;
};

const 排除提示词键集合 = new Set<string>([
    设置键.提示词池,
    设置键.内置提示词,
    设置键.世界书列表,
    设置键.世界书预设组,
    'wuxia_prompts'
]);

const 默认进度状态: 云同步进度状态 = {
    direction: null,
    stage: 'idle',
    message: '',
    transferredBytes: 0,
    totalBytes: 0,
    partIndex: 0,
    partCount: 0,
    speedBytesPerSecond: 0
};

const 是否提示词相关键 = (key: string): boolean => 排除提示词键集合.has(key);

const 读取文本 = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

const 安全路径段 = (value: string, fallback: string): string => {
    const normalized = 读取文本(value)
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || fallback;
};

const 规范化仓库名 = (value: string): string => {
    return 读取文本(value)
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[._-]+|[._-]+$/g, '')
        .slice(0, 100);
};

const pad2 = (value: number): string => Math.trunc(value).toString().padStart(2, '0');

const 构建存档键 = (save: any, index: number): string => {
    const date = new Date(save?.时间戳 || Date.now());
    const stamp = Number.isNaN(date.getTime())
        ? `${Date.now()}`
        : `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
    const title = 安全路径段(读取文本(save?.角色数据?.姓名), `save_${index + 1}`);
    const type = save?.类型 === 'auto' ? 'auto' : 'manual';
    return `${type}_${stamp}_${title}`;
};

const 从Mime推断扩展名 = (mimeType: string): string => {
    const normalized = (mimeType || '').toLowerCase();
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('gif')) return 'gif';
    if (normalized.includes('bmp')) return 'bmp';
    if (normalized.includes('svg')) return 'svg';
    if (normalized.includes('mp3') || normalized.includes('mpeg')) return 'mp3';
    if (normalized.includes('wav')) return 'wav';
    if (normalized.includes('ogg')) return 'ogg';
    return 'bin';
};

const dataUrl转二进制 = (dataUrl: string): { bytes: Uint8Array; mimeType: string } => {
    const matched = dataUrl.match(/^data:([^;,]+);base64,(.*)$/i);
    if (!matched) {
        throw new Error('图片资源不是有效的 data URL');
    }
    const mimeType = matched[1] || 'application/octet-stream';
    const base64 = matched[2] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return { bytes, mimeType };
};

const 二进制转DataUrl = (bytes: Uint8Array, mimeType: string): string => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
};

const githubFetch = async (token: string, url: string, init?: RequestInit): Promise<Response> => {
    return fetch(url, {
        ...init,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(init?.headers || {})
        }
    });
};

const 创建进度发射器 = (onProgress?: 云同步进度回调) => {
    const startedAt = Date.now();
    return (patch: Partial<云同步进度状态>) => {
        if (!onProgress) return;
        const transferredBytes = patch.transferredBytes ?? 0;
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
        onProgress({
            ...默认进度状态,
            ...patch,
            transferredBytes,
            speedBytesPerSecond: patch.speedBytesPerSecond ?? (transferredBytes > 0 ? transferredBytes / elapsedSeconds : 0)
        });
    };
};

const 切分分卷 = (bytes: Uint8Array): Uint8Array[] => {
    const parts: Uint8Array[] = [];
    for (let offset = 0; offset < bytes.length; offset += 云同步分卷大小) {
        parts.push(bytes.slice(offset, Math.min(offset + 云同步分卷大小, bytes.length)));
    }
    return parts.length > 0 ? parts : [new Uint8Array()];
};

const 拼接分卷 = (parts: Uint8Array[]): Uint8Array => {
    const totalSize = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(totalSize);
    let offset = 0;
    parts.forEach((part) => {
        output.set(part, offset);
        offset += part.length;
    });
    return output;
};

const 构建分卷文件名 = (index: number): string => `${云同步分卷前缀}${String(index + 1).padStart(3, '0')}`;

const 解析分卷清单 = (input: string): 云同步分卷清单 => {
    const parsed = JSON.parse(input) as 云同步分卷清单;
    if (parsed?.format !== 'wuxia-cloud-sync-multipart' || !Array.isArray(parsed.parts) || parsed.parts.length === 0) {
        throw new Error('云同步分卷清单无效');
    }
    return parsed;
};

const 获取当前用户 = async (token: string): Promise<GitHubUser> => {
    const res = await githubFetch(token, `${GITHUB_API_BASE}/user`);
    if (!res.ok) throw new Error('无法获取 GitHub 用户信息');
    const data = await res.json();
    const login = 读取文本(data?.login);
    if (!login) throw new Error('GitHub 用户名为空');
    return { login };
};

const 读取仓库名缓存 = (): string => 读取文本(localStorage.getItem(GITHUB_REPO_KEY));

const 保存仓库名缓存 = (repo: string): void => {
    const normalized = 规范化仓库名(repo);
    if (!normalized) return;
    localStorage.setItem(GITHUB_REPO_KEY, normalized);
};

const 获取或询问仓库名 = (): string => {
    const cachedRaw = 读取仓库名缓存();
    const cached = 规范化仓库名(cachedRaw);
    if (cached) {
        if (cached !== cachedRaw) {
            保存仓库名缓存(cached);
        }
        return cached;
    }
    const input = window.prompt('请输入用于云同步的 GitHub 私有仓库名（仅仓库名，不含用户名，推荐英文/数字/中划线），首次使用会自动创建私有仓库：', 'wuxia-cloud-save');
    const normalized = 规范化仓库名(input || '');
    if (!normalized) {
        throw new Error('未提供有效的私有仓库名。GitHub 仓库名请仅使用英文、数字、点、下划线或中划线。');
    }
    保存仓库名缓存(normalized);
    return normalized;
};

export const getBoundRepoConfig = (): string | null => {
    return localStorage.getItem(GITHUB_REPO_KEY);
};

export const clearBoundRepoConfig = (): void => {
    localStorage.removeItem(GITHUB_REPO_KEY);
};

const 获取仓库配置 = async (token: string): Promise<RepoConfig> => {
    const user = await 获取当前用户(token);
    const repo = 获取或询问仓库名();
    return { owner: user.login, repo };
};

const 获取仓库URL = ({ owner, repo }: RepoConfig): string => `https://github.com/${owner}/${repo}`;
const 仓库API前缀 = ({ owner, repo }: RepoConfig): string => `${GITHUB_API_BASE}/repos/${owner}/${repo}`;

const 确保私有仓库存在 = async (token: string, config: RepoConfig): Promise<void> => {
    const repoRes = await githubFetch(token, 仓库API前缀(config));
    if (repoRes.ok) return;
    if (repoRes.status !== 404) {
        const detail = await repoRes.text().catch(() => '');
        throw new Error(`读取私有仓库失败：${repoRes.status}${detail ? ` - ${detail.slice(0, 120)}` : ''}`);
    }

    const createRes = await githubFetch(token, `${GITHUB_API_BASE}/user/repos`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: config.repo,
            description: GITHUB_REPO_DESCRIPTION,
            private: true,
            auto_init: true
        })
    });
    if (!createRes.ok) {
        const detail = await createRes.text().catch(() => '');
        if (createRes.status === 422) {
            throw new Error(`创建私有仓库失败：仓库名“${config.repo}”无效、已存在，或当前账号无权创建。请改用英文仓库名，例如 wuxia-cloud-save。${detail ? ` GitHub 返回：${detail.slice(0, 220)}` : ''}`);
        }
        throw new Error(`创建私有仓库失败：${createRes.status}${detail ? ` - ${detail.slice(0, 160)}` : ''}`);
    }
};

const 获取Release = async (token: string, config: RepoConfig): Promise<ReleaseInfo | null> => {
    const res = await githubFetch(token, `${仓库API前缀(config)}/releases/tags/${GITHUB_RELEASE_TAG}`);
    if (res.status === 404) return null;
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`读取云同步 Release 失败：${res.status}${detail ? ` - ${detail.slice(0, 120)}` : ''}`);
    }
    return await res.json();
};

const 确保Release存在 = async (token: string, config: RepoConfig): Promise<ReleaseInfo> => {
    const existing = await 获取Release(token, config);
    if (existing) return existing;

    const createRes = await githubFetch(token, `${仓库API前缀(config)}/releases`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            tag_name: GITHUB_RELEASE_TAG,
            name: GITHUB_RELEASE_NAME,
            body: 'WuXia 云同步二进制存档。',
            draft: false,
            prerelease: false,
            generate_release_notes: false
        })
    });
    if (!createRes.ok) {
        const detail = await createRes.text().catch(() => '');
        throw new Error(`创建云同步 Release 失败：${createRes.status}${detail ? ` - ${detail.slice(0, 160)}` : ''}`);
    }
    return await createRes.json();
};

const 查找分卷清单附件 = (release: ReleaseInfo | null | undefined): ReleaseAsset | null => {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    return assets.find((asset) => asset?.name === 云同步分卷清单文件名) || null;
};

const 查找分卷附件列表 = (release: ReleaseInfo | null | undefined): ReleaseAsset[] => {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    return assets
        .filter((asset) => 读取文本(asset?.name).startsWith(云同步分卷前缀))
        .sort((a, b) => 读取文本(a.name).localeCompare(读取文本(b.name), 'en'));
};

const 删除附件 = async (token: string, config: RepoConfig, assetId: number): Promise<void> => {
    const res = await githubFetch(token, `${仓库API前缀(config)}/releases/assets/${assetId}`, {
        method: 'DELETE'
    });
    if (!res.ok && res.status !== 404) {
        const detail = await res.text().catch(() => '');
        throw new Error(`删除旧附件失败：${res.status}${detail ? ` - ${detail.slice(0, 240)}` : ''}`);
    }
};

const 删除旧云同步附件 = async (token: string, config: RepoConfig, release: ReleaseInfo): Promise<void> => {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const targets = assets.filter((asset) => {
        const name = 读取文本(asset?.name);
        return name === CLOUD_ZIP_FILENAME || name === 云同步分卷清单文件名 || name.startsWith(云同步分卷前缀);
    });
    for (const asset of targets) {
        if (asset?.id) {
            await 删除附件(token, config, asset.id);
        }
    }
    if (targets.length > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
    }
};

const 执行Release附件上传 = async (token: string, uploadUrl: string, bytes: Uint8Array, contentType = 'application/octet-stream'): Promise<Response> => {
    return fetch(RELEASE_UPLOAD_PROXY_PATH, {
        method: 'POST',
        headers: {
            'Content-Type': contentType,
            'X-GitHub-Token': token,
            'X-GitHub-Upload-Url': uploadUrl
        },
        body: new Blob([bytes.slice().buffer], { type: contentType })
    });
};

const 上传单个附件 = async (token: string, release: ReleaseInfo, fileName: string, bytes: Uint8Array, contentType: string): Promise<void> => {
    const rawUploadUrl = 读取文本(release.upload_url).replace(/\{\?name,label\}$/, '');
    if (!rawUploadUrl) throw new Error('Release 上传地址无效');
    const uploadUrl = `${rawUploadUrl}?name=${encodeURIComponent(fileName)}`;
    const res = await 执行Release附件上传(token, uploadUrl, bytes, contentType);
    if (!res.ok) {
        const detailText = await res.text().catch(() => '');
        throw new Error(`上传附件失败：${fileName} - ${res.status}${detailText ? ` - ${detailText.slice(0, 260)}` : ''}`);
    }
};

const 下载Release附件二进制 = async (token: string, url: string): Promise<Uint8Array> => {
    const res = await fetch(RELEASE_DOWNLOAD_PROXY_PATH, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-GitHub-Token': token,
            'X-GitHub-Download-Url': url
        }
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`下载云存档附件失败：${res.status}${detail ? ` - ${detail.slice(0, 220)}` : ''}`);
    }
    return new Uint8Array(await res.arrayBuffer());
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

const 读取图片资源记录 = async (ids: Set<string>): Promise<图片资源记录[]> => {
    if (ids.size === 0) return [];
    const db = await dbService.初始化数据库();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([图片资源存储名], 'readonly');
        const store = transaction.objectStore(图片资源存储名);
        const tasks = Array.from(ids).map((id) => new Promise<图片资源记录 | null>((taskResolve, taskReject) => {
            const request = store.get(id);
            request.onsuccess = () => {
                const record = request.result;
                const dataUrl = 读取文本(record?.dataUrl);
                if (!dataUrl) {
                    taskResolve(null);
                    return;
                }
                taskResolve({
                    id,
                    dataUrl,
                    createdAt: Number.isFinite(record?.createdAt) ? Number(record.createdAt) : Date.now()
                });
            };
            request.onerror = () => taskReject(request.error);
        }));
        Promise.all(tasks).then((items) => {
            resolve(items.filter((item): item is 图片资源记录 => Boolean(item)));
        }).catch(reject);
    });
};

const 读取全部待同步设置 = async (): Promise<Array<{ key: string; category: string; value: unknown }>> => {
    const settingsList = await dbService.获取设置管理清单();
    const items: Array<{ key: string; category: string; value: unknown }> = [];
    for (const item of settingsList) {
        const key = item.key;
        if (!key || key === GITHUB_TOKEN_KEY || 是否提示词相关键(key)) continue;
        try {
            items.push({
                key,
                category: item.category || 'unknown',
                value: await dbService.读取设置(key)
            });
        } catch (error) {
            console.warn('读取设置失败:', key, error);
        }
    }
    return items;
};

const 构建云同步ZIP二进制 = async (): Promise<Uint8Array> => {
    const savePayload = await dbService.导出存档数据();
    const saves = Array.isArray(savePayload.saves) ? savePayload.saves : [];
    const settings = await 读取全部待同步设置();

    const assetIds = new Set<string>();
    收集图片资源引用ID(savePayload, assetIds);
    settings.forEach((item) => 收集图片资源引用ID(item.value, assetIds));
    const assets = await 读取图片资源记录(assetIds);

    const files: Record<string, Uint8Array> = {};
    const saveIndex: 云同步存档索引项[] = [];
    const settingsIndex: 云同步设置索引项[] = [];
    const assetIndex: 云同步图片索引项[] = [];

    saves.forEach((save, index) => {
        const saveKey = 构建存档键(save, index);
        const file = `saves/${saveKey}.json`;
        saveIndex.push({
            key: saveKey,
            类型: save?.类型 === 'auto' ? 'auto' : 'manual',
            时间戳: Number(save?.时间戳) || Date.now(),
            标题: 读取文本(save?.角色数据?.姓名) || '未知角色',
            file
        });
        files[file] = strToU8(JSON.stringify(save, null, 2));
    });

    settings.forEach((item) => {
        const category = 安全路径段(item.category || 'unknown', 'unknown');
        const keySafe = 安全路径段(item.key, 'setting');
        const file = `settings/${category}/${keySafe}.json`;
        settingsIndex.push({
            key: item.key,
            category: item.category,
            file
        });
        files[file] = strToU8(JSON.stringify(item.value, null, 2));
    });

    assets.forEach((asset) => {
        const { bytes, mimeType } = dataUrl转二进制(asset.dataUrl);
        const extension = 从Mime推断扩展名(mimeType);
        const file = `assets/bin/${asset.id}.${extension}`;
        assetIndex.push({
            id: asset.id,
            file,
            mimeType,
            createdAt: asset.createdAt
        });
        files[file] = bytes;
    });

    const manifest: 云同步ZIP清单 = {
        format: 云同步ZIP格式标识,
        version: 云同步ZIP版本,
        exportedAt: new Date().toISOString(),
        saves: {
            indexFile: 'saves/index.json',
            count: saveIndex.length
        },
        settings: {
            indexFile: 'settings/index.json',
            count: settingsIndex.length
        },
        assets: {
            indexFile: 'assets/index.json',
            count: assetIndex.length
        }
    };

    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    files[manifest.saves.indexFile] = strToU8(JSON.stringify({ version: 云同步ZIP版本, items: saveIndex }, null, 2));
    files[manifest.settings.indexFile] = strToU8(JSON.stringify({ version: 云同步ZIP版本, items: settingsIndex }, null, 2));
    files[manifest.assets.indexFile] = strToU8(JSON.stringify({ version: 云同步ZIP版本, items: assetIndex }, null, 2));

    return zipSync(files);
};

const 清空并写入图片资源 = async (assets: Array<{ id: string; dataUrl: string; createdAt: number }>): Promise<void> => {
    const db = await dbService.初始化数据库();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([图片资源存储名], 'readwrite');
        const store = transaction.objectStore(图片资源存储名);
        store.clear();
        assets.forEach((asset) => {
            store.put({
                id: asset.id,
                dataUrl: asset.dataUrl,
                createdAt: asset.createdAt
            });
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
    await dbService.预热图片资源缓存();
};

export async function extractSyncData(): Promise<Uint8Array> {
    return await 构建云同步ZIP二进制();
}

export async function restoreSyncData(zipBytes: Uint8Array): Promise<boolean> {
    try {
        const entries = unzipSync(zipBytes);
        const manifestEntry = entries['manifest.json'];
        if (!manifestEntry) {
            throw new Error('云存档缺少 manifest 清单');
        }

        const manifest = JSON.parse(strFromU8(manifestEntry)) as 云同步ZIP清单;
        if (manifest?.format !== 云同步ZIP格式标识 || Number(manifest?.version) !== 云同步ZIP版本) {
            throw new Error('云存档格式不受支持，请重新上传一次云存档。');
        }

        const savesIndexEntry = entries[manifest.saves.indexFile];
        const settingsIndexEntry = entries[manifest.settings.indexFile];
        const assetsIndexEntry = entries[manifest.assets.indexFile];
        if (!savesIndexEntry || !settingsIndexEntry || !assetsIndexEntry) {
            throw new Error('云存档索引文件不完整');
        }

        const savesIndex = JSON.parse(strFromU8(savesIndexEntry)) as { items?: 云同步存档索引项[] };
        const settingsIndex = JSON.parse(strFromU8(settingsIndexEntry)) as { items?: 云同步设置索引项[] };
        const assetsIndex = JSON.parse(strFromU8(assetsIndexEntry)) as { items?: 云同步图片索引项[] };

        const indexedSaveList = Array.isArray(savesIndex.items) ? savesIndex.items : [];
        const settingsList = Array.isArray(settingsIndex.items) ? settingsIndex.items : [];
        const assetList = Array.isArray(assetsIndex.items) ? assetsIndex.items : [];

        const fallbackSaveList: 云同步存档索引项[] = indexedSaveList.length > 0
            ? []
            : Object.keys(entries)
                .filter((path) => path.startsWith('saves/') && path.endsWith('.json') && path !== manifest.saves.indexFile)
                .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
                .map((file, index) => ({
                    key: `fallback_${index}`,
                    类型: 'manual',
                    时间戳: Date.now(),
                    标题: file,
                    file
                }));

        const saveList = indexedSaveList.length > 0 ? indexedSaveList : fallbackSaveList;

        const saves = saveList
            .map((item) => {
                const entry = entries[item.file];
                if (!entry) {
                    throw new Error(`缺少存档文件：${item.file}`);
                }
                return JSON.parse(strFromU8(entry));
            })
            .filter((item) => item && typeof item === 'object');

        const hasSaveData = saves.length > 0;
        const hasSettingData = settingsList.length > 0;
        const hasAssetData = assetList.length > 0;

        if (!hasSaveData && !hasSettingData && !hasAssetData) {
            throw new Error('云存档中未找到可恢复的数据');
        }

        if (hasSaveData) {
            await dbService.导入存档数据(saves, { 覆盖现有: true });
        }

        const importedSettingKeys = new Set(settingsList.map((item) => item.key).filter(Boolean));
        const currentSettings = await dbService.获取设置管理清单();
        for (const current of currentSettings) {
            if (!current.key || current.key === GITHUB_TOKEN_KEY || 是否提示词相关键(current.key)) continue;
            if (!importedSettingKeys.has(current.key)) {
                await dbService.删除设置(current.key);
            }
        }

        for (const item of settingsList) {
            if (!item.key || item.key === GITHUB_TOKEN_KEY || 是否提示词相关键(item.key)) continue;
            const entry = entries[item.file];
            if (!entry) {
                throw new Error(`缺少设置文件：${item.file}`);
            }
            const value = JSON.parse(strFromU8(entry));
            await dbService.保存设置(item.key, value);
        }

        const importedAssets = assetList.map((item) => {
            const entry = entries[item.file];
            if (!entry) {
                throw new Error(`缺少图片资源文件：${item.file}`);
            }
            return {
                id: item.id,
                dataUrl: 二进制转DataUrl(entry, item.mimeType || 'application/octet-stream'),
                createdAt: Number.isFinite(item.createdAt) ? Number(item.createdAt) : Date.now()
            };
        });

        await 清空并写入图片资源(importedAssets);
        await dbService.清理未引用图片资源();

        return true;
    } catch (e) {
        console.error('恢复数据失败:', e);
        return false;
    }
}

export async function fetchSyncMetaData(token: string): Promise<{ exists: boolean; updatedAt: string | null; url: string | null }> {
    try {
        const config = await 获取仓库配置(token);
        await 确保私有仓库存在(token, config);
        const release = await 确保Release存在(token, config);
        const manifestAsset = 查找分卷清单附件(release);
        const partAssets = 查找分卷附件列表(release);
        return {
            exists: Boolean(manifestAsset) && partAssets.length > 0,
            updatedAt: 读取文本(manifestAsset?.updated_at) || 读取文本(partAssets[0]?.updated_at) || null,
            url: 读取文本(release?.html_url) || 获取仓库URL(config)
        };
    } catch {
        return { exists: false, updatedAt: null, url: null };
    }
}

export async function uploadToCloud(token: string, onProgress?: 云同步进度回调): Promise<boolean> {
    const emit = 创建进度发射器(onProgress);
    emit({ direction: 'upload', stage: 'packing', message: '正在整理本地存档与设置...', totalBytes: 0, transferredBytes: 0 });

    const config = await 获取仓库配置(token);
    await 确保私有仓库存在(token, config);
    let release = await 确保Release存在(token, config);
    const zipBytes = await extractSyncData();
    const parts = 切分分卷(zipBytes);
    const totalBytes = zipBytes.length;

    emit({
        direction: 'upload',
        stage: 'uploading',
        message: `开始上传，共 ${parts.length} 个分卷`,
        totalBytes,
        transferredBytes: 0,
        partIndex: 0,
        partCount: parts.length
    });

    await 删除旧云同步附件(token, config, release);
    release = await 确保Release存在(token, config);

    let transferredBytes = 0;
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        const fileName = 构建分卷文件名(index);
        emit({
            direction: 'upload',
            stage: 'uploading',
            message: `正在上传分卷 ${index + 1}/${parts.length}`,
            totalBytes,
            transferredBytes,
            partIndex: index + 1,
            partCount: parts.length
        });
        await 上传单个附件(token, release, fileName, part, 'application/octet-stream');
        transferredBytes += part.length;
        emit({
            direction: 'upload',
            stage: 'uploading',
            message: `分卷 ${index + 1}/${parts.length} 上传完成`,
            totalBytes,
            transferredBytes,
            partIndex: index + 1,
            partCount: parts.length
        });
    }

    const manifest: 云同步分卷清单 = {
        format: 'wuxia-cloud-sync-multipart',
        version: 云同步ZIP版本,
        exportedAt: new Date().toISOString(),
        fileName: CLOUD_ZIP_FILENAME,
        totalSize: totalBytes,
        partSize: 云同步分卷大小,
        partCount: parts.length,
        parts: parts.map((part, index) => ({
            name: 构建分卷文件名(index),
            size: part.length,
            index
        }))
    };

    await 上传单个附件(token, release, 云同步分卷清单文件名, strToU8(JSON.stringify(manifest, null, 2)), 'application/json');
    emit({
        direction: 'upload',
        stage: 'idle',
        message: '云同步上传完成',
        totalBytes,
        transferredBytes: totalBytes,
        partIndex: parts.length,
        partCount: parts.length
    });
    return true;
}

export async function downloadFromCloud(token: string, onProgress?: 云同步进度回调): Promise<boolean> {
    const emit = 创建进度发射器(onProgress);
    const config = await 获取仓库配置(token);
    await 确保私有仓库存在(token, config);
    const release = await 确保Release存在(token, config);
    const manifestAsset = 查找分卷清单附件(release);
    const manifestUrl = 读取文本(manifestAsset?.url) || 读取文本(manifestAsset?.browser_download_url);
    if (!manifestAsset || !manifestUrl) {
        throw new Error('未在私有仓库 Release 中找到云同步分卷清单');
    }

    emit({ direction: 'download', stage: 'downloading', message: '正在读取云端分卷清单...', totalBytes: 0, transferredBytes: 0 });
    const manifestBytes = await 下载Release附件二进制(token, manifestUrl);
    const manifest = 解析分卷清单(strFromU8(manifestBytes));
    const assetMap = new Map((release.assets || []).map((asset) => [asset.name, asset]));

    let transferredBytes = 0;
    const parts: Uint8Array[] = [];
    for (let index = 0; index < manifest.parts.length; index += 1) {
        const partMeta = manifest.parts[index];
        const asset = assetMap.get(partMeta.name);
        const downloadUrl = 读取文本(asset?.url) || 读取文本(asset?.browser_download_url);
        if (!asset || !downloadUrl) {
            throw new Error(`缺少云端分卷：${partMeta.name}`);
        }
        emit({
            direction: 'download',
            stage: 'downloading',
            message: `正在下载分卷 ${index + 1}/${manifest.partCount}`,
            totalBytes: manifest.totalSize,
            transferredBytes,
            partIndex: index + 1,
            partCount: manifest.partCount
        });
        const partBytes = await 下载Release附件二进制(token, downloadUrl);
        parts.push(partBytes);
        transferredBytes += partBytes.length;
        emit({
            direction: 'download',
            stage: 'downloading',
            message: `分卷 ${index + 1}/${manifest.partCount} 下载完成`,
            totalBytes: manifest.totalSize,
            transferredBytes,
            partIndex: index + 1,
            partCount: manifest.partCount
        });
    }

    emit({
        direction: 'download',
        stage: 'restoring',
        message: '正在拼接分卷并恢复本地数据...',
        totalBytes: manifest.totalSize,
        transferredBytes: manifest.totalSize,
        partIndex: manifest.partCount,
        partCount: manifest.partCount
    });

    const zipBytes = 拼接分卷(parts);
    const restored = await restoreSyncData(zipBytes);
    emit({
        direction: 'download',
        stage: 'idle',
        message: restored ? '云同步恢复完成' : '云同步恢复失败',
        totalBytes: manifest.totalSize,
        transferredBytes: manifest.totalSize,
        partIndex: manifest.partCount,
        partCount: manifest.partCount
    });
    return restored;
}
