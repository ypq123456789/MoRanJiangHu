import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

type DownloadAndInstallOptions = {
    url: string;
    versionName: string;
};

type InstalledApkInfo = {
    filePath: string;
    sha256: string;
    fileSize: number;
};

export type NativeApkUpdateProgress = {
    stage: 'preparing' | 'downloading' | 'downloaded' | 'installing' | 'completed' | 'error';
    message?: string;
    downloadedBytes?: number;
    totalBytes?: number;
    percent?: number;
    filePath?: string;
    versionName?: string;
};

type ApkUpdaterPlugin = {
    downloadAndInstall(options: DownloadAndInstallOptions): Promise<{ filePath: string; versionName: string }>;
    getInstalledApkInfo(): Promise<InstalledApkInfo>;
    addListener(
        eventName: 'updateProgress',
        listenerFunc: (progress: NativeApkUpdateProgress) => void
    ): Promise<PluginListenerHandle>;
};

export const NativeApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');
