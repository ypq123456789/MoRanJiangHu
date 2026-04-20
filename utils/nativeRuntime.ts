import { SystemBars, SystemBarType } from '@capacitor/core';

const readEnvString = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

export const getSyncApiBaseUrl = (): string => {
    const raw = readEnvString((import.meta as any).env?.VITE_SYNC_API_BASE_URL);
    return raw.replace(/\/+$/, '');
};

export const buildSyncApiUrl = (path: string): string => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const baseUrl = getSyncApiBaseUrl();
    return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
};

export const isNativeCapacitorEnvironment = (): boolean => {
    if (typeof window === 'undefined') return false;
    const maybeCapacitor = (window as any).Capacitor;
    if (!maybeCapacitor) return false;

    try {
        if (typeof maybeCapacitor.isNativePlatform === 'function') {
            return maybeCapacitor.isNativePlatform();
        }
        if (typeof maybeCapacitor.getPlatform === 'function') {
            return maybeCapacitor.getPlatform() !== 'web';
        }
    } catch {
        return false;
    }

    return false;
};

export const requiresRemoteSyncApi = (): boolean => {
    if (!isNativeCapacitorEnvironment()) return false;
    if (typeof window === 'undefined') return false;

    const hostname = readEnvString(window.location.hostname).toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1';
};

export const isMissingNativeSyncApiBaseUrl = (): boolean => (
    requiresRemoteSyncApi() && !getSyncApiBaseUrl()
);

export const setNativeSystemBarsHidden = async (hidden: boolean): Promise<void> => {
    if (!isNativeCapacitorEnvironment()) return;

    try {
        if (hidden) {
            await SystemBars.hide({ bar: SystemBarType.StatusBar });
            await SystemBars.hide({ bar: SystemBarType.NavigationBar });
        } else {
            await SystemBars.show({ bar: SystemBarType.StatusBar });
            await SystemBars.show({ bar: SystemBarType.NavigationBar });
        }
    } catch (error) {
        console.warn('Failed to update native system bars visibility:', error);
    }
};

export const 构建同步API地址 = buildSyncApiUrl;
export const 是否原生Capacitor环境 = isNativeCapacitorEnvironment;
export const 当前环境需要远程同步API = requiresRemoteSyncApi;
export const 设置原生系统栏隐藏 = setNativeSystemBarsHidden;
