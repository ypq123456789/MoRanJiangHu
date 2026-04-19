const JSON_HEADERS = {
    'Content-Type': 'application/json'
};

export const AUTH_CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

export const buildAuthJsonResponse = (payload: unknown, status = 200): Response => {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...JSON_HEADERS,
            ...AUTH_CORS_HEADERS
        }
    });
};

export const handleAuthOptions = (): Response => {
    return new Response(null, {
        status: 204,
        headers: AUTH_CORS_HEADERS
    });
};
