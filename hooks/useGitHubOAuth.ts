import { useState, useEffect, useRef } from 'react';

const TOKEN_KEY = 'github_sync_token';

export function useGitHubOAuth() {
    const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasFetched = useRef(false);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code && !hasFetched.current) {
            hasFetched.current = true;
            setIsLoggingIn(true);
            
            // Call our Cloudflare API to exchange code for token
            fetch('/api/auth/github', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            })
            .then(async res => {
                let data;
                try {
                    data = await res.json();
                } catch {
                    throw new Error(`HTTP Error ${res.status}`);
                }
                
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to get token from Cloudflare API');
                }
                return data;
            })
            .then(data => {
                if (data.access_token) {
                    localStorage.setItem(TOKEN_KEY, data.access_token);
                    setToken(data.access_token);
                } else if (data.error) {
                    throw new Error(data.error);
                }
            })
            .catch(err => {
                console.error('GitHub OAuth Error:', err);
                setError(err.message || '登录失败');
                alert('授权失败: ' + (err.message || '未知错误'));
            })
            .finally(() => {
                setIsLoggingIn(false);
                // Clean up URL
                const newUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
            });
        }
    }, []);

    const login = () => {
        const clientId = (import.meta as any).env.VITE_GITHUB_CLIENT_ID;
        if (!clientId) {
            alert('未配置 VITE_GITHUB_CLIENT_ID 环境变量');
            return;
        }
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo`;
    };

    const logout = () => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
    };

    return { token, isLoggingIn, error, login, logout, setError };
}
