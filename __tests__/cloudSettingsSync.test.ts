import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    settings: new Map<string, { value: unknown; updatedAt: number }>(),
    assets: new Map<string, { id: string; dataUrl: string; createdAt: number }>(),
    cloudPayload: '' as string,
    changeListeners: new Set<(change: any) => void>(),
    session: {
        userId: 'CP-test',
        username: 'bacon',
        password: 'pwd123456',
        clientSalt: 'salt'
    } as any
}));

vi.mock('../services/dbService', () => ({
    获取设置管理清单: async () => Array.from(state.settings.entries()).map(([key, record]) => ({
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
    })),
    读取设置: async (key: string) => state.settings.get(key)?.value ?? null,
    静默保存设置: async (key: string, value: unknown, updatedAt: number) => {
        state.settings.set(key, { value, updatedAt });
    },
    静默删除设置: async (key: string) => {
        state.settings.delete(key);
    },
    条件静默保存设置: async (key: string, value: unknown, minUpdatedAt: number) => {
        const existing = state.settings.get(key);
        if (existing && existing.updatedAt >= minUpdatedAt) return false;
        state.settings.set(key, { value, updatedAt: minUpdatedAt });
        return true;
    },
    读取设置一致性快照: async () => Array.from(state.settings.entries()).map(([key, record]) => ({
        key,
        value: record.value,
        updatedAt: record.updatedAt,
        category: 'customization'
    })),
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
        const second = await 上传本机设置();
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(state.cloudPayload).toBe(firstPayload);
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
});
