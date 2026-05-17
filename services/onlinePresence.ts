import { RELEASE_INFO } from '../data/releaseInfo';
import { isNativeCapacitorEnvironment } from '../utils/nativeRuntime';
import { 获取本地图片图床迁移状态 } from './dbService';

const ONLINE_SESSION_ID_KEY = 'moranjianghu.onlineSessionId';
const HEARTBEAT_PATH = '/api/admin/online';
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const WS_HEARTBEAT_INTERVAL_MS = 25 * 1000;
const WS_RECONNECT_MS = 10 * 1000;

const getOnlineApiBaseUrl = (): string => {
    if (!isNativeCapacitorEnvironment()) return '';
    const configuredUrl = typeof RELEASE_INFO.websiteUrl === 'string' ? RELEASE_INFO.websiteUrl.trim() : '';
    return (configuredUrl || 'https://msjh.bacon159.pp.ua').replace(/\/+$/, '');
};

const buildOnlineHttpUrl = (): string => `${getOnlineApiBaseUrl()}${HEARTBEAT_PATH}`;

const readSessionId = (): string => {
    try {
        const existing = window.localStorage.getItem(ONLINE_SESSION_ID_KEY);
        if (existing && /^[a-zA-Z0-9._:-]{8,96}$/.test(existing)) return existing;
        const bytes = new Uint8Array(12);
        window.crypto?.getRandomValues?.(bytes);
        const random = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('') || Math.random().toString(36).slice(2);
        const next = `web_${Date.now().toString(36)}_${random}`;
        window.localStorage.setItem(ONLINE_SESSION_ID_KEY, next);
        return next;
    } catch {
        return `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    }
};

const buildHeartbeatPayload = (sessionId: string) => {
    return {
        sessionId,
        path: `${window.location.pathname}${window.location.search}`.slice(0, 240),
        referrer: document.referrer || '',
        versionName: RELEASE_INFO.versionName,
        versionCode: RELEASE_INFO.versionCode,
        platform: isNativeCapacitorEnvironment() ? 'capacitor-android' : 'web',
        imageStats: {
            migrationStatus: 获取本地图片图床迁移状态()
        }
    };
};

const sendHeartbeat = async (sessionId: string): Promise<void> => {
    await fetch(buildOnlineHttpUrl(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(buildHeartbeatPayload(sessionId)),
        keepalive: true,
        cache: 'no-store'
    }).catch(() => undefined);
};

const buildOnlineWebSocketUrl = (): string => {
    const baseUrl = getOnlineApiBaseUrl();
    if (baseUrl) {
        return `${baseUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')}${HEARTBEAT_PATH}`;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${HEARTBEAT_PATH}`;
};

export const startOnlinePresenceHeartbeat = (): (() => void) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
    if (window.location.pathname.startsWith('/admin/')) return () => undefined;

    const sessionId = readSessionId();
    let stopped = false;
    let timer: ReturnType<typeof window.setInterval> | null = null;
    let wsTimer: ReturnType<typeof window.setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof window.setTimeout> | null = null;
    let socket: WebSocket | null = null;

    const clearWsTimer = () => {
        if (wsTimer) {
            window.clearInterval(wsTimer);
            wsTimer = null;
        }
    };

    const closeSocket = () => {
        clearWsTimer();
        if (socket) {
            try {
                socket.close();
            } catch {
                // ignore close failures
            }
            socket = null;
        }
    };

    const sendSocketPayload = async (type: 'hello' | 'ping') => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        try {
            socket.send(JSON.stringify({
                type,
                ...buildHeartbeatPayload(sessionId)
            }));
        } catch {
            // HTTP heartbeat remains as a fallback.
        }
    };

    const scheduleReconnect = () => {
        if (stopped || reconnectTimer) return;
        reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            connectSocket();
        }, WS_RECONNECT_MS);
    };

    const connectSocket = () => {
        if (stopped || typeof WebSocket === 'undefined') return;
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
        try {
            socket = new WebSocket(buildOnlineWebSocketUrl());
            socket.addEventListener('open', () => {
                void sendSocketPayload('hello');
                clearWsTimer();
                wsTimer = window.setInterval(() => {
                    void sendSocketPayload('ping');
                }, WS_HEARTBEAT_INTERVAL_MS);
            });
            socket.addEventListener('close', () => {
                clearWsTimer();
                socket = null;
                scheduleReconnect();
            });
            socket.addEventListener('error', () => {
                closeSocket();
                scheduleReconnect();
            });
        } catch {
            scheduleReconnect();
        }
    };

    const tick = () => {
        if (stopped) return;
        if (socket && socket.readyState === WebSocket.OPEN) return;
        void sendHeartbeat(sessionId);
    };

    connectSocket();
    tick();
    timer = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        stopped = true;
        if (timer) window.clearInterval(timer);
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        closeSocket();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
};
