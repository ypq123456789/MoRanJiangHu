// @vitest-environment jsdom
import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { 云端设置同步状态 } from '../services/cloudSettingsSync';
import { 自定义开局预设存储键 } from '../utils/customNewGamePresets';

const createDeferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const createIdleSyncStatus = (overrides?: Partial<云端设置同步状态>): 云端设置同步状态 => ({
    running: false,
    stage: 'idle',
    message: '',
    direction: null,
    settingCount: 0,
    assetCount: 0,
    changed: 0,
    pendingUpload: false,
    updatedAt: '2026-11-28T06:00:00.000Z',
    ...overrides
});

const mockControl = vi.hoisted(() => ({
    readSettingHandlers: new Map<string, () => Promise<any>>(),
    listNovelDatasets: vi.fn<() => Promise<any[]>>(),
    listWorkshopModules: vi.fn<() => Promise<any[]>>(),
    syncStatus: null as any,
    syncStatusListeners: new Set<(status: any) => void>(),
    refillListeners: new Set<(keys: string[]) => void>()
}));

vi.mock('../services/dbService', () => ({
    读取设置: vi.fn((key: string) => {
        const handler = mockControl.readSettingHandlers.get(key);
        return handler ? handler() : Promise.resolve([]);
    }),
    保存设置: vi.fn(async () => undefined)
}));

vi.mock('../services/novelDecompositionStore', () => ({
    读取小说拆分数据集列表: () => mockControl.listNovelDatasets()
}));

vi.mock('../services/creativeWorkshop', () => ({
    列出创意工坊模块: () => mockControl.listWorkshopModules(),
    下载创意工坊模块: vi.fn(),
    读取本地创意工坊模块: vi.fn(() => [])
}));

vi.mock('../services/cloudSettingsSync', () => ({
    读取云端设置同步状态: vi.fn(() => mockControl.syncStatus),
    订阅云端设置同步状态: vi.fn((listener: (status: any) => void) => {
        mockControl.syncStatusListeners.add(listener);
        return () => mockControl.syncStatusListeners.delete(listener);
    }),
    订阅云端设置回填: vi.fn((listener: (keys: string[]) => void) => {
        mockControl.refillListeners.add(listener);
        return () => mockControl.refillListeners.delete(listener);
    })
}));

vi.mock('../components/features/NewGame/NewGameDiyTools', () => ({
    default: () => null
}));

import NewGameWizard from '../components/features/NewGame/NewGameWizard';
import MobileNewGameWizard from '../components/features/NewGame/mobile/MobileNewGameWizard';
import { StartPresetsSection } from '../components/features/NewGame/StartPresetsSection';
import { SavedCollectionSection, 获取小说数据集加载文案 } from '../components/features/NewGame/SavedCollectionSection';

const makeValidPreset = (id: string, name: string) => ({
    id,
    名称: name,
    简介: `${name}简介`,
    worldConfig: {
        difficulty: 'normal',
        era: '架空乱世',
        genre: '经典武侠',
        worldExtraRequirement: '',
        manualWorldPrompt: '',
        manualRealmPrompt: ''
    },
    character: {
        姓名: '沈砚',
        性别: '男',
        年龄: 18,
        出生月: 3,
        出生日: 15,
        外貌: '青衫配剑',
        性格: '沉稳',
        属性: { 臂力: 8, 身法: 8, 根骨: 8, 悟性: 8, 福缘: 8, 魅力: 8 },
        背景名称: '江湖游侠',
        天赋名称列表: []
    },
    openingStreaming: true,
    openingExtraRequirement: ''
});

