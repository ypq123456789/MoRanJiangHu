import { tryDbBucket } from './_shared/dbStore';

const JSON_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8'
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

type CloudPlayUser = {
    userId: string;
    username: string;
    usernameKey: string;
    createdAt: string;
    updatedAt: string;
    passwordSalt: string;
    passwordHash: string;
    clientSalt: string;
    manifestUrl?: string;
    manifestUpdatedAt?: string;
    settingsUpdatedAt?: string;
};

const jsonResponse = (payload: unknown, status = 200): Response => (
    new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...JSON_HEADERS,
            ...CORS_HEADERS
        }
    })
);

export function onRequestOptions(): Response {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const getBucket = (env: any): any => {
    const dbBucket = tryDbBucket(env, 'cloud_play_data');
    if (dbBucket) return dbBucket;
    const candidate = env?.CLOUD_PLAY_R2 || env?.CNB_SYNC_R2;
    if (!candidate || typeof candidate.get !== 'function' || typeof candidate.put !== 'function') return null;
    return candidate;
};

const getPrefix = (env: any): string => {
    const raw = readString(env?.CLOUD_PLAY_R2_PREFIX) || 'moranjianghu/cloud-play';
    return raw.replace(/^\/+|\/+$/g, '') || 'moranjianghu/cloud-play';
};

const base64Url = (bytes: Uint8Array): string => {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const randomBase64Url = (length: number): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return base64Url(bytes);
};

const sha256Hex = async (value: string): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const hmacHex = async (secret: string, value: string): Promise<string> => {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const timingSafeEqual = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let index = 0; index < a.length; index += 1) {
        diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
    }
    return diff === 0;
};

const sanitizeUsername = (value: unknown): string => {
    const username = readString(value).replace(/\s+/g, '');
    if (username.length < 3 || username.length > 32) throw new Error('用户名需为 3-32 个字符。');
    if (!/^[\p{L}\p{N}_-]+$/u.test(username)) throw new Error('用户名仅支持中文、字母、数字、下划线和短横线。');
    return username;
};

const sanitizePassword = (value: unknown): string => {
    const password = typeof value === 'string' ? value : '';
    if (password.length < 6 || password.length > 128) throw new Error('密码需为 6-128 个字符。');
    return password;
};

const readRequestJson = async (request: Request, maxChars = 1024 * 1024): Promise<any> => {
    const text = await request.text();
    if (text.length > maxChars) throw new Error('请求内容过大。');
    return text ? JSON.parse(text) : {};
};

const buildUserKey = (env: any, usernameKey: string): string => `${getPrefix(env)}/users/${usernameKey}.json`;
const buildSettingsKey = (env: any, usernameKey: string): string => `${getPrefix(env)}/users/${usernameKey}/settings.json`;

const CLOUD_SETTINGS_FORMAT = 'moranjianghu-cloud-play-settings';
const CLOUD_SETTINGS_VERSION = 1;
const MAX_SETTINGS_PAYLOAD_CHARS = 24 * 1024 * 1024;

const buildPasswordHash = async (usernameKey: string, password: string, salt: string): Promise<string> => (
    hmacHex(salt, `${usernameKey}\n${password}`)
);

const toPublicUser = (user: CloudPlayUser) => ({
    userId: user.userId,
    username: user.username,
    clientSalt: user.clientSalt,
    manifestUrl: user.manifestUrl || '',
    manifestUpdatedAt: user.manifestUpdatedAt || '',
    settingsUpdatedAt: user.settingsUpdatedAt || '',
    updatedAt: user.updatedAt
});

const authenticate = async (env: any, usernameRaw: unknown, passwordRaw: unknown): Promise<CloudPlayUser> => {
    const bucket = getBucket(env);
    if (!bucket) throw new Error('云端游玩存储未配置。');
    const username = sanitizeUsername(usernameRaw);
    const password = sanitizePassword(passwordRaw);
    const usernameKey = await sha256Hex(username.toLowerCase());
    const object = await bucket.get(buildUserKey(env, usernameKey));
    if (!object) throw new Error('用户名或密码错误。');
    const user = await object.json<CloudPlayUser>().catch(() => null);
    if (!user?.passwordSalt || !user.passwordHash) throw new Error('账号数据损坏。');
    const passwordHash = await buildPasswordHash(usernameKey, password, user.passwordSalt);
    if (!timingSafeEqual(passwordHash, user.passwordHash)) throw new Error('用户名或密码错误。');
    return user;
};

