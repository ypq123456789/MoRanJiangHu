import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('存档批量导出 UI', () => {
    it('导出全部只生成一个总 ZIP，并通过流式写入降低峰值内存', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'components/features/SaveLoad/SaveLoadModal.tsx'),
            'utf8'
        );

        expect(source).toContain('创建存档ZIP流式写入');
        expect(source).toContain('navigator.storage?.getDirectory');
        expect(source).toContain('Filesystem.appendFile');
        expect(source).not.toContain('downloadArchiveBlob(archive.blob');
        expect(source).not.toContain('buildArchive: async');
        expect(source).toMatch(/wuxia-saves-.*\.zip/);
        expect(source).toContain("[html[data-theme='day']_&]:text-cyan-900");
        expect(source).toContain('已处理 ${completed} / ${total} 条');
    });

    it('APK 通过 Capacitor Filesystem 写入应用自有目录并交给分享面板（不再写公共 Documents）', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'components/features/SaveLoad/SaveLoadModal.tsx'),
            'utf8'
        );
        const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

        expect(source).toContain("from '@capacitor/filesystem'");
        expect(packageJson.dependencies['@capacitor/filesystem']).toBeTruthy();

        // 回归（2026-09-19）：公共 Documents 在 Android 11+ 下无权限且不在
        // FileProvider 已声明路径内，写入/分享都会失败，必须改用应用自有目录。
        expect(source).not.toContain('directory: Directory.Documents');
        expect(source).not.toContain("directory: 'DOCUMENTS'");
        expect(source).toContain('Directory.External');
        expect(source).toContain('Share.share');
    });
});
