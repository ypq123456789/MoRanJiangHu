// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WorkflowGraphSettings from '../components/features/Settings/WorkflowGraphSettings';
import { 创建接口配置模板, 规范化接口设置 } from '../utils/apiConfig';
import type { 接口设置结构 } from '../types';

const 构建设置 = () => 规范化接口设置({
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
            id: 'old-channel',
            名称: '旧渠道',
            baseUrl: 'https://old.example.test/v1',
            apiKey: 'old-key',
            model: 'old-model'
        }
    ],
    功能模型占位: {
        剧情回忆独立模型开关: true,
        剧情回忆渠道ID: 'old-channel',
        剧情回忆使用模型: 'old-model',
        剧情回忆API地址: 'https://old-manual.test/v1',
        剧情回忆API密钥: 'old-manual-key',
        文章优化独立模型开关: true,
        变量计算独立模型开关: true
    }
});

describe('生成流程图一键套用主剧情模型按钮', () => {
    afterEach(() => cleanup());

    it('点击后把各阶段渠道与模型写成主剧情并立即保存', () => {
        const onSave = vi.fn();
        render(<WorkflowGraphSettings settings={构建设置()} onSave={onSave} />);

        fireEvent.click(screen.getByRole('button', { name: '一键套用主剧情模型' }));

        expect(onSave).toHaveBeenCalledTimes(1);
        const 保存的设置 = onSave.mock.calls[0][0] as 接口设置结构;
        expect(保存的设置.功能模型占位.剧情回忆渠道ID).toBe('main-channel');
        expect(保存的设置.功能模型占位.剧情回忆使用模型).toBe('main-model');
        expect(保存的设置.功能模型占位.剧情回忆API地址).toBe('');
        expect(保存的设置.功能模型占位.剧情回忆API密钥).toBe('');
        expect(保存的设置.功能模型占位.变量计算渠道ID).toBe('main-channel');
        expect(screen.getByText(/已把 9 个阶段改为「主剧情渠道 · main-model」/)).toBeTruthy();
    });

    it('套用不会改动阶段开关', () => {
        const onSave = vi.fn();
        render(<WorkflowGraphSettings settings={构建设置()} onSave={onSave} />);

        fireEvent.click(screen.getByRole('button', { name: '一键套用主剧情模型' }));

        const 保存的设置 = onSave.mock.calls[0][0] as 接口设置结构;
        expect(保存的设置.功能模型占位.剧情回忆独立模型开关).toBe(true);
        expect(保存的设置.功能模型占位.文章优化独立模型开关).toBe(true);
        expect(保存的设置.功能模型占位.记忆总结独立模型开关).toBe(false);
    });
});
