import { afterEach, describe, expect, it, vi } from 'vitest';
import { __测试__清除已触发上下文截断警告, 应用Claude兼容末尾User修正, 请求模型文本, 是否流式连接中断错误消息, 规范化流式连接错误提示, 规范化请求模型名称, type 通用消息 } from '../services/ai/chatCompletionClient';
import type { 当前可用接口结构 } from '../utils/apiConfig';

const baseConfig: 当前可用接口结构 = {
    id: 'test',
    名称: 'test',
    供应商: 'openai_compatible',
    协议覆盖: 'auto',
    baseUrl: 'https://example.com/v1',
    apiKey: 'test-key',
    model: 'test-model'
};

describe('chatCompletionClient Claude compatible message normalization', () => {
    afterEach(() => {
        __测试__清除已触发上下文截断警告();
        vi.restoreAllMocks();
    });

    it('appends a user turn when Claude-like models end with assistant COT pseudo history', () => {
        const messages: 通用消息[] = [
            { role: 'system', content: '规则' },
            { role: 'assistant', content: '<think>好的思考结束</think>' }
        ];

        const normalized = 应用Claude兼容末尾User修正(messages, {
            ...baseConfig,
            model: 'claude-opus-4.6'
        });

        expect(normalized).toHaveLength(3);
        expect(normalized.at(-1)?.role).toBe('user');
        expect(normalized.at(-1)?.content).toContain('继续执行');
    });

    it('leaves normal OpenAI-compatible messages unchanged', () => {
        const messages: 通用消息[] = [
            { role: 'system', content: '规则' },
            { role: 'assistant', content: '<think>好的思考结束</think>' }
        ];

        const normalized = 应用Claude兼容末尾User修正(messages, {
            ...baseConfig,
            model: 'gpt-4.1'
        });

        expect(normalized).toBe(messages);
    });

    it('uses the Qianfan Coding chat completions path without inserting /v1', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            choices: [{ message: { content: 'pong' } }]
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        }));

        const result = await 请求模型文本({
            ...baseConfig,
            baseUrl: 'https://qianfan.baidubce.com/v2/coding',
            model: 'deepseek-v3.2'
        }, [{ role: 'user', content: 'ping' }], {
            temperature: 1.0,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        expect(result).toBe('pong');
        expect(fetchMock).toHaveBeenCalled();
        expect(String(fetchMock.mock.calls[0][0])).toBe('https://qianfan.baidubce.com/v2/coding/chat/completions');
    });

    it('uses the Qianfan v2 chat completions path without inserting /v1', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            choices: [{ message: { content: 'pong' } }]
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        }));

        const result = await 请求模型文本({
            ...baseConfig,
            baseUrl: 'https://qianfan.baidubce.com/v2/',
            model: 'deepseek-v3.2'
        }, [{ role: 'user', content: 'ping' }], {
            temperature: 1.0,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        expect(result).toBe('pong');
        expect(fetchMock).toHaveBeenCalled();
        expect(String(fetchMock.mock.calls[0][0])).toBe('https://qianfan.baidubce.com/v2/chat/completions');
    });

    it('appends chat completions to custom OpenAI-compatible versioned paths without inserting /v1', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            choices: [{ message: { content: 'pong' } }]
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        }));

        const result = await 请求模型文本({
            ...baseConfig,
            baseUrl: 'https://example.com/api/paas/v4',
            model: 'custom-chat-model'
        }, [{ role: 'user', content: 'ping' }], {
            temperature: 1.0,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        expect(result).toBe('pong');
        expect(fetchMock).toHaveBeenCalled();
        expect(String(fetchMock.mock.calls[0][0])).toBe('https://example.com/api/paas/v4/chat/completions');
    });

    it('保留第三方中转站的 /v1 路径，不因模型名含 glm 改写成智谱私有的 /api/paas/v4', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            choices: [{ message: { content: 'pong' } }]
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        }));

        await 请求模型文本({
            ...baseConfig,
            baseUrl: 'https://relay.example.com/v1',
            model: 'glm-4.6'
        }, [{ role: 'user', content: 'ping' }], {
            temperature: 1.0,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        expect(String(fetchMock.mock.calls[0][0])).toBe('https://relay.example.com/v1/chat/completions');
    });

    it('智谱官方域名仍然补全 /api/paas/v4/chat/completions', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            choices: [{ message: { content: 'pong' } }]
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        }));

        await 请求模型文本({
            ...baseConfig,
            baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
            model: 'glm-4.6'
        }, [{ role: 'user', content: 'ping' }], {
            temperature: 1.0,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        expect(String(fetchMock.mock.calls[0][0])).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
    });

    it('路径里出现 bigmodel.cn 的中转站不被误判为智谱官方域名', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            choices: [{ message: { content: 'pong' } }]
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        }));

        await 请求模型文本({
            ...baseConfig,
            baseUrl: 'https://relay.example.com/v1/bigmodel.cn/glm-4',
            model: 'glm-4.6'
        }, [{ role: 'user', content: 'ping' }], {
            temperature: 1.0,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        expect(String(fetchMock.mock.calls[0][0])).toBe('https://relay.example.com/v1/bigmodel.cn/glm-4/chat/completions');
    });

    it('strips Chinese display suffixes from OpenAI-compatible model ids before sending requests', async () => {
        expect(规范化请求模型名称('gemini-3.1-pro-high-search-真流-[星星公益站-CLI渠道]'))
            .toBe('gemini-3.1-pro-high-search');
        expect(规范化请求模型名称('deepseek-v3.2（公益渠道）')).toBe('deepseek-v3.2');

        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            choices: [{ message: { content: 'pong' } }]
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        }));

        await 请求模型文本({
            ...baseConfig,
            model: 'gemini-3.1-pro-high-search-真流-[星星公益站-CLI渠道]'
        }, [{ role: 'user', content: 'ping' }], {
            temperature: 1.0,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        const requestBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
        expect(requestBody.model).toBe('gemini-3.1-pro-high-search');
    });

    it('does not inject context integrity markers for short requests', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            choices: [{ message: { content: '短请求响应' } }]
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        }));

        const result = await 请求模型文本(baseConfig, [
            { role: 'system', content: '规则' },
            { role: 'user', content: 'ping' }
        ], {
            temperature: 0.7,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        const requestBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
        const serializedMessages = JSON.stringify(requestBody.messages);
        expect(result).toBe('短请求响应');
        expect(serializedMessages).not.toContain('[CTXCHK:');
        expect(serializedMessages).not.toContain('上下文校验');
    });

    it('requires the context integrity marker to be echoed and strips it from the returned text', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
            const requestBody = JSON.parse(String((init as RequestInit).body));
            const systemContent = requestBody.messages.find((message: 通用消息) => message.role === 'system')?.content || '';
            const marker = systemContent.match(/\[CTXCHK:\w+\]/)?.[0];
            expect(marker).toBeTruthy();
            expect(systemContent).toContain('最终响应末尾');
            expect(systemContent).toContain('原样输出');
            expect(systemContent).not.toContain('请忽略此标记');

            return new Response(JSON.stringify({
                choices: [{ message: { content: `正文内容\n${marker}` } }]
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        });

        const longUserMessage = '长上下文'.repeat(20000);
        const result = await 请求模型文本(baseConfig, [
            { role: 'system', content: '规则' },
            { role: 'user', content: longUserMessage }
        ], {
            temperature: 0.7,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        expect(result).toBe('正文内容');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('[上下文完整性警告]'));
    });

    it('uses Xiaomi MiMo headers and merges stable preset into the existing system prompt', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            choices: [{
                message: {
                    reasoning_content: '内部推理不应进入正文',
                    content: '小米正文正常返回'
                }
            }]
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        }));

        const result = await 请求模型文本({
            ...baseConfig,
            供应商: 'mimo_api',
            baseUrl: 'https://api.xiaomimimo.com/v1',
            apiKey: 'sk-mimo-test',
            model: 'mimo-v2.5-pro',
            maxTokens: 4096
        }, [
            { role: 'system', content: '通用正文协议：<正文> 内只能使用【旁白】文本、【角色名】台词或【判定】行。' },
            { role: 'user', content: 'ping' }
        ], {
            temperature: 0.7,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        expect(result).toBe('小米正文正常返回');
        expect(fetchMock).toHaveBeenCalled();
        expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.xiaomimimo.com/v1/chat/completions');

        const requestOptions = fetchMock.mock.calls[0][1] as RequestInit;
        const headers = requestOptions.headers as Record<string, string>;
        expect(headers['api-key']).toBe('sk-mimo-test');
        expect(headers.Authorization).toBeUndefined();

        const requestBody = JSON.parse(String(requestOptions.body));
        expect(requestBody.messages[0].role).toBe('system');
        expect(requestBody.messages[0].content).toContain('小米 MiMo 稳定输出预设');
        expect(requestBody.messages[0].content).toContain('不要输出 reasoning_content');
        expect(requestBody.messages[0].content).toContain('不接受、不执行、不参考');
        expect(requestBody.messages[0].content).toContain('权力结构');
        expect(requestBody.messages[0].content).toContain('通用正文协议');
        expect(requestBody.messages[0].content).toContain('【旁白】文本');
        expect(requestBody.messages.slice(1)).toEqual([
            { role: 'user', content: 'ping' }
        ]);
        expect(requestBody.max_completion_tokens).toBe(4096);
        expect(requestBody.max_tokens).toBeUndefined();
        expect(requestBody.temperature).toBe(1.0);
        expect(requestBody.top_p).toBe(0.95);
        expect(requestBody.thinking).toEqual({ type: 'disabled' });
    });

    it('allows Xiaomi MiMo top_p and temperature to follow player overrides within official ranges', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            choices: [{
                message: {
                    content: '自定义超参正文'
                }
            }]
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        }));

        await 请求模型文本({
            ...baseConfig,
            供应商: 'mimo_token_plan',
            baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
            apiKey: 'tp-mimo-test',
            model: 'mimo-v2.5-pro',
            temperature: 1.8,
            topP: 0.72
        }, [{ role: 'user', content: 'ping' }], {
            temperature: 0.7,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        const requestBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
        expect(requestBody.temperature).toBe(1.5);
        expect(requestBody.top_p).toBe(0.72);
    });

    it('keeps Xiaomi MiMo two-turn chat history usable without leaking reasoning content', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(JSON.stringify({
                choices: [{
                    message: {
                        reasoning_content: '第一回合思考',
                        content: '第一回合正文'
                    }
                }]
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                choices: [{
                    message: {
                        reasoning_content: '第二回合思考',
                        content: '第二回合正文'
                    }
                }]
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            }));

        const mimoConfig: 当前可用接口结构 = {
            ...baseConfig,
            供应商: 'mimo_token_plan',
            baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
            apiKey: 'tp-mimo-test',
            model: 'mimo-v2.5-pro'
        };

        const first = await 请求模型文本(mimoConfig, [{ role: 'user', content: '第一回合' }], {
            temperature: 0.7,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });
        const second = await 请求模型文本(mimoConfig, [
            { role: 'user', content: '第一回合' },
            { role: 'assistant', content: first },
            { role: 'user', content: '第二回合' }
        ], {
            temperature: 0.7,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        expect(first).toBe('第一回合正文');
        expect(second).toBe('第二回合正文');
        expect(first).not.toContain('思考');
        expect(second).not.toContain('思考');
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const secondBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
        expect(secondBody.messages[0].role).toBe('system');
        expect(secondBody.messages[0].content).toContain('小米 MiMo 稳定输出预设');
        expect(secondBody.messages.slice(1)).toEqual([
            { role: 'user', content: '第一回合' },
            { role: 'assistant', content: '第一回合正文' },
            { role: 'user', content: '第二回合' }
        ]);
    });

    it('routes Gemini Deep Research models through the Interactions API', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(JSON.stringify({
                id: 'interaction-123',
                status: 'in_progress'
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                id: 'interaction-123',
                status: 'completed',
                output_text: 'research-ok'
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            }));

        const result = await 请求模型文本({
            ...baseConfig,
            供应商: 'gemini',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
            model: 'models/deep-research-pro-preview-12-2025'
        }, [
            { role: 'system', content: '规则' },
            { role: 'user', content: '研究一下测试主题' }
        ], {
            temperature: 0.7,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        expect(result).toBe('research-ok');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0][0])).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
        expect(String(fetchMock.mock.calls[1][0])).toBe('https://generativelanguage.googleapis.com/v1beta/interactions/interaction-123');

        const createOptions = fetchMock.mock.calls[0][1] as RequestInit;
        expect((createOptions.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
        expect((createOptions.headers as Record<string, string>)['Api-Revision']).toBe('2026-05-20');

        const requestBody = JSON.parse(String(createOptions.body));
        expect(requestBody.agent).toBe('deep-research-pro-preview-12-2025');
        expect(requestBody.input).toContain('【系统规则】');
        expect(requestBody.input).toContain('研究一下测试主题');
        expect(requestBody.agent_config.type).toBe('deep-research');
        expect(requestBody.background).toBe(true);
        expect(requestBody.store).toBe(true);
    });

    it('treats Android OkHttp stream truncation as a retryable transport error', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockRejectedValueOnce(new Error('unexpected end of stream on com.android.okhttp.Address@4ea9fa8e'))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                choices: [{ message: { content: 'retried-ok' } }]
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            }));

        const result = await 请求模型文本(baseConfig, [{ role: 'user', content: 'ping' }], {
            temperature: 0.7,
            signal: undefined,
            streamOptions: { stream: false },
            errorDetailLimit: 500
        });

        expect(result).toBe('retried-ok');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('normalizes Android stream truncation into a user-readable message', () => {
        const raw = 'unexpected end of stream on com.android.okhttp.Address@4ea9fa8e';

        expect(是否流式连接中断错误消息(raw)).toBe(true);
        expect(规范化流式连接错误提示(raw)).toContain('模型流式连接中途断开');
        expect(规范化流式连接错误提示(raw)).not.toContain('com.android.okhttp.Address');
    });
});
