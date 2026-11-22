// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ApiSettings, { 是否GeminiDeepResearch配置, 解析模型列表后的选择, 选择最佳可用模型 } from '../components/features/Settings/ApiSettings';
import * as textAIService from '../services/ai/text';
import { 创建接口配置模板, 构建OpenAI兼容模型列表候选地址, 获取剧情回忆接口配置, 获取世界演变接口配置, 获取规划分析接口配置, 规范化接口设置, 推断供应商, 供应商标签 } from '../utils/apiConfig';
import { 获取OpenAI兼容模型列表 } from '../utils/openAIModelListFetcher';

vi.mock('../services/ai/text', () => ({
    testConnection: vi.fn()
}));

vi.mock('../utils/openAIModelListFetcher', () => ({
    获取OpenAI兼容模型列表: vi.fn()
}));

describe('接口模型自动选择', () => {
    it('优先选择同渠道返回列表中版本号更大的高能力模型', () => {
        expect(选择最佳可用模型([
            'gemini-2.5-pro',
            'gemini-2.0-pro',
            'gemini-2.5-flash',
            'text-embedding-004'
        ])).toBe('gemini-2.5-pro');
    });

    it('不会在小米等非 GPT 渠道测试时硬保留 GPT 模型', () => {
        expect(选择最佳可用模型([
            'moonshot-v1-8k',
            'moonshot-v1-32k',
            'moonshot-v1-128k',
            'moonshot-v1-8k-vision-preview'
        ])).toBe('moonshot-v1-128k');
    });

    it('过滤空值并避开图片、语音和嵌入类模型', () => {
        expect(选择最佳可用模型([
            '',
            'gpt-image-2',
            'text-embedding-3-large',
            'gpt-5-mini',
            'gpt-5'
        ])).toBe('gpt-5');
    });

    it('Deep Research 协议提示仍能独立识别，不参与模型自动选择', () => {
        expect(是否GeminiDeepResearch配置(
            'gemini-2.5-pro-deep-research',
            'https://generativelanguage.googleapis.com/v1beta'
        )).toBe(true);
        expect(是否GeminiDeepResearch配置(
            'agy-gpt-oss-120b-medium',
            'https://example.com/v1'
        )).toBe(false);
    });

    it('获取列表或测试连接时保留用户当前选择，不自动切换成评分更高的模型', () => {
        expect(解析模型列表后的选择('agy-gpt-oss-120b-medium', [
            'gemini-2.5-pro',
            'agy-gpt-oss-120b-medium'
        ])).toBe('agy-gpt-oss-120b-medium');
    });

    it('只有当前模型为空时才自动选择一个可用模型', () => {
        expect(解析模型列表后的选择('', [
            'gemini-2.5-flash',
            'gemini-2.5-pro'
        ])).toBe('gemini-2.5-pro');
    });
});

