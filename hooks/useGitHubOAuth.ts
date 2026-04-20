import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    buildSyncApiUrl,
    getSyncApiBaseUrl,
    isMissingNativeSyncApiBaseUrl,
    isNativeCapacitorEnvironment
} from '../utils/nativeRuntime';

const TOKEN_KEY = 'github_sync_token';
const OAUTH_STATE_KEY = 'github_oauth_pending_state';
const GITHUB_OAUTH_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_OAUTH_SCOPE = 'repo';
const WEB_CALLBACK_PATH = '/oauth/github/callback';
const DEFAULT_NATIVE_APP_LINK = 'https://msjh.bacon.de5.net/oauth/github/callback';
const DEFAULT_NATIVE_DEEP_LINK = 'com.moranjianghu.game://oauth/github/callback';

type GitHubOAuthSessionStatus = 'idle' | 'waiting' | 'exchanging' | 'success' | 'error';
type GitHubOAuthClientType = 'web' | 'native';

export type GitHubOAuthSessionState = {
    status: GitHubOAuthSessionStatus;
    authorizationUrl: string;
    redirectUri: string;
    message: string | null;
};

type PendingOAuthState = {
    state: string;
    redirectUri: string;
    clientType: GitHubOAuthClientType;
    expectedCallbackUris: string[];
    createdAt: number;
};

type TokenExchangeResponse = {
    access_token?: string;
    error?: string;
};

const createIdleOAuthSession = (): GitHubOAuthSessionState => ({
    status: 'idle',
    authorizationUrl: '',
    redirectUri: '',
    message: null
});

const normalizeErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
};

const readEnvString = (value: unknown) => (
    typeof value === 'string' ? value.trim() : ''
);

const getNativeSyncApiMissingMessage = () => {
    const currentOrigin = typeof window === 'undefined' ? 'unknown' : window.location.origin;
    return [
        '当前 APK 没有配置远程同步 API 地址，GitHub 同步无法工作。',
        `当前运行地址：${currentOrigin}`,
        '请在打包前配置 VITE_SYNC_API_BASE_URL，并重新生成 APK。'
    ].join('\n');
};

const getJsonResponseError = (response: Response, rawText: string) => {
    const snippet = rawText.trim().slice(0, 160);
    if (!snippet) {
        return new Error(`HTTP Error ${response.status}`);
    }

    const looksLikeHtml = snippet.startsWith('<!DOCTYPE') || snippet.startsWith('<html') || snippet.startsWith('<');
    if (looksLikeHtml) {
        return new Error(
            `HTTP Error ${response.status}: 服务返回了 HTML 页面而不是 JSON。通常表示 APK 没有配置 VITE_SYNC_API_BASE_URL，或者请求被发到了错误地址。`
        );
    }

    return new Error(`HTTP Error ${response.status}: ${snippet}`);
};

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
    const rawText = await response.text();
    try {
        return JSON.parse(rawText) as T;
    } catch {
        throw getJsonResponseError(response, rawText);
    }
};

const openGitHubAuthPage = async (targetUrl: string, isNativeApp: boolean) => {
    if (!targetUrl) return;

    if (isNativeApp) {
        try {
            const { Browser } = await import('@capacitor/browser');
            await Browser.open({
                url: targetUrl,
                presentationStyle: 'fullscreen'
            });
            return;
        } catch (error) {
            console.warn('Failed to open native browser, fallback to window.open', error);
        }
    }

    window.open(targetUrl, '_blank', 'noopener,noreferrer');
};

const closeGitHubAuthPageIfPossible = async () => {
    try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.close();
    } catch {
        // Browser.close is not supported on every platform; ignore.
    }
};

const createOAuthStateValue = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const buildOAuthState = (isNativeApp: boolean) => (
    `${isNativeApp ? 'native' : 'web'}:${createOAuthStateValue()}`
);

const serializeCallbackUrl = (value: string) => {
    try {
        const url = new URL(value);
        url.search = '';
        url.hash = '';
        return url.toString().replace(/\/$/, '');
    } catch {
        return '';
    }
};

const normalizeCallbackUris = (value: unknown) => (
    Array.isArray(value)
        ? value.map((item) => readEnvString(item)).filter(Boolean)
        : []
);

