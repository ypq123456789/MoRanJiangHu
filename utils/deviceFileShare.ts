import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativeCapacitorEnvironment } from './nativeRuntime';

export type 设备文件保存结果 = {
    /** shared = 已通过系统分享面板交给玩家；fallback = 文件已落盘但分享面板未唤起；none = 无法保存 */
    method: 'shared' | 'fallback' | 'none';
    message: string;
    fileName: string;
};

/**
 * 原生 APP 里可用的落盘目录，按优先级排列。
 *
 * ⚠️ 绝不能再用 `Directory.Documents`：Capacitor 把它映射到
 * `Environment.getExternalStoragePublicDirectory(DIRECTORY_DOCUMENTS)`，
 * 那是**公共 Documents 目录**，在 Android 11+ 的 Scoped Storage 下：
 *   1. 需要存储权限，而本 APK 的 manifest 只声明了 INTERNET +
 *      REQUEST_INSTALL_PACKAGES（targetSdk 36），写入必被拒绝；
 *   2. 即使写成功，`file_paths.xml` 只声明了 `external-path` /
 *      `cache-path` / `external-files-path`，覆盖不到公共 Documents，
 *      `SharePlugin` 的 `FileProvider.getUriForFile` 会抛
 *      "Failed to find configured root"，分享面板同样起不来。
 * 改用下列应用自有目录后，既不需要任何存储权限，也落在 FileProvider
 * 已声明的 root 内（`getExternalFilesDir` → `external-files-path`，
 * `cacheDir` → `cache-path`），分享面板可正常工作。
 */
const 落盘目录优先级: Directory[] = [
    Directory.External,
    Directory.ExternalCache,
    Directory.Cache,
    Directory.Data
];

const 目录名称 = (directory: Directory): string => {
    switch (directory) {
        case Directory.External:
            return '外部应用目录（Android/data/<应用包名>/files）';
        case Directory.ExternalCache:
        case Directory.Cache:
        case Directory.Data:
        default:
            return '应用私有目录';
    }
};

/** 依次尝试各候选目录写入；返回第一个成功的目录。 */
const 尝试写入文件 = async (
    fileName: string,
    dataBase64: string
): Promise<{ directory: Directory } | null> => {
    let lastError: unknown = null;

    for (const directory of 落盘目录优先级) {
        try {
            await Filesystem.writeFile({
                path: fileName,
                data: dataBase64,
                directory,
                recursive: false
            });
            return { directory };
        } catch (error) {
            lastError = error;
            console.warn(`[设备文件分享] 写入「${目录名称(directory)}」失败，继续尝试下一个候选目录。`, error);
        }
    }

    console.error('[设备文件分享] 所有候选目录均写入失败。', lastError);
    return null;
};

/**
 * 在原生 APP 里把文件写入应用自有目录，再唤起系统分享面板，
 * 让玩家自己选择“保存到文件/下载/发送到微信或网盘”。
 *
 * 修复历史：
 *  - 早期直接把 txt/zip 写进 `Directory.Documents`（公共 Documents），
 *    Android 11+ 下既写不进也分享不出去，玩家只看到一句
 *    “已保存到设备文档目录”却怎么也找不到文件。
 *  - 现改为应用自有目录（见 `落盘目录优先级`），写入不依赖存储权限，
 *    并且**只有在文件确实落盘后**才可能返回非 none 结果。
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

    // [写入防护] 写入失败时文件并不存在，必须返回 none，让调用方走浏览器下载兜底
    const written = await 尝试写入文件(fileName, dataBase64);
    if (!written) {
        return {
            method: 'none',
            message: `导出失败：「${fileName}」未能写入设备。`,
            fileName
        };
    }

    let fileUri = '';
    try {
        const uri = await Filesystem.getUri({ directory: written.directory, path: fileName });
        fileUri = uri?.uri || '';
        if (!fileUri) {
            throw new Error('getUri 未返回可用路径');
        }
    } catch (error) {
        console.warn('[设备文件分享] 解析文件路径失败。', error);
        // 文件已落盘但拿不到 URI，分享不可能成功，仍报 none 以触发浏览器下载兜底
        return {
            method: 'none',
            message: `导出失败：「${fileName}」已写入但无法读取，请重试。`,
            fileName
        };
    }

    try {
        await Share.share({
            files: [fileUri],
            title: fileName,
            dialogTitle: dialogTitle || '保存或分享文件'
        });
        return {
            method: 'shared',
            message: `已生成「${fileName}」，请在系统面板中选择“保存到文件”或发送到其他应用。`,
            fileName
        };
    } catch (error) {
        // 分享面板异常（如机型限制、玩家取消）时文件仍在应用目录内
        console.warn('[设备文件分享] 分享面板唤起失败，文件保留在应用目录。', error);
        return {
            method: 'fallback',
            message: `文件已生成「${fileName}」（保存在${目录名称(written.directory)}）。如系统分享面板未出现，可尝试通过“导出/上传到云端”等其他方式获取。`,
            fileName
        };
    }
};
