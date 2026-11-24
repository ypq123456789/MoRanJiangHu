import { describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../functions/api/cloud-play';

const 前缀 = 'moranjianghu/cloud-play';
const 文本编码器 = new TextEncoder();

const 转十六进制 = (bytes: ArrayBuffer): string => (
    Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
);

const sha256Hex = async (value: string): Promise<string> => (
    转十六进制(await crypto.subtle.digest('SHA-256', 文本编码器.encode(value)))
);

const hmacHex = async (secret: string, value: string): Promise<string> => {
    const key = await crypto.subtle.importKey('raw', 文本编码器.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return 转十六进制(await crypto.subtle.sign('HMAC', key, 文本编码器.encode(value)));
};

const 创建桶 = (initial: Record<string, string> = {}) => {
    const values = new Map(Object.entries(initial));
    return {
        get: vi.fn(async (key: string) => {
            const value = values.get(key);
            if (!value) return null;
            return { json: async () => JSON.parse(value), text: async () => value, body: null, size: value.length };
        }),
        put: vi.fn(async (key: string, value: any) => {
            values.set(key, typeof value === 'string' ? value : JSON.stringify(value));
        }),
        list: vi.fn(async () => ({ objects: [], truncated: false })),
        delete: vi.fn(async (key: string) => { values.delete(key); }),
        values
    };
};

const 创建用户桶 = async (username: string, password: string, userId = 'CP-test') => {
    const usernameKey = await sha256Hex(username.toLowerCase());
    const salt = 'test-salt';
    const passwordHash = await hmacHex(salt, `${usernameKey}\n${password}`);
    return 创建桶({
        [`${前缀}/users/${usernameKey}.json`]: JSON.stringify({
            userId,
            username,
            usernameKey,
            passwordSalt: salt,
            passwordHash
        })
    });
};

const 构建请求 = (action: string, body: unknown): Request => new Request(
    `https://example.com/api/cloud-play?action=${action}`,
    {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }
);

const 构建环境 = (bucket: ReturnType<typeof 创建桶>) => ({
    CLOUD_PLAY_R2: bucket,
    CLOUD_PLAY_R2_PREFIX: 'moranjianghu/cloud-play'
});

describe('云端游玩设置同步 API', () => {
    it('上传后同一账号可下载密文，密码错误无法读取', async () => {
        const bucket = await 创建用户桶('bacon', 'pwd123456');
        const env = 构建环境(bucket);

        const uploadRes = await onRequestPost({ request: 构建请求('settings-upload', {
            username: 'bacon',
            password: 'pwd123456',
            payload: 'ZW5jcnlwdGVkLXBheWxvYWQ='
        }), env } as any);
        expect(uploadRes.status).toBe(200);
        const uploadJson = await uploadRes.json();
        expect(uploadJson.ok).toBe(true);
        expect(uploadJson.settingsUpdatedAt).toBeTruthy();

        const settingsKey = `${前缀}/users/${await sha256Hex('bacon')}/settings.json`;
        expect(bucket.values.has(settingsKey)).toBe(true);

        const downloadRes = await onRequestPost({ request: 构建请求('settings-download', {
            username: 'bacon',
            password: 'pwd123456'
        }), env } as any);
        const downloadJson = await downloadRes.json();
        expect(downloadJson).toMatchObject({
            ok: true,
            exists: true,
            payload: 'ZW5jcnlwdGVkLXBheWxvYWQ='
        });

        const wrongRes = await onRequestPost({ request: 构建请求('settings-download', {
            username: 'bacon',
            password: 'wrongpass'
        }), env } as any);
        expect(wrongRes.status).toBe(400);
        expect((await wrongRes.json()).ok).toBe(false);
    });

    it('未上传设置时返回 exists=false', async () => {
        const bucket = await 创建用户桶('bacon', 'pwd123456');
        const res = await onRequestPost({ request: 构建请求('settings-download', {
            username: 'bacon',
            password: 'pwd123456'
        }), env: 构建环境(bucket) } as any);
        expect(await res.json()).toEqual({ ok: true, exists: false });
    });

    it('不同用户设置互相隔离', async () => {
        const bucket = await 创建用户桶('bacon', 'pwd123456', 'CP-a');
        // 为第二个用户写入账号记录
        const secondKey = await sha256Hex('other');
        bucket.values.set(`${前缀}/users/${secondKey}.json`, JSON.stringify({
            userId: 'CP-b',
            username: 'other',
            usernameKey: secondKey,
            passwordSalt: 'test-salt',
            passwordHash: await hmacHex('test-salt', `${secondKey}\nother123`)
        }));
        const env = 构建环境(bucket);

        await onRequestPost({ request: 构建请求('settings-upload', {
            username: 'bacon',
            password: 'pwd123456',
            payload: 'YmFjb24tc2V0dGluZ3M='
        }), env } as any);

        const res = await onRequestPost({ request: 构建请求('settings-download', {
            username: 'other',
            password: 'other123'
        }), env } as any);
        expect(await res.json()).toEqual({ ok: true, exists: false });
    });
});
