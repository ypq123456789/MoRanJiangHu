// @vitest-environment jsdom
import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const mockState = {
    session: null as any,
    storageMode: 'tg' as 'tg' | 'object' | null,
    objectEnabled: false,
    objectConfig: null as any,
    refreshSession: vi.fn(),
    readManifest: vi.fn(),
    listObjectSaves: vi.fn(),
    testObjectConnection: vi.fn()
};

vi.mock('../services/cloudPlayService', () => ({
    云端游玩风险提示文本: '风险提示正文',
    已确认云端游玩风险: vi.fn(() => true),
    设置云端游玩风险确认: vi.fn(),
    读取云端游玩会话: vi.fn(() => mockState.session),
    刷新云端游玩会话: (...args: any[]) => mockState.refreshSession(...args),
    注册云端游玩账号: vi.fn(),
    登录云端游玩账号: vi.fn(),
    清除云端游玩会话: vi.fn(),
    启用对象存储云端游玩模式: vi.fn(() => { mockState.objectEnabled = true; mockState.storageMode = 'object'; }),
    清除对象存储云端游玩模式: vi.fn(() => { mockState.objectEnabled = false; }),
    已启用对象存储云端游玩模式: vi.fn(() => mockState.objectEnabled),
    设置云端游玩存储模式: vi.fn((mode: any) => { mockState.storageMode = mode === 'local' ? null : mode; }),
    读取云端游玩存储模式: vi.fn(() => mockState.storageMode),
    准备开启云端新存档: vi.fn((mode: any) => mode),
    读取云端存档清单: (...args: any[]) => mockState.readManifest(...args),
    读取缓存云端存档清单: vi.fn(() => null),
    复制全部本地存档到云端: vi.fn(),
    导入云端存档到本地: vi.fn(),
    保存云端存档为本地文件: vi.fn(),
    下载云端存档包: vi.fn(),
    删除云端存档节点: vi.fn()
}));

vi.mock('../services/objectStorageSync', () => ({
    读取对象存储同步配置: vi.fn(async () => mockState.objectConfig),
    测试对象存储连接: (...args: any[]) => mockState.testObjectConnection(...args),
    列出对象存储云存档: (...args: any[]) => mockState.listObjectSaves(...args),
    下载对象存储云存档: vi.fn(),
    删除对象存储云存档: vi.fn(),
    增量同步到对象存储: vi.fn()
}));

vi.mock('../services/cloudSettingsSync', () => ({
    同步云端设置: vi.fn(async () => ({ ok: true, settingCount: 0 })),
    启动云端设置自动同步: vi.fn(),
    停止云端设置自动同步: vi.fn(),
    订阅云端设置同步状态: vi.fn(() => () => undefined),
    读取云端设置同步状态: vi.fn(() => ({ stage: 'idle', message: '' }))
}));

vi.mock('../components/features/Auth/CloudSettingsSyncPanel', () => ({
    default: () => null
}));

import CloudPlayModal from '../components/features/Auth/CloudPlayModal';

