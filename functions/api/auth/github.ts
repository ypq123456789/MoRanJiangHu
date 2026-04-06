export async function onRequestPost({ request, env }: any) {
    try {
        const { code } = await request.json();

        if (!code) {
            return new Response(JSON.stringify({ error: 'Missing authorization code' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env;

        if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
            return new Response(JSON.stringify({ error: 'Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET env variables in Cloudflare' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
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

        if (tokenData.error) {
            return new Response(JSON.stringify({ error: tokenData.error_description || tokenData.error }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ access_token: tokenData.access_token }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
