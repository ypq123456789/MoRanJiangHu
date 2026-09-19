import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeRuntimeMock = vi.hoisted(() => ({ native: false }));
const fsMock = vi.hoisted(() => ({
    writeFile: vi.fn(),
    getUri: vi.fn(),
    Directory: { Documents: 'DOCUMENTS', External: 'EXTERNAL', ExternalCache: 'EXTERNAL_CACHE', Cache: 'CACHE', Data: 'DATA' }
}));
const shareMock = vi.hoisted(() => ({ share: vi.fn() }));

vi.mock('../utils/nativeRuntime', () => ({
    isNativeCapacitorEnvironment: () => nativeRuntimeMock.native
}));
vi.mock('@capacitor/filesystem', () => ({
    Directory: fsMock.Directory,
    Filesystem: { writeFile: fsMock.writeFile, getUri: fsMock.getUri }
}));
vi.mock('@capacitor/share', () => ({
    Share: { share: shareMock.share }
}));

const decodeBase64Utf8 = (value: string): string => Buffer.from(value, 'base64').toString('utf8');

describe('prompt export', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        nativeRuntimeMock.native = false;
        fsMock.writeFile.mockResolvedValue({ uri: 'file:///ext/wuxia_prompts.json' });
        fsMock.getUri.mockResolvedValue({ uri: 'file:///ext/wuxia_prompts.json' });
        shareMock.share.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('writes prompt JSON through the shared device-file helper in the APK runtime', async () => {
        nativeRuntimeMock.native = true;
        vi.stubGlobal('window', {
            Capacitor: {
                Plugins: {
                    // 仅用于触发 promptExport 的“原生可用”分流；真实写入由 deviceFileShare 走包导入
                    Filesystem: { writeFile: vi.fn() }
                }
            }
        });

        const { 导出提示词到文件 } = await import('../utils/promptExport');
        const result = await 导出提示词到文件([
            { id: 'p1', 标题: '生图提示词', 内容: '正面提示', 类型: '自定义', 启用: true }
        ] as any);

        expect(result.method).toBe('file');
        expect(result.fileName).toBe('wuxia_prompts.json');
        expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
        expect(fsMock.writeFile.mock.calls[0][0]).toMatchObject({
            path: 'wuxia_prompts.json',
            recursive: false
        });
        // 回归：禁止再写公共 Documents（Android 11+ 必然失败）
        expect(fsMock.writeFile.mock.calls[0][0].directory).not.toBe('DOCUMENTS');
        expect(JSON.parse(decodeBase64Utf8(fsMock.writeFile.mock.calls[0][0].data))).toEqual([
            { id: 'p1', 标题: '生图提示词', 内容: '正面提示', 类型: '自定义', 启用: true }
        ]);
        expect(shareMock.share).toHaveBeenCalledTimes(1);
        // 成功文案不能再说“已导出到设备文档目录”
        expect(result.message).not.toContain('设备文档目录');
    });

    it('keeps the browser download path outside native runtime', async () => {
        const click = vi.fn();
        const anchor: any = { click, href: '', download: '' };
        const createElement = vi.fn(() => anchor);
        const createObjectURL = vi.fn(() => 'blob:prompt-export');
        const revokeObjectURL = vi.fn();
        vi.stubGlobal('document', { createElement });
        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
        vi.stubGlobal('setTimeout', vi.fn((callback: () => void) => {
            callback();
            return 1;
        }));

        const { 导出提示词到文件 } = await import('../utils/promptExport');
        const result = await 导出提示词到文件([
            { id: 'p2', 标题: '浏览器提示词', 内容: '负面提示', 类型: '自定义', 启用: true }
        ] as any);

        expect(result.method).toBe('download');
        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(anchor.href).toBe('blob:prompt-export');
        expect(anchor.download).toBe('wuxia_prompts.json');
        expect(click).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:prompt-export');
    });
});
