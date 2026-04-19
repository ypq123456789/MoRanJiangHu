import { buildAuthJsonResponse, handleAuthOptions } from './_shared';

export function onRequestOptions(): Response {
    return handleAuthOptions();
}

export async function onRequestPost({ request, env }: any) {
    try {
        const { deviceCode } = await request.json();
        if (!deviceCode) {
            return buildAuthJsonResponse({ error: 'Missing deviceCode' }, 400);
        }

        const { GITHUB_CLIENT_ID } = env;
        if (!GITHUB_CLIENT_ID) {
            return buildAuthJsonResponse({ error: 'Missing GITHUB_CLIENT_ID env variable in Cloudflare' }, 500);
        }

        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                device_code: deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            })
        });

        const data = await response.json();
        if (!response.ok) {
            return buildAuthJsonResponse({ error: data.error_description || data.error || 'Failed to poll GitHub device flow' }, response.status);
        }

        if (data.access_token) {
            return buildAuthJsonResponse({
                status: 'authorized',
                access_token: data.access_token
            });
        }

        if (data.error === 'authorization_pending') {
            return buildAuthJsonResponse({
                status: 'pending',
                interval: data.interval
            });
        }

        if (data.error === 'slow_down') {
            return buildAuthJsonResponse({
                status: 'slow_down',
                interval: data.interval
            });
        }

        if (data.error === 'expired_token') {
            return buildAuthJsonResponse({
                status: 'expired',
                error: data.error_description || 'GitHub device code expired'
            });
        }

        if (data.error === 'access_denied') {
            return buildAuthJsonResponse({
                status: 'denied',
                error: data.error_description || 'GitHub authorization was denied'
            });
        }

        return buildAuthJsonResponse({
            status: 'error',
            error: data.error_description || data.error || 'Unknown GitHub device flow state'
        }, 400);
    } catch (error: any) {
        return buildAuthJsonResponse({ error: error?.message || 'Unknown GitHub device poll error' }, 500);
    }
}
