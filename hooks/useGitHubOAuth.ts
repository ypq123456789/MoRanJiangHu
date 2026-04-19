import { useCallback, useEffect, useRef, useState } from 'react';
import { 构建同步API地址, 是否原生Capacitor环境 } from '../utils/nativeRuntime';

const TOKEN_KEY = 'github_sync_token';
const DEVICE_FLOW_GRACE_MS = 5000;

type DeviceFlowStatus = 'idle' | 'waiting' | 'success' | 'error';

export type GitHubDeviceFlowState = {
    status: DeviceFlowStatus;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    expiresAt: number | null;
    intervalSeconds: number;
    message: string | null;
};

type DeviceStartResponse = {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    verification_uri_complete?: string;
    expires_in?: number;
    interval?: number;
    error?: string;
};

type DevicePollResponse = {
    status?: 'pending' | 'slow_down' | 'authorized' | 'expired' | 'denied' | 'error';
    access_token?: string;
    interval?: number;
    error?: string;
};

const idleDeviceFlowState = (): GitHubDeviceFlowState => ({
    status: 'idle',
    userCode: '',
    verificationUri: '',
    verificationUriComplete: '',
    expiresAt: null,
    intervalSeconds: 5,
    message: null
});

const normalizeErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
};

const readEnvString = (value: unknown) => (
    typeof value === 'string' ? value.trim() : ''
);

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
    let data: T;
    try {
        data = await response.json();
    } catch {
        throw new Error(`HTTP Error ${response.status}`);
    }
    return data;
};

