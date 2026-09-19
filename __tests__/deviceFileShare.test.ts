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
    Directory: {
        Documents: 'DOCUMENTS',
        External: 'EXTERNAL',
        ExternalCache: 'EXTERNAL_CACHE',
        Cache: 'CACHE',
        Data: 'DATA'
    },
    Filesystem: { writeFile: vi.fn(), getUri: vi.fn() }
}));
vi.mock('@capacitor/share', () => ({
    Share: { share: vi.fn() }
}));

/**
 * 回归背景（2026-09-19 玩家反馈）：
 * 导出小说点“正式TXT/MD”只提示「已保存到设备文档目录」，既不弹分享面板、
 * 文件也找不到。根因是写 `Directory.Documents`（公共 Documents）：
 *   1. APK manifest 无存储权限（targetSdk 36），写入被 Scoped Storage 拒绝；
 *   2. 即使写成功，`file_paths.xml` 也不覆盖公共 Documents，
 *      FileProvider 抛 "Failed to find configured root"，分享面板仍起不来。
 * 下面这些用例锁死修复后的契约：**禁止再写 Documents**，且只有真正落盘
 * 之后才允许返回非 none。
 */
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

    it('绝不写入公共 Documents 目录（该目录在 Android 11+ 必然失败）', async () => {
        nativeMock.isNative = true;
        vi.mocked(Filesystem.writeFile).mockResolvedValueOnce({ uri: 'file:///ext/a.zip' } as any);
        vi.mocked(Filesystem.getUri).mockResolvedValueOnce({ uri: 'file:///ext/a.zip' } as any);
        vi.mocked(Share.share).mockResolvedValueOnce();

        await 写入并分享设备文件('a.zip', 'aGVsbG8=');

        for (const call of vi.mocked(Filesystem.writeFile).mock.calls) {
            expect((call[0] as any).directory).not.toBe(Directory.Documents);
        }
        expect(Filesystem.writeFile).toHaveBeenCalledWith(
            expect.objectContaining({ path: 'a.zip', directory: Directory.External, recursive: false })
        );
    });

    it('首选目录写入失败时逐个降级到下一个候选目录，最终成功则返回 shared', async () => {
        nativeMock.isNative = true;
        vi.mocked(Filesystem.writeFile)
            .mockRejectedValueOnce(new Error('EXTERNAL unavailable'))
            .mockResolvedValueOnce({ uri: 'file:///cache/a.zip' } as any);
        vi.mocked(Filesystem.getUri).mockResolvedValueOnce({ uri: 'file:///cache/a.zip' } as any);
        vi.mocked(Share.share).mockResolvedValueOnce();

        const result = await 写入并分享设备文件('a.zip', 'aGVsbG8=');

        expect(result.method).toBe('shared');
        expect(Filesystem.writeFile).toHaveBeenCalledTimes(2);
        expect(vi.mocked(Filesystem.writeFile).mock.calls[1][0]).toMatchObject({
            directory: Directory.ExternalCache
        });
        expect(Filesystem.getUri).toHaveBeenCalledWith({
            directory: Directory.ExternalCache,
            path: 'a.zip'
        });
    });

    it('所有候选目录都写入失败时返回 none，不能谎报 fallback 让调用方跳过浏览器下载回退', async () => {
        nativeMock.isNative = true;
        vi.mocked(Filesystem.writeFile).mockRejectedValue(new Error('disk full'));

        const result = await 写入并分享设备文件('a.zip', 'aGVsbG8=');

        expect(result.method).toBe('none');
        expect(result.message).toContain('a.zip');
        // 4 个候选目录都被尝试过
        expect(Filesystem.writeFile).toHaveBeenCalledTimes(4);
        expect(Filesystem.getUri).not.toHaveBeenCalled();
        expect(Share.share).not.toHaveBeenCalled();
    });

    it('写入成功但取 URI 失败时返回 none（拿不到路径就无法分享，须触发下载兜底）', async () => {
        nativeMock.isNative = true;
        vi.mocked(Filesystem.writeFile).mockResolvedValueOnce({ uri: 'file:///ext/a.zip' } as any);
        vi.mocked(Filesystem.getUri).mockRejectedValueOnce(new Error('no uri'));

        const result = await 写入并分享设备文件('a.zip', 'aGVsbG8=');

        expect(result.method).toBe('none');
        expect(Share.share).not.toHaveBeenCalled();
    });

    it('写入成功但分享面板失败时返回 fallback（文件已在应用目录内）', async () => {
        nativeMock.isNative = true;
        vi.mocked(Filesystem.writeFile).mockResolvedValueOnce({ uri: 'file:///ext/a.zip' } as any);
        vi.mocked(Filesystem.getUri).mockResolvedValueOnce({ uri: 'file:///ext/a.zip' } as any);
        vi.mocked(Share.share).mockRejectedValueOnce(new Error('no activity'));

        const result = await 写入并分享设备文件('a.zip', 'aGVsbG8=');

        expect(result.method).toBe('fallback');
        expect(result.message).toContain('a.zip');
        expect(Filesystem.getUri).toHaveBeenCalledTimes(1);
        expect(Share.share).toHaveBeenCalledTimes(1);
    });

    it('写入、取 URI、分享全部成功时返回 shared，并把正确 URI 交给面板', async () => {
        nativeMock.isNative = true;
        vi.mocked(Filesystem.writeFile).mockResolvedValueOnce({ uri: 'file:///ext/a.zip' } as any);
        vi.mocked(Filesystem.getUri).mockResolvedValueOnce({ uri: 'file:///ext/a.zip' } as any);
        vi.mocked(Share.share).mockResolvedValueOnce();

        const result = await 写入并分享设备文件('a.zip', 'aGVsbG8=', '保存文件');

        expect(result.method).toBe('shared');
        expect(Share.share).toHaveBeenCalledWith(
            expect.objectContaining({ files: ['file:///ext/a.zip'], dialogTitle: '保存文件' })
        );
    });

    it('成功文案不再出现误导性的「已保存到设备文档目录」', async () => {
        nativeMock.isNative = true;
        vi.mocked(Filesystem.writeFile).mockResolvedValueOnce({ uri: 'file:///ext/a.zip' } as any);
        vi.mocked(Filesystem.getUri).mockResolvedValueOnce({ uri: 'file:///ext/a.zip' } as any);
        vi.mocked(Share.share).mockResolvedValueOnce();

        const result = await 写入并分享设备文件('a.zip', 'aGVsbG8=');

        expect(result.message).not.toContain('设备文档目录');
        expect(result.message).toContain('系统面板');
    });
});
