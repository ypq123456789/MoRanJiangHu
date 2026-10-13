import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ModalErrorBoundary } from '../components/ui/ModalErrorBoundary';
import {
    isDynamicImportFetchError,
    setLazyImportInGameActive
} from '../utils/lazyImportWithReload';
import {
    读取懒组件版本,
    重置懒组件重建,
    清空懒组件重建登记,
    订阅懒组件重建
} from '../utils/lazyComponentRebuild';

const 读取节点文本 = (node: React.ReactNode): string => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(读取节点文本).join('');
    if (!React.isValidElement(node)) return '';
    return 读取节点文本((node.props as { children?: React.ReactNode }).children);
};

const 查找按钮点击 = (node: React.ReactNode, label: string): (() => void) | null => {
    if (Array.isArray(node)) {
        for (const child of node) {
            const found = 查找按钮点击(child, label);
            if (found) return found;
        }
        return null;
    }
    if (!React.isValidElement(node)) return null;
    const props = node.props as { children?: React.ReactNode; onClick?: () => void };
    if (node.type === 'button' && 读取节点文本(props.children).includes(label)) {
        return props.onClick || null;
    }
    return 查找按钮点击(props.children, label);
};

const 导入失败错误 = new Error('Failed to fetch dynamically imported module');
导入失败错误.name = 'DynamicImportDeferredReloadError';

describe('游戏态懒加载失败的重试路径', () => {
    afterEach(() => {
        setLazyImportInGameActive(false);
        清空懒组件重建登记();
    });

    it('重建登记簿会递增版本并通知订阅者', () => {
        const listener = vi.fn();
        const unsubscribe = 订阅懒组件重建('settings-modal', listener);

        expect(读取懒组件版本('settings-modal')).toBe(0);
        重置懒组件重建('settings-modal');
        expect(读取懒组件版本('settings-modal')).toBe(1);
        expect(listener).toHaveBeenCalledOnce();

        unsubscribe();
        重置懒组件重建('settings-modal');
        expect(listener).toHaveBeenCalledOnce();
    });

    it('游戏态内显示「重新加载」而不是「刷新重试」', () => {
        setLazyImportInGameActive(true);
        const boundary = new ModalErrorBoundary({
            title: '设置打开失败',
            onClose: vi.fn(),
            importKeys: ['settings-modal', 'mobile-settings-modal'],
            children: React.createElement('div', null, '设置内容')
        });
        boundary.state = { ...boundary.state, ...ModalErrorBoundary.getDerivedStateFromError(导入失败错误) };

        const fallback = boundary.render();
        const 文本 = 读取节点文本(fallback);
        expect(文本).toContain('设置打开失败');
        // 游戏态不得引导玩家刷新页面（会退出对局、丢进度）
        expect(文本).not.toContain('刷新重试');
        expect(文本).toContain('重新加载');
        expect(查找按钮点击(fallback, '重新加载')).toBeTypeOf('function');
    });

    it('点击「重新加载」会重建对应懒组件并清空错误', () => {
        setLazyImportInGameActive(true);
        const boundary = new ModalErrorBoundary({
            title: '设置打开失败',
            onClose: vi.fn(),
            importKeys: ['settings-modal', 'mobile-settings-modal'],
            children: React.createElement('div', null, '设置内容')
        });
        boundary.state = { ...boundary.state, ...ModalErrorBoundary.getDerivedStateFromError(导入失败错误) };
        boundary.setState = ((updater: any) => {
            boundary.state = {
                ...boundary.state,
                ...(typeof updater === 'function' ? updater(boundary.state) : updater)
            };
        }) as any;

        const retry = 查找按钮点击(boundary.render(), '重新加载');
        retry?.();

        expect(读取懒组件版本('settings-modal')).toBe(1);
        expect(读取懒组件版本('mobile-settings-modal')).toBe(1);
        expect(boundary.state.error).toBeNull();
    });

    it('非游戏态仍保留刷新自愈按钮', () => {
        const boundary = new ModalErrorBoundary({
            title: '设置打开失败',
            onClose: vi.fn(),
            children: React.createElement('div', null, '设置内容')
        });
        boundary.state = { ...boundary.state, ...ModalErrorBoundary.getDerivedStateFromError(导入失败错误) };

        const fallback = boundary.render();
        expect(读取节点文本(fallback)).toContain('页面资源已经更新');
        expect(查找按钮点击(fallback, '刷新重试')).toBeTypeOf('function');
        expect(查找按钮点击(fallback, '重新加载')).toBeNull();
    });

    it('非懒加载错误不显示任何重试按钮', () => {
        expect(isDynamicImportFetchError(new Error('普通渲染错误'))).toBe(false);
        setLazyImportInGameActive(true);
        const boundary = new ModalErrorBoundary({
            title: '设置打开失败',
            onClose: vi.fn(),
            importKeys: ['settings-modal'],
            children: React.createElement('div', null, '设置内容')
        });
        boundary.state = { ...boundary.state, ...ModalErrorBoundary.getDerivedStateFromError(new Error('普通渲染错误')) };

        const fallback = boundary.render();
        expect(查找按钮点击(fallback, '重新加载')).toBeNull();
        expect(查找按钮点击(fallback, '刷新重试')).toBeNull();
    });
});