import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    settings: new Map<string, { value: unknown; updatedAt: number }>(),
    assets: new Map<string, { id: string; dataUrl: string; createdAt: number }>(),
    cloudPayload: '' as string,
    apiCalls: [] as string[],
    readSettingCalls: [] as string[],
    getAllSnapshotCalls: 0,
    changeListeners: new Set<(change: any) => void>(),
    session: {
        userId: 'CP-test',
        username: 'bacon',
        password: 'pwd123456',
        clientSalt: 'salt'
    } as any
}));

vi.mock('../services/dbService', () => ({
    获取设置管理清单: async () => {
        state.getAllSnapshotCalls += 1;
        return Array.from(state.settings.entries()).map(([key, record]) => ({
            key,
            label: key,
            category: 'customization',
            categoryLabel: '',
            description: '',
            size: 0,
            summary: '',
            updatedAt: record.updatedAt,
            internal: false,
            known: true
        }));
    },
    读取设置键列表: async () => Array.from(state.settings.keys()),
    读取单条设置记录: async (key: string) => {
        state.readSettingCalls.push(key);
        const record = state.settings.get(key);
        if (!record) return null;
        return { key, value: record.value, updatedAt: record.updatedAt, category: 'customization' };
    },
    读取设置: async (key: string) => state.settings.get(key)?.value ?? null,
    静默保存设置: async (key: string, value: unknown, updatedAt: number) => {
        state.settings.set(key, { value, updatedAt });
    },
    静默删除设置: async (key: string) => {
        state.settings.delete(key);
    },
    条件静默删除设置: async (key: string, maxUpdatedAt: number) => {
        const existing = state.settings.get(key);
        if (!existing || existing.updatedAt >= maxUpdatedAt) return false;
        state.settings.delete(key);
        return true;
    },
    条件静默保存设置: async (key: string, value: unknown, minUpdatedAt: number) => {
        const existing = state.settings.get(key);
        if (existing && existing.updatedAt >= minUpdatedAt) return false;
        state.settings.set(key, { value, updatedAt: minUpdatedAt });
        return true;
    },
    读取设置一致性快照: async () => {
        state.getAllSnapshotCalls += 1;
        return Array.from(state.settings.entries()).map(([key, record]) => ({
            key,
            value: record.value,
            updatedAt: record.updatedAt,
            category: 'customization'
        }));
    },
    读取单条图片资源原始记录: async (id: string) => state.assets.get(id) ?? null,
    读取图片资源原始列表: async (ids: string[]) => ids
        .map((id) => state.assets.get(id))
        .filter((item): item is { id: string; dataUrl: string; createdAt: number } => Boolean(item)),
    写入图片资源原始列表: async (assets: Array<{ id: string; dataUrl: string; createdAt: number }>) => {
        assets.forEach((asset) => state.assets.set(asset.id, asset));
        return assets.length;
    },
    订阅设置变更: (listener: (change: any) => void) => {
        state.changeListeners.add(listener);
        return () => state.changeListeners.delete(listener);
    }
}));

vi.mock('../services/cloudPlayService', () => ({
    读取云端游玩会话: () => state.session,
    // 测试里用可逆的伪加密，只验证打包/解包链路，不验证真实 AES
    加密字节: async (bytes: Uint8Array) => new Uint8Array([0x50, 0x4b, ...bytes]),
    解密字节: async (bytes: Uint8Array) => bytes.slice(2),
    callCloudPlayApi: async (action: string, body: any) => {
        state.apiCalls.push(action);
        if (action === 'settings-upload') {
            state.cloudPayload = String(body.payload || '');
            return { ok: true };
        }
        if (action === 'settings-download') {
            return state.cloudPayload
                ? { ok: true, exists: true, payload: state.cloudPayload }
                : { ok: true, exists: false };
        }
        throw new Error(`unexpected action ${action}`);
    }
}));

