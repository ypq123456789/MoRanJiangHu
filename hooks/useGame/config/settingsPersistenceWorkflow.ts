import type {
    世界书结构,
    世界书预设组结构,
    记忆配置结构,
    内置提示词条目结构,
    图片管理设置结构,
    场景图片档案,
    接口设置结构,
    提示词结构,
    游戏设置结构,
    节日结构,
    模型词组转化器预设结构,
    画师串预设结构,
    视觉设置结构,
    词组转化器提示词预设结构
} from '../../../types';
import * as dbService from '../../../services/dbService';
import { 按场景图上限裁剪档案 } from '../sceneImageArchiveWorkflow';
import { 规范化游戏设置 } from '../../../utils/gameSettings';
import { 规范化图片管理设置 } from '../../../utils/imageManagerSettings';
import { 设置键 } from '../../../utils/settingsSchema';
import { 规范化接口设置 } from '../../../utils/apiConfig';
import { 内置提示词存储键, 规范化内置提示词列表 } from '../../../utils/builtinPrompts';
import { 世界书存储键, 世界书预设组存储键, 规范化世界书列表, 规范化世界书预设组列表 } from '../../../utils/worldbook';
import { 规范化记忆配置 } from '../memoryUtils';

type 设置持久化工作流依赖 = {
    获取接口配置: () => 接口设置结构;
    同步接口配置: (config: 接口设置结构) => void;
    设置内置提示词列表: (entries: 内置提示词条目结构[]) => void;
    设置世界书列表: (books: 世界书结构[]) => void;
    设置世界书预设组列表: (groups: 世界书预设组结构[]) => void;
    应用视觉设置到状态: (value: Partial<视觉设置结构> | null | undefined) => void;
    应用图片管理设置到状态: (value: Partial<图片管理设置结构> | null | undefined) => void;
    获取当前场景图片档案: () => 场景图片档案;
    同步场景图片档案: (archive: 场景图片档案) => void;
    获取场景图历史上限: () => number;
    设置游戏设置: (config: 游戏设置结构) => void;
    设置记忆配置: (config: 记忆配置结构) => void;
    设置提示词池: (prompts: 提示词结构[]) => void;
    设置节日列表: (festivals: 节日结构[]) => void;
};

