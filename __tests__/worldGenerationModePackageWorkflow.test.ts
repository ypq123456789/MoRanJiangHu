import { beforeEach, describe, expect, it, vi } from 'vitest';
import { 创意工坊模块列表 } from '../data/creativeWorkshopModules';
import { 执行世界生成工作流 } from '../hooks/useGame/worldGenerationWorkflow';
import * as textAIService from '../services/ai/text';
import type { WorldGenConfig, 角色数据结构 } from '../types';
import { 获取题材模式配置 } from '../utils/workshopEngine';

vi.mock('../services/ai/text', () => ({
    generateWorldFoundationData: vi.fn(async () => ({
        worldPrompt: 'AI模式包世界观',
        mapLayers: [],
        factions: [],
        rawText: '<世界观>AI模式包世界观</世界观>'
    })),
    解析世界观提示词内容: vi.fn(() => '被误用的手动世界观'),
    generateFandomRealmData: vi.fn(async () => '同人境界'),
    解析境界体系提示词内容: vi.fn((content: string) => content)
}));

vi.mock('../services/dbService', () => ({
    保存设置: vi.fn(async () => undefined)
}));

describe('worldGenerationWorkflow mode package opening', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('完整模式包新档会先调用 AI 世界观生成而不是直接校验手动世界观', async () => {
        const xianxiaPackage = 创意工坊模块列表.find((entry) => entry.id === 'mode-package-仙侠');
        expect(xianxiaPackage?.preset).toBeTruthy();
        const worldConfig = xianxiaPackage!.preset!.worldConfig as WorldGenConfig;
        expect(worldConfig.manualWorldPrompt).toBe('');
        const openingConfig = JSON.parse(JSON.stringify(xianxiaPackage!.preset!.openingConfig));
        openingConfig.modeRuntimeProfile.identity.modeId = 'custom-world-generation-test';
        openingConfig.modeRuntimeProfile.identity.displayName = '世界观约束测试模式';
        openingConfig.modeRuntimeProfile.economy.exchangeRules = '三层货币：铜钱、银子、金元宝。';
        openingConfig.modeRuntimeProfile.economy.currencySystem = {
            id: 'credits',
            name: '信用点体系',
            baseUnitId: 'credit',
            units: [{ id: 'credit', name: '信用点', symbol: 'CR', aliases: [], baseRate: 1, order: 0 }]
        };
        openingConfig.runtimeSnapshot = {
            ...(openingConfig.runtimeSnapshot || {}),
            mainStoryDirection: '围绕市井生活和个人成长展开',
            hiddenPlotPolicy: '只保留轻量人情误会和可回收伏笔'
        };

        const history: any[] = [];
        const 设置历史记录 = vi.fn((value: any) => {
            if (typeof value === 'function') {
                history.splice(0, history.length, ...value(history));
            } else {
                history.splice(0, history.length, ...value);
            }
        });
        const setPrompts = vi.fn();
        const 追加系统消息 = vi.fn();
        const deps = {
            apiConfig: {
                activeConfigId: 'main',
                configs: [{
                    id: 'main',
                    名称: '测试接口',
                    供应商: 'openai_compatible',
                    协议覆盖: 'openai',
                    baseUrl: 'https://example.test/v1',
                    apiKey: 'test-key',
                    model: 'test-model',
                    maxTokens: 1200,
                    temperature: 0.2
                }],
                功能模型占位: {
                    主剧情使用模型: 'test-model'
                }
            },
            gameConfig: { 启用修炼体系: true },
            prompts: [{
                id: 'core_world',
                标题: '世界观',
                内容: '旧世界观',
                类型: '世界观',
                启用: true
            }],
            view: 'new_game',
            setView: vi.fn(),
            setPrompts,
            setLoading: vi.fn(),
            setShowSettings: vi.fn(),
            设置历史记录,
            设置开局配置: vi.fn(),
            设置最近开局配置: vi.fn(),
            清空重Roll快照: vi.fn(),
            重置自动存档状态: vi.fn(),
            创建开场基础状态: vi.fn(() => ({ 世界: {}, 角色: {}, 环境: {} })),
            构建前端清空开场状态: vi.fn((base: any) => base),
            应用开场基态: vi.fn(),
            创建开场命令基态: vi.fn(() => ({})),
            执行开场剧情生成: vi.fn(async () => undefined),
            追加系统消息,
            替换流式草稿为失败提示: vi.fn((currentHistory: any[]) => currentHistory)
        };

        await 执行世界生成工作流(
            worldConfig,
            {
                姓名: '测试修士',
                性别: '男',
                年龄: 18,
                出生日期: '一月初一',
                外貌: '青衫干净',
                性格: '谨慎',
                境界: '炼气一层',
                力量: 5,
                敏捷: 5,
                体质: 5,
                根骨: 5,
                悟性: 5,
                福源: 5,
                天赋列表: [{ 名称: '灵觉敏锐', 描述: '感知敏锐', 效果: '提升感知' }],
                出身背景: { 名称: '散修遗孤', 描述: '独自修行', 效果: '熟悉底层修行' }
            } as 角色数据结构,
            openingConfig,
            'step',
            false,
            '',
            undefined,
            deps as any
        );

        expect(textAIService.generateWorldFoundationData).toHaveBeenCalledTimes(1);
        const worldGenerationCall = vi.mocked(textAIService.generateWorldFoundationData).mock.calls[0];
        expect(worldGenerationCall[0]).toContain('本世界仅使用“信用点”');
        expect(worldGenerationCall[0]).not.toContain('铜钱、银子、金元宝');
        expect(worldGenerationCall[4]).toContain('【模式包世界观生成约束】');
        expect(worldGenerationCall[4]).toContain('市井生活和个人成长');
        expect(worldGenerationCall[4]).toContain('轻量人情误会');
        expect(worldGenerationCall[4]).toContain('不得点名幕后黑手');
        expect(textAIService.解析世界观提示词内容).not.toHaveBeenCalled();
        expect(setPrompts).toHaveBeenLastCalledWith(expect.arrayContaining([
            expect.objectContaining({ id: 'core_world', 内容: 'AI模式包世界观' })
        ]));
        expect(追加系统消息).toHaveBeenCalledWith(expect.stringContaining('世界观与境界体系提示词已写入'));
    });

    it('旧版安装包残留的官方题材口径不会被当成完整手动世界观', async () => {
        const xianxiaPackage = 创意工坊模块列表.find((entry) => entry.id === 'mode-package-仙侠');
        expect(xianxiaPackage?.preset).toBeTruthy();
        const worldConfig = {
            ...xianxiaPackage!.preset!.worldConfig,
            manualWorldPrompt: 获取题材模式配置('武侠').promptLines.join('\n')
        } as WorldGenConfig;

        const setPrompts = vi.fn();
        const deps = {
            apiConfig: {
                activeConfigId: 'main',
                configs: [{
                    id: 'main',
                    名称: '测试接口',
                    供应商: 'openai_compatible',
                    协议覆盖: 'openai',
                    baseUrl: 'https://example.test/v1',
                    apiKey: 'test-key',
                    model: 'test-model',
                    maxTokens: 1200,
                    temperature: 0.2
                }],
                功能模型占位: {
                    主剧情使用模型: 'test-model'
                }
            },
            gameConfig: { 启用修炼体系: true },
            prompts: [{
                id: 'core_world',
                标题: '世界观',
                内容: '旧世界观',
                类型: '世界观',
                启用: true
            }],
            view: 'new_game',
            setView: vi.fn(),
            setPrompts,
            setLoading: vi.fn(),
            setShowSettings: vi.fn(),
            设置历史记录: vi.fn(),
            设置开局配置: vi.fn(),
            设置最近开局配置: vi.fn(),
            清空重Roll快照: vi.fn(),
            重置自动存档状态: vi.fn(),
            创建开场基础状态: vi.fn(() => ({ 世界: {}, 角色: {}, 环境: {} })),
            构建前端清空开场状态: vi.fn((base: any) => base),
            应用开场基态: vi.fn(),
            创建开场命令基态: vi.fn(() => ({})),
            执行开场剧情生成: vi.fn(async () => undefined),
            追加系统消息: vi.fn(),
            替换流式草稿为失败提示: vi.fn((currentHistory: any[]) => currentHistory)
        };

        await 执行世界生成工作流(
            worldConfig,
            {
                姓名: '测试修士',
                性别: '男',
                年龄: 18,
                出生日期: '一月初一',
                外貌: '青衫干净',
                性格: '谨慎',
                境界: '炼气一层',
                力量: 5,
                敏捷: 5,
                体质: 5,
                根骨: 5,
                悟性: 5,
                福源: 5,
                天赋列表: [{ 名称: '灵觉敏锐', 描述: '感知敏锐', 效果: '提升感知' }],
                出身背景: { 名称: '散修遗孤', 描述: '独自修行', 效果: '熟悉底层修行' }
            } as 角色数据结构,
            xianxiaPackage!.preset!.openingConfig,
            'step',
            false,
            '',
            undefined,
            deps as any
        );

        expect(textAIService.generateWorldFoundationData).toHaveBeenCalledTimes(1);
        expect(textAIService.解析世界观提示词内容).not.toHaveBeenCalled();
        expect(setPrompts).toHaveBeenLastCalledWith(expect.arrayContaining([
            expect.objectContaining({ id: 'core_world', 内容: 'AI模式包世界观' })
        ]));
    });

    it('流式世界观生成被上游中断时降级为真正的非流式重试（不再传 stream: true）', async () => {
        const xianxiaPackage = 创意工坊模块列表.find((entry) => entry.id === 'mode-package-仙侠');
        const worldConfig = xianxiaPackage!.preset!.worldConfig as WorldGenConfig;
        const history: any[] = [];
        const 设置历史记录 = vi.fn((value: any) => {
            if (typeof value === 'function') {
                history.splice(0, history.length, ...value(history));
            } else {
                history.splice(0, history.length, ...value);
            }
        });
        const setPrompts = vi.fn();

        vi.mocked(textAIService.generateWorldFoundationData)
            .mockImplementationOnce(async (_ctx, _char, _api, streamOptions) => {
                streamOptions?.onDelta?.('', '');
                streamOptions?.onDelta?.('<世界观>半截', '<世界观>半截');
                streamOptions?.onStreamEnd?.({ sawDone: false, accumulatedLength: 9 });
                return { worldPrompt: '半截世界观', mapLayers: [], factions: [], rawText: '<世界观>半截' };
            })
            .mockImplementationOnce(async () => ({
                worldPrompt: '非流式完整世界观',
                mapLayers: [],
                factions: [],
                rawText: '<世界观>非流式完整世界观</世界观>'
            }));

        const deps = {
            apiConfig: {
                activeConfigId: 'main',
                configs: [{
                    id: 'main',
                    名称: '测试接口',
                    供应商: 'openai_compatible',
                    协议覆盖: 'openai',
                    baseUrl: 'https://example.test/v1',
                    apiKey: 'test-key',
                    model: 'test-model',
                    maxTokens: 1200,
                    temperature: 0.2
                }],
                功能模型占位: {
                    主剧情使用模型: 'test-model'
                }
            },
            gameConfig: { 启用修炼体系: false },
            prompts: [{
                id: 'core_world',
                标题: '世界观',
                内容: '旧世界观',
                类型: '世界观',
                启用: true
            }],
            view: 'new_game',
            setView: vi.fn(),
            setPrompts,
            setLoading: vi.fn(),
            setShowSettings: vi.fn(),
            设置历史记录,
            设置开局配置: vi.fn(),
            设置最近开局配置: vi.fn(),
            清空重Roll快照: vi.fn(),
            重置自动存档状态: vi.fn(),
            创建开场基础状态: vi.fn(() => ({ 世界: {}, 角色: {}, 环境: {} })),
            构建前端清空开场状态: vi.fn((base: any) => base),
            应用开场基态: vi.fn(),
            创建开场命令基态: vi.fn(() => ({})),
            执行开场剧情生成: vi.fn(async () => undefined),
            追加系统消息: vi.fn(),
            替换流式草稿为失败提示: vi.fn((currentHistory: any[]) => currentHistory)
        };

        await 执行世界生成工作流(
            worldConfig,
            {
                姓名: '测试修士',
                性别: '男',
                年龄: 18,
                出生日期: '一月初一',
                外貌: '青衫干净',
                性格: '谨慎',
                境界: '凡人',
                力量: 5,
                敏捷: 5,
                体质: 5,
                根骨: 5,
                悟性: 5,
                福源: 5,
                天赋列表: [],
                出身背景: { 名称: '平民', 描述: '普通出身', 效果: '无' }
            } as 角色数据结构,
            xianxiaPackage!.preset!.openingConfig,
            'step',
            true,
            '',
            undefined,
            deps as any
        );

        expect(textAIService.generateWorldFoundationData).toHaveBeenCalledTimes(2);
        const firstStreamOptions = vi.mocked(textAIService.generateWorldFoundationData).mock.calls[0][3];
        const secondStreamOptions = vi.mocked(textAIService.generateWorldFoundationData).mock.calls[1][3];
        expect(firstStreamOptions).toMatchObject({ stream: true });
        expect(secondStreamOptions).toBeUndefined();
        expect(setPrompts).toHaveBeenLastCalledWith(expect.arrayContaining([
            expect.objectContaining({ id: 'core_world', 内容: '非流式完整世界观' })
        ]));
    });
});
