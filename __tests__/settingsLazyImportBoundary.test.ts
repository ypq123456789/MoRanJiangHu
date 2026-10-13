import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ModalErrorBoundary } from '../components/ui/ModalErrorBoundary';
import { lazyImportWithReload } from '../utils/lazyImportWithReload';

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

describe('设置模块懒加载局部错误边界', () => {
    it('settings-world 等旧 chunk 失效时由设置弹窗边界承接，不击穿根界面', () => {
        const source = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf8');
        const settingsBlockStart = source.indexOf('{/* Settings Modal */}');
        const settingsBlockEnd = source.indexOf('{showWorldbookManager && (', settingsBlockStart);

        expect(settingsBlockStart).toBeGreaterThanOrEqual(0);
        expect(settingsBlockEnd).toBeGreaterThan(settingsBlockStart);

        const settingsBlock = source.slice(settingsBlockStart, settingsBlockEnd);
        const boundaryOpen = settingsBlock.indexOf('<ModalErrorBoundary title="设置打开失败"');
        // 注意：懒加载边界标签可能带属性（如 onDismiss）且多行书写，
        // 只能匹配标签名开头，不能匹配带右尖括号的单行形式。
        const suspenseOpen = settingsBlock.indexOf('<懒加载边界');
        const mobileSettings = settingsBlock.indexOf('<MobileSettingsModal');
        const desktopSettings = settingsBlock.indexOf('<SettingsModal');
        const suspenseClose = settingsBlock.lastIndexOf('</懒加载边界>');
        const boundaryClose = settingsBlock.lastIndexOf('</ModalErrorBoundary>');

        expect(boundaryOpen).toBeGreaterThanOrEqual(0);
        expect(suspenseOpen).toBeGreaterThan(boundaryOpen);
        expect(mobileSettings).toBeGreaterThan(suspenseOpen);
        expect(desktopSettings).toBeGreaterThan(suspenseOpen);
        expect(suspenseClose).toBeGreaterThan(desktopSettings);
        expect(boundaryClose).toBeGreaterThan(suspenseClose);
    });

    it('动态导入失败时显示设置局部错误页，并可调用关闭设置而不影响边界外根界面', async () => {
        const originalWindow = globalThis.window;
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: {}
        });

        try {
            const importError = await lazyImportWithReload(
                'settings-world',
                async () => Promise.reject(new Error('Failed to fetch dynamically imported module'))
            ).then(
                () => null,
                (error: Error) => error
            );
            expect(importError?.name).toBe('DynamicImportDeferredReloadError');

            const closeSettings = vi.fn();
            const boundary = new ModalErrorBoundary({
                title: '设置打开失败',
                onClose: closeSettings,
                children: React.createElement('div', null, '边界外根界面仍可使用')
            });
            boundary.state = ModalErrorBoundary.getDerivedStateFromError(importError as Error);

            const fallback = boundary.render();
            const fallbackText = 读取节点文本(fallback);
            expect(fallbackText).toContain('设置打开失败');
            expect(fallbackText).toContain('页面资源已经更新');
            expect(fallbackText).toContain('刷新重试');

            const closeClick = 查找按钮点击(fallback, '关闭');
            expect(closeClick).toBeTypeOf('function');
            closeClick?.();
            expect(closeSettings).toHaveBeenCalledTimes(1);
        } finally {
            if (originalWindow === undefined) {
                delete (globalThis as { window?: Window }).window;
            } else {
                Object.defineProperty(globalThis, 'window', {
                    configurable: true,
                    value: originalWindow
                });
            }
        }
    });
});
