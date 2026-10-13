import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    isLazyImportInGameActive,
    lazyImportWithReload,
    preloadLazyImport,
    setLazyImportInGameActive
} from '../utils/lazyImportWithReload';

describe('lazyImportWithReload', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        setLazyImportInGameActive(false);
    });

    const 造sessionStorage = (initial?: Record<string, string>) => {
        const values = new Map<string, string>(Object.entries(initial || {}));
        return {
            getItem: vi.fn((key: string) => values.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => values.set(key, value)),
            removeItem: vi.fn((key: string) => values.delete(key))
        };
    };

    it('refreshes only once for repeated failures in the same session', async () => {
        const reload = vi.fn();
        const values = new Map<string, string>();
        const sessionStorage = {
            getItem: vi.fn((key: string) => values.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => values.set(key, value)),
            removeItem: vi.fn((key: string) => values.delete(key))
        };
        vi.stubGlobal('window', {
            location: { reload },
            sessionStorage
        });

        const loader = async () => {
            throw new TypeError('Failed to fetch dynamically imported module');
        };
        await expect(lazyImportWithReload('game-panel', loader)).rejects.toMatchObject({
            name: 'DynamicImportDeferredReloadError'
        });
        await expect(lazyImportWithReload('game-panel', loader)).rejects.toMatchObject({
            name: 'DynamicImportDeferredReloadError'
        });

        expect(sessionStorage.setItem).toHaveBeenCalledOnce();
        expect(sessionStorage.setItem).toHaveBeenCalledWith('moranjianghu:lazy-import-reload:game-panel', '1');
        expect(reload).toHaveBeenCalledOnce();
    });

    it('clears the reload marker after the module loads successfully', async () => {
        const values = new Map([['moranjianghu:lazy-import-reload:game-panel', '1']]);
        const sessionStorage = {
            getItem: vi.fn((key: string) => values.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => values.set(key, value)),
            removeItem: vi.fn((key: string) => values.delete(key))
        };
        vi.stubGlobal('window', {
            location: { reload: vi.fn() },
            sessionStorage
        });

        await expect(lazyImportWithReload('game-panel', async () => ({ default: 'loaded' })))
            .resolves.toEqual({ default: 'loaded' });
        expect(sessionStorage.removeItem).toHaveBeenCalledWith('moranjianghu:lazy-import-reload:game-panel');
        expect(values.has('moranjianghu:lazy-import-reload:game-panel')).toBe(false);
    });

    it('treats Safari text/html module MIME errors as deployed chunk failures', async () => {
        vi.stubGlobal('window', { location: { reload: vi.fn() } });

        await expect(lazyImportWithReload('settings-panel', async () => {
            throw new TypeError("'text/html' is not a valid JavaScript MIME type.");
        })).rejects.toMatchObject({
            name: 'DynamicImportDeferredReloadError'
        });
    });

    // 回归：iOS Safari 上「读档 -> 刷新 -> 回主页」的根因。
    // 读档成功后 setView('game') 触发批量预热，任一 chunk 失败即整页刷新，
    // 而 view 不持久化，玩家刚读进来的对局被直接丢掉。
    it('never reloads the page for warmup failures', async () => {
        const reload = vi.fn();
        const sessionStorage = 造sessionStorage();
        vi.stubGlobal('window', { location: { reload }, sessionStorage });

        const loader = async () => {
            throw new TypeError('Failed to fetch dynamically imported module');
        };

        await expect(preloadLazyImport('character-modal', loader)).rejects.toMatchObject({
            name: 'DynamicImportDeferredReloadError'
        });
        await expect(preloadLazyImport('character-modal', loader)).rejects.toMatchObject({
            name: 'DynamicImportDeferredReloadError'
        });

        expect(reload).not.toHaveBeenCalled();
        expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });

    it('does not reload even when warmup fails outside game state', async () => {
        const reload = vi.fn();
        vi.stubGlobal('window', { location: { reload }, sessionStorage: 造sessionStorage() });
        expect(isLazyImportInGameActive()).toBe(false);

        await expect(preloadLazyImport('map-modal', async () => {
            throw new TypeError('Loading chunk 42 failed');
        })).rejects.toMatchObject({
            name: 'DynamicImportDeferredReloadError'
        });

        expect(reload).not.toHaveBeenCalled();
    });

    it('does not reload on user-triggered load failure once in game state', async () => {
        const reload = vi.fn();
        const sessionStorage = 造sessionStorage();
        vi.stubGlobal('window', { location: { reload }, sessionStorage });
        setLazyImportInGameActive(true);

        await expect(lazyImportWithReload('settings-modal', async () => {
            throw new TypeError('Failed to fetch dynamically imported module');
        })).rejects.toMatchObject({
            name: 'DynamicImportDeferredReloadError'
        });

        expect(reload).not.toHaveBeenCalled();
        expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });

    it('restores reload self-healing after leaving game state', async () => {
        const reload = vi.fn();
        const sessionStorage = 造sessionStorage();
        vi.stubGlobal('window', { location: { reload }, sessionStorage });

        setLazyImportInGameActive(true);
        setLazyImportInGameActive(false);
        expect(isLazyImportInGameActive()).toBe(false);

        await expect(lazyImportWithReload('character-modal', async () => {
            throw new TypeError('Failed to fetch dynamically imported module');
        })).rejects.toMatchObject({
            name: 'DynamicImportDeferredReloadError'
        });

        expect(reload).toHaveBeenCalledOnce();
    });

    it('tells the player to refresh manually when reload was suppressed', async () => {
        vi.stubGlobal('window', {
            location: { reload: vi.fn() },
            sessionStorage: 造sessionStorage()
        });

        const error = await preloadLazyImport('inventory-modal', async () => {
            throw new TypeError('Failed to fetch dynamically imported module');
        }).catch((e: Error) => e);

        expect(error.name).toBe('DynamicImportDeferredReloadError');
        expect(error.message).toContain('请稍后重试');
        expect(error.message).not.toContain('系统已尝试刷新页面');
    });
});
