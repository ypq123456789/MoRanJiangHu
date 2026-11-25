import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncToObjectStorage = vi.fn();
const createLocalStorageMock = () => {
    const store = new Map<string, string>();
    return {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
            store.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
            store.delete(key);
        }),
        clear: vi.fn(() => {
            store.clear();
        })
    };
};

vi.mock('../services/dbService', () => ({
    计算存档同步哈希: vi.fn((save: any) => save?.元数据?.存档哈希 || 'abcd1234abcd1234'),
    读取存档列表: vi.fn(async () => []),
    读取图片资源: vi.fn(async (ref: string) => (
        String(ref).includes('player-avatar-local') ? 'data:image/png;base64,LOCAL_AVATAR' : ''
    )),
    保存图片资源并返回同步地址: vi.fn(async (_dataUrl: string, preferredId?: string) => (
        `https://image.example/assets/${preferredId || 'asset'}.png`
    ))
}));

vi.mock('../services/saveArchiveService', () => ({
    导出ZIP存档文件: vi.fn(async () => new Blob(['save'])),
    解析ZIP存档文件: vi.fn()
}));

vi.mock('../services/imageHostService', () => ({
    上传Blob到图床: vi.fn(async () => ({ url: 'https://image.example/save.mjc', size: 4 })),
    buildImageHostProxyUrl: (path: string) => path
}));

vi.mock('../services/objectStorageSync', () => ({
    读取对象存储同步配置: vi.fn(async () => ({
        endpoint: 'https://s3.example.com',
        bucket: 'bucket',
        accessKey: 'ak',
        secretKey: 'sk'
    })),
    增量同步到对象存储: (...args: any[]) => syncToObjectStorage(...args)
}));