describe('接口模型异步请求竞态', () => {
    const fetchModelsMock = vi.mocked(获取OpenAI兼容模型列表);
    const testConnectionMock = vi.mocked(textAIService.testConnection);

    const createDeferred = <T,>() => {
        let resolve!: (value: T) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<T>((resolvePromise, rejectPromise) => {
            resolve = resolvePromise;
            reject = rejectPromise;
        });
        return { promise, resolve, reject };
    };

    const createConfig = (id: string, name: string, baseUrl: string, apiKey: string) => ({
        ...创建接口配置模板('openai_compatible'),
        id,
        名称: name,
        baseUrl,
        apiKey,
        model: ''
    });

    const renderSettings = () => render(React.createElement(ApiSettings, {
        settings: 规范化接口设置({
            activeConfigId: 'config-a',
            configs: [
                createConfig('config-a', '配置 A', 'https://a.example.test/v1', 'key-a'),
                createConfig('config-b', '配置 B', 'https://b.example.test/v1', 'key-b')
            ],
            功能模型占位: {
                主剧情使用模型: ''
            }
        }),
        onSave: vi.fn()
    }));

    beforeEach(() => {
        fetchModelsMock.mockReset();
        testConnectionMock.mockReset();
    });

    afterEach(() => {
        cleanup();
    });

    it('配置 A 返回模型前切换到 B 时，不把 A 的列表或推荐模型写入 B', async () => {
        const deferred = createDeferred<string[]>();
        fetchModelsMock.mockReturnValueOnce(deferred.promise);
        renderSettings();

        fireEvent.click(screen.getByRole('button', { name: '获取列表' }));
        fireEvent.click(screen.getByRole('button', { name: /配置 B/ }));

        await act(async () => {
            deferred.resolve(['gemini-2.5-pro']);
            await deferred.promise;
        });

        await waitFor(() => expect(screen.getByText('接口配置已切换或发生变化，已丢弃旧模型列表。')).toBeTruthy());
        expect(screen.getByPlaceholderText('可直接手动输入模型名称')).toHaveProperty('value', 'gpt-4o-mini');
        expect(screen.queryByText('gemini-2.5-pro')).toBeNull();
        expect(testConnectionMock).not.toHaveBeenCalled();
    });

    it.each([
        ['接口地址 (Base URL)', 'https://changed.example.test/v1'],
        ['密钥 (API Key)', 'changed-key']
    ])('同一配置等待期间修改%s时，丢弃旧模型响应', async (label, nextValue) => {
        const deferred = createDeferred<string[]>();
        fetchModelsMock.mockReturnValueOnce(deferred.promise);
        renderSettings();

        fireEvent.click(screen.getByRole('button', { name: '获取列表' }));
        fireEvent.change(screen.getByLabelText(label), { target: { value: nextValue } });

        await act(async () => {
            deferred.resolve(['gemini-2.5-pro']);
            await deferred.promise;
        });

        await waitFor(() => expect(screen.getByText('接口配置已切换或发生变化，已丢弃旧模型列表。')).toBeTruthy());
        expect(screen.getByPlaceholderText('可直接手动输入模型名称')).toHaveProperty('value', 'gpt-4o-mini');
        expect(screen.queryByText('gemini-2.5-pro')).toBeNull();
    });

    it('连接测试获取模型期间切换配置时，不触发旧配置的连接请求', async () => {
        const deferred = createDeferred<string[]>();
        fetchModelsMock.mockReturnValueOnce(deferred.promise);
        renderSettings();

        fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
        fireEvent.click(screen.getByRole('button', { name: /配置 B/ }));

        await act(async () => {
            deferred.resolve(['gemini-2.5-pro']);
            await deferred.promise;
        });

        await waitFor(() => expect(screen.getByText('接口配置已切换或发生变化，已取消旧配置的连接测试，请重新测试当前配置。')).toBeTruthy());
        expect(testConnectionMock).not.toHaveBeenCalled();
        expect(screen.getByPlaceholderText('可直接手动输入模型名称')).toHaveProperty('value', 'gpt-4o-mini');
    });

    it.each([
        ['接口地址 (Base URL)', 'https://changed.example.test/v1'],
        ['密钥 (API Key)', 'changed-key']
    ])('连接请求已发出后修改%s时，丢弃旧连接结果', async (label, nextValue) => {
        const connectionDeferred = createDeferred<{ ok: boolean; detail: string }>();
        fetchModelsMock.mockResolvedValueOnce(['gpt-4o-mini']);
        testConnectionMock.mockReturnValueOnce(connectionDeferred.promise);
        renderSettings();

        fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
        await waitFor(() => expect(testConnectionMock).toHaveBeenCalledTimes(1));
        fireEvent.change(screen.getByLabelText(label), { target: { value: nextValue } });

        await act(async () => {
            connectionDeferred.resolve({ ok: true, detail: 'OK' });
            await connectionDeferred.promise;
        });

        await waitFor(() => expect(screen.getByText('接口配置已切换或发生变化，已丢弃旧配置的连接测试结果，请重新测试当前配置。')).toBeTruthy());
        expect(screen.queryByText('连接测试成功')).toBeNull();
    });

    it('最大输出 Token 超过模型上限时自动回落到建议档位并继续连接测试', async () => {
        fetchModelsMock.mockResolvedValueOnce(['gpt-4o-mini']);
        testConnectionMock.mockResolvedValueOnce({ ok: true, detail: 'OK' } as any);
        renderSettings();

        fireEvent.click(screen.getByRole('button', { name: '64K' }));
        fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

        await waitFor(() => expect(screen.getByText(/gpt-4o-mini 官方最大输出约为 16384/)).toBeTruthy());
        await waitFor(() => expect(testConnectionMock).toHaveBeenCalledTimes(1));
        // gpt-4o-mini 的建议档位是 8K：不再拦截请求，而是按官方上限内的值发送。
        expect(testConnectionMock.mock.calls[0][0]).toMatchObject({ maxTokens: 8192 });
        expect(screen.getByRole('button', { name: '测试连接' })).not.toHaveProperty('disabled', true);
    });

    it('连接请求已发出后修改模型时，丢弃旧模型的连接结果', async () => {
        const connectionDeferred = createDeferred<{ ok: boolean; detail: string }>();
        fetchModelsMock.mockResolvedValueOnce(['gpt-4o-mini', 'gemini-2.5-pro']);
        testConnectionMock.mockReturnValueOnce(connectionDeferred.promise);
        renderSettings();

        fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
        await waitFor(() => expect(testConnectionMock).toHaveBeenCalledTimes(1));
        fireEvent.change(screen.getByPlaceholderText('可直接手动输入模型名称'), {
            target: { value: 'gemini-2.5-pro' }
        });

        await act(async () => {
            connectionDeferred.resolve({ ok: true, detail: 'OK' });
            await connectionDeferred.promise;
        });

        await waitFor(() => expect(screen.getByText('主剧情模型已发生变化，已丢弃旧模型的连接测试结果，请重新测试当前模型。')).toBeTruthy());
        expect(screen.queryByText('连接测试成功')).toBeNull();
    });

    it('后发连接测试会作废旧模型列表请求，旧结果不覆盖当前状态', async () => {
        const listDeferred = createDeferred<string[]>();
        const connectionDeferred = createDeferred<{ ok: boolean; detail: string }>();
        fetchModelsMock
            .mockReturnValueOnce(listDeferred.promise)
            .mockResolvedValueOnce(['gpt-4o-mini']);
        testConnectionMock.mockReturnValueOnce(connectionDeferred.promise);
        renderSettings();

        fireEvent.click(screen.getByRole('button', { name: '获取列表' }));
        fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
        await waitFor(() => expect(testConnectionMock).toHaveBeenCalledTimes(1));

        await act(async () => {
            listDeferred.resolve(['gemini-2.5-pro']);
            await listDeferred.promise;
        });
        expect(screen.queryByText('接口配置已切换或发生变化，已丢弃旧模型列表。')).toBeNull();

        await act(async () => {
            connectionDeferred.resolve({ ok: true, detail: 'OK' });
            await connectionDeferred.promise;
        });
        await waitFor(() => expect(screen.getByText('连接测试成功')).toBeTruthy());
    });
});

