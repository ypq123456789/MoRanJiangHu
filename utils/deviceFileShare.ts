import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativeCapacitorEnvironment } from './nativeRuntime';

export type 设备文件保存结果 = {
    /** shared = 已通过系统分享面板交给玩家；fallback = 走浏览器下载；none = 无法保存 */
    method: 'shared' | 'fallback' | 'none';
    message: string;
    fileName: string;
};

/**
 * 在原生 APP 里把文件先写入应用私有文档目录，再唤起系统分享面板，
 * 让玩家自己选择“保存到文件/下载/发送到微信或网盘”。
 *
 * 背景：此前直接把 zip/txt 写进 `Directory.Documents`（应用私有目录，
 * Android 11+ 的 Scoped Storage 下系统文件管理器不可见），玩家反馈
 * “提示已保存到设备文档目录，但在文档里找了半天也找不到”。
 * 系统分享面板（SAF）是让文件落到用户可见位置的通用途径。
 *
 * @param fileName 目标文件名（仅文件名，不带路径）
 * @param dataBase64 文件内容（base64 编码字符串）
 * @param dialogTitle 分享面板标题（可选，Android 生效）
 */
export const 写入并分享设备文件 = async (
    fileName: string,
    dataBase64: string,
    dialogTitle?: string
): Promise<设备文件保存结果> => {
    if (!isNativeCapacitorEnvironment()) {
        return { method: 'none', message: '当前不是原生 APP 环境。', fileName };
    }
    try {
        await Filesystem.writeFile({
            path: fileName,
            data: dataBase64,
            directory: Directory.Documents,
            recursive: false
        });
        const uri = await Filesystem.getUri({ directory: Directory.Documents, path: fileName });
        await Share.share({
            files: [uri.uri],
            title: fileName,
            dialogTitle: dialogTitle || '保存或分享文件'
        });
        return {
            method: 'shared',
            message: `已生成「${fileName}」，请在系统面板中选择“保存到文件”或发送到其他应用。`,
            fileName
        };
    } catch (error) {
        // Share 面板自身异常（如机型限制）时，文件已落在私有目录，尽力提示；不抛断流程
        console.warn('[设备文件分享] 分享面板唤起失败，文件保留在应用文档目录。', error);
        return {
            method: 'fallback',
            message: `文件已生成「${fileName}」（保存在应用文档目录）。如系统分享面板未出现，可尝试通过“导出/上传到云端”等其他方式获取。`,
            fileName
        };
    }
};
