import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const loadPrebootListeners = (options?: { mounted?: boolean }) => {
    const html = fs.readFileSync('index.html', 'utf8');
    const match = html.match(/<script>\s*([\s\S]*?window\.__MORAN_PREBOOT_LOGS__[\s\S]*?)<\/script>/);
    if (!match) throw new Error('preboot script not found');

    const listeners: Record<string, (event: any) => void> = {};
    const appended: any[] = [];
    const windowMock: any = {
        addEventListener: vi.fn((type: string, listener: (event: any) => void) => {
            listeners[type] = listener;
        })
    };
    const rootElement = { childElementCount: options?.mounted ? 1 : 0 };
    const documentMock: any = {
        body: {
            appendChild: vi.fn((node: any) => {
                appended.push(node);
            })
        },
        getElementById: vi.fn((id: string) => (id === 'root' ? rootElement : null)),
        createElement: vi.fn(() => ({
            id: '',
            style: {},
            textContent: ''
        }))
    };
    const consoleMock = {
        error: vi.fn(),
        warn: vi.fn()
    };

    new Function('window', 'document', 'console', match[1])(windowMock, documentMock, consoleMock);
    return { windowMock, listeners, appended };
};

describe('preboot error handling', () => {
    it('does not block app startup for recoverable NetworkError promise rejections', () => {
        const { windowMock, listeners, appended } = loadPrebootListeners();
        const preventDefault = vi.fn();

        listeners.unhandledrejection({
            reason: new TypeError('NetworkError when attempting to fetch resource.'),
            preventDefault
        });

        expect(preventDefault).toHaveBeenCalled();
        expect(appended).toHaveLength(0);
        expect(windowMock.__MORAN_PREBOOT_LOGS__[0].level).toBe('warn');
    });

    it('treats structured HTTP 5xx status as recoverable', () => {
        const { listeners, appended } = loadPrebootListeners();
        const preventDefault = vi.fn();

        listeners.unhandledrejection({
            reason: { message: 'upstream failed', status: 503 },
            preventDefault
        });

        expect(preventDefault).toHaveBeenCalled();
        expect(appended).toHaveLength(0);
    });

    it('treats contextual HTTP 502 text as recoverable', () => {
        const { listeners, appended } = loadPrebootListeners();
        const preventDefault = vi.fn();

        listeners.unhandledrejection({
            reason: new Error('API proxy returned HTTP 502 Bad Gateway'),
            preventDefault
        });

        expect(preventDefault).toHaveBeenCalled();
        expect(appended).toHaveLength(0);
    });

    it('does not treat bare 5xx-looking business numbers as recoverable', () => {
        const { listeners, appended } = loadPrebootListeners();
        const preventDefault = vi.fn();

        listeners.unhandledrejection({
            reason: new Error('inventory item 512 failed validation at line 550'),
            preventDefault
        });

        expect(preventDefault).not.toHaveBeenCalled();
        expect(appended).toHaveLength(1);
    });

    it('does not hide a structured HTTP 401 rejection containing API Error text', () => {
        const { listeners, appended } = loadPrebootListeners();
        const preventDefault = vi.fn();

        listeners.unhandledrejection({
            reason: { message: 'API Error: Unauthorized', status: 401 },
            preventDefault
        });

        expect(preventDefault).not.toHaveBeenCalled();
        expect(appended).toHaveLength(1);
    });

    it('still shows the startup failure overlay for non-recoverable promise rejections', () => {
        const { listeners, appended } = loadPrebootListeners();

        listeners.unhandledrejection({
            reason: new Error('chunk boot failed'),
            preventDefault: vi.fn()
        });

        expect(appended).toHaveLength(1);
    });

    // 回归：v1.0.706 线上事故。玩家已在游戏中，后台自动生图撞上第三方渠道 403，
    // 该 rejection 被误判为「应用启动失败」，整屏遮罩盖死游戏。
    it('never blocks an already mounted app with a mid-session rejection', () => {
        const { windowMock, listeners, appended } = loadPrebootListeners({ mounted: true });
        const preventDefault = vi.fn();

        listeners.unhandledrejection({
            reason: new Error('协议请求错误: AI 接口拒绝访问（403）：积分不足。'),
            preventDefault
        });

        expect(appended).toHaveLength(0);
        expect(windowMock.__MORAN_PREBOOT_LOGS__.at(-1).level).toBe('error');
    });

    it('never replaces an already mounted app with the overlay on a stray window.error', () => {
        const { listeners, appended } = loadPrebootListeners({ mounted: true });

        listeners.error({
            message: 'Uncaught TypeError: x is not a function',
            filename: 'https://msjh.bacon159.pp.ua/assets/index.js',
            lineno: 1,
            colno: 2,
            error: new Error('x is not a function')
        });

        expect(appended).toHaveLength(0);
    });
});