describe('云端游玩存储模式', () => {
    beforeEach(async () => {
        vi.resetModules();
        vi.stubGlobal('localStorage', createLocalStorageMock());
        syncToObjectStorage.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('对象存储选择状态优先于已存在 TG 会话，后台自动同步不会被 TG 抢走', async () => {
        const service = await import('../services/cloudPlayService');
        localStorage.setItem('moranjianghu.cloudPlay.session.v1', JSON.stringify({
            expiresAt: Date.now() + 60_000,
            session: {
                userId: 'u1',
                username: 'tg-user',
                password: 'pw',
                clientSalt: 'salt'
            }
        }));
        service.启用对象存储云端游玩模式();
        syncToObjectStorage.mockResolvedValueOnce({ uploaded: 1, skipped: 0, updated: 0, deduped: 0, total: 1 });

        expect(service.读取云端游玩存储模式()).toBe('object');
        service.后台同步存档到云端({
            id: 1,
            类型: 'auto',
            时间戳: 1779000000000,
            角色数据: { 姓名: '杨培强' },
            环境信息: { 具体地点: '武馆' },
            历史记录: [],
            元数据: { 存档哈希: 'abcd1234abcd1234' }
        } as any);

        await vi.waitFor(() => expect(syncToObjectStorage).toHaveBeenCalledTimes(1));
        expect(syncToObjectStorage).toHaveBeenCalledWith(
            expect.any(Object),
            [expect.objectContaining({ id: 1 })],
            undefined,
            { includeImages: false, includeAncestors: false }
        );
    });

    it('没有系列 ID 的旧存档按各自根节点区分，不按角色名合并', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            format: 'moranjianghu-cloud-play',
            saves: [
                { cloudId: 'old-a', title: '杨培强', timestamp: 2 },
                { cloudId: 'old-b', title: '杨培强', timestamp: 1 }
            ]
        }), { status: 200 })));
        const service = await import('../services/cloudPlayService');
        const manifest = await service.读取云端存档清单({
            userId: 'u1', username: 'test', password: 'pw', clientSalt: 'salt',
            manifestUrl: 'https://image.example/manifest.json'
        });
        expect(manifest.saves.map((item) => item.seriesId)).toEqual(['old-a', 'old-b']);
        expect(manifest.saves.map((item) => item.rootCloudId)).toEqual(['old-a', 'old-b']);
    });

    it('子节点时间早于父节点时仍沿父节点归入同一系列', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            format: 'moranjianghu-cloud-play',
            saves: [
                { cloudId: 'child', title: '杨培强', timestamp: 1, parentCloudId: 'parent' },
                { cloudId: 'parent', title: '杨培强', timestamp: 2 }
            ]
        }), { status: 200 })));
        const service = await import('../services/cloudPlayService');
        const manifest = await service.读取云端存档清单({
            userId: 'u1', username: 'test', password: 'pw', clientSalt: 'salt',
            manifestUrl: 'https://image.example/manifest.json'
        });
        const byId = new Map(manifest.saves.map((item) => [item.cloudId, item]));
        expect(byId.get('child')?.seriesId).toBe(byId.get('parent')?.seriesId);
        expect(byId.get('child')?.rootCloudId).toBe('parent');
    });

    it('从云端游玩开启新存档时会覆盖旧的本地游玩标记并恢复 TG 同步', async () => {
        const service = await import('../services/cloudPlayService');
        localStorage.setItem('moranjianghu.cloudPlay.session.v1', JSON.stringify({
            expiresAt: Date.now() + 60_000,
            session: {
                userId: 'u1',
                username: 'tg-user',
                password: 'pw',
                clientSalt: 'salt'
            }
        }));
        service.设置云端游玩存储模式('local');

        expect(service.读取云端游玩存储模式()).toBeNull();
        expect(service.准备开启云端新存档('tg')).toBe('tg');
        expect(service.读取云端游玩存储模式()).toBe('tg');
    });

    it('从对象存储云端游玩开启新存档时会恢复对象存储自动同步模式', async () => {
        const service = await import('../services/cloudPlayService');
        service.设置云端游玩存储模式('local');

        expect(service.准备开启云端新存档('object')).toBe('object');
        expect(service.读取云端游玩存储模式()).toBe('object');
    });

    it('返回首页前可以等待云端自动同步队列完成', async () => {
        const service = await import('../services/cloudPlayService');
        localStorage.setItem('moranjianghu.cloudPlay.session.v1', JSON.stringify({
            expiresAt: Date.now() + 60_000,
            session: {
                userId: 'u1',
                username: 'tg-user',
                password: 'pw',
                clientSalt: 'salt'
            }
        }));
        service.启用对象存储云端游玩模式();

        let resolveSync!: () => void;
        const syncFinished = new Promise<void>((resolve) => { resolveSync = resolve; });
        syncToObjectStorage.mockImplementationOnce(async () => {
            await syncFinished;
            return { uploaded: 1, skipped: 0, updated: 0, deduped: 0, total: 1 };
        });

        service.后台同步存档到云端({
            id: 1,
            类型: 'auto',
            时间戳: 1779000000000,
            角色数据: { 姓名: '杨培开' },
            环境信息: { 具体地点: '武馆' },
            历史记录: [],
            元数据: { 存档哈希: 'abcd1234abcd1234' }
        } as any);

        let completed = false;
        const waiting = service.等待云端后台同步完成().then(() => { completed = true; });
        await vi.waitFor(() => expect(syncToObjectStorage).toHaveBeenCalledTimes(1));
        await Promise.resolve();
        expect(completed).toBe(false);
        resolveSync();
        await waiting;
        expect(completed).toBe(true);
    });

    it('TG 云端存档包只复用已登记可用的头像图床兜底映射，不内嵌图片数据或重复上传图片', async () => {
        vi.stubGlobal('crypto', {
            getRandomValues: (bytes: Uint8Array) => bytes.fill(7),
            subtle: {
                importKey: vi.fn(async () => ({})),
                deriveKey: vi.fn(async () => ({})),
                encrypt: vi.fn(async (_algorithm: unknown, _key: unknown, data: Uint8Array) => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
                digest: vi.fn(async () => new Uint8Array(32).buffer)
            }
        });
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/api/image-host/download')) {
                return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'Content-Type': 'image/png' } });
            }
            return new Response(JSON.stringify({
                ok: true,
                user: {
                    userId: 'u1',
                    username: 'tg-user',
                    clientSalt: 'salt',
                    manifestUrl: 'https://image.example/manifest.json'
                }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }));
        const imageHost = await import('../services/imageHostService');
        const dbService = await import('../services/dbService');
        const imageAssets = await import('../utils/imageAssets');
        imageAssets.注册远程图片兜底引用('https://image.example/assets/player-avatar-local.png', 'player-avatar-local');
        const uploadedBlobs: Blob[] = [];
        vi.mocked(imageHost.上传Blob到图床).mockImplementation(async (blob: Blob, options: any) => {
            uploadedBlobs.push(blob);
            return { url: `https://image.example/${options?.fileName || uploadedBlobs.length}`, size: blob.size };
        });

        const service = await import('../services/cloudPlayService');
        await service.上传单个存档到云端(
            { userId: 'u1', username: 'tg-user', password: 'pw', clientSalt: 'salt' },
            {
                id: 1,
                类型: 'manual',
                时间戳: 1779000000000,
                角色数据: {
                    姓名: '杨培强',
                    图片档案: {
                        已选头像图片ID: 'avatar-1',
                        生图历史: [
                            {
                                id: 'avatar-1',
                                构图: '头像',
                                状态: 'success',
                                本地路径: 'wuxia-asset://player-avatar-local'
                            }
                        ]
                    }
                },
                环境信息: { 具体地点: '武馆' },
                历史记录: [],
                元数据: { 存档哈希: 'abcd1234abcd1234' }
            } as any,
            {
                format: 'moranjianghu-cloud-play',
                version: 1,
                userId: 'u1',
                username: 'tg-user',
                updatedAt: new Date().toISOString(),
                saves: []
            }
        );

        const encryptedPackage = JSON.parse(await uploadedBlobs[0].text());
        const pack = JSON.parse(Buffer.from(encryptedPackage.data, 'base64').toString('utf8'));
        expect(pack.imageFallbacks).toEqual([
            {
                id: 'player-avatar-local',
                remoteUrl: 'https://image.example/assets/player-avatar-local.png'
            }
        ]);
        expect(JSON.stringify(pack)).not.toContain('LOCAL_AVATAR');
        expect(dbService.保存图片资源并返回同步地址).not.toHaveBeenCalled();
    });
});