const 构造云端包 = (
    settings: Array<{ key: string; value: unknown; updatedAt: number }>,
    assets: any[] = [],
    deletions: any[] = []
) => {
    const plain = JSON.stringify({
        format: 'moranjianghu-cloud-play-settings',
        version: 1,
        userId: 'CP-test',
        savedAt: '2026-11-24T00:00:00.000Z',
        settings,
        assets,
        deletions
    });
    const bytes = new TextEncoder().encode(plain);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(`${String.fromCharCode(0x50, 0x4b)}${binary}`);
};

describe('云端设置联机同步', () => {
    beforeEach(() => {
        state.settings.clear();
        state.assets.clear();
        state.changeListeners.clear();
        state.cloudPayload = '';
        state.apiCalls = [];
        state.readSettingCalls = [];
        state.getAllSnapshotCalls = 0;
        const 存储 = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => 存储.get(key) ?? null,
            setItem: (key: string, value: string) => { 存储.set(key, value); },
            removeItem: (key: string) => { 存储.delete(key); },
            key: (index: number) => Array.from(存储.keys())[index] ?? null,
            get length() { return 存储.size; },
            clear: () => 存储.clear()
        });
    });

    it('同步会带上自定义开局预设等全部设置项', async () => {
        state.settings.set('new_game_custom_start_presets', {
            value: [{ id: 'custom_start_1', 名称: '4' }],
            updatedAt: 1000
        });
        state.settings.set('api_settings', { value: { activeConfigId: 'x' }, updatedAt: 1001 });

        const { 同步云端设置 } = await import('../services/cloudSettingsSync');
        const result = await 同步云端设置(state.session);

        expect(result.ok).toBe(true);
        expect(state.cloudPayload).toBeTruthy();
        const decoded = JSON.parse(new TextDecoder().decode(
            Uint8Array.from(atob(state.cloudPayload), (char) => char.charCodeAt(0)).slice(2)
        ));
        expect(decoded.settings.map((item: any) => item.key)).toEqual(
            expect.arrayContaining(['new_game_custom_start_presets', 'api_settings'])
        );
        expect(decoded.settings.find((item: any) => item.key === 'new_game_custom_start_presets').value)
            .toEqual([{ id: 'custom_start_1', 名称: '4' }]);
    });

    it('下载时按设置项时间戳合并：云端新则覆盖，本地新则保留', async () => {
        state.settings.set('api_settings', { value: { name: 'local-new' }, updatedAt: 3000 });
        state.settings.set('prompts', { value: [{ id: 'local-old' }], updatedAt: 1000 });
        state.cloudPayload = 构造云端包([
            { key: 'api_settings', value: { name: 'cloud-old' }, updatedAt: 2000 },
            { key: 'prompts', value: [{ id: 'cloud-new' }], updatedAt: 2000 },
            { key: 'extra_worldbooks', value: [{ id: 'cloud-only' }], updatedAt: 2000 }
        ]);

        const { 拉取云端设置 } = await import('../services/cloudSettingsSync');
        const result = await 拉取云端设置();

        expect(result.ok).toBe(true);
        expect(result.changed).toBe(2);
        expect(state.settings.get('api_settings')?.value).toEqual({ name: 'local-new' });
        expect(state.settings.get('prompts')?.value).toEqual([{ id: 'cloud-new' }]);
        expect(state.settings.get('extra_worldbooks')?.value).toEqual([{ id: 'cloud-only' }]);
    });

    it('删除墓碑会传播到其它设备，且不会误删删除后重建的新值', async () => {
        state.settings.set('music_tracks', { value: [{ id: 'old' }], updatedAt: 1000 });
        state.settings.set('game_settings', { value: { v: 2 }, updatedAt: 5000 });
        state.cloudPayload = 构造云端包(
            [{ key: 'game_settings', value: { v: 2 }, updatedAt: 5000 }],
            [],
            [
                { key: 'music_tracks', deletedAt: 2000 },
                { key: 'game_settings', deletedAt: 3000 }
            ]
        );

        const { 拉取云端设置 } = await import('../services/cloudSettingsSync');
        const result = await 拉取云端设置();

        expect(result.ok).toBe(true);
        expect(state.settings.has('music_tracks')).toBe(false);
        expect(state.settings.get('game_settings')?.value).toEqual({ v: 2 });
    });

    it('设置无变化时跳过重复上传', async () => {
        state.settings.set('api_settings', { value: { activeConfigId: 'x' }, updatedAt: 1000 });
        const { 上传本机设置 } = await import('../services/cloudSettingsSync');
        const first = await 上传本机设置();
        const firstPayload = state.cloudPayload;
        expect(state.apiCalls).toEqual(['settings-download', 'settings-upload']);
        const second = await 上传本机设置();
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(second.skipped).toBe(true);
        // 指纹预检命中：第二次连网络请求都不发（不拉取、不打包、不加密）
        expect(state.apiCalls).toEqual(['settings-download', 'settings-upload']);
        expect(state.cloudPayload).toBe(firstPayload);
    });

    it('云端坏包会自愈：以本机设置覆盖重传，不再卡死在下载失败', async () => {
        state.settings.set('api_settings', { value: { activeConfigId: 'local' }, updatedAt: 1000 });
        // 云端包存在但 payload 是坏 base64（旧版残留 / 换密码），解密必然失败
        state.cloudPayload = btoa('not-a-valid-encrypted-package');
        const { 同步云端设置 } = await import('../services/cloudSettingsSync');
        const result = await 同步云端设置(state.session);

        expect(result.ok).toBe(true);
        expect(state.apiCalls).toContain('settings-download');
        expect(state.apiCalls).toContain('settings-upload');
        // 云端已被本机设置覆盖：解码上传包能读到本机值
        const decoded = JSON.parse(new TextDecoder().decode(
            Uint8Array.from(atob(state.cloudPayload), (char) => char.charCodeAt(0)).slice(2)
        ));
        expect(decoded.settings.find((item: any) => item.key === 'api_settings').value)
            .toEqual({ activeConfigId: 'local' });
    });

    it('本机变更后指纹失效，会重新上传新值', async () => {
        state.settings.set('api_settings', { value: { activeConfigId: 'x' }, updatedAt: 1000 });
        const { 上传本机设置 } = await import('../services/cloudSettingsSync');
        await 上传本机设置();
        state.settings.set('api_settings', { value: { activeConfigId: 'y' }, updatedAt: 2000 });
        const second = await 上传本机设置();
        expect(second.ok).toBe(true);
        expect(second.skipped).toBeUndefined();
        expect(state.apiCalls.filter((action) => action === 'settings-upload')).toHaveLength(2);
        const decoded = JSON.parse(new TextDecoder().decode(
            Uint8Array.from(atob(state.cloudPayload), (char) => char.charCodeAt(0)).slice(2)
        ));
        expect(decoded.settings.find((item: any) => item.key === 'api_settings').value)
            .toEqual({ activeConfigId: 'y' });
    });

    it('同步会一起搬运设置引用的图片资源', async () => {
        state.settings.set('scene_image_archive', {
            value: { cover: 'wuxia-asset://asset-1' },
            updatedAt: 1000
        });
        state.assets.set('asset-1', {
            id: 'asset-1',
            dataUrl: 'data:image/png;base64,AAAA',
            createdAt: 123
        });

        const { 同步云端设置 } = await import('../services/cloudSettingsSync');
        await 同步云端设置(state.session);

        state.assets.clear();
        state.settings.clear();
        const { 拉取云端设置 } = await import('../services/cloudSettingsSync');
        await 拉取云端设置();

        expect(state.assets.get('asset-1')?.dataUrl).toBe('data:image/png;base64,AAAA');
    });

    it('反序列化前排除小说拆分与NPC备份等超大本机键，绝不触发全表 getAll 或读取排除键内容', async () => {
        state.settings.set('new_game_custom_start_presets', {
            value: [{ id: 'preset_4', 名称: '4' }],
            updatedAt: 1000
        });
        state.settings.set('novel_decomposition_datasets', {
            value: { huge: '巨量小说原文' },
            updatedAt: 2000
        });
        state.settings.set('novel_decomposition_tasks', {
            value: { hugeTask: '拆分任务快照' },
            updatedAt: 2001
        });
        state.settings.set('npc_variable_backups', {
            value: [{ id: 'b1' }],
            updatedAt: 2002
        });
        state.settings.set('image_asset_migration_v2', {
            value: true,
            updatedAt: 2003
        });

        const { 同步云端设置 } = await import('../services/cloudSettingsSync');
        const result = await 同步云端设置(state.session);

        expect(result.ok).toBe(true);
        expect(state.getAllSnapshotCalls).toBe(0);
        expect(state.readSettingCalls).toContain('new_game_custom_start_presets');
        expect(state.readSettingCalls).not.toContain('novel_decomposition_datasets');
        expect(state.readSettingCalls).not.toContain('novel_decomposition_tasks');
        expect(state.readSettingCalls).not.toContain('npc_variable_backups');
        expect(state.readSettingCalls).not.toContain('image_asset_migration_v2');
    });

    it('单项超预算或含音频大资源时仅跳过超大项，核心开局预设方案4仍正常同步', async () => {
        state.settings.set('new_game_custom_start_presets', {
            value: [{ id: 'preset_4', 名称: '4' }],
            updatedAt: 1000
        });
        state.settings.set('extra_worldbooks', {
            value: '超'.repeat(1_600_000), // ~4.8MB UTF-8 > 单条 4MB 上限
            updatedAt: 1001
        });
        state.settings.set('music_tracks', {
            value: [{ id: 'm1', url: 'wuxia-asset://audio-big' }, { id: 'm2', cover: 'wuxia-asset://img-small' }],
            updatedAt: 1002
        });
        state.assets.set('audio-big', {
            id: 'audio-big',
            dataUrl: 'data:audio/mpeg;base64,BBBBBBBB',
            createdAt: 100
        });
        state.assets.set('img-small', {
            id: 'img-small',
            dataUrl: 'data:image/png;base64,CCCC',
            createdAt: 101
        });

        const { 同步云端设置 } = await import('../services/cloudSettingsSync');
        const result = await 同步云端设置(state.session);

        expect(result.ok).toBe(true);
        expect(result.skippedKeys).toContain('extra_worldbooks');
        expect(result.assetCount).toBe(1);

        const decoded = JSON.parse(new TextDecoder().decode(
            Uint8Array.from(atob(state.cloudPayload), (char) => char.charCodeAt(0)).slice(2)
        ));
        expect(decoded.settings.map((s: any) => s.key)).toContain('new_game_custom_start_presets');
        expect(decoded.settings.map((s: any) => s.key)).not.toContain('extra_worldbooks');
        expect(decoded.assets.map((a: any) => a.id)).toEqual(['img-small']);
    });

    it('24KB 分块 Base64 编解码在跨块与非 3 字节整数倍长度下精确可逆', async () => {
        const { base64编码, base64解码 } = await import('../services/cloudSettingsSync');
        const original = new Uint8Array(70_003); // 跨 3 个 24576 块且末尾余 1 字节
        for (let i = 0; i < original.length; i += 1) {
            original[i] = (i * 131 + 17) & 0xff;
        }
        const encoded = base64编码(original);
        // 中间不能出现非末尾 '=' 填充
        expect(encoded.slice(0, -2)).not.toContain('=');
        const roundtrip = base64解码(encoded);
        expect(roundtrip.length).toBe(original.length);
        expect(Array.from(roundtrip.subarray(0, 64))).toEqual(Array.from(original.subarray(0, 64)));
        expect(Array.from(roundtrip.subarray(-64))).toEqual(Array.from(original.subarray(-64)));
    });
});
