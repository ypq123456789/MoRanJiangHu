import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    合并请求头,
    构建内置补充请求头,
    构建模型列表请求头,
    读取可复用自定义请求头,
    解析自定义请求头,
    是否OpenCode接口地址,
    读取OpenCode会话标识
} from '../utils/customRequestHeaders';
import { 构建OpenAI家族请求头 } from '../services/ai/chatCompletionClient';
import type { 当前可用接口结构 } from '../utils/apiConfig';
// @ts-ignore 方括号路径由打包器解析
import { onRequestPost, onRequestOptions } from '../functions/api/ai-relay/[[path]]';

const 基础配置 = (patch: Partial<当前可用接口结构> = {}): 当前可用接口结构 => ({
    id: 'cfg-1',
    名称: '测试配置',
    供应商: 'openai_compatible',
    协议覆盖: 'auto',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    apiKey: 'sk-test',
    model: 'gk-1',
    ...patch
});

describe('自定义请求头解析', () => {
    it('支持 Key: Value 与 Key=Value，忽略注释与空行', () => {
        const headers = 解析自定义请求头([
            '# 注释行',
            '',
            'X-Custom: abc',
            'HTTP-Referer=https://example.com',
            '   X-Trim :  v  '
        ].join('\n'));
        expect(headers).toEqual({
            'X-Custom': 'abc',
            'HTTP-Referer': 'https://example.com',
            'X-Trim': 'v'
        });
    });

    it('只在第一个分隔符处切开，值里的冒号保留', () => {
        expect(解析自定义请求头('Authorization: Bearer a:b:c')).toEqual({
            Authorization: 'Bearer a:b:c'
        });
    });

    it('非法头名、被禁头、空值都被忽略', () => {
        const headers = 解析自定义请求头([
            'bad header: v',
            'Host: evil.example.com',
            'content-length: 10',
            'X-Empty:',
            'X-Ok: 1'
        ].join('\n'));
        expect(headers).toEqual({ 'X-Ok': '1' });
    });

    it('同名头（大小写不同）以后者为准，且不产生重复键', () => {
        const headers = 解析自定义请求头('X-A: 1\nx-a: 2');
        expect(Object.keys(headers)).toEqual(['x-a']);
        expect(headers['x-a']).toBe('2');
    });

    it('换行注入被压平，避免拼出额外请求头', () => {
        // 单行内的 \r\n 已在切行阶段被拆开，第一行值不应携带第二行的内容
        const headers = 解析自定义请求头('X-A: 1\r\nX-B: 2');
        expect(headers['X-A']).toBe('1');
        expect(headers['X-B']).toBe('2');
    });

    it('空输入返回空对象', () => {
        expect(解析自定义请求头('')).toEqual({});
        expect(解析自定义请求头(undefined)).toEqual({});
        expect(解析自定义请求头(null)).toEqual({});
    });
});

describe('请求头合并', () => {
    it('extra 覆盖 base 的同名头（大小写不敏感），保留写入方的大小写', () => {
        const merged = 合并请求头(
            { Authorization: 'Bearer old', 'Content-Type': 'application/json' },
            { authorization: 'Bearer new' }
        );
        expect(merged).toEqual({ authorization: 'Bearer new', 'Content-Type': 'application/json' });
        expect(Object.keys(merged).filter((k) => k.toLowerCase() === 'authorization')).toHaveLength(1);
    });
});