describe('NewGame 异步集合与开局预设方案加载状态', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockControl.readSettingHandlers.clear();
        mockControl.syncStatusListeners.clear();
        mockControl.refillListeners.clear();
        mockControl.syncStatus = createIdleSyncStatus();
        mockControl.listNovelDatasets.mockResolvedValue([]);
        mockControl.listWorkshopModules.mockResolvedValue([]);
    });

    afterEach(async () => {
        cleanup();
        await new Promise((resolve) => setImmediate(resolve));
    });

    afterAll(async () => {
        cleanup();
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
    });

    it('桌面端在本地加载期间展示加载中状态，且慢速小说/工坊请求不会阻塞开局预设立即显示', async () => {
        const presetDeferred = createDeferred<any[]>();
        const novelDeferred = createDeferred<any[]>();
        const workshopDeferred = createDeferred<any[]>();

        mockControl.readSettingHandlers.set(自定义开局预设存储键, () => presetDeferred.promise);
        mockControl.listNovelDatasets.mockImplementation(() => novelDeferred.promise);
        mockControl.listWorkshopModules.mockImplementation(() => workshopDeferred.promise);

        render(<NewGameWizard onComplete={vi.fn()} onCancel={vi.fn()} loading={false} />);

        expect(screen.getByText('开局预设方案')).toBeTruthy();
        expect(screen.getByText('正在加载开局预设方案…')).toBeTruthy();
        expect(screen.getByText('正在加载创意工坊模式列表…')).toBeTruthy();

        await act(async () => {
            presetDeferred.resolve([makeValidPreset('preset-fast', '首屏极速剑客方案')]);
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(screen.getByText('首屏极速剑客方案')).toBeTruthy();
            expect(screen.queryByText('正在加载开局预设方案…')).toBeNull();
        });

        expect(screen.getByText('正在加载创意工坊模式列表…')).toBeTruthy();

        await act(async () => {
            novelDeferred.resolve([]);
            workshopDeferred.resolve([]);
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(screen.queryByText('正在加载创意工坊模式列表…')).toBeNull();
        });
    });

    it('桌面端在云端设置下载回填期间展示同步状态，回填完成后立刻渲染云端预设', async () => {
        mockControl.syncStatus = createIdleSyncStatus({
            running: true,
            stage: 'download',
            direction: 'download',
            message: '正在从云端同步个人配置（含开局预设）…'
        });

        let savedPresets: any[] = [];
        mockControl.readSettingHandlers.set(自定义开局预设存储键, async () => savedPresets);

        render(<NewGameWizard onComplete={vi.fn()} onCancel={vi.fn()} loading={false} />);

        await waitFor(() => {
            expect(screen.getByText('正在从云端同步开局预设方案…')).toBeTruthy();
            expect(screen.getByText('正在从云端同步个人配置（含开局预设）…')).toBeTruthy();
        });

        await act(async () => {
            savedPresets = [makeValidPreset('preset-cloud', '云端跨设备同步方案')];
            mockControl.refillListeners.forEach((listener) => listener([自定义开局预设存储键]));
            mockControl.syncStatus = createIdleSyncStatus({ stage: 'done', direction: 'download', message: '同步完成' });
            mockControl.syncStatusListeners.forEach((listener) => listener(mockControl.syncStatus));
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(screen.getByText('云端跨设备同步方案')).toBeTruthy();
            expect(screen.queryByText('正在从云端同步开局预设方案…')).toBeNull();
        });
    });

    it('移动端在加载期间显示加载提示，全部加载完成且为空时自动隐藏预设区块', async () => {
        const presetDeferred = createDeferred<any[]>();
        const workshopDeferred = createDeferred<any[]>();

        mockControl.readSettingHandlers.set(自定义开局预设存储键, () => presetDeferred.promise);
        mockControl.listWorkshopModules.mockImplementation(() => workshopDeferred.promise);

        render(<MobileNewGameWizard onComplete={vi.fn()} onCancel={vi.fn()} loading={false} />);

        expect(screen.getByText('开局预设方案')).toBeTruthy();
        expect(screen.getByText('正在加载开局预设方案…')).toBeTruthy();
        expect(screen.getByText('正在加载创意工坊模式列表…')).toBeTruthy();

        await act(async () => {
            presetDeferred.resolve([]);
            workshopDeferred.resolve([]);
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(screen.queryByText('开局预设方案')).toBeNull();
            expect(screen.queryByText('正在加载创意工坊模式列表…')).toBeNull();
        });
    });

    it('StartPresetsSection、SavedCollectionSection 与小说数据集文案正确区分加载态与空状态', () => {
        const preset = makeValidPreset('preset-existing', '已有方案') as any;

        const { rerender, container } = render(
            <StartPresetsSection
                variant="desktop"
                presets={[preset]}
                loading={false}
                cloudSyncing={true}
                onApply={vi.fn()}
                onStart={vi.fn()}
                onEdit={vi.fn()}
                onOverwrite={vi.fn()}
                onDelete={vi.fn()}
            />
        );
        expect(screen.getByText('已有方案')).toBeTruthy();
        expect(screen.getByText('云端同步中…')).toBeTruthy();

        rerender(
            <StartPresetsSection
                variant="mobile"
                presets={[]}
                loading={false}
                cloudSyncing={false}
                onApply={vi.fn()}
                onStart={vi.fn()}
                onEdit={vi.fn()}
                onOverwrite={vi.fn()}
                onDelete={vi.fn()}
            />
        );
        expect(container.firstChild).toBeNull();

        const { rerender: rerenderSaved, container: savedContainer } = render(
            <SavedCollectionSection
                variant="desktop"
                title="已保存自定义身份"
                itemCount={0}
                loading={true}
                cloudSyncing={false}
                loadingText="正在加载已保存的自定义身份…"
            >
                {null}
            </SavedCollectionSection>
        );
        expect(screen.getByText('正在加载已保存的自定义身份…')).toBeTruthy();

        rerenderSaved(
            <SavedCollectionSection
                variant="desktop"
                title="已保存自定义身份"
                itemCount={0}
                loading={false}
                cloudSyncing={false}
                loadingText="正在加载已保存的自定义身份…"
            >
                {null}
            </SavedCollectionSection>
        );
        expect(savedContainer.firstChild).toBeNull();

        expect(获取小说数据集加载文案(true, 0)).toEqual({
            placeholder: '正在加载小说分解数据集…',
            emptyHint: '正在读取已导入的小说分解数据集，请稍候…'
        });
        expect(获取小说数据集加载文案(false, 0).placeholder).toBe('暂无已导入的小说分解数据');
    });
});
