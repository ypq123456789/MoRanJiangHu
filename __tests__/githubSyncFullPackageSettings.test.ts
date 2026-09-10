import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const state = vi.hoisted(() => ({
    settings: new Map<string, unknown>()
}));

const 分类映射: Record<string, string> = {
    api_settings: 'interface',
    visual_settings: 'interface',
    prompts: 'prompt',
    builtin_prompt_entries: 'prompt',
    extra_worldbooks: 'prompt',
    worldbook_preset_groups: 'prompt',
    music_tracks: 'media'
};

const 创建假数据库 = () => ({
    transaction: () => {
        const 事务: any = {
            objectStore: () => ({
                clear: () => undefined,
                put: () => undefined,
                get: () => ({ onsuccess: null, onerror: null, result: null })
            }),
            oncomplete: null as null | (() => void),
            onerror: null as null | (() => void),
            error: null
        };
        Object.defineProperty(事务, 'oncomplete', {
            set(handler: () => void) {
                handler();
            },
            get() {
                return null;
            },
            configurable: true
        });
        return 事务;
    }
});

vi.mock('../services/dbService', () => ({
    获取设置管理清单: async () => Array.from(state.settings.entries()).map(([key, value]) => ({
        key,
        label: key,
        category: 分类映射[key] || 'unknown',
        categoryLabel: '',
        description: '',
        size: 0,
        summary: '',
        updatedAt: Date.now(),
        internal: false,
        value
    })),
    读取设置: async (key: string) => (state.settings.has(key) ? state.settings.get(key) : null),
    保存设置: async (key: string, value: unknown) => {
        state.settings.set(key, value);
    },
    删除设置: async (key: string) => {
        state.settings.delete(key);
    },
    导出存档数据: async () => ({ version: 1, exportedAt: new Date().toISOString(), saves: [] }),
    导入存档数据: async () => ({ imported: 0, skipped: 0 }),
    初始化数据库: async () => 创建假数据库(),
    预热图片资源缓存: async () => undefined,
    清理未引用图片资源: async () => undefined
}));

const { extractSyncData, restoreSyncData } = await import('../services/githubSync');

const 读取包内设置键 = (zipBytes: Uint8Array): string[] => {
    const entries = unzipSync(zipBytes);
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    const settingsIndex = JSON.parse(strFromU8(entries[manifest.settings.indexFile]));
    return (settingsIndex.items || []).map((item: any) => item.key).sort();
};

const 读取包清单 = (zipBytes: Uint8Array): any => {
    const entries = unzipSync(zipBytes);
    return JSON.parse(strFromU8(entries['manifest.json']));
};

const 构建旧版存档包 = (): Uint8Array => zipSync({
    'manifest.json': strToU8(JSON.stringify({
        format: 'wuxia-cloud-sync-zip',
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        saves: { indexFile: 'saves/index.json', count: 0 },
        settings: { indexFile: 'settings/index.json', count: 1 },
        assets: { indexFile: 'assets/index.json', count: 0 }
    })),
    'saves/index.json': strToU8(JSON.stringify({ version: 1, items: [] })),
    'settings/index.json': strToU8(JSON.stringify({
        version: 1,
        items: [{ key: 'api_settings', category: 'interface', file: 'settings/interface/api_settings.json' }]
    })),
    'assets/index.json': strToU8(JSON.stringify({ version: 1, items: [] })),
    'settings/interface/api_settings.json': strToU8(JSON.stringify({ activeConfigId: 'cloud' }))
});

describe('GitHub 云同步：完整存档包包含提示词类设置', () => {
    beforeEach(() => {
        state.settings.clear();
        const 存储 = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => (存储.has(key) ? 存储.get(key)! : null),
            setItem: (key: string, value: string) => {
                存储.set(key, value);
            },
            removeItem: (key: string) => {
                存储.delete(key);
            },
            clear: () => {
                存储.clear();
            }
        });
    });

    it('完整包带上提示词池 / 内置提示词 / 世界书 / 世界书预设组，且视觉设置按设备保留', async () => {
        state.settings.set('api_settings', { activeConfigId: 'local' });
        state.settings.set('prompts', [{ id: 'prompt_1' }]);
        state.settings.set('builtin_prompt_entries', [{ id: 'builtin_1' }]);
        state.settings.set('extra_worldbooks', [{ id: 'worldbook_1' }]);
        state.settings.set('worldbook_preset_groups', [{ id: 'group_1' }]);
        state.settings.set('visual_settings', { 字体: 'kai' });

        const zipBytes = await extractSyncData();

        expect(读取包内设置键(zipBytes)).toEqual([
            'api_settings',
            'builtin_prompt_entries',
            'extra_worldbooks',
            'prompts',
            'worldbook_preset_groups'
        ]);
        expect(读取包清单(zipBytes).includesPromptSettings).toBe(true);
    });

    it('恢复完整包会覆盖本地提示词与世界书，并清理包内已不存在的普通设置', async () => {
        state.settings.set('api_settings', { activeConfigId: 'cloud' });
        state.settings.set('prompts', [{ id: 'prompt_from_cloud' }]);
        state.settings.set('extra_worldbooks', [{ id: 'worldbook_from_cloud' }]);
        const zipBytes = await extractSyncData();

        state.settings.set('api_settings', { activeConfigId: 'local' });
        state.settings.set('prompts', [{ id: 'prompt_local_stale' }]);
        state.settings.set('extra_worldbooks', [{ id: 'worldbook_local_stale' }]);
        state.settings.set('music_tracks', [{ id: 'local_only' }]);
        state.settings.set('visual_settings', { 字体: 'kai' });

        const result = await restoreSyncData(zipBytes);

        expect(result.success).toBe(true);
        expect(state.settings.get('prompts')).toEqual([{ id: 'prompt_from_cloud' }]);
        expect(state.settings.get('extra_worldbooks')).toEqual([{ id: 'worldbook_from_cloud' }]);
        expect(state.settings.get('api_settings')).toEqual({ activeConfigId: 'cloud' });
        expect(state.settings.has('music_tracks')).toBe(false);
        expect(state.settings.get('visual_settings')).toEqual({ 字体: 'kai' });
    });

    it('恢复旧版存档包（清单无 includesPromptSettings）时保留本地提示词与世界书', async () => {
        state.settings.set('api_settings', { activeConfigId: 'local' });
        state.settings.set('prompts', [{ id: 'prompt_local' }]);
        state.settings.set('extra_worldbooks', [{ id: 'worldbook_local' }]);
        state.settings.set('worldbook_preset_groups', [{ id: 'group_local' }]);

        const result = await restoreSyncData(构建旧版存档包());

        expect(result.success).toBe(true);
        expect(state.settings.get('api_settings')).toEqual({ activeConfigId: 'cloud' });
        expect(state.settings.get('prompts')).toEqual([{ id: 'prompt_local' }]);
        expect(state.settings.get('extra_worldbooks')).toEqual([{ id: 'worldbook_local' }]);
        expect(state.settings.get('worldbook_preset_groups')).toEqual([{ id: 'group_local' }]);
    });
});
