import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const makeSave = (index: number): any => ({
    类型: 'manual',
    时间戳: 1779000000000 + index,
    角色数据: { 姓名: `测试角色${index}` },
    环境信息: { 具体地点: '测试地点', 时间: '测试时间' },
    历史记录: [{ role: 'user', parts: [{ text: `第${index}条记录` }] }]
});

vi.mock('../data/releaseInfo', () => ({
    RELEASE_INFO: { versionName: '1.0.test', versionCode: 999 }
}));

vi.mock('../utils/nativeRuntime', () => ({
    构建同步API地址: () => '/api/object-storage-proxy'
}));

vi.mock('../utils/settingsSchema', () => ({
    设置键: { 对象存储同步配置: 'object-storage-sync-config' }
}));

vi.mock('../services/dbService', () => ({
    读取设置: vi.fn(),
    保存设置: vi.fn(),
    读取存档列表: vi.fn(async () => [makeSave(1), makeSave(2), makeSave(3)]),
    导入存档数据: vi.fn(),
    计算存档同步哈希: vi.fn((save: any) => save?.元数据?.存档哈希 || `sync${String(save?.时间戳 || '').slice(-4)}_${save?.环境信息?.具体地点 || ''}_${Array.isArray(save?.历史记录) ? save.历史记录.length : 0}`),
    计算存档摘要短哈希: vi.fn((save: any) => `hash${String(save?.时间戳 || '').slice(-4)}`)
}));

vi.mock('../services/saveArchiveService', () => ({
    导出ZIP存档文件: vi.fn(async ({ saves }: any) => {
        const save = saves?.[0] || makeSave(0);
        const body = JSON.stringify({
            save,
            padding: 'x'.repeat(900 * 1024)
        });
        return new Blob([body], { type: 'application/zip' });
    }),
    解析ZIP存档文件: vi.fn()
}));

vi.mock('../services/githubSync', () => ({
    extractSettingsSyncData: vi.fn(),
    restoreSettingsSyncData: vi.fn()
}));

