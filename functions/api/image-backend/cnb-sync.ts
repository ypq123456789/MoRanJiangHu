const JSON_HEADERS = {
    'Content-Type': 'application/json'
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CNB-Sync-Token'
};

type SyncPayload = {
    customerId?: string;
    backendType: string;
    port: number;
    url: string;
    healthUrl?: string;
    detectedFrom?: string;
    detectedAt: string;
    workspace?: string;
    workspaceStart?: unknown;
    workspaceDetail?: unknown;
};

type RegistryItem = SyncPayload & {
    id: string;
    label: string;
    lastHeartbeatAt: string;
    source: 'registry';
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

const readBearerToken = (request: Request): string => {
    const authHeader = request.headers.get('Authorization')?.trim() || '';
    const directHeader = request.headers.get('X-CNB-Sync-Token')?.trim() || '';
    if (directHeader) return directHeader;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || '';
};

const readString = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

const normalizeSyncUrl = (value: string): string => {
    try {
        const url = new URL(String(value || '').trim());
        url.pathname = url.pathname.replace(/\/+$/, '');
        return url.toString().replace(/\/$/, '');
    } catch {
        return '';
    }
};

const isAllowedSyncUrl = (value: string, allowAnyUrl: boolean): boolean => {
    try {
        const url = new URL(value);
        if (!/^https?:$/i.test(url.protocol)) return false;
        if (allowAnyUrl) return true;
        return /(^|\.)cnb\.run$/i.test(url.hostname);
    } catch {
        return false;
    }
};

const toPositiveInt = (value: unknown, fallback: number): number => {
    const parsed = Math.floor(Number(value));
    return parsed > 0 ? parsed : fallback;
};

const buildRegistryKey = (payload: SyncPayload): string => {
    const backendType = readString(payload.backendType || 'comfyui') || 'comfyui';
    const customerId = readString(payload.customerId || 'anonymous') || 'anonymous';
    const workspace = readString(payload.workspace || 'workspace') || 'workspace';
    return `backend:${backendType}:${customerId}:${workspace}`.toLowerCase();
};

const buildLabel = (payload: SyncPayload): string => {
    return readString(payload.customerId) || readString(payload.workspace) || readString(payload.url) || 'ComfyUI';
};

const getRegistryNamespace = (env: any): KVNamespace | null => {
    const candidate = env?.CNB_SYNC_REGISTRY;
    if (!candidate || typeof candidate.get !== 'function' || typeof candidate.put !== 'function') {
        return null;
    }
    return candidate as KVNamespace;
};

const getRegistryTtlSeconds = (env: any): number => toPositiveInt(env?.CNB_SYNC_REGISTRY_TTL_SEC, 900);

const sanitizePayload = (body: any, allowAnyUrl: boolean): SyncPayload | null => {
    const normalizedUrl = normalizeSyncUrl(String(body?.url || ''));
    const port = Math.max(1, Number(body?.port || 0) || 0);

    if (!normalizedUrl || !port || !isAllowedSyncUrl(normalizedUrl, allowAnyUrl)) {
        return null;
    }

    return {
        customerId: readString(body?.customerId) || undefined,
        backendType: readString(body?.backendType || 'comfyui') || 'comfyui',
        port,
        url: normalizedUrl,
        healthUrl: normalizeSyncUrl(String(body?.healthUrl || '')) || undefined,
        detectedFrom: readString(body?.detectedFrom) || undefined,
        detectedAt: readString(body?.detectedAt || new Date().toISOString()) || new Date().toISOString(),
        workspace: readString(body?.workspace) || undefined,
        workspaceStart: body?.workspaceStart,
        workspaceDetail: body?.workspaceDetail
    };
};

const saveRegistryItem = async (env: any, payload: SyncPayload): Promise<RegistryItem | null> => {
    const registry = getRegistryNamespace(env);
    if (!registry) return null;

    const now = new Date().toISOString();
    const item: RegistryItem = {
        ...payload,
        id: buildRegistryKey(payload),
        label: buildLabel(payload),
        lastHeartbeatAt: now,
        source: 'registry'
    };

    await registry.put(item.id, JSON.stringify(item), {
        expirationTtl: getRegistryTtlSeconds(env)
    });

    return item;
};

const listRegistryItems = async (request: Request, env: any): Promise<RegistryItem[]> => {
    const registry = getRegistryNamespace(env);
    if (!registry) return [];

    const url = new URL(request.url);
    const backendType = readString(url.searchParams.get('backendType'));
    const customerId = readString(url.searchParams.get('customerId'));
    const prefix = backendType ? `backend:${backendType.toLowerCase()}:` : 'backend:';
    const ttlMs = getRegistryTtlSeconds(env) * 1000;
    const now = Date.now();

    let cursor: string | undefined;
    const items: RegistryItem[] = [];

    do {
        const page = await registry.list({ prefix, cursor, limit: 100 });
        cursor = page.list_complete ? undefined : page.cursor;

        for (const key of page.keys) {
            const raw = await registry.get(key.name);
            if (!raw) continue;
            try {
                const item = JSON.parse(raw) as RegistryItem;
                const heartbeatTime = Date.parse(item.lastHeartbeatAt || item.detectedAt || '');
                if (heartbeatTime && now - heartbeatTime > ttlMs) continue;
                if (customerId && readString(item.customerId) !== customerId) continue;
                items.push(item);
            } catch {
                continue;
            }
        }
    } while (cursor);

    return items.sort((a, b) => {
        const aTime = Date.parse(a.lastHeartbeatAt || a.detectedAt || '') || 0;
        const bTime = Date.parse(b.lastHeartbeatAt || b.detectedAt || '') || 0;
        return bTime - aTime;
    });
};

export async function onRequestOptions(): Promise<Response> {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
    });
}

