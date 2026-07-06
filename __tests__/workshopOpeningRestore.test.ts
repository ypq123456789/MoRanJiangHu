import { describe, expect, it } from 'vitest';
import { 构建开局预设摘要列表, 获取快速重开运行时恢复参数, 构建预设直开恢复结果 } from '../utils/customNewGamePresets';
import { 创意工坊模块列表 } from '../data/creativeWorkshopModules';

describe('workshop opening restore helpers', () => {
    it('开局预设摘要列表只读取列表展示字段，不触碰大字段', () => {
        const rawPreset: any = {
            id: 'lazy-preset',
            名称: '轻量方案',
            简介: '只用于列表展示',
            character: {
                姓名: '迟砚',
                性别: '男',
                背景名称: '宗门旧徒'
            }
        };
        Object.defineProperty(rawPreset, 'openingConfig', {
            get() {
                throw new Error('列表摘要不应读取 openingConfig');
            }
        });
        Object.defineProperty(rawPreset, 'worldConfig', {
            get() {
                throw new Error('列表摘要不应读取 worldConfig');
            }
        });

        const summaries = 构建开局预设摘要列表([rawPreset]);

        expect(summaries).toEqual([
            {
                id: 'lazy-preset',
                名称: '轻量方案',
                简介: '只用于列表展示',
                character: {
                    姓名: '迟砚',
                    性别: '男',
                    背景名称: '宗门旧徒'
                }
            }
        ]);
    });

    it('快速重开优先使用 runtimeSnapshot 中的恢复字段', () => {
        const restored = 获取快速重开运行时恢复参数({
            openingConfig: {
                题材模式: '武侠',
                初始关系模板: '随机邂逅',
                关系侧重: ['友情'],
                开局切入偏好: '市井起手',
                开局生成门派: true,
                开局生成同门: true,
                同人融合: {
                    enabled: false,
                    作品名: '',
                    来源类型: '小说',
                    融合强度: '轻度映射',
                    保留原著角色: false,
                    启用角色替换: false,
                    替换目标角色名: '',
                    附加替换角色名列表: [],
                    附加角色替换规则列表: [],
                    启用附加小说: false,
                    附加小说数据集ID: ''
                },
                runtimeSnapshot: {
                    openingStreaming: false,
                    openingExtraPrompt: '来自快照的额外提示',
                    openingExtraRequirement: '来自快照的额外要求',
                    activeModuleExtraRules: '来自快照的模块规则'
                }
            },
            openingStreaming: true,
            openingExtraPrompt: '旧表层提示'
        });

        expect(restored.openingStreaming).toBe(false);
        expect(restored.openingExtraPrompt).toBe('来自快照的额外提示');
        expect(restored.openingExtraRequirement).toBe('来自快照的额外要求');
        expect(restored.activeModuleExtraRules).toBe('来自快照的模块规则');
    });

    it('预设直开恢复结果会过滤失效模块并保留有效运行时字段', () => {
        const restored = 构建预设直开恢复结果({
            id: 'direct-open-restore',
            名称: '直开恢复',
            简介: '测试直开恢复结果',
            worldConfig: {
                worldName: '测试世界',
                worldSize: '九州宏大',
                dynastySetting: '测试王朝',
                sectDensity: '适中',
                tianjiaoSetting: '测试天骄',
                difficulty: 'normal',
                worldExtraRequirement: '',
                manualWorldPrompt: '',
                manualRealmPrompt: ''
            },
            character: {
                姓名: '测试角色',
                性别: '男',
                年龄: 18,
                出生月: 1,
                出生日: 1,
                外貌: '普通',
                性格: '谨慎',
                属性: { 力量: 5, 敏捷: 5, 体质: 5, 根骨: 5, 悟性: 5, 福源: 5 },
                背景名称: '宗门旧徒',
                天赋名称列表: ['稳扎稳打']
            },
            openingConfig: {
                题材模式: '武侠',
                初始关系模板: '随机邂逅',
                关系侧重: ['友情'],
                开局切入偏好: '市井起手',
                开局生成门派: true,
                开局生成同门: true,
                同人融合: {
                    enabled: false,
                    作品名: '',
                    来源类型: '小说',
                    融合强度: '轻度映射',
                    保留原著角色: false,
                    启用角色替换: false,
                    替换目标角色名: '',
                    附加替换角色名列表: [],
                    附加角色替换规则列表: [],
                    启用附加小说: false,
                    附加小说数据集ID: ''
                },
                runtimeSnapshot: {
                    openingStreaming: false,
                    openingExtraRequirement: '来自快照的额外要求',
                    activeModuleExtraRules: '来自快照的模块规则',
                    modeWorldbooks: [{
                        id: 'topic-book',
                        标题: '题材口径',
                        描述: '题材说明',
                        常驻大纲: '',
                        启用: true,
                        内置: false,
                        条目: [],
                        创建时间: 0,
                        更新时间: 0
                    }],
                    workshopSelection: {
                        selectedMode: '武侠',
                        selectedModules: {
                            topic: 'builtin:topic-wuxia',
                            ability: 'missing:ability',
                            world_rules: 'builtin:world-rules-wuxia'
                        }
                    }
                }
            },
            openingStreaming: true,
            openingExtraRequirement: '旧值'
        }, {
            validModuleKeys: new Set(['builtin:topic-wuxia', 'builtin:world-rules-wuxia'])
        });

        expect(restored.openingStreaming).toBe(false);
        expect(restored.openingExtraRequirement).toBe('来自快照的额外要求');
        expect(restored.activeModuleExtraRules).toBe('来自快照的模块规则');
        expect(restored.modeWorldbooks?.map((item) => item.id)).toEqual(['topic-book']);
        expect(restored.workshopSelection).toEqual({
            selectedMode: '武侠',
            selectedModules: {
                topic: 'builtin:topic-wuxia',
                world_rules: 'builtin:world-rules-wuxia'
            }
        });
    });

    it('快速重开和预设直开会静默校准运行时派生状态且不重复污染文本字段', () => {
        const wuxiaTopic = 创意工坊模块列表.find((entry) => entry.source === 'builtin' && entry.id === 'mode-package-武侠');
        expect(wuxiaTopic).toBeTruthy();
        const openingConfig = {
            题材模式: '武侠' as const,
            初始关系模板: '随机邂逅' as const,
            关系侧重: ['友情'] as const,
            开局切入偏好: '市井起手' as const,
            开局生成门派: true,
            开局生成同门: true,
            modeRuntimeProfile: {
                ...(wuxiaTopic!.modeRuntimeProfile as any),
                identity: {
                    ...(wuxiaTopic!.modeRuntimeProfile as any).identity,
                    displayName: '旧显示名'
                }
            },
            同人融合: {
                enabled: false,
                作品名: '',
                来源类型: '小说' as const,
                融合强度: '轻度映射' as const,
                保留原著角色: false,
                启用角色替换: false,
                替换目标角色名: '',
                附加替换角色名列表: [],
                附加角色替换规则列表: [],
                启用附加小说: false,
                附加小说数据集ID: ''
            },
            runtimeSnapshot: {
                openingStreaming: false,
                openingExtraRequirement: '来自快照的额外要求',
                activeModuleExtraRules: '旧模块规则',
                modeWorldbooks: [{
                    id: 'stale-book',
                    标题: '过期世界书',
                    描述: '过期说明',
                    常驻大纲: '',
                    启用: true,
                    内置: false,
                    条目: [],
                    创建时间: 0,
                    更新时间: 0
                }],
                modeBackgrounds: [
                    { 名称: '过期背景', 描述: '过期描述', 效果: '过期效果' }
                ],
                modeTalents: [
                    { 名称: '过期天赋', 描述: '过期描述', 效果: '过期效果' }
                ],
                workshopSelection: {
                    selectedMode: '武侠',
                    selectedModules: {
                        topic: 'builtin:mode-package-武侠'
                    }
                }
            }
        };

        const runtimeRestored = 获取快速重开运行时恢复参数({
            openingConfig,
            openingStreaming: true,
            openingExtraPrompt: '旧表层提示',
            openingExtraRequirement: '旧额外要求',
            activeModuleExtraRules: '旧模块规则',
            validModuleKeys: new Set(['builtin:mode-package-武侠'])
        });

        expect(runtimeRestored.activeModuleExtraRules).not.toBe('旧模块规则');
        expect(runtimeRestored.modeWorldbooks?.map((item) => item.id)).toEqual(wuxiaTopic!.modeWorldbooks?.map((item) => item.id));
        expect(runtimeRestored.modeRuntimeProfile?.identity.displayName).toBe(wuxiaTopic!.modeRuntimeProfile?.identity.displayName);

        const directOpenRestored = 构建预设直开恢复结果({
            id: 'direct-open-controlled-replay',
            名称: '直开静默校准',
            简介: '测试直开静默校准',
            worldConfig: {
                worldName: '测试世界',
                worldSize: '九州宏大',
                dynastySetting: '测试王朝',
                sectDensity: '适中',
                tianjiaoSetting: '测试天骄',
                difficulty: 'normal',
                worldExtraRequirement: '世界要求原文',
                manualWorldPrompt: '世界提示原文',
                manualRealmPrompt: '境界提示原文'
            },
            character: {
                姓名: '测试角色',
                性别: '男',
                年龄: 18,
                出生月: 1,
                出生日: 1,
                外貌: '普通',
                性格: '谨慎',
                属性: { 力量: 5, 敏捷: 5, 体质: 5, 根骨: 5, 悟性: 5, 福源: 5 },
                背景名称: '宗门旧徒',
                天赋名称列表: ['稳扎稳打']
            },
            openingConfig,
            openingStreaming: true,
            openingExtraRequirement: '旧值'
        }, {
            validModuleKeys: new Set(['builtin:mode-package-武侠'])
        });

        expect(directOpenRestored.worldConfig.worldExtraRequirement).toBe('世界要求原文');
        expect(directOpenRestored.worldConfig.manualWorldPrompt).toBe('世界提示原文');
        expect(directOpenRestored.worldConfig.manualRealmPrompt).toBe('境界提示原文');
        expect(directOpenRestored.activeModuleExtraRules).not.toBe('旧模块规则');
        expect(directOpenRestored.modeWorldbooks?.map((item) => item.id)).toEqual(wuxiaTopic!.modeWorldbooks?.map((item) => item.id));
        expect(directOpenRestored.openingConfig?.modeRuntimeProfile?.identity.displayName).toBe(wuxiaTopic!.modeRuntimeProfile?.identity.displayName);
    });

    it('预设直开兼容真实 UI 包装参数并保留预设世界观字段', () => {
        const restored = 构建预设直开恢复结果({
            preset: {
                id: 'direct-open-ui-shape',
                名称: 'UI 包装调用',
                简介: '复现 UI 曾传入的包装对象形状',
                worldConfig: {
                    worldName: '预设世界',
                    worldSize: '无尽位面',
                    dynastySetting: '预设王朝',
                    sectDensity: '稀少',
                    tianjiaoSetting: '预设天骄',
                    difficulty: 'hard',
                    worldExtraRequirement: '预设世界观草稿',
                    manualWorldPrompt: '<世界观>预设手动世界观</世界观>',
                    manualRealmPrompt: '<境界体系>预设境界</境界体系>'
                },
                character: {
                    姓名: '测试角色',
                    性别: '女',
                    年龄: 21,
                    出生月: 2,
                    出生日: 3,
                    外貌: '清冷',
                    性格: '谨慎',
                    属性: { 力量: 5, 敏捷: 6, 体质: 5, 根骨: 6, 悟性: 7, 福源: 5 },
                    背景名称: '预设身份',
                    天赋名称列表: ['预设天赋']
                },
                openingConfig: {
                    题材模式: '武侠',
                    初始关系模板: '随机邂逅',
                    关系侧重: ['友情'],
                    开局切入偏好: '市井起手',
                    开局生成门派: true,
                    开局生成同门: true,
                    同人融合: {
                        enabled: false,
                        作品名: '',
                        来源类型: '小说',
                        融合强度: '轻度映射',
                        保留原著角色: false,
                        启用角色替换: false,
                        替换目标角色名: '',
                        附加替换角色名列表: [],
                        附加角色替换规则列表: [],
                        启用附加小说: false,
                        附加小说数据集ID: ''
                    }
                },
                openingStreaming: true,
                openingExtraRequirement: '预设开局额外要求'
            },
            fallbackBackgrounds: [
                { 名称: '预设身份', 描述: '来自预设身份池', 效果: '获得预设身份效果' }
            ],
            fallbackTalents: [
                { 名称: '预设天赋', 描述: '来自预设天赋池', 效果: '获得预设天赋效果' }
            ]
        });

        expect(restored.worldConfig.worldName).toBe('预设世界');
        expect(restored.worldConfig.worldExtraRequirement).toBe('预设世界观草稿');
        expect(restored.worldConfig.manualWorldPrompt).toContain('预设手动世界观');
        expect(restored.worldConfig.manualRealmPrompt).toContain('预设境界');
        expect(restored.selectedBackground?.名称).toBe('预设身份');
        expect(restored.selectedTalents.map((item) => item.名称)).toEqual(['预设天赋']);
    });

    it('预设直开按预设题材恢复背景天赋，不被当前页面兜底池串成武侠出身', () => {
        const restored = 构建预设直开恢复结果({
            id: 'direct-open-infinite-mode-with-wuxia-fallback',
            名称: '无限流直开恢复',
            简介: '复现当前页面仍是武侠池时，无限流预设不应恢复成名门之后',
            worldConfig: {
                worldName: '主神空间',
                worldSize: '无尽位面',
                dynastySetting: '',
                sectDensity: '稀少',
                tianjiaoSetting: '',
                difficulty: 'normal',
                worldExtraRequirement: '',
                manualWorldPrompt: '',
                manualRealmPrompt: ''
            },
            character: {
                姓名: '周砚',
                性别: '男',
                年龄: 24,
                出生月: 1,
                出生日: 1,
                外貌: '普通',
                性格: '谨慎',
                属性: { 力量: 5, 敏捷: 5, 体质: 5, 根骨: 5, 悟性: 5, 福源: 5 },
                背景名称: '恐怖片影迷',
                天赋名称列表: ['情报记忆', '恐惧抗性']
            },
            openingConfig: {
                题材模式: '无限流',
                初始关系模板: '随机邂逅',
                关系侧重: ['友情'],
                开局切入偏好: '市井起手',
                开局生成门派: true,
                开局生成同门: true,
                同人融合: {
                    enabled: false,
                    作品名: '',
                    来源类型: '小说',
                    融合强度: '轻度映射',
                    保留原著角色: false,
                    启用角色替换: false,
                    替换目标角色名: '',
                    附加替换角色名列表: [],
                    附加角色替换规则列表: [],
                    启用附加小说: false,
                    附加小说数据集ID: ''
                }
            },
            openingStreaming: true,
            openingExtraRequirement: ''
        }, {
            fallbackBackgrounds: [
                { 名称: '名门之后', 描述: '武林世家出身，血缘、家学与旧交会在很长时间里持续影响你的道路。', 效果: '武侠兜底身份' }
            ],
            fallbackTalents: [
                { 名称: '天生剑骨', 描述: '武侠兜底天赋', 效果: '武侠兜底效果' }
            ]
        });

        expect(restored.openingConfig?.题材模式).toBe('无限流');
        expect(restored.selectedBackground?.名称).toBe('恐怖片影迷');
        expect(restored.selectedBackground?.描述).not.toContain('武林世家出身');
        expect(restored.selectedTalents.map((item) => item.名称)).toEqual(['情报记忆', '恐惧抗性']);
    });
});