describe('CloudPlayModal 云端存档加载态与竞态防护', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.session = null;
        mockState.storageMode = 'tg';
        mockState.objectEnabled = false;
        mockState.objectConfig = null;
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

    it('对象存储模式下加载期间显示读取中状态，不会先闪出「对象存储云端暂无存档」', async () => {
        mockState.storageMode = 'object';
        mockState.objectEnabled = true;
        mockState.objectConfig = {
            endpoint: 'https://s3.example.com',
            bucket: 'test-bucket',
            prefix: 'MoRanJiangHu',
            accessKey: 'ak',
            secretKey: 'sk'
        };

        let resolveList!: (value: any[]) => void;
        mockState.listObjectSaves.mockImplementation(() => new Promise((resolve) => {
            resolveList = resolve;
        }));

        render(
            <CloudPlayModal
                onClose={vi.fn()}
                onLoadGame={vi.fn()}
                onStartNewGame={vi.fn()}
                onConfigureObjectStorage={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('status').textContent).toContain('正在读取对象存储云端存档');
        });
        expect(screen.queryByText(/对象存储云端暂无存档/)).toBeNull();

        resolveList([
            {
                id: 'manual_1',
                fileName: 'manual_1.json',
                title: '沈青岚',
                type: 'manual',
                saveTimestamp: 1779000000000,
                savedAt: '2026-11-26T00:00:00.000Z',
                syncedAt: '2026-11-26T00:00:00.000Z',
                hash: 'abcdef1234567890',
                size: 2048,
                location: '姑苏城',
                gameTime: '1:01:01:08:00',
                turnCount: 3,
                seriesId: 'series-1'
            }
        ]);

        await waitFor(() => {
            expect(screen.getByText('沈青岚')).toBeTruthy();
        });
        expect(mockState.testObjectConnection).not.toHaveBeenCalled();
    });

    it('对象存储读取失败时显示失败提示与重试按钮，不误报「对象存储云端暂无存档」', async () => {
        mockState.storageMode = 'object';
        mockState.objectEnabled = true;
        mockState.objectConfig = {
            endpoint: 'https://s3.example.com',
            bucket: 'test-bucket',
            prefix: 'MoRanJiangHu',
            accessKey: 'ak',
            secretKey: 'sk'
        };
        mockState.listObjectSaves
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce([]);

        render(
            <CloudPlayModal
                onClose={vi.fn()}
                onLoadGame={vi.fn()}
                onStartNewGame={vi.fn()}
                onConfigureObjectStorage={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getAllByText(/读取对象存储云端存档失败：Network error/).length).toBeGreaterThan(0);
        });
        const retryBtn = screen.getByRole('button', { name: '重试读取' });
        expect(retryBtn).toBeTruthy();
        expect(screen.queryByText(/对象存储云端暂无存档/)).toBeNull();
    });

    it('TG 模式打开时若本地会话缺少 manifestUrl，会先同步最新会话地址再拉取存档', async () => {
        const staleSession = {
            userId: 'CP-1',
            username: 'alice',
            password: 'pw',
            clientSalt: 'salt',
            manifestUrl: ''
        };
        mockState.session = staleSession;
        mockState.storageMode = 'tg';
        mockState.refreshSession.mockResolvedValueOnce({
            ...staleSession,
            manifestUrl: 'https://image1.bacon159.pp.ua/file/latest-manifest.json'
        });
        mockState.readManifest.mockResolvedValueOnce({
            format: 'moranjianghu-cloud-play',
            version: 1,
            userId: 'CP-1',
            username: 'alice',
            updatedAt: '2026-11-28T00:00:00.000Z',
            saves: [
                {
                    cloudId: 'c1',
                    syncHash: 'hash12345678',
                    seriesId: 's1',
                    title: '苏清浅',
                    type: 'manual',
                    timestamp: 1779000000000,
                    savedAt: '2026-11-28T00:00:00.000Z',
                    location: '洛阳',
                    gameTime: '1:01:01:08:00',
                    historyCount: 2,
                    turnCount: 1,
                    packageUrl: 'https://image1.bacon159.pp.ua/file/save.mjc',
                    sha256: 'abc'
                }
            ]
        });

        render(
            <CloudPlayModal
                onClose={vi.fn()}
                onLoadGame={vi.fn()}
                onStartNewGame={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('苏清浅')).toBeTruthy();
        });
        expect(mockState.refreshSession).toHaveBeenCalledWith(staleSession);
        expect(mockState.readManifest).toHaveBeenCalledWith(expect.objectContaining({
            manifestUrl: 'https://image1.bacon159.pp.ua/file/latest-manifest.json'
        }));
    });

    it('TG 模式拉取清单失败且无本地缓存时显示失败与重试按钮，不误报「暂无云端存档」', async () => {
        mockState.session = {
            userId: 'CP-1',
            username: 'alice',
            password: 'pw',
            clientSalt: 'salt',
            manifestUrl: 'https://image1.bacon159.pp.ua/file/m.json'
        };
        mockState.storageMode = 'tg';
        mockState.refreshSession.mockResolvedValueOnce(mockState.session);
        mockState.readManifest.mockRejectedValueOnce(new Error('读取云端存档清单失败：HTTP 502'));

        render(
            <CloudPlayModal
                onClose={vi.fn()}
                onLoadGame={vi.fn()}
                onStartNewGame={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getAllByText(/读取云端存档失败：读取云端存档清单失败：HTTP 502/).length).toBeGreaterThan(0);
        });
        expect(screen.getByRole('button', { name: '重试读取' })).toBeTruthy();
        expect(screen.queryByText(/暂无云端存档/)).toBeNull();
    });
});