describe('对象存储同步', () => {
    const config = {
        endpoint: 'https://s3.example.com',
        bucket: 'bucket',
        accessKey: 'access',
        secretKey: 'secret',
        prefix: 'MoRanJiangHuTest'
    };

    beforeEach(() => {
        vi.useRealTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('整包上传失败后回退分片，并并发上传多个存档', async () => {
        const directSaveKeys = new Set<string>();
        let activeWholeUploads = 0;
        let maxActiveWholeUploads = 0;
        let fallbackChunkUploads = 0;

        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            const method = headers.get('X-Object-Storage-Method') || '';
            const key = headers.get('X-Object-Storage-Key') || '';
            if (!method) {
                throw new TypeError('CORS blocked direct object storage request');
            }

            if (method === 'GET' && key.endsWith('/manifest.json')) {
                return new Response('', { status: 404 });
            }

            if (
                method === 'PUT'
                && key.includes('/saves/')
                && key.endsWith('.json')
                && String(init?.body || '').includes('"archiveBase64"')
            ) {
                directSaveKeys.add(key);
                activeWholeUploads += 1;
                maxActiveWholeUploads = Math.max(maxActiveWholeUploads, activeWholeUploads);
                await new Promise((resolve) => setTimeout(resolve, 10));
                activeWholeUploads -= 1;
                return new Response('too large', { status: 413 });
            }

            if (method === 'PUT' && key.includes('/chunks/saves/')) {
                fallbackChunkUploads += 1;
                return new Response('', { status: 200 });
            }

            if (method === 'PUT' && key.endsWith('/manifest.json')) {
                const manifest = JSON.parse(String(init?.body || '{}'));
                expect(manifest.saves).toHaveLength(3);
                return new Response('', { status: 200 });
            }

            return new Response('', { status: 200 });
        }));

        const { 增量同步到对象存储 } = await import('../services/objectStorageSync');
        const result = await 增量同步到对象存储(config);

        expect(result.uploaded).toBe(3);
        expect(result.skipped).toBe(0);
        expect(directSaveKeys.size).toBe(3);
        expect(fallbackChunkUploads).toBeGreaterThan(3);
        expect(maxActiveWholeUploads).toBeGreaterThan(1);
    });

    it('增量导入会下载同同步键云存档，再交给本地精确去重', async () => {
        const local = makeSave(1);
        const cloud = {
            ...makeSave(1),
            环境信息: { 具体地点: '手机新增地点', 时间: '手机新增时间' },
            历史记录: [
                { role: 'user', parts: [{ text: '手机新增回合' }] },
                { role: 'assistant', content: '新内容' }
            ]
        };
        const packagePayload = {
            format: 'moranjianghu-object-storage-save-package',
            version: 1,
            metadata: {
                id: 'manual_same_sync_key_hash',
                fileName: 'manual_same_sync_key_hash.json',
                syncKey: 'manual|1779000000001|测试角色1',
                title: '测试角色1',
                type: 'manual',
                saveTimestamp: 1779000000001,
                savedAt: new Date(1779000000001).toISOString(),
                syncedAt: new Date(1779000001000).toISOString(),
                deviceType: 'phone',
                deviceLabel: '手机',
                appVersion: '1.0.test',
                versionCode: 999,
                hash: 'abcdef1234567890',
                size: 1234,
                location: '手机新增地点',
                gameTime: '手机新增时间'
            },
            archiveBase64: 'ZmFrZS16aXA='
        };

        const dbService = await import('../services/dbService');
        vi.mocked(dbService.读取存档列表).mockResolvedValueOnce([local]);
        vi.mocked(dbService.导入存档数据).mockResolvedValueOnce({ total: 1, imported: 1, skipped: 0 });
        const archiveService = await import('../services/saveArchiveService');
        vi.mocked(archiveService.解析ZIP存档文件).mockResolvedValueOnce({ saves: [cloud] } as any);

        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            const method = headers.get('X-Object-Storage-Method') || '';
            const key = headers.get('X-Object-Storage-Key') || '';
            if (!method) {
                throw new TypeError('CORS blocked direct object storage request');
            }
            if (method === 'GET' && key.endsWith('/saves/manual_same_sync_key_hash.json')) {
                return new Response(JSON.stringify(packagePayload), { status: 200 });
            }
            throw new Error(`unexpected request ${method} ${key}`);
        }));

        const { 增量导入对象存储云存档 } = await import('../services/objectStorageSync');
        const result = await 增量导入对象存储云存档(config, [packagePayload.metadata as any]);

        expect(result).toEqual({ total: 1, imported: 1, skipped: 0 });
        expect(archiveService.解析ZIP存档文件).toHaveBeenCalledTimes(1);
        expect(dbService.导入存档数据).toHaveBeenCalledWith(
            { saves: [expect.objectContaining({ 环境信息: expect.objectContaining({ 具体地点: '手机新增地点' }) })] },
            { 覆盖现有: false }
        );
    });

    it('上传遇到同同步键但不同哈希的存档时保留两个版本', async () => {
        const local = makeSave(1);
        const remoteMetadata = {
            id: 'manual_old_hash',
            fileName: 'manual_old_hash.json',
            syncKey: 'manual|1779000000001|测试角色1',
            title: '测试角色1',
            type: 'manual',
            saveTimestamp: 1779000000001,
            savedAt: new Date(1779000000001).toISOString(),
            syncedAt: new Date(1779000001000).toISOString(),
            deviceType: 'phone',
            deviceLabel: '手机',
            appVersion: '1.0.test',
            versionCode: 998,
            hash: 'remotehash0001',
            size: 1234,
            location: '手机地点',
            gameTime: '手机时间'
        };
        let writtenManifest: any = null;
        const dbService = await import('../services/dbService');
        vi.mocked(dbService.读取存档列表).mockResolvedValueOnce([local]);

        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            const method = headers.get('X-Object-Storage-Method') || '';
            const key = headers.get('X-Object-Storage-Key') || '';
            if (!method) {
                throw new TypeError('CORS blocked direct object storage request');
            }
            if (method === 'GET' && key.endsWith('/manifest.json')) {
                return new Response(JSON.stringify({
                    format: 'moranjianghu-object-storage-manifest',
                    version: 1,
                    updatedAt: new Date().toISOString(),
                    saves: [remoteMetadata]
                }), { status: 200 });
            }
            if (method === 'PUT' && key.includes('/saves/')) {
                return new Response('', { status: 200 });
            }
            if (method === 'PUT' && key.endsWith('/manifest.json')) {
                writtenManifest = JSON.parse(String(init?.body || '{}'));
                return new Response('', { status: 200 });
            }
            return new Response('', { status: 200 });
        }));

        const { 增量同步到对象存储 } = await import('../services/objectStorageSync');
        const result = await 增量同步到对象存储(config);

        expect(result.uploaded).toBe(1);
        expect(result.skipped).toBe(0);
        expect(writtenManifest.saves).toHaveLength(2);
        expect(new Set(writtenManifest.saves.map((item: any) => item.hash)).size).toBe(2);
    });

    it('上传新谱系根节点时从源头写成第0回合', async () => {
        const local = {
            ...makeSave(7),
            类型: 'auto',
            元数据: {
                存档哈希: 'roothash0007',
                存档系列ID: 'series-new',
                存档谱系深度: 7,
                游戏回合数: 7
            },
            历史记录: [
                { role: 'assistant', structuredResponse: {}, content: '开局正文' },
                { role: 'assistant', structuredResponse: {}, content: '后续正文' }
            ]
        };
        let writtenManifest: any = null;
        const dbService = await import('../services/dbService');
        vi.mocked(dbService.读取存档列表).mockResolvedValueOnce([local as any]);

        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            const method = headers.get('X-Object-Storage-Method') || '';
            const key = headers.get('X-Object-Storage-Key') || '';
            if (!method) throw new TypeError('CORS blocked direct object storage request');
            if (method === 'GET' && key.endsWith('/manifest.json')) {
                return new Response(JSON.stringify({
                    format: 'moranjianghu-object-storage-manifest',
                    version: 1,
                    updatedAt: new Date().toISOString(),
                    saves: []
                }), { status: 200 });
            }
            if (method === 'PUT' && key.includes('/saves/')) return new Response('', { status: 200 });
            if (method === 'PUT' && key.endsWith('/manifest.json')) {
                writtenManifest = JSON.parse(String(init?.body || '{}'));
                return new Response('', { status: 200 });
            }
            return new Response('', { status: 200 });
        }));

        const { 增量同步到对象存储 } = await import('../services/objectStorageSync');
        const result = await 增量同步到对象存储(config);

        expect(result.uploaded).toBe(1);
        expect(writtenManifest.saves).toHaveLength(1);
        expect(writtenManifest.saves[0]).toEqual(expect.objectContaining({
            hash: 'roothash0007',
            turnCount: 0,
            parentHash: '',
            rootHash: 'roothash0007',
            lineageDepth: 0,
            branchInput: '开局'
        }));
    });

    it('同一自动存档节点再次同步时更新云端节点，不生成平行分支', async () => {
        const local = {
            ...makeSave(2),
            类型: 'auto',
            时间戳: 1779000005000,
            角色数据: { 姓名: '杨培强' },
            元数据: {
                存档哈希: 'newautohash0002',
                存档系列ID: 'series-a',
                存档父节点哈希: 'parenthash0001',
                存档根节点哈希: 'parenthash0001',
                存档谱系版本: 1,
                存档谱系深度: 1,
                自动存档节点ID: 'turn:7|time:1:01:01:23:00|loc:百草阁后院厢房',
                自动存档签名: 'node:turn:7|time:1:01:01:23:00|loc:百草阁后院厢房'
            }
        };
        const oldRemote = {
            id: 'auto_old_hash',
            fileName: 'auto_old_hash.json',
            syncKey: 'auto-node|series-a|turn:7/time:1:01:01:23:00/loc:百草阁后院厢房|杨培强',
            title: '杨培强',
            type: 'auto',
            saveTimestamp: 1779000001000,
            savedAt: new Date(1779000001000).toISOString(),
            syncedAt: new Date(1779000002000).toISOString(),
            deviceType: 'phone',
            deviceLabel: '手机',
            appVersion: '1.0.test',
            versionCode: 998,
            hash: 'oldautohash0001',
            size: 1234,
            location: '百草阁后院厢房',
            gameTime: '1:01:01:23:00',
            seriesId: 'series-a',
            parentHash: 'parenthash0001',
            rootHash: 'parenthash0001',
            lineageDepth: 1,
            autoNodeId: 'turn:7|time:1:01:01:23:00|loc:百草阁后院厢房'
        };
        let writtenManifest: any = null;
        const dbService = await import('../services/dbService');
        vi.mocked(dbService.读取存档列表).mockResolvedValueOnce([local as any]);

        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            const method = headers.get('X-Object-Storage-Method') || '';
            const key = headers.get('X-Object-Storage-Key') || '';
            if (!method) throw new TypeError('CORS blocked direct object storage request');
            if (method === 'GET' && key.endsWith('/manifest.json')) {
                return new Response(JSON.stringify({
                    format: 'moranjianghu-object-storage-manifest',
                    version: 1,
                    updatedAt: new Date().toISOString(),
                    saves: [oldRemote]
                }), { status: 200 });
            }
            if (method === 'PUT' && key.includes('/saves/')) return new Response('', { status: 200 });
            if (method === 'PUT' && key.endsWith('/manifest.json')) {
                writtenManifest = JSON.parse(String(init?.body || '{}'));
                return new Response('', { status: 200 });
            }
            return new Response('', { status: 200 });
        }));

        const { 增量同步到对象存储 } = await import('../services/objectStorageSync');
        const result = await 增量同步到对象存储(config);

        expect(result.uploaded).toBe(1);
        expect(result.updated).toBe(1);
        expect(writtenManifest.saves).toHaveLength(1);
        expect(writtenManifest.saves[0]).toEqual(expect.objectContaining({
            hash: 'newautohash0002',
            autoNodeId: 'turn:7|time:1:01:01:23:00|loc:百草阁后院厢房'
        }));
    });

    it('读取旧对象存储清单时按自动存档语义收敛同回合同地点重复节点', async () => {
        const oldA = {
            id: 'auto_old_a',
            fileName: 'auto_old_a.json',
            title: '杨培强',
            type: 'auto',
            saveTimestamp: 1779000001000,
            savedAt: new Date(1779000001000).toISOString(),
            syncedAt: new Date(1779000002000).toISOString(),
            deviceType: 'phone',
            deviceLabel: '手机',
            appVersion: '1.0.test',
            versionCode: 998,
            hash: 'oldautohash0001',
            size: 1234,
            location: '百草阁后院厢房',
            gameTime: '1:01:01:23:00',
            turnCount: 7,
            seriesId: 'series-a',
            parentHash: 'parenthash0001',
            rootHash: 'parenthash0001',
            lineageDepth: 1
        };
        const oldB = {
            ...oldA,
            id: 'auto_old_b',
            fileName: 'auto_old_b.json',
            hash: 'oldautohash0002',
            syncedAt: new Date(1779000003000).toISOString()
        };

        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            const method = headers.get('X-Object-Storage-Method') || '';
            const key = headers.get('X-Object-Storage-Key') || '';
            if (!method) throw new TypeError('CORS blocked direct object storage request');
            if (method === 'GET' && key.endsWith('/manifest.json')) {
                return new Response(JSON.stringify({
                    format: 'moranjianghu-object-storage-manifest',
                    version: 1,
                    updatedAt: new Date().toISOString(),
                    saves: [oldA, oldB]
                }), { status: 200 });
            }
            return new Response('', { status: 200 });
        }));

        const { 列出对象存储云存档 } = await import('../services/objectStorageSync');
        const list = await 列出对象存储云存档(config);

        expect(list).toHaveLength(1);
        expect(list[0]).toEqual(expect.objectContaining({
            id: 'auto_old_b',
            hash: 'oldautohash0002'
        }));
    });

    it('读取旧对象存储清单时会把同一谱系的中途开线修回连续进度线并写回', async () => {
        const brokenRoot = {
            id: 'auto_root',
            fileName: 'auto_root.json',
            title: '杨培强',
            type: 'auto',
            saveTimestamp: 1779000000000,
            savedAt: new Date(1779000000000).toISOString(),
            syncedAt: new Date(1779000001000).toISOString(),
            deviceType: 'phone',
            deviceLabel: '手机',
            appVersion: '1.0.test',
            versionCode: 998,
            hash: 'root000000000001',
            size: 1234,
            location: '山门',
            gameTime: '1:01:01:08:00',
            turnCount: 0,
            seriesId: 'series-broken',
            rootHash: 'root000000000001',
            branchInput: '开局'
        };
        const brokenMiddleRoot = {
            ...brokenRoot,
            id: 'auto_middle',
            fileName: 'auto_middle.json',
            hash: 'middle0000000002',
            saveTimestamp: 1779000002000,
            savedAt: new Date(1779000002000).toISOString(),
            syncedAt: new Date(1779000003000).toISOString(),
            location: '藏经阁',
            gameTime: '1:01:01:09:00',
            turnCount: 5,
            rootHash: 'middle0000000002',
            parentHash: '',
            branchInput: '继续游玩'
        };
        let repairedManifest: any = null;

        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            const method = headers.get('X-Object-Storage-Method') || '';
            const key = headers.get('X-Object-Storage-Key') || '';
            if (!method) throw new TypeError('CORS blocked direct object storage request');
            if (method === 'GET' && key.endsWith('/manifest.json')) {
                return new Response(JSON.stringify({
                    format: 'moranjianghu-object-storage-manifest',
                    version: 1,
                    updatedAt: new Date().toISOString(),
                    saves: [brokenMiddleRoot, brokenRoot]
                }), { status: 200 });
            }
            if (method === 'PUT' && key.endsWith('/manifest.json')) {
                repairedManifest = JSON.parse(String(init?.body || '{}'));
                return new Response('', { status: 200 });
            }
            return new Response('', { status: 200 });
        }));

        const { 列出对象存储云存档 } = await import('../services/objectStorageSync');
        const list = await 列出对象存储云存档(config);
        const ordered = [...list].sort((a: any, b: any) => Number(a.turnCount) - Number(b.turnCount));

        expect(repairedManifest.saves).toHaveLength(2);
        expect(ordered.map((item: any) => item.turnCount)).toEqual([0, 1]);
        expect(ordered[1]).toEqual(expect.objectContaining({
            parentHash: 'root000000000001',
            rootHash: 'root000000000001',
            lineageDepth: 1
        }));
        expect(repairedManifest.saves.find((item: any) => item.hash === 'middle0000000002')).toEqual(expect.objectContaining({
            turnCount: 1,
            parentHash: 'root000000000001'
        }));
    });

    it('上传子节点时会把本地可找到的祖先节点一起打进云包', async () => {
        const parent = {
            ...makeSave(1),
            元数据: {
                存档哈希: 'parenthash0001',
                存档系列ID: 'series-a',
                存档根节点哈希: 'parenthash0001',
                存档谱系版本: 1,
                存档谱系深度: 0
            }
        };
        const child = {
            ...makeSave(2),
            元数据: {
                存档哈希: 'childhash0002',
                存档系列ID: 'series-a',
                存档父节点哈希: 'parenthash0001',
                存档根节点哈希: 'parenthash0001',
                存档谱系版本: 1,
                存档谱系深度: 1
            }
        };
        const dbService = await import('../services/dbService');
        vi.mocked(dbService.读取存档列表).mockResolvedValueOnce([parent, child]);
        const archiveService = await import('../services/saveArchiveService');
        const exportedBundles: any[][] = [];
        const exportedOptions: any[] = [];
        vi.mocked(archiveService.导出ZIP存档文件).mockImplementation(async (options: any) => {
            const { saves } = options || {};
            exportedOptions.push(options);
            exportedBundles.push(saves);
            return new Blob([JSON.stringify({ saves })], { type: 'application/zip' });
        });

        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            const method = headers.get('X-Object-Storage-Method') || '';
            const key = headers.get('X-Object-Storage-Key') || '';
            if (!method) throw new TypeError('CORS blocked direct object storage request');
            if (method === 'GET' && key.endsWith('/manifest.json')) {
                return new Response(JSON.stringify({
                    format: 'moranjianghu-object-storage-manifest',
                    version: 1,
                    updatedAt: new Date().toISOString(),
                    saves: [{
                        id: 'manual_parent',
                        fileName: 'manual_parent.json',
                        hash: 'parenthash0001',
                        saveTimestamp: parent.时间戳,
                        syncedAt: new Date().toISOString()
                    }]
                }), { status: 200 });
            }
            if (method === 'PUT' && key.includes('/saves/')) return new Response('', { status: 200 });
            if (method === 'PUT' && key.endsWith('/manifest.json')) return new Response('', { status: 200 });
            return new Response('', { status: 200 });
        }));

        const { 增量同步到对象存储 } = await import('../services/objectStorageSync');
        const result = await 增量同步到对象存储(config);

        expect(result.uploaded).toBe(1);
        expect(exportedBundles).toHaveLength(1);
        expect(exportedBundles[0].map((save) => save.元数据?.存档哈希)).toEqual(['parenthash0001', 'childhash0002']);
        expect(exportedOptions.every((options) => options?.includeImages === true)).toBe(true);
    });

    it('后台只同步当前存档时，也会补传本地可找到的祖先节点', async () => {
        const parent = {
            ...makeSave(1),
            元数据: {
                存档哈希: 'parenthash0001',
                存档系列ID: 'series-a',
                存档根节点哈希: 'parenthash0001',
                存档谱系版本: 1,
                存档谱系深度: 0
            }
        };
        const child = {
            ...makeSave(2),
            元数据: {
                存档哈希: 'childhash0002',
                存档系列ID: 'series-a',
                存档父节点哈希: 'parenthash0001',
                存档根节点哈希: 'parenthash0001',
                存档谱系版本: 1,
                存档谱系深度: 1
            }
        };
        const dbService = await import('../services/dbService');
        vi.mocked(dbService.读取存档列表).mockResolvedValueOnce([parent, child]);
        let writtenManifest: any = null;

        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            const method = headers.get('X-Object-Storage-Method') || '';
            const key = headers.get('X-Object-Storage-Key') || '';
            if (!method) throw new TypeError('CORS blocked direct object storage request');
            if (method === 'GET' && key.endsWith('/manifest.json')) {
                return new Response(JSON.stringify({
                    format: 'moranjianghu-object-storage-manifest',
                    version: 1,
                    updatedAt: new Date().toISOString(),
                    saves: []
                }), { status: 200 });
            }
            if (method === 'PUT' && key.includes('/saves/')) return new Response('', { status: 200 });
            if (method === 'PUT' && key.endsWith('/manifest.json')) {
                writtenManifest = JSON.parse(String(init?.body || '{}'));
                return new Response('', { status: 200 });
            }
            return new Response('', { status: 200 });
        }));

        const { 增量同步到对象存储 } = await import('../services/objectStorageSync');
        const result = await 增量同步到对象存储(config, [child as any]);

        expect(result.uploaded).toBe(2);
        expect(writtenManifest.saves.map((item: any) => item.hash).sort()).toEqual(['childhash0002', 'parenthash0001']);
    });

    it('增量导入云包时会恢复包内全部时间树节点', async () => {
        const parent = {
            ...makeSave(1),
            元数据: {
                存档哈希: 'parenthash0001',
                存档系列ID: 'series-a',
                存档根节点哈希: 'parenthash0001',
                存档谱系版本: 1,
                存档谱系深度: 0
            }
        };
        const child = {
            ...makeSave(2),
            元数据: {
                存档哈希: 'childhash0002',
                存档系列ID: 'series-a',
                存档父节点哈希: 'parenthash0001',
                存档根节点哈希: 'parenthash0001',
                存档谱系版本: 1,
                存档谱系深度: 1
            }
        };
        const metadata = {
            id: 'manual_child',
            fileName: 'manual_child.json',
            syncKey: 'manual|1779000000002|测试角色2',
            title: '测试角色2',
            type: 'manual',
            saveTimestamp: child.时间戳,
            savedAt: new Date(child.时间戳).toISOString(),
            syncedAt: new Date().toISOString(),
            hash: 'childhash0002',
            size: 1234,
            bundledSaveCount: 2
        };
        const dbService = await import('../services/dbService');
        vi.mocked(dbService.读取存档列表).mockResolvedValueOnce([]);
        vi.mocked(dbService.导入存档数据).mockResolvedValueOnce({ total: 2, imported: 2, skipped: 0 });
        const archiveService = await import('../services/saveArchiveService');
        vi.mocked(archiveService.解析ZIP存档文件).mockResolvedValueOnce({ saves: [parent, child] } as any);

        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            const method = headers.get('X-Object-Storage-Method') || '';
            const key = headers.get('X-Object-Storage-Key') || '';
            if (!method) throw new TypeError('CORS blocked direct object storage request');
            if (method === 'GET' && key.endsWith('/saves/manual_child.json')) {
                return new Response(JSON.stringify({
                    format: 'moranjianghu-object-storage-save-package',
                    version: 1,
                    metadata,
                    archiveBase64: 'ZmFrZS16aXA='
                }), { status: 200 });
            }
            throw new Error(`unexpected request ${method} ${key}`);
        }));

        const { 增量导入对象存储云存档 } = await import('../services/objectStorageSync');
        const result = await 增量导入对象存储云存档(config, [metadata as any]);

        expect(result).toEqual({ total: 1, imported: 2, skipped: 0 });
        expect(dbService.导入存档数据).toHaveBeenCalledWith(
            { saves: [expect.objectContaining({ 元数据: expect.objectContaining({ 存档哈希: 'parenthash0001' }) }), expect.objectContaining({ 元数据: expect.objectContaining({ 存档哈希: 'childhash0002' }) })] },
            { 覆盖现有: false }
        );
    });

    it('增量导入会用云端哈希跳过本地已有存档，避免重复下载', async () => {
        const local = {
            ...makeSave(1),
            元数据: { 存档哈希: 'abcdef1234567890' }
        };
        const cloudMetadata = {
            id: 'manual_existing_hash',
            fileName: 'manual_existing_hash.json',
            syncKey: 'manual|1779000000001|测试角色1',
            title: '测试角色1',
            type: 'manual',
            saveTimestamp: 1779000000001,
            savedAt: new Date(1779000000001).toISOString(),
            syncedAt: new Date(1779000001000).toISOString(),
            hash: 'abcdef1234567890',
            size: 1234
        };

        const dbService = await import('../services/dbService');
        vi.mocked(dbService.读取存档列表).mockResolvedValueOnce([local]);
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('不应下载本地已有哈希的云存档');
        }));

        const { 增量导入对象存储云存档 } = await import('../services/objectStorageSync');
        const result = await 增量导入对象存储云存档(config, [cloudMetadata as any]);

        expect(result).toEqual({ total: 1, imported: 0, skipped: 1 });
        expect(dbService.导入存档数据).not.toHaveBeenCalled();
    });

    it('可以从对象存储清单中删除单个云端存档，并删除对应包文件', async () => {
        let writtenManifest: any = null;
        const metadata = {
            id: 'manual_delete_me',
            fileName: 'manual_delete_me.json',
            syncKey: 'manual|1779000000001|测试角色1',
            title: '测试角色1',
            type: 'manual',
            saveTimestamp: 1779000000001,
            savedAt: new Date(1779000000001).toISOString(),
            syncedAt: new Date(1779000001000).toISOString(),
            deviceType: 'phone',
            deviceLabel: '手机',
            appVersion: '1.0.test',
            versionCode: 999,
            hash: 'deletehash0001',
            size: 1234,
            location: '测试地点',
            gameTime: '测试时间'
        };
        const keep = { ...metadata, id: 'manual_keep', fileName: 'manual_keep.json', hash: 'keephash0001' };
        const deletedKeys: string[] = [];

        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            const method = headers.get('X-Object-Storage-Method') || '';
            const key = headers.get('X-Object-Storage-Key') || '';
            if (!method) throw new TypeError('CORS blocked direct object storage request');
            if (method === 'GET' && key.endsWith('/manifest.json')) {
                return new Response(JSON.stringify({
                    format: 'moranjianghu-object-storage-manifest',
                    version: 1,
                    updatedAt: new Date().toISOString(),
                    saves: [metadata, keep]
                }), { status: 200 });
            }
            if (method === 'GET' && key.endsWith('/saves/manual_delete_me.json')) {
                return new Response(JSON.stringify({
                    format: 'moranjianghu-object-storage-save-package',
                    version: 1,
                    metadata,
                    archiveBase64: 'ZmFrZQ=='
                }), { status: 200 });
            }
            if (method === 'DELETE') {
                deletedKeys.push(key);
                return new Response('', { status: 204 });
            }
            if (method === 'PUT' && key.endsWith('/manifest.json')) {
                writtenManifest = JSON.parse(String(init?.body || '{}'));
                return new Response('', { status: 200 });
            }
            return new Response('', { status: 200 });
        }));

        const { 删除对象存储云存档 } = await import('../services/objectStorageSync');
        const result = await 删除对象存储云存档(config, metadata as any);

        expect(result.removed).toBe(true);
        expect(deletedKeys.some((key) => key.endsWith('/saves/manual_delete_me.json'))).toBe(true);
        expect(writtenManifest.saves).toHaveLength(1);
        expect(writtenManifest.saves[0].id).toBe('manual_keep');
    });

    it('B2 S3 端点会优先走 CDN 对象存储代理而不是浏览器直连', async () => {
        const b2Config = {
            ...config,
            endpoint: 'https://s3.us-west-004.backblazeb2.com'
        };
        const requestedUrls: string[] = [];

        vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
            const requestUrl = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
            requestedUrls.push(requestUrl);
            const headers = new Headers(init?.headers);
            const method = headers.get('X-Object-Storage-Method') || '';
            const key = headers.get('X-Object-Storage-Key') || '';

            if (!method) {
                throw new Error('B2 端点不应走浏览器直连');
            }

            if (method === 'GET' && key.endsWith('/manifest.json')) {
                return new Response('', { status: 404 });
            }

            if (method === 'PUT' && key.includes('/saves/')) {
                return new Response('', { status: 200 });
            }

            if (method === 'PUT' && key.endsWith('/manifest.json')) {
                return new Response('', { status: 200 });
            }

            return new Response('', { status: 200 });
        }));

        const { 增量同步到对象存储 } = await import('../services/objectStorageSync');
        const result = await 增量同步到对象存储(b2Config, [makeSave(99)]);

        expect(result.uploaded).toBe(1);
        expect(requestedUrls[0]).toBe('https://cdn.bacon159.pp.ua/api/object-storage-proxy');
        expect(requestedUrls.every((url) => !url.startsWith('https://s3.us-west-004.backblazeb2.com'))).toBe(true);
    });
});