describe('小米 MiMo 接口配置', () => {
    it('提供 API 和 Token Plan 两种内置供应商模板', () => {
        const apiConfig = 创建接口配置模板('mimo_api');
        const tokenPlanConfig = 创建接口配置模板('mimo_token_plan');

        expect(供应商标签.mimo_api).toBe('小米 MiMo API');
        expect(供应商标签.mimo_token_plan).toBe('小米 MiMo Token Plan');
        expect(apiConfig.供应商).toBe('mimo_api');
        expect(apiConfig.baseUrl).toBe('https://api.xiaomimimo.com/v1');
        expect(apiConfig.model).toBe('mimo-v2.5-pro');
        expect(tokenPlanConfig.供应商).toBe('mimo_token_plan');
        expect(tokenPlanConfig.baseUrl).toBe('https://token-plan-cn.xiaomimimo.com/v1');
        expect(tokenPlanConfig.model).toBe('mimo-v2.5-pro');
    });

    it('根据小米官方和 Token Plan 地址自动推断供应商', () => {
        expect(推断供应商('https://api.xiaomimimo.com/v1')).toBe('mimo_api');
        expect(推断供应商('https://api.xiaomimimo.com/anthropic')).toBe('mimo_api');
        expect(推断供应商('https://token-plan-cn.xiaomimimo.com/v1')).toBe('mimo_token_plan');
        expect(推断供应商('https://token-plan-cn.xiaomimimo.com/anthropic')).toBe('mimo_token_plan');
    });
});

describe('OpenAI 兼容模型列表地址', () => {
    // 网页环境下会在直连候选之后追加同域中转候选（/api/ai-relay?target=...）作为跨域兜底，
    // 直连候选的顺序与内容保持不变；以下用例只断言直连前缀，中转追加行为见 aiRelayCors.test.ts。
    it('优先使用百度千帆 v2 的模型列表地址，避免错误插入 /v1', () => {
        const candidates = 构建OpenAI兼容模型列表候选地址('https://qianfan.baidubce.com/v2/');
        expect(candidates.slice(0, 2)).toEqual([
            'https://qianfan.baidubce.com/v2/models',
            'https://qianfan.baidubce.com/models'
        ]);
    });

    it('优先使用自定义 OpenAI 兼容版本路径的模型列表地址，避免错误插入 /v1', () => {
        const candidates = 构建OpenAI兼容模型列表候选地址('https://example.com/api/paas/v4');
        expect(candidates.slice(0, 3)).toEqual([
            'https://example.com/api/paas/v4/models',
            'https://example.com/api/paas/models',
            'https://example.com/models'
        ]);
    });

    it('保留普通 OpenAI 兼容地址的 v1/models 兼容探测顺序', () => {
        const candidates = 构建OpenAI兼容模型列表候选地址('https://example.com/v1');
        expect(candidates.slice(0, 2)).toEqual([
            'https://example.com/v1/models',
            'https://example.com/models'
        ]);
    });
});