export function useGitHubOAuth() {
    const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deviceFlow, setDeviceFlow] = useState<GitHubDeviceFlowState>(idleDeviceFlowState);
    const hasFetched = useRef(false);
    const deviceCodeRef = useRef('');
    const pollingTimerRef = useRef<number | null>(null);
    const isNativeApp = 是否原生Capacitor环境();
    const githubClientId = readEnvString((import.meta as any).env?.VITE_GITHUB_CLIENT_ID);
    const hasGitHubOAuthClientId = githubClientId.length > 0;

    const stopPolling = useCallback(() => {
        if (pollingTimerRef.current !== null) {
            window.clearTimeout(pollingTimerRef.current);
            pollingTimerRef.current = null;
        }
    }, []);

    const resetDeviceFlow = useCallback(() => {
        stopPolling();
        deviceCodeRef.current = '';
        setDeviceFlow(idleDeviceFlowState());
    }, [stopPolling]);

    const logout = useCallback(() => {
        stopPolling();
        localStorage.removeItem(TOKEN_KEY);
        deviceCodeRef.current = '';
        setToken(null);
        setError(null);
        setDeviceFlow(idleDeviceFlowState());
    }, [stopPolling]);

    const openDeviceVerification = useCallback(() => {
        const targetUrl = deviceFlow.verificationUriComplete || deviceFlow.verificationUri;
        if (!targetUrl) return;
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }, [deviceFlow.verificationUri, deviceFlow.verificationUriComplete]);

    const finishWithToken = useCallback((nextToken: string) => {
        localStorage.setItem(TOKEN_KEY, nextToken);
        setToken(nextToken);
        setError(null);
        deviceCodeRef.current = '';
        setDeviceFlow((current) => ({
            ...current,
            status: 'success',
            message: 'GitHub 已授权完成。'
        }));
        stopPolling();
    }, [stopPolling]);

    const schedulePoll = useCallback((delayMs: number) => {
        stopPolling();
        pollingTimerRef.current = window.setTimeout(async () => {
            const activeDeviceCode = deviceCodeRef.current;
            if (!activeDeviceCode) return;

            try {
                const response = await fetch(构建同步API地址('/api/auth/github-device-poll'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceCode: activeDeviceCode })
                });
                const data = await parseJsonResponse<DevicePollResponse>(response);
                if (!response.ok) {
                    throw new Error(data.error || 'GitHub 设备授权轮询失败');
                }

                if (data.status === 'authorized' && data.access_token) {
                    finishWithToken(data.access_token);
                    return;
                }

                if (data.status === 'pending' || data.status === 'slow_down') {
                    const nextInterval = Math.max(5, Number(data.interval) || deviceFlow.intervalSeconds || 5);
                    setDeviceFlow((current) => ({
                        ...current,
                        status: 'waiting',
                        intervalSeconds: nextInterval,
                        message: data.status === 'slow_down'
                            ? 'GitHub 限制了轮询频率，已自动放慢检查速度。'
                            : '等待你在浏览器中完成 GitHub 授权。'
                    }));
                    schedulePoll((data.status === 'slow_down' ? nextInterval + 5 : nextInterval) * 1000);
                    return;
                }

                if (data.status === 'expired') {
                    throw new Error(data.error || '设备授权码已过期，请重新发起登录。');
                }

                if (data.status === 'denied') {
                    throw new Error(data.error || '你已取消本次 GitHub 授权。');
                }

                throw new Error(data.error || 'GitHub 授权状态未知');
            } catch (pollError) {
                const message = normalizeErrorMessage(pollError, 'GitHub 授权失败');
                setError(message);
                setDeviceFlow((current) => ({
                    ...current,
                    status: 'error',
                    message
                }));
                stopPolling();
            }
        }, delayMs);
    }, [deviceFlow.intervalSeconds, finishWithToken, stopPolling]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code && !hasFetched.current) {
            hasFetched.current = true;
            setIsLoggingIn(true);

            fetch(构建同步API地址('/api/auth/github'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            })
                .then(async (res) => {
                    const data = await parseJsonResponse<{ access_token?: string; error?: string }>(res);
                    if (!res.ok) {
                        throw new Error(data.error || 'Failed to get token from API');
                    }
                    return data;
                })
                .then((data) => {
                    if (data.access_token) {
                        finishWithToken(data.access_token);
                        return;
                    }
                    throw new Error(data.error || 'GitHub OAuth did not return an access token');
                })
                .catch((requestError) => {
                    const message = normalizeErrorMessage(requestError, '登录失败');
                    console.error('GitHub OAuth Error:', requestError);
                    setError(message);
                    alert(`授权失败: ${message}`);
                })
                .finally(() => {
                    setIsLoggingIn(false);
                    const newUrl = window.location.origin + window.location.pathname;
                    window.history.replaceState({}, document.title, newUrl);
                });
        }
    }, [finishWithToken]);

    useEffect(() => {
        return () => stopPolling();
    }, [stopPolling]);

    const login = useCallback(async () => {
        setError(null);

        if (!isNativeApp && !githubClientId) {
            const message = '未配置 VITE_GITHUB_CLIENT_ID 环境变量';
            setError(message);
            alert(message);
            return;
        }

        if (!isNativeApp) {
            window.location.href = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&scope=repo`;
            return;
        }

        setIsLoggingIn(true);
        try {
            const response = await fetch(构建同步API地址('/api/auth/github-device-start'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await parseJsonResponse<DeviceStartResponse>(response);
            if (!response.ok) {
                throw new Error(data.error || '无法启动 GitHub 设备授权');
            }

            const deviceCode = (data.device_code || '').trim();
            const userCode = (data.user_code || '').trim();
            const verificationUri = (data.verification_uri || '').trim();
            const verificationUriComplete = (data.verification_uri_complete || verificationUri).trim();
            const expiresInSeconds = Math.max(60, Number(data.expires_in) || 900);
            const intervalSeconds = Math.max(5, Number(data.interval) || 5);

            if (!deviceCode || !userCode || !verificationUri) {
                throw new Error('GitHub 未返回完整的设备授权信息');
            }

            deviceCodeRef.current = deviceCode;
            setDeviceFlow({
                status: 'waiting',
                userCode,
                verificationUri,
                verificationUriComplete,
                expiresAt: Date.now() + expiresInSeconds * 1000,
                intervalSeconds,
                message: '请在浏览器中输入设备码完成 GitHub 登录。'
            });

            window.open(verificationUriComplete, '_blank', 'noopener,noreferrer');
            schedulePoll(intervalSeconds * 1000);
        } catch (loginError) {
            const message = normalizeErrorMessage(loginError, 'GitHub 登录失败');
            setError(message);
            setDeviceFlow({
                ...idleDeviceFlowState(),
                status: 'error',
                message
            });
            alert(`授权失败: ${message}`);
        } finally {
            setIsLoggingIn(false);
        }
    }, [githubClientId, isNativeApp, schedulePoll]);

    const cancelDeviceFlow = useCallback(() => {
        setError(null);
        resetDeviceFlow();
    }, [resetDeviceFlow]);

    const deviceFlowRemainingSeconds = (() => {
        if (!deviceFlow.expiresAt) return 0;
        return Math.max(0, Math.floor((deviceFlow.expiresAt - Date.now() + DEVICE_FLOW_GRACE_MS) / 1000));
    })();

    useEffect(() => {
        if (deviceFlow.status !== 'waiting' || !deviceFlow.expiresAt) return;
        if (deviceFlowRemainingSeconds > 0) return;

        setDeviceFlow((current) => ({
            ...current,
            status: 'error',
            message: '设备授权码已过期，请重新发起登录。'
        }));
        stopPolling();
    }, [deviceFlow.expiresAt, deviceFlow.status, deviceFlowRemainingSeconds, stopPolling]);

    return {
        token,
        isLoggingIn,
        error,
        login,
        logout,
        setError,
        isNativeApp,
        hasGitHubOAuthClientId,
        deviceFlow,
        deviceFlowRemainingSeconds,
        openDeviceVerification,
        cancelDeviceFlow
    };
}
