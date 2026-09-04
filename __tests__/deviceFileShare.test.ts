import { describe, expect, it, vi } from 'vitest';
import { 写入并分享设备文件 } from '../utils/deviceFileShare';

describe('写入并分享设备文件', () => {
    it('在非原生浏览器环境返回 none，不抛错、不尝试原生写入', async () => {
        const result = await 写入并分享设备文件('测试.zip', 'aGVsbG8=', '保存文件');
        expect(result.method).toBe('none');
        expect(result.fileName).toBe('测试.zip');
    });
});