describe('阶段上游模型解析', () => {
    const createSettings = (recallModel: string) => 规范化接口设置({
        activeConfigId: 'main-channel',
        configs: [
            {
                ...创建接口配置模板('openai_compatible'),
                id: 'main-channel',
                名称: '主剧情渠道',
                baseUrl: 'https://main.example.test/v1',
                apiKey: 'main-key',
                model: 'main-model'
            },
            {
                ...创建接口配置模板('openai_compatible'),
                id: 'recall-channel',
                名称: '剧情回忆渠道',
                baseUrl: 'https://recall.example.test/v1',
                apiKey: 'recall-key',
                model: 'recall-default-model'
            }
        ],
        功能模型占位: {
            剧情回忆独立模型开关: true,
            剧情回忆渠道ID: 'recall-channel',
            剧情回忆使用模型: recallModel
        }
    });

    it('阶段模型为空时会使用所选渠道默认模型', () => {
        const config = 获取剧情回忆接口配置(createSettings(''));

        expect(config?.id).toBe('recall-channel');
        expect(config?.baseUrl).toBe('https://recall.example.test/v1');
        expect(config?.apiKey).toBe('recall-key');
        expect(config?.model).toBe('recall-default-model');
    });

    it('阶段旧模型会覆盖新渠道默认模型', () => {
        const config = 获取剧情回忆接口配置(createSettings('main-model'));

        expect(config?.id).toBe('recall-channel');
        expect(config?.baseUrl).toBe('https://recall.example.test/v1');
        expect(config?.apiKey).toBe('recall-key');
        expect(config?.model).toBe('main-model');
    });

    it('阶段旧 API 地址会覆盖新渠道默认端点', () => {
        const config = 获取剧情回忆接口配置({
            ...规范化接口设置({
                activeConfigId: 'main-channel',
                configs: [
                    { ...创建接口配置模板('openai_compatible'), id: 'main-channel', 名称: '主剧情渠道', baseUrl: 'https://main.example.test/v1', apiKey: 'main-key', model: 'main-model' },
                    { ...创建接口配置模板('openai_compatible'), id: 'recall-channel', 名称: '剧情回忆渠道', baseUrl: 'https://recall.example.test/v1', apiKey: 'recall-key', model: 'recall-default-model' }
                ],
                功能模型占位: {
                    剧情回忆独立模型开关: true,
                    剧情回忆渠道ID: 'recall-channel',
                    剧情回忆使用模型: '',
                    剧情回忆API地址: 'https://old-manual-endpoint.test/v1',
                    剧情回忆API密钥: 'old-manual-key'
                }
            })
        });

        expect(config?.id).toBe('recall-channel');
        expect(config?.baseUrl).toBe('https://old-manual-endpoint.test/v1');
        expect(config?.apiKey).toBe('old-manual-key');
        expect(config?.model).toBe('recall-default-model');
    });

    it('动态世界未配置独立模型时复用主剧情接口', () => {
        const settings = 规范化接口设置({
            activeConfigId: 'main-channel',
            configs: [
                {
                    ...创建接口配置模板('openai_compatible'),
                    id: 'main-channel',
                    名称: '主剧情渠道',
                    baseUrl: 'https://main.example.test/v1',
                    apiKey: 'main-key',
                    model: 'main-model'
                }
            ],
            功能模型占位: {
                世界演变功能启用: true,
                世界演变独立模型开关: false,
                世界演变使用模型: ''
            }
        });

        const config = 获取世界演变接口配置(settings);

        expect(config?.id).toBe('main-channel');
        expect(config?.baseUrl).toBe('https://main.example.test/v1');
        expect(config?.apiKey).toBe('main-key');
        expect(config?.model).toBe('main-model');
    });

    it('规划分析未配置独立模型时复用主剧情接口', () => {
        const settings = 规范化接口设置({
            activeConfigId: 'main-channel',
            configs: [
                {
                    ...创建接口配置模板('openai_compatible'),
                    id: 'main-channel',
                    名称: '主剧情渠道',
                    baseUrl: 'https://main.example.test/v1',
                    apiKey: 'main-key',
                    model: 'main-model'
                }
            ],
            功能模型占位: {
                规划分析功能启用: true,
                规划分析独立模型开关: false,
                规划分析使用模型: ''
            }
        });

        const config = 获取规划分析接口配置(settings);

        expect(config?.id).toBe('main-channel');
        expect(config?.baseUrl).toBe('https://main.example.test/v1');
        expect(config?.apiKey).toBe('main-key');
        expect(config?.model).toBe('main-model');
    });

    it('动态世界总开关关闭时不复用主剧情接口', () => {
        const settings = 规范化接口设置({
            activeConfigId: 'main-channel',
            configs: [
                {
                    ...创建接口配置模板('openai_compatible'),
                    id: 'main-channel',
                    名称: '主剧情渠道',
                    baseUrl: 'https://main.example.test/v1',
                    apiKey: 'main-key',
                    model: 'main-model'
                }
            ],
            功能模型占位: {
                世界演变功能启用: false,
                世界演变独立模型开关: false
            }
        });

        expect(获取世界演变接口配置(settings)).toBeNull();
    });
});
