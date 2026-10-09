// @vitest-environment jsdom
import React from 'react';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VariableReviewModal from '../components/features/Settings/VariableReviewModal';
import { createVariableReviewConfigurationActions } from '../services/variableReviewSettingsService';
import { createVariableReviewActions } from '../hooks/useGame/variableReviewActions';
import { runVariableReview } from '../hooks/useGame/variableReviewWorkflow';
import { normalizeVariableReviewSettings, VARIABLE_REVIEW_SETTINGS_KEY } from '../utils/variableReviewSettings';
import { 请求模型文本 } from '../services/ai/chatCompletionClient';
import { createReviewRig, reviewOutput } from './helpers/variableReviewFixture';

const requests: { url: string; body: any; headers: HeadersInit }[] = [];
beforeEach(() => {
    requests.length = 0;
    vi.stubGlobal('crypto', webcrypto);
    // jsdom的XHR没有路由服务；走客户端同一HTTP body构造后的fetch传输。
    vi.stubGlobal('XMLHttpRequest', undefined);
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit = {}) => {
        if (!options.body) return new Response(JSON.stringify({ data: [{ id: 'gemini-3-flash', display_name: '[按次] Gemini Flash', context_length: 200000 }, { id: 'id-only' }] }), { headers: { 'content-type': 'application/json' } });
        const body = JSON.parse(String(options.body));
        requests.push({ url: String(url), body, headers: options.headers });
        if (body.stream) return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: reviewOutput() } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
        return new Response(JSON.stringify(body.agent ? { status: 'completed', output_text: reviewOutput() } : { choices: [{ message: { content: reviewOutput() } }] }), { headers: { 'content-type': 'application/json' } });
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const uiRig = () => {
    const rig = createReviewRig('林岳走进大厅。');
    rig.dependencies.apiConfig = structuredClone(rig.dependencies.apiConfig);
    const stored = new Map<string, unknown>();
    const storage = { read: vi.fn(async (key: string) => stored.get(key)), write: vi.fn(async (key: string, value: unknown) => { stored.set(key, structuredClone(value)); }) };
    const config = createVariableReviewConfigurationActions(() => rig.dependencies.apiConfig, storage);
    const actions = { ...createVariableReviewActions({ getInput: () => rig.source,
        getDependencies: () => ({ ...rig.dependencies, reviewSettings: config.peekSettings() }), saveSettings: config.saveVariableReviewSettings, getModelMetadata: config.getVariableReviewModelMetadata,
        commitState: rig.commit, saveState: rig.save }), ...config };
    return { ...rig, actions, stored, storage, config };
};

describe('变量审查真实HTTP与配置生产链路', () => {
    it.each([0.8, undefined])('OpenAI-compatible topP=%s序列化到最终HTTP body', async topP => {
        const rig = createReviewRig('林岳走进大厅。');
        await runVariableReview(rig.source, { ...rig.dependencies, reviewSettings: { ...normalizeVariableReviewSettings(undefined, rig.dependencies.apiConfig), topP } });
        expect(requests).toHaveLength(1);
        if (topP === undefined) expect(requests[0].body).not.toHaveProperty('top_p');
        else expect(requests[0].body.top_p).toBe(0.8);
    });
    it('Deep Research不支持Top P，不向Interactions发送该字段', async () => {
        await 请求模型文本({ ...createReviewRig().dependencies.apiConfig.configs[0], 供应商: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'deep-research-pro-preview', topP: 0.8 }, [{ role: 'user', content: '审查' }], { temperature: 0.2, variableReviewSampling: true });
        expect(requests[0].url).toContain('/interactions');
        expect(requests[0].body).not.toHaveProperty('top_p');
    });
    it('普通业务没有新增默认Top P，MiMo既有默认保持不变；审查留空不发送', async () => {
        const api = createReviewRig().dependencies.apiConfig.configs[0];
        await 请求模型文本(api, [{ role: 'user', content: 'test' }], { temperature: 0.2 });
        expect(requests.at(-1)!.body).not.toHaveProperty('top_p');
        const mimo = { ...api, 供应商: 'mimo_api' as const, baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5' };
        await 请求模型文本(mimo, [{ role: 'user', content: 'test' }], { temperature: 0.2 });
        expect(requests.at(-1)!.body.top_p).toBe(0.95);
        await 请求模型文本(mimo, [{ role: 'user', content: 'test' }], { temperature: 0.2, variableReviewSampling: true });
        expect(requests.at(-1)!.body).not.toHaveProperty('top_p');
    });
    it('HTTP模型元数据→service→UI label→保存ID→最终审查HTTP发送ID', async () => {
        const rig = uiRig(); render(<VariableReviewModal actions={rig.actions} onClose={vi.fn()} />);
        await screen.findByLabelText('审查提示词');
        expect(requests).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: '刷新模型' }));
        await screen.findByText('当前审查模型不在最新模型列表中，请重新选择。');
        fireEvent.click(within(screen.getByRole('group', { name: '审查模型列表' })).getByRole('button', { name: /test-model/ }));
        expect(screen.getByRole('button', { name: 'id-only' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '[按次] Gemini Flash' }));
        await waitFor(() => expect((rig.stored.get(VARIABLE_REVIEW_SETTINGS_KEY) as any).model).toBe('gemini-3-flash'));
        fireEvent.click(screen.getByRole('button', { name: '开始变量审查' }));
        await screen.findByText('在本次审查范围内，未发现需要修改的变量。');
        expect(requests[0].body.model).toBe('gemini-3-flash');
        expect(requests[0].url).toContain('review.test');
        expect(screen.getByRole('region', { name: '审查容量诊断' }).textContent).toContain('200,000');
        expect(screen.getByRole('region', { name: '审查容量诊断' }).textContent).toContain('当前接口模型metadata');
    });
    it('UI自定义窗口持久化、超限无HTTP、增大容量后可请求；刷新不覆盖手动值', async () => {
        const rig = uiRig(); render(<VariableReviewModal actions={rig.actions} onClose={vi.fn()} />);
        await screen.findByLabelText('审查提示词');
        const group = screen.getByRole('group', { name: '审查上下文窗口' });
        fireEvent.click(within(group).getByRole('button', { name: /^自动$/ }));
        fireEvent.click(screen.getByRole('button', { name: /^自定义$/ }));
        const context = screen.getByLabelText('自定义上下文窗口 Token');
        fireEvent.change(context, { target: { value: '32000' } }); fireEvent.blur(context);
        const output = screen.getByLabelText('最大输出 Token'); fireEvent.change(output, { target: { value: '8192' } }); fireEvent.blur(output);
        fireEvent.change(screen.getByLabelText('审查提示词'), { target: { value: '核对事实与变量'.repeat(10000) } });
        await waitFor(() => expect(rig.config.peekSettings()).toMatchObject({ contextWindowMode: 'custom', contextWindowTokens: 32000 }));
        fireEvent.click(screen.getByRole('button', { name: '开始变量审查' }));
        await screen.findByText('上下文容量不足'); expect(requests).toHaveLength(0);
        expect(screen.getByRole('region', { name: '审查容量诊断' }).textContent).toContain('32,000');
        const next = screen.getByLabelText('自定义上下文窗口 Token'); fireEvent.change(next, { target: { value: '400000' } }); fireEvent.blur(next);
        fireEvent.click(screen.getByRole('button', { name: '刷新模型' }));
        await screen.findByText('当前审查模型不在最新模型列表中，请重新选择。');
        expect((screen.getByLabelText('自定义上下文窗口 Token') as HTMLInputElement).value).toBe('400000');
        fireEvent.click(screen.getByRole('button', { name: '开始变量审查' }));
        await screen.findByText('在本次审查范围内，未发现需要修改的变量。');
        expect(requests).toHaveLength(1); expect(rig.commit).not.toHaveBeenCalled();
        expect((rig.stored.get(VARIABLE_REVIEW_SETTINGS_KEY) as any).contextWindowTokens).toBe(400000);
    });
    it('点击后保存延迟期间改A连接并切B，本次仍使用A快照，下一次使用B', async () => {
        const rig = uiRig();
        const api = rig.dependencies.apiConfig;
        api.configs = [{ ...api.configs[0], id: 'A', 名称: 'A', model: 'story-A' }, { ...api.configs[0], id: 'B', 名称: 'B', baseUrl: 'https://b.test/v1', apiKey: 'key-B', model: 'story-B' }];
        api.activeConfigId = 'A'; api.功能模型占位.变量计算渠道ID = 'A';
        const mounted = render(<VariableReviewModal actions={rig.actions} onClose={vi.fn()} />);
        await screen.findByLabelText('审查提示词');
        fireEvent.change(screen.getByLabelText('审查提示词'), { target: { value: '策略A' } });
        fireEvent.change(screen.getByLabelText('本次审查备注（可选）'), { target: { value: '备注A' } });
        for (const [label, value] of [['最大输出 Token', '8192'], ['Temperature（可选）', '0.3'], ['Top P（可选）', '0.8']]) {
            const field = screen.getByLabelText(label); fireEvent.change(field, { target: { value } }); fireEvent.blur(field);
        }
        await waitFor(() => expect((rig.stored.get(VARIABLE_REVIEW_SETTINGS_KEY) as any).customPrompt).toBe('策略A'));
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        rig.storage.write.mockImplementationOnce(async (key, value) => { await gate; rig.stored.set(key, value); });
        fireEvent.click(screen.getByRole('button', { name: '开始变量审查' }));
        expect(requests).toHaveLength(0);
        api.configs[0].baseUrl = 'https://changed-a.test/v1'; api.configs[0].apiKey = 'changed-key';
        const next = { ...rig.config.peekSettings(), mainConfigId: 'B', model: 'review-B', customPrompt: '策略B', maxOutputTokens: 16384, temperature: 0.5, topP: 0.9 };
        const saveB = rig.config.saveVariableReviewSettings(next);
        release(); await saveB;
        await screen.findByText('在本次审查范围内，未发现需要修改的变量。');
        expect(requests[0].url).toContain('review.test'); expect(requests[0].body.model).toBe('test-model');
        expect(requests[0].body).toMatchObject({ max_tokens: 8192, temperature: 0.3, top_p: 0.8 });
        expect(requests[0].headers).toMatchObject({ Authorization: 'Bearer test-key' });
        const task = JSON.parse(requests[0].body.messages.find((message: any) => message.role === 'user').content);
        expect(task.reviewStrategy.text).toBe('策略A'); expect(task.reviewNotes.text).toBe('备注A');
        mounted.unmount(); render(<VariableReviewModal actions={rig.actions} onClose={vi.fn()} />);
        await screen.findByLabelText('审查提示词');
        fireEvent.click(screen.getByRole('button', { name: '开始变量审查' }));
        await screen.findByText('在本次审查范围内，未发现需要修改的变量。');
        expect(requests.at(-1)!.url).toContain('b.test'); expect(requests.at(-1)!.body.model).toBe('review-B');
        expect(requests.at(-1)!.body).toMatchObject({ max_tokens: 16384, temperature: 0.5, top_p: 0.9 });
    });
    it('设置读取失败结束loading并禁用开始；重试成功可审查', async () => {
        const rig = uiRig(); rig.storage.read.mockRejectedValueOnce(new Error('数据库暂不可用'));
        render(<VariableReviewModal actions={rig.actions} onClose={vi.fn()} />);
        await screen.findByText('审查配置加载失败：数据库暂不可用');
        expect(screen.queryByText('正在加载审查设置…')).toBeNull();
        expect((screen.getByRole('button', { name: '开始变量审查' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: '重试加载配置' }));
        await screen.findByLabelText('审查提示词');
        expect((screen.getByRole('button', { name: '开始变量审查' }) as HTMLButtonElement).disabled).toBe(false);
        expect(requests).toHaveLength(0);
    });
    it('不支持的协议UI明确禁用Top P；MiMo越界参数按供应商范围显示和保存', async () => {
        const rig = uiRig(); render(<VariableReviewModal actions={rig.actions} onClose={vi.fn()} />);
        await screen.findByLabelText('审查提示词'); fireEvent.click(screen.getByLabelText('使用独立 API'));
        fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://generativelanguage.googleapis.com/v1beta/openai' } });
        fireEvent.change(screen.getByLabelText('自定义审查 Model ID'), { target: { value: 'deep-research-pro-preview' } });
        expect((screen.getByLabelText('Top P（可选）') as HTMLInputElement).disabled).toBe(true);
        expect(screen.getByText(/本次请求不会发送该参数/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://api.xiaomimimo.com/v1' } });
        fireEvent.change(screen.getByLabelText('自定义审查 Model ID'), { target: { value: 'mimo-v2.5' } });
        const topP = screen.getByLabelText('Top P（可选）') as HTMLInputElement;
        fireEvent.change(topP, { target: { value: '0' } }); fireEvent.blur(topP); expect(topP.value).toBe('0.01');
        const temperature = screen.getByLabelText('Temperature（可选）') as HTMLInputElement;
        fireEvent.change(temperature, { target: { value: '2' } }); fireEvent.blur(temperature); expect(temperature.value).toBe('1.5');
        await waitFor(() => expect(rig.config.peekSettings()).toMatchObject({ topP: 0.01, temperature: 1.5 }));
    });
    it.each([['最大输出 Token', '12.7', '1024', 'maxOutputTokens', 1024], ['Temperature（可选）', '999', '2', 'temperature', 2], ['Top P（可选）', '-1', '0', 'topP', 0]])('数值%s失焦后UI和保存值一致', async (label, input, display, key, saved) => {
        const rig = uiRig(); render(<VariableReviewModal actions={rig.actions} onClose={vi.fn()} />);
        await screen.findByLabelText('审查提示词');
        const field = screen.getByLabelText(label as string) as HTMLInputElement;
        fireEvent.change(field, { target: { value: input } }); fireEvent.blur(field);
        expect(field.value).toBe(display);
        await waitFor(() => expect((rig.stored.get(VARIABLE_REVIEW_SETTINGS_KEY) as any)[key]).toBe(saved));
    });
});
