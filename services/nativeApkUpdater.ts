import { registerPlugin } from '@capacitor/core';

type DownloadAndInstallOptions = {
    url: string;
    versionName: string;
};

type ApkUpdaterPlugin = {
    downloadAndInstall(options: DownloadAndInstallOptions): Promise<{ filePath: string; versionName: string }>;
};

export const NativeApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');
