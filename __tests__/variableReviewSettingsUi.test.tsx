// @vitest-environment jsdom
import React from 'react';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VariableReviewModal from '../components/features/Settings/VariableReviewModal';
import { createVariableReviewConfigurationActions } from '../services/variableReviewSettingsService';
import { DEFAULT_VARIABLE_REVIEW_PROMPT } from '../prompts/runtime/variableReview';
import { VARIABLE_REVIEW_SETTINGS_KEY } from '../utils/variableReviewSettings';
import * as models from '../utils/openAIModelListFetcher';
import * as client from '../services/ai/chatCompletionClient';
import { createReviewRig, reviewOutput } from './helpers/variableReviewFixture';
vi.mock('../utils/openAIModelListFetcher', () => ({ 获取OpenAI兼容模型元数据: vi.fn() }));
vi.mock('../services/ai/chatCompletionClient', async original => ({ ...await original<typeof import('../services/ai/chatCompletionClient')>(), 请求模型文本: vi.fn() }));
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); vi.mocked(models.获取OpenAI兼容模型元数据).mockReset(); vi.mocked(client.请求模型文本).mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const rigWithSettings = () => {
    const rig = createReviewRig('林岳走进大厅。');
    const stored = new Map<string, any>();
    const storage = { read: vi.fn(async (key: string) => stored.get(key)), write: vi.fn(async (key: string, value: any) => { stored.set(key, structuredClone(value)); }) };
    const configuration = createVariableReviewConfigurationActions(() => rig.dependencies.apiConfig, storage);
    Object.defineProperty(rig.dependencies, 'reviewSettings', { enumerable: true, get: () => configuration.peekSettings() });
    const actions = { ...rig.actions, ...configuration };
    return { ...rig, actions, stored, storage, configuration };
};
const open = async (rig: ReturnType<typeof rigWithSettings>) => {
    const mounted = render(<VariableReviewModal actions={rig.actions} onClose={vi.fn()} />);
    await screen.findByLabelText('审查提示词'); return mounted;
};
describe('变量审查统一配置UI与真实工作流', () => {
    it('打开/编辑配置不启动AI，点击开始才发起审查；备注不是长期设置', async () => {
        const rig = rigWithSettings(); await open(rig);
        expect((screen.getByLabelText('审查提示词') as HTMLTextAreaElement).value).toBe(DEFAULT_VARIABLE_REVIEW_PROMPT);
        fireEvent.change(screen.getByLabelText('审查提示词'), { target: { value: '重点检查服装' } });
        fireEvent.change(screen.getByLabelText('本次审查备注（可选）'), { target: { value: '重点看NPC' } });
        expect(client.请求模型文本).not.toHaveBeenCalled();
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput());
        fireEvent.click(screen.getByRole('button', { name: '开始变量审查' }));
        await screen.findByText('在本次审查范围内，未发现需要修改的变量。');
        const payload = JSON.parse(vi.mocked(client.请求模型文本).mock.calls[0][1][2].content);
        expect(payload.reviewStrategy.text).toBe('重点检查服装'); expect(payload.reviewNotes.text).toBe('重点看NPC'); expect(payload.originalPlayerInput.text).toBe('走进大厅');
        expect(rig.stored.get(VARIABLE_REVIEW_SETTINGS_KEY).reviewNotes).toBeUndefined();
    });
    it('编辑Prompt后重新挂载仍保留，恢复默认仅改Prompt，备注和API不变', async () => {
        const rig = rigWithSettings(); const mounted = await open(rig);
        fireEvent.change(screen.getByLabelText('审查提示词'), { target: { value: '自定义策略' } });
        fireEvent.change(screen.getByLabelText('自定义审查 Model ID'), { target: { value: 'review-GPT' } });
        await waitFor(() => expect(rig.stored.get(VARIABLE_REVIEW_SETTINGS_KEY).customPrompt).toBe('自定义策略'));
        mounted.unmount(); await open(rig);
        expect((screen.getByLabelText('审查提示词') as HTMLTextAreaElement).value).toBe('自定义策略');
        fireEvent.change(screen.getByLabelText('本次审查备注（可选）'), { target: { value: '保留本次备注' } });
        fireEvent.click(screen.getByRole('button', { name: '恢复默认审查提示词' }));
        const confirm = screen.getByRole('alertdialog', { name: '恢复默认变量审查提示词' });
        fireEvent.click(within(confirm).getByRole('button', { name: '取消' }));
        expect((screen.getByLabelText('审查提示词') as HTMLTextAreaElement).value).toBe('自定义策略');
        fireEvent.click(screen.getByRole('button', { name: '恢复默认审查提示词' }));
        fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^恢复默认$/ }));
        expect((screen.getByLabelText('审查提示词') as HTMLTextAreaElement).value).toBe(DEFAULT_VARIABLE_REVIEW_PROMPT);
        expect((screen.getByLabelText('本次审查备注（可选）') as HTMLTextAreaElement).value).toBe('保留本次备注');
        expect((screen.getByLabelText('自定义审查 Model ID') as HTMLInputElement).value).toBe('review-GPT');
        await waitFor(() => expect(rig.stored.get(VARIABLE_REVIEW_SETTINGS_KEY).customPrompt).toBe(DEFAULT_VARIABLE_REVIEW_PROMPT));
    });
    it.each([true, false])('模型刷新后当前ID存在=%s，保持原选择并提示', async found => {
        const rig = rigWithSettings(); await open(rig);
        vi.mocked(models.获取OpenAI兼容模型元数据).mockResolvedValue((found ? ['test-model', 'other'] : ['other']).map(id => ({ id, label: id })));
        fireEvent.click(screen.getByRole('button', { name: '刷新模型' }));
        await screen.findByText(found ? '审查模型列表已刷新。' : '当前审查模型不在最新模型列表中，请重新选择。');
        expect((screen.getByLabelText('自定义审查 Model ID') as HTMLInputElement).value).toBe('test-model');
        expect(client.请求模型文本).not.toHaveBeenCalled();
    });
    it('模型展示label被选择时实际请求只发送ID', async () => {
        const rig = rigWithSettings(); await open(rig);
        vi.mocked(models.获取OpenAI兼容模型元数据).mockResolvedValue([{ id: 'gemini-3-flash', label: '[0.01/次][备用] Gemini Flash' }]);
        fireEvent.click(screen.getByRole('button', { name: '刷新模型' })); await screen.findByText('当前审查模型不在最新模型列表中，请重新选择。');
        const group = screen.getByRole('group', { name: '审查模型列表' });
        fireEvent.click(within(group).getByRole('button', { name: /test-model/ }));
        fireEvent.click(screen.getByRole('button', { name: '[0.01/次][备用] Gemini Flash' }));
        expect((screen.getByLabelText('自定义审查 Model ID') as HTMLInputElement).value).toBe('gemini-3-flash');
        vi.mocked(client.请求模型文本).mockResolvedValue(reviewOutput()); fireEvent.click(screen.getByRole('button', { name: '开始变量审查' }));
        await screen.findByText('在本次审查范围内，未发现需要修改的变量。');
        expect(vi.mocked(client.请求模型文本).mock.calls[0][0].model).toBe('gemini-3-flash');
    });
    it('独立模式供应商/密钥可编辑，刷新使用独立连接；密钥可显示隐藏', async () => {
        const rig = rigWithSettings(); await open(rig);
        fireEvent.click(screen.getByLabelText('使用独立 API'));
        fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://own.test/v1' } });
        fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'own-key' } });
        expect((screen.getByLabelText('API Key') as HTMLInputElement).type).toBe('password');
        fireEvent.click(screen.getByRole('button', { name: '显示密钥' })); expect((screen.getByLabelText('API Key') as HTMLInputElement).type).toBe('text');
        vi.mocked(models.获取OpenAI兼容模型元数据).mockResolvedValue([{ id: 'test-model', label: 'test-model' }]); fireEvent.click(screen.getByRole('button', { name: '刷新模型' }));
        await screen.findByText('审查模型列表已刷新。');
        expect(models.获取OpenAI兼容模型元数据).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'https://own.test/v1', apiKey: 'own-key' }));
    });
    it('刷新期间切换来源，旧模型列表不得污染新来源', async () => {
        const rig = rigWithSettings(); await open(rig);
        let resolve!: (v: { id: string; label: string }[]) => void;
        vi.mocked(models.获取OpenAI兼容模型元数据).mockImplementation(() => new Promise(r => { resolve = r; }));
        fireEvent.click(screen.getByRole('button', { name: '刷新模型' }));
        await waitFor(() => expect(models.获取OpenAI兼容模型元数据).toHaveBeenCalled());
        fireEvent.click(screen.getByLabelText('使用独立 API')); resolve([{ id: 'stale-model', label: 'stale-model' }]);
        await waitFor(() => expect(screen.queryByText('stale-model')).toBeNull());
    });
});