export async function onRequestPost({ request, env }: any): Promise<Response> {
    try {
        const bucket = getBucket(env);
        if (!bucket) return jsonResponse({ ok: false, error: '云端游玩存储未配置。' }, 500);
        const url = new URL(request.url);
        const action = readString(url.searchParams.get('action')) || 'login';
        const body = await readRequestJson(
            request,
            action === 'settings-upload' ? MAX_SETTINGS_PAYLOAD_CHARS + 4096 : 1024 * 1024
        );

        if (action === 'register') {
            const username = sanitizeUsername(body?.username);
            const password = sanitizePassword(body?.password);
            const usernameKey = await sha256Hex(username.toLowerCase());
            const userKey = buildUserKey(env, usernameKey);
            const existing = await bucket.get(userKey);
            if (existing) return jsonResponse({ ok: false, error: '该用户名已存在，请直接登录或换一个用户名。' }, 409);
            const now = new Date().toISOString();
            const passwordSalt = randomBase64Url(18);
            const user: CloudPlayUser = {
                userId: `CP-${randomBase64Url(12)}`,
                username,
                usernameKey,
                createdAt: now,
                updatedAt: now,
                passwordSalt,
                passwordHash: await buildPasswordHash(usernameKey, password, passwordSalt),
                clientSalt: randomBase64Url(18)
            };
            await bucket.put(userKey, JSON.stringify(user, null, 2), {
                httpMetadata: { contentType: 'application/json; charset=utf-8' }
            });
            return jsonResponse({ ok: true, user: toPublicUser(user) });
        }

        if (action === 'login') {
            const user = await authenticate(env, body?.username, body?.password);
            return jsonResponse({ ok: true, user: toPublicUser(user) });
        }

        if (action === 'settings-upload') {
            const user = await authenticate(env, body?.username, body?.password);
            const payload = typeof body?.payload === 'string' ? body.payload : '';
            if (!payload) throw new Error('设置内容为空。');
            if (payload.length > MAX_SETTINGS_PAYLOAD_CHARS) throw new Error('设置内容过大，无法同步。');
            const now = new Date().toISOString();
            const record = {
                format: CLOUD_SETTINGS_FORMAT,
                version: CLOUD_SETTINGS_VERSION,
                userId: user.userId,
                updatedAt: now,
                payload
            };
            await bucket.put(buildSettingsKey(env, user.usernameKey), JSON.stringify(record), {
                httpMetadata: { contentType: 'application/json; charset=utf-8' }
            });
            const updated: CloudPlayUser = { ...user, settingsUpdatedAt: now, updatedAt: now };
            await bucket.put(buildUserKey(env, user.usernameKey), JSON.stringify(updated, null, 2), {
                httpMetadata: { contentType: 'application/json; charset=utf-8' }
            });
            return jsonResponse({ ok: true, settingsUpdatedAt: now });
        }

        if (action === 'settings-download') {
            const user = await authenticate(env, body?.username, body?.password);
            const object = await bucket.get(buildSettingsKey(env, user.usernameKey));
            if (!object) return jsonResponse({ ok: true, exists: false });
            const record: any = await object.json().catch(() => null);
            if (!record || record.format !== CLOUD_SETTINGS_FORMAT || typeof record.payload !== 'string') {
                return jsonResponse({ ok: true, exists: false });
            }
            return jsonResponse({
                ok: true,
                exists: true,
                payload: record.payload,
                updatedAt: readString(record.updatedAt)
            });
        }

        if (action === 'update-manifest') {
            const user = await authenticate(env, body?.username, body?.password);
            const manifestUrl = readString(body?.manifestUrl);
            if (!/^https?:\/\//i.test(manifestUrl)) throw new Error('清单地址无效。');
            const now = new Date().toISOString();
            const updated: CloudPlayUser = {
                ...user,
                manifestUrl,
                manifestUpdatedAt: now,
                updatedAt: now
            };
            await bucket.put(buildUserKey(env, user.usernameKey), JSON.stringify(updated, null, 2), {
                httpMetadata: { contentType: 'application/json; charset=utf-8' }
            });
            return jsonResponse({ ok: true, user: toPublicUser(updated) });
        }

        return jsonResponse({ ok: false, error: 'Unsupported action' }, 400);
    } catch (error: any) {
        return jsonResponse({ ok: false, error: error?.message || '云端游玩请求失败。' }, 400);
    }
}
