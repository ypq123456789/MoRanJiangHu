const JSON_HEADERS = {
    'Content-Type': 'application/json'
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-GitHub-Token, X-GitHub-Upload-Url'
};

const buildJsonResponse = (payload: unknown, status = 200): Response => {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...JSON_HEADERS,
            ...CORS_HEADERS
        }
    });
};

const isValidUploadUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'uploads.github.com';
    } catch {
        return false;
    }
};

export async function onRequestOptions(): Promise<Response> {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
    });
}

export async function onRequestPost({ request }: any): Promise<Response> {
    try {
        const token = request.headers.get('X-GitHub-Token')?.trim() || '';
        const uploadUrl = request.headers.get('X-GitHub-Upload-Url')?.trim() || '';
        const contentType = request.headers.get('Content-Type')?.trim() || 'application/octet-stream';

        if (!token) {
            return buildJsonResponse({ error: 'Missing X-GitHub-Token header' }, 400);
        }

        if (!uploadUrl || !isValidUploadUrl(uploadUrl)) {
            return buildJsonResponse({ error: 'Invalid GitHub upload URL' }, 400);
        }

        const zipBuffer = await request.arrayBuffer();
        if (!zipBuffer || zipBuffer.byteLength === 0) {
            return buildJsonResponse({ error: 'Empty upload body' }, 400);
        }

        const upstreamResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': contentType,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'WuXia-Cloud-Sync'
            },
            body: zipBuffer
        });

        const responseText = await upstreamResponse.text();
        return new Response(responseText, {
            status: upstreamResponse.status,
            headers: {
                ...JSON_HEADERS,
                ...CORS_HEADERS
            }
        });
    } catch (error: any) {
        return buildJsonResponse({ error: error?.message || 'Unknown upload proxy error' }, 500);
    }
}