const 生成预设ID = (): string => `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const 合并并去重预设列表 = (existing: any[] = [], incoming: any[] = []) => {
    const merged = new Map<string, any>();
    [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])].forEach((item) => {
        if (item && item.id) {
            merged.set(item.id, item);
        }
    });
    return Array.from(merged.values());
};

const 下载JSON文件 = (payload: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
};

const 读取文件为文本 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsText(file, 'utf-8');
});

const 打开JSON文件 = async (): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) {
                reject(new Error('未选择文件'));
                return;
            }
            void 读取文件为文本(file).then(resolve).catch(reject);
        };
        input.click();
    });
};

export const 创建设置持久化工作流 = (deps: 设置持久化工作流依赖) => {
    const saveSettings = async (newConfig: 接口设置结构) => {
        const normalized = 规范化接口设置(newConfig);
        deps.同步接口配置(normalized);
        await dbService.保存设置(设置键.API配置, normalized);
    };

    const updateApiConfig = (updater: (config: 接口设置结构) => 接口设置结构) => {
        const nextConfig = updater(规范化接口设置(deps.获取接口配置()));
        return saveSettings(nextConfig);
    };

    const loadBuiltinPromptEntries = async () => {
        try {
            const savedEntries = await dbService.读取设置(内置提示词存储键);
            deps.设置内置提示词列表(规范化内置提示词列表(savedEntries));
        } catch (error) {
            console.error('读取内置提示词失败', error);
        }
    };

    const loadWorldbooks = async () => {
        try {
            const savedEntries = await dbService.读取设置(世界书存储键);
            deps.设置世界书列表(规范化世界书列表(savedEntries));
        } catch (error) {
            console.error('读取世界书列表失败', error);
        }
    };

    const loadWorldbookPresetGroups = async () => {
        try {
            const savedGroups = await dbService.读取设置(世界书预设组存储键);
            deps.设置世界书预设组列表(规范化世界书预设组列表(savedGroups));
        } catch (error) {
            console.error('读取世界书预设组失败', error);
        }
    };

    const saveBuiltinPromptEntries = async (entries: 内置提示词条目结构[]) => {
        const normalized = 规范化内置提示词列表(entries);
        deps.设置内置提示词列表(normalized);
        await dbService.保存设置(内置提示词存储键, normalized);
    };

    const saveWorldbooks = async (books: 世界书结构[]) => {
        const normalized = 规范化世界书列表(books);
        deps.设置世界书列表(normalized);
        await dbService.保存设置(世界书存储键, normalized);
    };

    const saveWorldbookPresetGroups = async (groups: 世界书预设组结构[]) => {
        const normalized = 规范化世界书预设组列表(groups);
        deps.设置世界书预设组列表(normalized);
        await dbService.保存设置(世界书预设组存储键, normalized);
    };

    const saveVisualSettings = async (newConfig: 视觉设置结构) => {
        deps.应用视觉设置到状态(newConfig);
    };

    const saveImageManagerSettings = async (newConfig: 图片管理设置结构) => {
        const normalized = 规范化图片管理设置(newConfig);
        deps.应用图片管理设置到状态(normalized);
        const { 档案: nextArchive, 删除数量 } = 按场景图上限裁剪档案(
            deps.获取当前场景图片档案() || {},
            deps.获取场景图历史上限()
        );
        deps.同步场景图片档案(nextArchive);
        await dbService.保存设置(设置键.场景图片档案, nextArchive);
        if (删除数量 > 0) {
            await dbService.清理未引用图片资源();
        }
    };

    const saveArtistPreset = async (preset: 画师串预设结构) => {
        if (!preset?.id) return;
        const finalPreset = preset.id.startsWith('new_')
            ? { ...preset, id: 生成预设ID() }
            : preset;

        await updateApiConfig((config) => {
            const feature = config.功能模型占位;
            const list = Array.isArray(feature.画师串预设列表) ? [...feature.画师串预设列表] : [];
            const existingIndex = list.findIndex((item) => item.id === finalPreset.id);

            if (existingIndex > -1) {
                list[existingIndex] = finalPreset;
            } else {
                const originalIndex = list.findIndex((item) => item.id === preset.id);
                if (originalIndex > -1) {
                    list[originalIndex] = finalPreset;
                } else {
                    list.push(finalPreset);
                }
            }
            return {
                ...config,
                功能模型占位: { ...feature, 画师串预设列表: list }
            };
        });
    };

    const deleteArtistPreset = async (presetId: string) => {
        if (!presetId) return;
        await updateApiConfig((config) => {
            const feature = config.功能模型占位;
            const list = (Array.isArray(feature.画师串预设列表) ? feature.画师串预设列表 : []).filter((item) => item.id !== presetId);
            return {
                ...config,
                功能模型占位: { ...feature, 画师串预设列表: list }
            };
        });
    };

    const saveModelConverterPreset = async (preset: 模型词组转化器预设结构) => {
        if (!preset?.id) return;
        const finalPreset = preset.id.startsWith('new_')
            ? { ...preset, id: 生成预设ID() }
            : preset;

        await updateApiConfig((config) => {
            const feature = config.功能模型占位;
            const list = Array.isArray(feature.模型词组转化器预设列表) ? [...feature.模型词组转化器预设列表] : [];
            const existingIndex = list.findIndex((item) => item.id === finalPreset.id);
            if (existingIndex > -1) {
                list[existingIndex] = finalPreset;
            } else {
                const originalIndex = list.findIndex((item) => item.id === preset.id);
                if (originalIndex > -1) {
                    list[originalIndex] = finalPreset;
                } else {
                    list.push(finalPreset);
                }
            }
            return {
                ...config,
                功能模型占位: { ...feature, 模型词组转化器预设列表: list }
            };
        });
    };

    const deleteModelConverterPreset = async (presetId: string) => {
        if (!presetId) return;
        await updateApiConfig((config) => {
            const feature = config.功能模型占位;
            const list = (Array.isArray(feature.模型词组转化器预设列表) ? feature.模型词组转化器预设列表 : []).filter((item) => item.id !== presetId);
            return {
                ...config,
                功能模型占位: { ...feature, 模型词组转化器预设列表: list }
            };
        });
    };

    const setModelConverterPresetEnabled = async (presetId: string, enabled: boolean) => {
        if (!presetId) return;
        await updateApiConfig((config) => {
            const feature = config.功能模型占位;
            const list = (Array.isArray(feature.模型词组转化器预设列表) ? feature.模型词组转化器预设列表 : []).map((item) => (
                item.id === presetId ? { ...item, 是否启用: enabled } : item
            ));
            return {
                ...config,
                功能模型占位: { ...feature, 模型词组转化器预设列表: list }
            };
        });
    };

    const savePromptConverterPreset = async (preset: 词组转化器提示词预设结构) => {
        if (!preset?.id) return;
        const finalPreset = preset.id.startsWith('new_')
            ? { ...preset, id: 生成预设ID() }
            : preset;

        await updateApiConfig((config) => {
            const feature = config.功能模型占位;
            const list = Array.isArray(feature.词组转化器提示词预设列表) ? [...feature.词组转化器提示词预设列表] : [];
            const existingIndex = list.findIndex((item) => item.id === finalPreset.id);
            if (existingIndex > -1) {
                list[existingIndex] = finalPreset;
            } else {
                const originalIndex = list.findIndex((item) => item.id === preset.id);
                if (originalIndex > -1) {
                    list[originalIndex] = finalPreset;
                } else {
                    list.push(finalPreset);
                }
            }
            return {
                ...config,
                功能模型占位: { ...feature, 词组转化器提示词预设列表: list }
            };
        });
    };

    const deletePromptConverterPreset = async (presetId: string) => {
        if (!presetId) return;
        await updateApiConfig((config) => {
            const feature = config.功能模型占位;
            const list = (Array.isArray(feature.词组转化器提示词预设列表) ? feature.词组转化器提示词预设列表 : []).filter((item) => item.id !== presetId);
            return {
                ...config,
                功能模型占位: { ...feature, 词组转化器提示词预设列表: list }
            };
        });
    };

    const exportPresets = async () => {
        const feature = 规范化接口设置(deps.获取接口配置()).功能模型占位;
        下载JSON文件({
            画师串预设列表: feature.画师串预设列表,
            模型词组转化器预设列表: feature.模型词组转化器预设列表,
            词组转化器提示词预设列表: feature.词组转化器提示词预设列表,
            角色锚点列表: feature.角色锚点列表
        }, 'wuxia-presets.json');
    };

    const importPresets = async () => {
        const content = await 打开JSON文件();
        const imported = JSON.parse(content || '{}');
        await updateApiConfig((config) => {
            const feature = config.功能模型占位;
            return {
                ...config,
                功能模型占位: {
                    ...feature,
                    画师串预设列表: 合并并去重预设列表(feature.画师串预设列表, imported.画师串预设列表),
                    模型词组转化器预设列表: 合并并去重预设列表(feature.模型词组转化器预设列表, imported.模型词组转化器预设列表),
                    词组转化器提示词预设列表: 合并并去重预设列表(feature.词组转化器提示词预设列表, imported.词组转化器提示词预设列表),
                    角色锚点列表: 合并并去重预设列表(feature.角色锚点列表, imported.角色锚点列表),
                    PNG画风预设列表: 合并并去重预设列表(feature.PNG画风预设列表, imported.PNG画风预设列表)
                }
            };
        });
    };

    const saveGameSettings = async (newConfig: 游戏设置结构) => {
        const normalized = 规范化游戏设置(newConfig);
        deps.设置游戏设置(normalized);
        await dbService.保存设置(设置键.游戏设置, normalized);
    };

    const saveMemorySettings = async (newConfig: 记忆配置结构) => {
        const normalized = 规范化记忆配置(newConfig);
        deps.设置记忆配置(normalized);
        await dbService.保存设置(设置键.记忆设置, normalized);
    };

    const updatePrompts = async (newPrompts: 提示词结构[]) => {
        deps.设置提示词池(newPrompts);
        await dbService.保存设置(设置键.提示词池, newPrompts);
    };

    const updateFestivals = async (newFestivals: 节日结构[]) => {
        deps.设置节日列表(newFestivals);
        await dbService.保存设置(设置键.节日配置, newFestivals);
    };

    return {
        loadBuiltinPromptEntries,
        loadWorldbooks,
        loadWorldbookPresetGroups,
        saveSettings,
        saveBuiltinPromptEntries,
        saveWorldbooks,
        saveWorldbookPresetGroups,
        saveVisualSettings,
        saveImageManagerSettings,
        updateApiConfig,
        saveArtistPreset,
        deleteArtistPreset,
        saveModelConverterPreset,
        deleteModelConverterPreset,
        setModelConverterPresetEnabled,
        savePromptConverterPreset,
        deletePromptConverterPreset,
        exportPresets,
        importPresets,
        saveGameSettings,
        saveMemorySettings,
        updatePrompts,
        updateFestivals
    };
};
