import { buildAuthJsonResponse, handleAuthOptions } from './_shared';

export function onRequestOptions(): Response {
    return handleAuthOptions();
}

export async function onRequestPost({ request, env }: any) {
    try {
        const { code } = await request.json();

        if (!code) {
            return buildAuthJsonResponse({ error: 'Missing authorization code' }, 400);
        }

        const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env;
        if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
            return buildAuthJsonResponse({ error: 'Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET env variables in Cloudflare' }, 500);
        }

        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code
            })
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok) {
            return buildAuthJsonResponse({ error: tokenData.error_description || tokenData.error || 'GitHub OAuth token exchange failed' }, tokenResponse.status);
        }

        if (tokenData.error) {
            return buildAuthJsonResponse({ error: tokenData.error_description || tokenData.error }, 400);
        }

        return buildAuthJsonResponse({ access_token: tokenData.access_token });
    } catch (error: any) {
        return buildAuthJsonResponse({ error: error?.message || 'Unknown GitHub OAuth error' }, 500);
    }
}
