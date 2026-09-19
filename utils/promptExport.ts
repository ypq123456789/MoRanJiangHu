import { 提示词结构 } from '../types';
import { isNativeCapacitorEnvironment } from './nativeRuntime';
import { 写入并分享设备文件 } from './deviceFileShare';
import { 创建并记录ObjectURL, 延迟释放并记录ObjectURL } from './objectUrlLifecycle';

export type 提示词导出结果 = {
    method: 'file' | 'download';
    fileName: string;
    message: string;
};

const 提示词导出文件名 = 'wuxia_prompts.json';

const 编码Base64 = (content: string): string => {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(content, 'utf8').toString('base64');
    }
    return btoa(unescape(encodeURIComponent(content)));
};

const 读取原生文件系统插件 = (): any => {
    if (!isNativeCapacitorEnvironment()) return null;
    const runtime = typeof window !== 'undefined' ? (window as any) : undefined;
    return runtime?.Capacitor?.Plugins?.Filesystem || null;
};

export const 导出提示词到文件 = async (prompts: 提示词结构[]): Promise<提示词导出结果> => {
    const content = JSON.stringify(Array.isArray(prompts) ? prompts : [], null, 2);
    const filesystem = 读取原生文件系统插件();

    if (filesystem?.writeFile) {
        // [修复] 原先写 `directory: 'DOCUMENTS'`（公共 Documents）：Android 11+ 下
        // 无存储权限且不在 FileProvider 已声明路径内，写入必失败，却仍返回
        // “已导出到设备文档目录”的成功文案。现统一走应用自有目录 + 系统分享面板。
        try {
            const result = await 写入并分享设备文件(提示词导出文件名, 编码Base64(content), '保存提示词文件');
            if (result.method !== 'none') {
                return {
                    method: 'file',
                    fileName: 提示词导出文件名,
                    message: result.message
                };
            }
            console.warn('[提示词导出] 设备文件保存失败，尝试浏览器下载兜底:', result.message);
        } catch (error) {
            console.error('提示词原生文件导出失败，尝试浏览器下载兜底:', error);
        }
    }

    if (typeof document === 'undefined') {
        throw new Error('当前环境无法导出提示词文件');
    }

    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = 创建并记录ObjectURL(blob, {
        source: 'promptExport.导出提示词到文件',
        kind: 'prompt-export',
        detail: { promptCount: Array.isArray(prompts) ? prompts.length : 0 }
    });
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 提示词导出文件名;
    anchor.click();
    延迟释放并记录ObjectURL(url, {
        source: 'promptExport.导出提示词到文件',
        kind: 'prompt-export',
        detail: { reason: 'download-clicked' }
    }, 1000);

    return {
        method: 'download',
        fileName: 提示词导出文件名,
        message: `已开始下载：${提示词导出文件名}`
    };
};
