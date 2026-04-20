const BINARY_CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-GitHub-Token, X-GitHub-Download-Url'
};

const JSON_HEADERS = {
    'Content-Type': 'application/json',
    ...BINARY_CORS_HEADERS
};

const buildJsonResponse = (payload: unknown, status = 200): Response => {
    return new Response(JSON.stringify(payload), {
        status,
        headers: JSON_HEADERS
    });
};

const isValidDownloadUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return false;
        return url.hostname === 'github.com' || url.hostname === 'objects.githubusercontent.com' || url.hostname === 'api.github.com';
    } catch {
        return false;
    }
};

export async function onRequestOptions(): Promise<Response> {
    return new Response(null, {
        status: 204,
        headers: BINARY_CORS_HEADERS
    });
}

export async function onRequestPost({ request }: any): Promise<Response> {
    try {
        const token = request.headers.get('X-GitHub-Token')?.trim() || '';
        const downloadUrl = request.headers.get('X-GitHub-Download-Url')?.trim() || '';

        if (!token) {
            return buildJsonResponse({ error: 'Missing X-GitHub-Token header' }, 400);
        }

        if (!downloadUrl || !isValidDownloadUrl(downloadUrl)) {
            return buildJsonResponse({ error: 'Invalid GitHub download URL' }, 400);
        }

        const upstreamResponse = await fetch(downloadUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/octet-stream',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'WuXia-Cloud-Sync'
            },
            redirect: 'manual'
        });

        let finalResponse = upstreamResponse;
        const isRedirect = [301, 302, 303, 307, 308].includes(upstreamResponse.status);

        if (isRedirect) {
            const redirectUrl = upstreamResponse.headers.get('Location');
            if (redirectUrl) {
                // Fetch from S3 WITHOUT the Authorization header!
                // S3 explicitly rejects pre-signed URLs if unauthorized headers are included.
                finalResponse = await fetch(redirectUrl, {
                    method: 'GET'
                });
            } else {
                return buildJsonResponse({ error: 'GitHub returned a redirect without a Location header' }, 502);
            }
        }

        if (!finalResponse.ok) {
            const responseText = await finalResponse.text();
            return new Response(responseText, {
                status: finalResponse.status,
                headers: JSON_HEADERS
            });
        }

        return new Response(finalResponse.body, {
            status: finalResponse.status,
            headers: {
                ...BINARY_CORS_HEADERS,
                'Content-Type': finalResponse.headers.get('Content-Type') || 'application/octet-stream',
                ...(finalResponse.headers.get('Content-Length')
                    ? { 'Content-Length': finalResponse.headers.get('Content-Length') as string }
                    : {}),
                ...(finalResponse.headers.get('Content-Disposition')
                    ? { 'Content-Disposition': finalResponse.headers.get('Content-Disposition') as string }
                    : {})
            }
        });
    } catch (error: any) {
        return buildJsonResponse({ error: error?.message || 'Unknown download proxy error' }, 500);
    }
}
