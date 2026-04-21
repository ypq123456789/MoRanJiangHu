import { registerPlugin } from '@capacitor/core';

type DownloadAndInstallOptions = {
    url: string;
    versionName: string;
};

type InstalledApkInfo = {
    filePath: string;
    sha256: string;
    fileSize: number;
};

type ApkUpdaterPlugin = {
    downloadAndInstall(options: DownloadAndInstallOptions): Promise<{ filePath: string; versionName: string }>;
    getInstalledApkInfo(): Promise<InstalledApkInfo>;
};

export const NativeApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');
