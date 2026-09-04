import { afterEach, describe, expect, it, vi } from 'vitest';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { 写入并分享设备文件 } from '../utils/deviceFileShare';

// 可控的原生环境开关：默认 false（非原生），个别用例置 true 模拟 APP 内
const nativeMock = vi.hoisted(() => ({ isNative: false }));
vi.mock('../utils/nativeRuntime', () => ({
    isNativeCapacitorEnvironment: () => nativeMock.isNative
}));
vi.mock('@capacitor/filesystem', () => ({
    Directory: { Documents: 'DOCUMENTS' },
    Filesystem: { writeFile: vi.fn(), getUri: vi.fn() }
}));
vi.mock('@capacitor/share', () => ({
    Share: { share: vi.fn() }
}));

describe('写入并分享设备文件', () => {
    afterEach(() => {
        nativeMock.isNative = false;
        vi.clearAllMocks();
    });

    it('在非原生浏览器环境返回 none，不抛错、不尝试原生写入', async () => {
        const result = await 写入并分享设备文件('测试.zip', 'aGVsbG8=', '保存文件');
        expect(result.method).toBe('none');
        expect(result.fileName).toBe('测试.zip');
        expect(Filesystem.writeFile).not.toHaveBeenCalled();
    });

    it('原生写入失败时返回 none，不能谎报 fallback 让调用方跳过浏览器下载回退', async () => {
        nativeMock.isNative = true;
        vi.mocked(Filesystem.writeFile).mockRejectedValueOnce(new Error('disk full'));
        const result = await 写入并分享设备文件('a.zip', 'aGVsbG8=');
        expect(result.method).toBe('none');
        expect(result.message).toContain('a.zip');
        expect(Filesystem.writeFile).toHaveBeenCalledTimes(1);
        expect(Filesystem.getUri).not.toHaveBeenCalled();
        expect(Share.share).not.toHaveBeenCalled();
    });

    it('写入成功但分享面板失败时返回 fallback（文件已落在私有目录）', async () => {
        nativeMock.isNative = true;
        vi.mocked(Filesystem.writeFile).mockResolvedValueOnce({ uri: 'file:///doc/a.zip' } as any);
        vi.mocked(Filesystem.getUri).mockResolvedValueOnce({ uri: 'file:///doc/a.zip' } as any);
        vi.mocked(Share.share).mockRejectedValueOnce(new Error('no activity'));
        const result = await 写入并分享设备文件('a.zip', 'aGVsbG8=');
        expect(result.method).toBe('fallback');
        expect(Filesystem.writeFile).toHaveBeenCalledWith({
            path: 'a.zip',
            data: 'aGVsbG8=',
            directory: Directory.Documents,
            recursive: false
        });
        expect(Filesystem.getUri).toHaveBeenCalledTimes(1);
        expect(Share.share).toHaveBeenCalledTimes(1);
    });

    it('写入、取 URI、分享全部成功时返回 shared', async () => {
        nativeMock.isNative = true;
        vi.mocked(Filesystem.writeFile).mockResolvedValueOnce({ uri: 'file:///doc/a.zip' } as any);
        vi.mocked(Filesystem.getUri).mockResolvedValueOnce({ uri: 'file:///doc/a.zip' } as any);
        vi.mocked(Share.share).mockResolvedValueOnce();
        const result = await 写入并分享设备文件('a.zip', 'aGVsbG8=', '保存文件');
        expect(result.method).toBe('shared');
        expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///doc/a.zip'], dialogTitle: '保存文件' }));
    });
});