export async function onRequestGet({ request, env }: any): Promise<Response> {
    try {
        const items = await listRegistryItems(request, env);
        return buildJsonResponse({
            ok: true,
            count: items.length,
            items
        });
    } catch (error: any) {
        return buildJsonResponse({ error: error?.message || 'Unknown CNB registry error' }, 500);
    }
}

export async function onRequestPost({ request, env }: any): Promise<Response> {
    try {
        const expectedToken = readString(env?.CNB_SYNC_TOKEN);
        const providedToken = readBearerToken(request);

        if (expectedToken && providedToken !== expectedToken) {
            return buildJsonResponse({ error: 'Invalid CNB sync token' }, 401);
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return buildJsonResponse({ error: 'Invalid JSON payload' }, 400);
        }

        const allowAnyUrl = readString(env?.CNB_SYNC_ALLOW_ANY_URL).toLowerCase() === 'true';
        const payload = sanitizePayload(body, allowAnyUrl);
        if (!payload) {
            return buildJsonResponse({ error: 'Missing or invalid sync payload' }, 400);
        }

        const registryItem = await saveRegistryItem(env, payload);

        const forwardUrl = readString(env?.CNB_SYNC_FORWARD_URL);
        const forwardToken = readString(env?.CNB_SYNC_FORWARD_TOKEN);
        if (forwardUrl) {
            const forwardResponse = await fetch(forwardUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(forwardToken ? { 'Authorization': `Bearer ${forwardToken}` } : {})
                },
                body: JSON.stringify(payload)
            });

            const forwardText = await forwardResponse.text();
            if (!forwardResponse.ok) {
                return buildJsonResponse({
                    error: 'Forward webhook failed',
                    forwardStatus: forwardResponse.status,
                    detail: forwardText.slice(0, 500)
                }, 502);
            }

            return buildJsonResponse({
                ok: true,
                forwarded: true,
                registryStored: Boolean(registryItem),
                payload,
                item: registryItem
            });
        }

        return buildJsonResponse({
            ok: true,
            forwarded: false,
            registryStored: Boolean(registryItem),
            payload,
            item: registryItem
        });
    } catch (error: any) {
        return buildJsonResponse({ error: error?.message || 'Unknown CNB sync error' }, 500);
    }
}