describe('OpenCode 会话头自动补齐', () => {
    it('识别 opencode.ai 及其子域，不误判仿冒域名', () => {
        expect(是否OpenCode接口地址('https://opencode.ai/zen/go/v1')).toBe(true);
        expect(是否OpenCode接口地址('https://api.opencode.ai/v1')).toBe(true);
        expect(是否OpenCode接口地址('opencode.ai/zen/go/v1')).toBe(true);
        expect(是否OpenCode接口地址('https://opencode.ai.evil.com/v1')).toBe(false);
        expect(是否OpenCode接口地址('https://api.openai.com/v1')).toBe(false);
        expect(是否OpenCode接口地址('')).toBe(false);
    });

    it('同一会话内会话标识保持稳定', () => {
        const first = 读取OpenCode会话标识();
        const second = 读取OpenCode会话标识();
        expect(first).toBe(second);
        expect(first.length).toBeGreaterThanOrEqual(8);
    });

    it('非 OpenCode 地址不注入任何补头', () => {
        expect(构建内置补充请求头('https://api.deepseek.com/v1')).toEqual({});
    });

    it('OpenAI 家族请求头带上 x-opencode-session，且保留鉴权头', () => {
        const headers = 构建OpenAI家族请求头(基础配置());
        expect(headers['x-opencode-session']).toBe(读取OpenCode会话标识());
        expect(headers.Authorization).toBe('Bearer sk-test');
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('玩家自定义头优先，可覆盖内置补头', () => {
        const headers = 构建OpenAI家族请求头(基础配置({
            自定义请求头: 'x-opencode-session: manual-session\nX-Extra: 1'
        }));
        expect(headers['x-opencode-session']).toBe('manual-session');
        expect(headers['X-Extra']).toBe('1');
    });

    it('玩家可以自定义 Authorization（中转网关自建鉴权）', () => {
        const headers = 构建OpenAI家族请求头(基础配置({
            baseUrl: 'https://api.example.com/v1',
            自定义请求头: 'Authorization: Token abc'
        }));
        expect(headers.Authorization).toBe('Token abc');
        expect(headers['x-opencode-session']).toBeUndefined();
    });
});

describe('自定义头复用范围', () => {
    const 渠道 = { baseUrl: 'https://opencode.ai/zen/go/v1', 自定义请求头: 'X-Gw: 1' };

    it('请求地址与渠道同源时复用渠道自定义头', () => {
        expect(读取可复用自定义请求头('https://opencode.ai/zen/go/v1/models', 渠道)).toBe('X-Gw: 1');
    });

    it('独立模型指向另一家网关时不复用（避免把 A 的私有头发给 B）', () => {
        expect(读取可复用自定义请求头('https://api.example.com/v1', 渠道)).toBe('');
    });

    it('渠道没有配置自定义头时返回空串', () => {
        expect(读取可复用自定义请求头('https://opencode.ai/v1', { baseUrl: 'https://opencode.ai/v1' })).toBe('');
        expect(读取可复用自定义请求头('https://opencode.ai/v1', null)).toBe('');
    });
});

describe('模型列表请求头', () => {    it('OpenCode 地址同样补会话头', () => {
        const headers = 构建模型列表请求头({
            baseUrl: 'https://opencode.ai/zen/go/v1',
            apiKey: 'sk-test'
        });
        expect(headers.Authorization).toBe('Bearer sk-test');
        expect(headers['x-opencode-session']).toBe(读取OpenCode会话标识());
    });

    it('小米 MiMo 仍走 api-key，并附带自定义头', () => {
        const headers = 构建模型列表请求头({
            baseUrl: 'https://api.xiaomimimo.com/v1',
            apiKey: 'mimo-key',
            供应商: 'mimo_api',
            自定义请求头: 'X-Trace: t1'
        });
        expect(headers['api-key']).toBe('mimo-key');
        expect(headers.Authorization).toBeUndefined();
        expect(headers['X-Trace']).toBe('t1');
    });
});

describe('同域中转透传自定义请求头', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const 中转请求 = (headers: Record<string, string>) => {
        const target = 'https://opencode.ai/zen/go/v1/chat/completions';
        return new Request(`https://msjh.bacon159.pp.ua/api/ai-relay?target=${encodeURIComponent(target)}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model: 'gk-1', messages: [] })
        });
    };

    it('x-opencode-session 等自定义头会被转发到上游', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }));
        vi.stubGlobal('fetch', fetchMock);
            const res = await onRequestPost({
            request: 中转请求({
                'Content-Type': 'application/json',
                Authorization: 'Bearer sk-test',
                'x-opencode-session': 'session-123',
                'X-Custom-Trace': 'trace-1',
                'Sec-Fetch-Site': 'cross-site',
                'X-Forwarded-For': '1.2.3.4',
                Forwarded: 'for=1.2.3.4',
                'CF-Access-Client-Id': 'access-id'
            })
        });
        expect(res.status).toBe(200);
        const forwarded = (fetchMock.mock.calls[0][1] as any).headers as Headers;
        expect(forwarded.get('x-opencode-session')).toBe('session-123');
        expect(forwarded.get('x-custom-trace')).toBe('trace-1');
        expect(forwarded.get('Authorization')).toBe('Bearer sk-test');
        // 边缘层/传输层头不得外泄
        expect(forwarded.get('cookie')).toBeNull();
        expect(forwarded.get('content-length')).toBeNull();
        expect(forwarded.get('sec-fetch-site')).toBeNull();
        expect(forwarded.get('x-forwarded-for')).toBeNull();
        expect(forwarded.get('forwarded')).toBeNull();
        // cf-* 不做整段屏蔽，零信任网关头要保留
        expect(forwarded.get('cf-access-client-id')).toBe('access-id');
    });

    it('预检回显调用方申请的请求头，避免自定义头在预检被拦', () => {
        const res = onRequestOptions({
            request: new Request('https://msjh.bacon159.pp.ua/api/ai-relay', {
                method: 'OPTIONS',
                headers: {
                    'Access-Control-Request-Headers': 'authorization,x-opencode-session,X-Custom',
                    Origin: 'https://localhost'
                }
            })
        });
        expect(res.status).toBe(204);
        const allowed = String(res.headers.get('Access-Control-Allow-Headers') || '').toLowerCase();
        expect(allowed).toContain('x-opencode-session');
        expect(allowed).toContain('x-custom');
        expect(allowed).toContain('authorization');
    });

    it('无参调用预检仍返回默认允许列表', () => {
        const res = onRequestOptions();
        expect(res.status).toBe(204);
        expect(String(res.headers.get('Access-Control-Allow-Headers'))).toContain('Authorization');
    });
});
