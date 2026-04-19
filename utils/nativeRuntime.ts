const 读取字符串 = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

export const 获取同步API基础地址 = (): string => {
    const raw = 读取字符串((import.meta as any).env?.VITE_SYNC_API_BASE_URL);
    return raw.replace(/\/+$/, '');
};

export const 构建同步API地址 = (path: string): string => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const baseUrl = 获取同步API基础地址();
    return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
};

export const 是否原生Capacitor环境 = (): boolean => {
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

export const 当前环境需要远程同步API = (): boolean => {
    if (!是否原生Capacitor环境()) return false;
    if (typeof window === 'undefined') return false;

    const hostname = 读取字符串(window.location.hostname).toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1';
};