const readPendingOAuthState = (): PendingOAuthState | null => {
    try {
        const raw = localStorage.getItem(OAUTH_STATE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<PendingOAuthState>;
        const state = readEnvString(parsed.state);
        const redirectUri = readEnvString(parsed.redirectUri);
        const createdAt = Number(parsed.createdAt);
        const clientType = parsed.clientType === 'native' ? 'native' : 'web';
        const expectedCallbackUris = normalizeCallbackUris(parsed.expectedCallbackUris);

        if (!state || !redirectUri || !Number.isFinite(createdAt)) {
            return null;
        }

        return {
            state,
            redirectUri,
            clientType,
            expectedCallbackUris: expectedCallbackUris.length > 0 ? expectedCallbackUris : [redirectUri],
            createdAt
        };
    } catch {
        return null;
    }
};

const writePendingOAuthState = (value: PendingOAuthState) => {
    localStorage.setItem(OAUTH_STATE_KEY, JSON.stringify(value));
};

const clearPendingOAuthState = () => {
    localStorage.removeItem(OAUTH_STATE_KEY);
};

const isMatchingCallbackUrl = (urlValue: string, redirectUris: string[]) => {
    const normalizedUrl = serializeCallbackUrl(urlValue);
    if (!normalizedUrl) return false;

    return redirectUris.some((redirectUri) => normalizedUrl === serializeCallbackUrl(redirectUri));
};

const getNativeDirectRedirectUri = () => {
    const configured = readEnvString((import.meta as any).env?.VITE_GITHUB_OAUTH_REDIRECT_URI);
    return configured || DEFAULT_NATIVE_DEEP_LINK;
};

const getNativeBridgeRedirectUri = () => {
    const configured = readEnvString((import.meta as any).env?.VITE_GITHUB_OAUTH_BRIDGE_REDIRECT_URI);
    return configured || DEFAULT_NATIVE_APP_LINK;
};

const getWebRedirectUri = () => {
    if (typeof window === 'undefined') return WEB_CALLBACK_PATH;
    return new URL(WEB_CALLBACK_PATH, window.location.origin).toString();
};

export function useGitHubOAuth() {
    const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [oauthSession, setOAuthSession] = useState<GitHubOAuthSessionState>(createIdleOAuthSession);
    const handledCallbackUrlRef = useRef('');

    const isNativeApp = isNativeCapacitorEnvironment();
    const webGitHubClientId = readEnvString((import.meta as any).env?.VITE_GITHUB_CLIENT_ID);
    const nativeGitHubClientId = readEnvString((import.meta as any).env?.VITE_GITHUB_NATIVE_CLIENT_ID);
    const hasNativeGitHubClientId = nativeGitHubClientId.length > 0;
    const oauthClientType: GitHubOAuthClientType = isNativeApp && hasNativeGitHubClientId ? 'native' : 'web';
    const githubClientId = oauthClientType === 'native' ? nativeGitHubClientId : webGitHubClientId;
    const hasGitHubOAuthClientId = githubClientId.length > 0;
    const syncApiBaseUrl = useMemo(() => getSyncApiBaseUrl(), []);
    const missingNativeSyncApiBaseUrl = isNativeApp && isMissingNativeSyncApiBaseUrl();
    const oauthRedirectUri = useMemo(() => {
        if (!isNativeApp) return getWebRedirectUri();
        return oauthClientType === 'native'
            ? getNativeDirectRedirectUri()
            : getNativeBridgeRedirectUri();
    }, [isNativeApp, oauthClientType]);
    const nativeDeepLinkUri = useMemo(() => getNativeDirectRedirectUri(), []);

    const resetOAuthSession = useCallback(() => {
        setOAuthSession(createIdleOAuthSession());
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        clearPendingOAuthState();
        setToken(null);
        setError(null);
        resetOAuthSession();
    }, [resetOAuthSession]);

    const finishWithToken = useCallback((nextToken: string) => {
        localStorage.setItem(TOKEN_KEY, nextToken);
        clearPendingOAuthState();
        setToken(nextToken);
        setError(null);
        setOAuthSession((current) => ({
            ...current,
            status: 'success',
            message: 'GitHub 已授权完成。'
        }));
        void closeGitHubAuthPageIfPossible();
    }, []);

    const reopenAuthorizationPage = useCallback(() => {
        const targetUrl = oauthSession.authorizationUrl;
        if (!targetUrl) return;
        void openGitHubAuthPage(targetUrl, isNativeApp);
    }, [isNativeApp, oauthSession.authorizationUrl]);

    const exchangeCodeForToken = useCallback(async (
        code: string,
        redirectUri: string,
        clientType: GitHubOAuthClientType
    ) => {
        const response = await fetch(buildSyncApiUrl('/api/auth/github'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                redirectUri,
                clientType
            })
        });
        const data = await parseJsonResponse<TokenExchangeResponse>(response);
        if (!response.ok) {
            throw new Error(data.error || 'GitHub OAuth token exchange failed');
        }
        if (!data.access_token) {
            throw new Error(data.error || 'GitHub OAuth did not return an access token');
        }
        return data.access_token;
    }, []);

    const cleanupCallbackUrl = useCallback((callbackUrl: string) => {
        if (typeof window === 'undefined') return;

        try {
            const url = new URL(callbackUrl);
            if (url.origin === window.location.origin && url.pathname === WEB_CALLBACK_PATH) {
                window.history.replaceState({}, document.title, '/');
            }
        } catch {
            // Ignore malformed callback cleanup.
        }
    }, []);

    const bridgeBrowserCallbackToNativeApp = useCallback((callbackUrl: string) => {
        if (typeof window === 'undefined' || isNativeApp) return false;

        let url: URL;
        try {
            url = new URL(callbackUrl);
        } catch {
            return false;
        }

        if (url.pathname !== WEB_CALLBACK_PATH) {
            return false;
        }

        const state = readEnvString(url.searchParams.get('state'));
        if (!state.startsWith('native:')) {
            return false;
        }

        const deepLinkUrl = `${getNativeDirectRedirectUri()}${url.search}`;
        window.location.assign(deepLinkUrl);
        return true;
    }, [isNativeApp]);

    const handleOAuthCallback = useCallback(async (callbackUrl: string) => {
        if (!callbackUrl || handledCallbackUrlRef.current === callbackUrl) {
            return;
        }

        if (bridgeBrowserCallbackToNativeApp(callbackUrl)) {
            return;
        }

        const pendingState = readPendingOAuthState();
        if (!pendingState) {
            return;
        }

        let url: URL;
        try {
            url = new URL(callbackUrl);
        } catch {
            return;
        }

        if (!isMatchingCallbackUrl(callbackUrl, pendingState.expectedCallbackUris)) {
            return;
        }

        handledCallbackUrlRef.current = callbackUrl;
        setIsLoggingIn(true);
        void closeGitHubAuthPageIfPossible();

        const callbackError = readEnvString(url.searchParams.get('error'));
        const callbackErrorDescription = readEnvString(url.searchParams.get('error_description'));
        const callbackCode = readEnvString(url.searchParams.get('code'));
        const callbackState = readEnvString(url.searchParams.get('state'));

        try {
            if (callbackError) {
                throw new Error(callbackErrorDescription || callbackError);
            }

            if (!callbackCode) {
                throw new Error('GitHub 回调中缺少 authorization code。');
            }

            if (!callbackState || callbackState !== pendingState.state) {
                throw new Error('GitHub OAuth state 校验失败，请重新登录。');
            }

            setOAuthSession((current) => ({
                ...current,
                status: 'exchanging',
                redirectUri: pendingState.redirectUri,
                message: '正在校验 GitHub 授权结果并换取访问令牌。'
            }));

            const nextToken = await exchangeCodeForToken(
                callbackCode,
                pendingState.redirectUri,
                pendingState.clientType
            );
            finishWithToken(nextToken);
        } catch (callbackFailure) {
            const message = normalizeErrorMessage(callbackFailure, 'GitHub 登录失败');
            clearPendingOAuthState();
            setError(message);
            setOAuthSession((current) => ({
                ...current,
                status: 'error',
                redirectUri: pendingState.redirectUri,
                message
            }));
            alert(`授权失败: ${message}`);
        } finally {
            cleanupCallbackUrl(callbackUrl);
            setIsLoggingIn(false);
        }
    }, [bridgeBrowserCallbackToNativeApp, cleanupCallbackUrl, exchangeCodeForToken, finishWithToken]);

    useEffect(() => {
        void handleOAuthCallback(window.location.href);
    }, [handleOAuthCallback]);

    useEffect(() => {
        if (!isNativeApp) return;

        let released = false;
        let removeListener: (() => void) | undefined;

        const bindNativeOAuthListener = async () => {
            const { App } = await import('@capacitor/app');

            const listener = await App.addListener('appUrlOpen', (event) => {
                void handleOAuthCallback(event.url);
            });
            removeListener = () => {
                void listener.remove();
            };

            const launchUrl = await App.getLaunchUrl();
            if (!released && launchUrl?.url) {
                void handleOAuthCallback(launchUrl.url);
            }
        };

        void bindNativeOAuthListener();

        return () => {
            released = true;
            removeListener?.();
        };
    }, [handleOAuthCallback, isNativeApp]);

    const login = useCallback(async () => {
        setError(null);

        if (!githubClientId) {
            const message = isNativeApp
                ? '未配置可用的 GitHub OAuth Client ID。请至少提供 VITE_GITHUB_CLIENT_ID，或为 APK 单独提供 VITE_GITHUB_NATIVE_CLIENT_ID。'
                : '未配置 VITE_GITHUB_CLIENT_ID 环境变量。';
            setError(message);
            alert(message);
            return;
        }

        if (isNativeApp && missingNativeSyncApiBaseUrl) {
            const message = getNativeSyncApiMissingMessage();
            setError(message);
            alert(message);
            return;
        }

        const useNativeDirectCallback = isNativeApp && oauthClientType === 'native';
        const redirectUri = !isNativeApp
            ? getWebRedirectUri()
            : useNativeDirectCallback
                ? getNativeDirectRedirectUri()
                : getNativeBridgeRedirectUri();
        const expectedCallbackUris = !isNativeApp
            ? [redirectUri]
            : useNativeDirectCallback
                ? [redirectUri]
                : [redirectUri, getNativeDirectRedirectUri()];
        const state = buildOAuthState(isNativeApp);
        const authorizationUrl = new URL(GITHUB_OAUTH_AUTHORIZE_URL);

        authorizationUrl.searchParams.set('client_id', githubClientId);
        authorizationUrl.searchParams.set('redirect_uri', redirectUri);
        authorizationUrl.searchParams.set('scope', GITHUB_OAUTH_SCOPE);
        authorizationUrl.searchParams.set('state', state);
        authorizationUrl.searchParams.set('allow_signup', 'true');

        writePendingOAuthState({
            state,
            redirectUri,
            clientType: oauthClientType,
            expectedCallbackUris,
            createdAt: Date.now()
        });

        const authorizationUrlString = authorizationUrl.toString();
        handledCallbackUrlRef.current = '';
        setOAuthSession({
            status: 'waiting',
            authorizationUrl: authorizationUrlString,
            redirectUri,
            message: !isNativeApp
                ? '即将跳转到 GitHub 授权页。'
                : useNativeDirectCallback
                    ? 'GitHub 授权页已打开，完成授权后会通过 Android deep link 直接回到应用。'
                    : 'GitHub 授权页已打开，完成授权后会先落到网页回调页，再自动拉起 APK。'
        });

        if (!isNativeApp) {
            window.location.assign(authorizationUrlString);
            return;
        }

        setIsLoggingIn(true);
        try {
            await openGitHubAuthPage(authorizationUrlString, true);
        } catch (loginError) {
            clearPendingOAuthState();
            const message = normalizeErrorMessage(loginError, 'GitHub 登录失败');
            setError(message);
            setOAuthSession({
                ...createIdleOAuthSession(),
                status: 'error',
                redirectUri,
                message
            });
            alert(`授权失败: ${message}`);
        } finally {
            setIsLoggingIn(false);
        }
    }, [githubClientId, isNativeApp, missingNativeSyncApiBaseUrl, oauthClientType]);

    return {
        token,
        isLoggingIn,
        error,
        login,
        logout,
        setError,
        isNativeApp,
        hasGitHubOAuthClientId,
        oauthSession,
        reopenAuthorizationPage,
        syncApiBaseUrl,
        missingNativeSyncApiBaseUrl,
        oauthRedirectUri,
        nativeDeepLinkUri
    };
}
