import type { PNG画风预设结构, 接口设置结构, 角色锚点结构 } from '../../types';
import { 获取主剧情接口配置, 获取生图词组转化器接口配置, 接口配置是否可用, 规范化接口设置 } from '../../utils/apiConfig';
import { 提取NPC生图基础数据, 提取主角生图基础数据 } from './npcContext';

type 右下角提示参数 = {
    title: string;
    message: string;
    tone?: 'info' | 'success' | 'error';
};

type 图片预设工作流依赖 = {
    获取接口配置: () => 接口设置结构;
    更新接口配置: (updater: (config: 接口设置结构) => 接口设置结构) => Promise<unknown> | unknown;
    加载图片AI服务: () => Promise<any>;
    推送右下角提示: (toast: 右下角提示参数) => void;
    保存图片资源: (dataUrl: string) => Promise<string>;
    获取社交列表: () => any[];
    获取角色?: () => any;
    isCultivationSystemEnabled?: () => boolean;
};

const 生成PNG画风预设ID = (): string => `png_preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const 生成PNG画风关联画师串预设ID = (presetId: string): string => `png_artist_${presetId}`;
const 是否PNG关联画师串预设 = (presetId: string | null | undefined): boolean => (
    typeof presetId === 'string' && presetId.trim().startsWith('png_artist_')
);
const 生成角色锚点ID = (): string => `character_anchor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
export const 主角角色锚点标识 = '__player__';

const 读取文件为DataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
});

const 读取文件为文本 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsText(file, 'utf-8');
});

const 下载JSON文件 = (payload: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

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

export const 提取NPC生图基础数据附带私密描述 = (
    npc: any,
    options?: { cultivationSystemEnabled?: boolean }
) => {
    const baseData = 提取NPC生图基础数据(npc, options);
    const gender = typeof npc?.性别 === 'string' ? npc.性别.trim() : '';
    const isMajor = npc?.是否主要角色 === true;
    if (gender !== '女' || !isMajor) return baseData;
    const 读取描述 = (key: string): string => (
        typeof npc?.[key] === 'string' ? npc[key].trim() : ''
    );
    const chest = 读取描述('胸部描述');
    const vulva = 读取描述('小穴描述');
    const anus = 读取描述('屁穴描述');
    if (!chest && !vulva && !anus) return baseData;
    return {
        ...baseData,
        ...(chest ? { 胸部描述: chest } : {}),
        ...(vulva ? { 小穴描述: vulva } : {}),
        ...(anus ? { 屁穴描述: anus } : {})
    };
};

export const 创建图片预设工作流 = (deps: 图片预设工作流依赖) => {
    const 读取PNG画风预设 = (presetId?: string, scope: 'npc' | 'scene' = 'npc'): PNG画风预设结构 | null => {
        const feature = 规范化接口设置(deps.获取接口配置()).功能模型占位;
        const list = Array.isArray(feature.PNG画风预设列表) ? feature.PNG画风预设列表 : [];
        if (presetId) {
            return list.find(item => item.id === presetId) || null;
        }
        const currentId = (
            scope === 'scene'
                ? (feature.当前场景PNG画风预设ID || feature.当前PNG画风预设ID || '')
                : (feature.当前NPCPNG画风预设ID || feature.当前PNG画风预设ID || '')
        ).trim();
        return list.find(item => item.id === currentId) || list[0] || null;
    };

    const 获取当前PNG画风预设摘要 = (presetId?: string, scope: 'npc' | 'scene' = 'npc'): PNG画风预设结构 | null => {
        const preset = 读取PNG画风预设(presetId, scope);
        if (!preset) return null;
        const 原始正面提示词 = (preset.原始正面提示词 || '').trim();
        const 剥离后正面提示词 = (preset.剥离后正面提示词 || '').trim();
        const AI提炼正面提示词 = (preset.AI提炼正面提示词 || '').trim();
        const 正面提示词 = (preset.正面提示词 || '').trim();
        const 负面提示词 = (preset.负面提示词 || '').trim();
        const 画师串 = (preset.画师串 || '').trim();
        const 参数 = preset.参数;
        if (!原始正面提示词 && !剥离后正面提示词 && !AI提炼正面提示词 && !正面提示词 && !负面提示词 && !画师串 && !参数) return null;
        return {
            ...preset,
            原始正面提示词,
            剥离后正面提示词,
            AI提炼正面提示词,
            正面提示词,
            负面提示词,
            画师串
        };
    };

    const 保存PNG画风预设 = async (
        preset: PNG画风预设结构,
        options?: { 设为当前?: boolean }
    ): Promise<PNG画风预设结构 | null> => {
        if (!preset) return null;
        const now = Date.now();
        const 原始正面提示词 = (preset.原始正面提示词 || '').trim();
        const 剥离后正面提示词 = (preset.剥离后正面提示词 || '').trim();
        const AI提炼正面提示词 = (preset.AI提炼正面提示词 || '').trim();
        const 有效正面提示词 = (preset.正面提示词 || AI提炼正面提示词 || 剥离后正面提示词).trim();
        const imageAIService = await deps.加载图片AI服务();
        const finalPreset: PNG画风预设结构 = {
            id: preset.id && preset.id.trim() ? preset.id : 生成PNG画风预设ID(),
            名称: (preset.名称 || '').trim() || '未命名PNG画风',
            来源: preset.来源 || 'unknown',
            原始正面提示词,
            剥离后正面提示词,
            AI提炼正面提示词,
            正面提示词: 有效正面提示词,
            负面提示词: preset.负面提示词 || '',
            画师串: (preset.画师串 || '').trim(),
            画师命中项: Array.isArray(preset.画师命中项) ? preset.画师命中项.map(item => String(item).trim()).filter(Boolean) : [],
            优先复刻原参数: preset.优先复刻原参数 === true,
            参数: imageAIService.净化PNG复刻参数(preset.参数),
            封面: preset.封面,
            原始元数据: preset.原始元数据,
            元数据标签: preset.元数据标签,
            createdAt: Number.isFinite(preset.createdAt) ? preset.createdAt : now,
            updatedAt: now
        };

        await deps.更新接口配置(config => {
            const feature = config.功能模型占位;
            const list = Array.isArray(feature.PNG画风预设列表) ? [...feature.PNG画风预设列表] : [];
            const index = list.findIndex(p => p.id === finalPreset.id);
            if (index >= 0) {
                list[index] = finalPreset;
            } else {
                list.unshift(finalPreset);
            }
            const artistPresetId = 生成PNG画风关联画师串预设ID(finalPreset.id);
            const artistPresets = (Array.isArray(feature.画师串预设列表) ? feature.画师串预设列表 : []).filter(
                (presetItem) => presetItem?.id !== artistPresetId
            );
            return {
                ...config,
                功能模型占位: {
                    ...feature,
                    PNG画风预设列表: list,
                    画师串预设列表: artistPresets,
                    当前PNG画风预设ID: options?.设为当前 ? finalPreset.id : feature.当前PNG画风预设ID,
                    当前NPCPNG画风预设ID: options?.设为当前 && !feature.当前NPCPNG画风预设ID ? finalPreset.id : feature.当前NPCPNG画风预设ID,
                    当前场景PNG画风预设ID: options?.设为当前 && !feature.当前场景PNG画风预设ID ? finalPreset.id : feature.当前场景PNG画风预设ID,
                    当前NPC画师串预设ID: feature.当前NPC画师串预设ID === artistPresetId ? '' : feature.当前NPC画师串预设ID,
                    当前场景画师串预设ID: feature.当前场景画师串预设ID === artistPresetId ? '' : feature.当前场景画师串预设ID
                }
            };
        });
        return finalPreset;
    };

    const 删除PNG画风预设 = async (presetId: string) => {
        if (!presetId) return;
        await deps.更新接口配置(config => {
            const feature = config.功能模型占位;
            const list = (Array.isArray(feature.PNG画风预设列表) ? feature.PNG画风预设列表 : []).filter(p => p.id !== presetId);
            const artistPresets = (Array.isArray(feature.画师串预设列表) ? feature.画师串预设列表 : []).filter(
                (preset) => preset.id !== 生成PNG画风关联画师串预设ID(presetId)
            );
            const 关联预设ID = 生成PNG画风关联画师串预设ID(presetId);
            return {
                ...config,
                功能模型占位: {
                    ...feature,
                    PNG画风预设列表: list,
                    画师串预设列表: artistPresets,
                    当前PNG画风预设ID: feature.当前PNG画风预设ID === presetId ? '' : feature.当前PNG画风预设ID,
                    当前NPCPNG画风预设ID: feature.当前NPCPNG画风预设ID === presetId ? '' : feature.当前NPCPNG画风预设ID,
                    当前场景PNG画风预设ID: feature.当前场景PNG画风预设ID === presetId ? '' : feature.当前场景PNG画风预设ID,
                    当前NPC画师串预设ID: feature.当前NPC画师串预设ID === 关联预设ID ? '' : feature.当前NPC画师串预设ID,
                    当前场景画师串预设ID: feature.当前场景画师串预设ID === 关联预设ID ? '' : feature.当前场景画师串预设ID
                }
            };
        });
    };

    const 设置当前PNG画风预设 = async (presetId: string) => {
        await deps.更新接口配置(config => {
            const feature = config.功能模型占位;
            return {
                ...config,
                功能模型占位: {
                    ...feature,
                    当前PNG画风预设ID: presetId
                }
            };
        });
    };

    const 生成PNG画风预设封面 = async (file: File): Promise<string> => {
        const dataUrl = await 读取文件为DataUrl(file);
        if (!dataUrl) return '';
        try {
            const assetRef = await deps.保存图片资源(dataUrl);
            return assetRef || dataUrl;
        } catch {
            return dataUrl;
        }
    };

    const 导出PNG画风预设 = () => {
        const feature = 规范化接口设置(deps.获取接口配置()).功能模型占位;
        下载JSON文件({
            version: 1,
            presets: Array.isArray(feature.PNG画风预设列表) ? feature.PNG画风预设列表 : []
        }, 'png-style-presets.json');
    };

    const 导入PNG画风预设 = async () => {
        const content = await 打开JSON文件();
        const imported = JSON.parse(content || '{}');
        const incoming = Array.isArray(imported?.presets) ? imported.presets : [];
        await deps.更新接口配置(config => {
            const feature = config.功能模型占位;
            const merged = new Map<string, PNG画风预设结构>();
            const existing = Array.isArray(feature.PNG画风预设列表) ? feature.PNG画风预设列表 : [];
            [...existing, ...incoming].forEach((item) => {
                if (item && item.id) {
                    merged.set(item.id, item as PNG画风预设结构);
                }
            });
            const mergedList = Array.from(merged.values());
            const artistPresets = (Array.isArray(feature.画师串预设列表) ? feature.画师串预设列表 : []).filter(
                (preset) => !是否PNG关联画师串预设(preset?.id)
            );
            return {
                ...config,
                功能模型占位: {
                    ...feature,
                    PNG画风预设列表: mergedList,
                    画师串预设列表: artistPresets,
                    当前NPC画师串预设ID: 是否PNG关联画师串预设(feature.当前NPC画师串预设ID) ? '' : feature.当前NPC画师串预设ID,
                    当前场景画师串预设ID: 是否PNG关联画师串预设(feature.当前场景画师串预设ID) ? '' : feature.当前场景画师串预设ID
                }
            };
        });
    };

    const 解析并提炼PNG画风 = async (file: File, options?: { 预设名称?: string; 额外要求?: string }) => {
        const baseConfig = 规范化接口设置(deps.获取接口配置());
        const feature = baseConfig.功能模型占位;
        const resolvedApi = feature?.PNG提炼启用独立模型 === true
            ? {
                ...baseConfig,
                activeConfigId: 'png_refine',
                configs: [
                    ...(Array.isArray(baseConfig.configs) ? baseConfig.configs : []),
                    {
                        id: 'png_refine',
                        名称: 'PNG提炼模型',
                        供应商: baseConfig.configs?.[0]?.供应商 || 'openai',
                        baseUrl: feature?.PNG提炼API地址 || baseConfig.configs?.[0]?.baseUrl || '',
                        apiKey: feature?.PNG提炼API密钥 || baseConfig.configs?.[0]?.apiKey || '',
                        model: feature?.PNG提炼使用模型 || baseConfig.configs?.[0]?.model || '',
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    }
                ]
            }
            : baseConfig;
        const refineApi = 获取主剧情接口配置(resolvedApi);
        if (!refineApi || !接口配置是否可用(refineApi)) {
            throw new Error('PNG提炼需要配置可用的接口模型。');
        }
        const imageAIService = await deps.加载图片AI服务();
        const parsed = await imageAIService.解析PNG文件元数据(file);
        const parsedPositivePrompt = (parsed.正面提示词 || '').trim();
        if (!parsedPositivePrompt) {
            const metadataKeys = Object.keys(parsed.元数据标签 || {});
            throw new Error(
                metadataKeys.length > 0
                    ? `未从 PNG 读取到可用正面提示词元数据。已读取字段：${metadataKeys.slice(0, 8).join(', ')}`
                    : '未从 PNG 读取到可用正面提示词元数据。'
            );
        }
        const refined = await imageAIService.提炼PNG画风标签(parsed, refineApi, { 额外要求: options?.额外要求 });
        const cover = await 生成PNG画风预设封面(file);
        const now = Date.now();
        const preset: PNG画风预设结构 = {
            id: 生成PNG画风预设ID(),
            名称: (options?.预设名称 || file.name.replace(/\.[^.]+$/, '') || 'PNG画风预设').trim(),
            来源: parsed.来源,
            原始正面提示词: refined.原始正面提示词 || parsed.正面提示词 || '',
            剥离后正面提示词: refined.剥离后正面提示词 || '',
            AI提炼正面提示词: refined.AI提炼正面提示词 || '',
            正面提示词: refined.正面提示词 || '',
            负面提示词: parsed.负面提示词 || '',
            画师串: refined.画师串 || '',
            画师命中项: Array.isArray(refined.画师命中项) ? refined.画师命中项 : [],
            优先复刻原参数: true,
            参数: imageAIService.净化PNG复刻参数(parsed.参数),
            封面: cover || undefined,
            原始元数据: parsed.原始元数据,
            元数据标签: parsed.元数据标签,
            createdAt: now,
            updatedAt: now
        };
        const savedPreset = await 保存PNG画风预设(preset, { 设为当前: true });
        if (!savedPreset?.id) {
            throw new Error('PNG 解析完成，但保存画风预设失败。');
        }
        return savedPreset;
    };

    const parsePngStylePreset = async (
        file: File,
        options?: { 预设名称?: string; 额外要求?: string; 后台处理?: boolean }
    ): Promise<PNG画风预设结构 | null> => {
        if (!options?.后台处理) {
            return await 解析并提炼PNG画风(file, options);
        }
        const displayName = (options?.预设名称 || file?.name || 'PNG画风预设').trim();
        deps.推送右下角提示({
            title: 'PNG 解析已提交',
            message: `${displayName}正在后台解析与提炼，可继续其他操作。`,
            tone: 'info'
        });
        void 解析并提炼PNG画风(file, options)
            .then((preset) => {
                deps.推送右下角提示({
                    title: 'PNG 解析完成',
                    message: `${preset?.名称 || displayName}已解析完成并保存为当前画风预设。`,
                    tone: 'success'
                });
            })
            .catch((error: any) => {
                const message = typeof error?.message === 'string' && error.message.trim()
                    ? error.message.trim()
                    : 'PNG 解析失败';
                deps.推送右下角提示({
                    title: 'PNG 解析失败',
                    message,
                    tone: 'error'
                });
            });
        return null;
    };

    const 角色锚点含有效内容 = (anchor?: Partial<角色锚点结构> | null): boolean => {
        const positiveTokens = (anchor?.正面提示词 || '')
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0 && /[\p{L}\p{N}]/u.test(item));
        if (positiveTokens.length > 0) return true;
        const features = anchor?.结构化特征;
        if (!features || typeof features !== 'object') return false;
        return Object.values(features).some((value) => (
            Array.isArray(value)
            && value.some((item) => typeof item === 'string' && item.trim().length > 0)
        ));
    };

    const 保存角色锚点 = async (
        anchor: 角色锚点结构,
        options?: { 设为当前?: boolean }
    ): Promise<角色锚点结构 | null> => {
        if (!anchor?.npcId) return null;
        const now = Date.now();
        const finalAnchor: 角色锚点结构 = {
            id: anchor.id && anchor.id.trim() ? anchor.id : 生成角色锚点ID(),
            npcId: anchor.npcId.trim(),
            名称: (anchor.名称 || '').trim() || '未命名角色锚点',
            是否启用: anchor.是否启用 !== false,
            生成时默认附加: anchor.生成时默认附加 === true,
            场景生图自动注入: anchor.场景生图自动注入 === true,
            正面提示词: (anchor.正面提示词 || '').trim(),
            负面提示词: (anchor.负面提示词 || '').trim(),
            结构化特征: anchor.结构化特征,
            来源: anchor.来源 || 'manual',
            原始提取文本: (anchor.原始提取文本 || '').trim() || undefined,
            提取模型信息: (anchor.提取模型信息 || '').trim() || undefined,
            createdAt: Number.isFinite(anchor.createdAt) ? anchor.createdAt : now,
            updatedAt: now
        };

        await deps.更新接口配置(config => {
            const feature = config.功能模型占位;
            const list = Array.isArray(feature.角色锚点列表) ? [...feature.角色锚点列表] : [];
            const index = list.findIndex((item) => item.id === finalAnchor.id || item.npcId === finalAnchor.npcId);
            if (index >= 0) {
                list[index] = finalAnchor;
            } else {
                list.unshift(finalAnchor);
            }
            return {
                ...config,
                功能模型占位: {
                    ...feature,
                    角色锚点列表: list,
                    当前角色锚点ID: options?.设为当前 ? finalAnchor.id : feature.当前角色锚点ID
                }
            };
        });
        return finalAnchor;
    };

    const 删除角色锚点 = async (anchorId: string) => {
        if (!anchorId) return;
        await deps.更新接口配置(config => {
            const feature = config.功能模型占位;
            const list = (Array.isArray(feature.角色锚点列表) ? feature.角色锚点列表 : []).filter((item) => item.id !== anchorId);
            return {
                ...config,
                功能模型占位: {
                    ...feature,
                    角色锚点列表: list,
                    当前角色锚点ID: feature.当前角色锚点ID === anchorId ? '' : feature.当前角色锚点ID
                }
            };
        });
    };

    const 设置当前角色锚点 = async (anchorId: string) => {
        if (!anchorId) return;
        await deps.更新接口配置(config => ({
            ...config,
            功能模型占位: {
                ...config.功能模型占位,
                当前角色锚点ID: anchorId
            }
        }));
    };

    const 读取角色锚点 = (anchorId?: string): 角色锚点结构 | null => {
        const feature = 规范化接口设置(deps.获取接口配置()).功能模型占位;
        const list = Array.isArray(feature.角色锚点列表) ? feature.角色锚点列表 : [];
        if (anchorId) {
            return list.find((item) => item.id === anchorId) || null;
        }
        const currentId = (feature.当前角色锚点ID || '').trim();
        return list.find((item) => item.id === currentId) || list[0] || null;
    };

    const 按NPC读取角色锚点 = (npcId: string): 角色锚点结构 | null => {
        if (!npcId) return null;
        const feature = 规范化接口设置(deps.获取接口配置()).功能模型占位;
        const list = Array.isArray(feature.角色锚点列表) ? feature.角色锚点列表 : [];
        return list.find((item) => item.npcId === npcId && item.是否启用 !== false) || null;
    };

    const 读取主角角色锚点 = (): 角色锚点结构 | null => (
        按NPC读取角色锚点(主角角色锚点标识)
    );

    const 提取场景角色锚点 = (sceneContext: unknown): Array<Pick<角色锚点结构, '名称' | '正面提示词' | '负面提示词' | '结构化特征'>> => {
        const overview = Array.isArray((sceneContext as any)?.人物快照?.场景人物总览)
            ? (sceneContext as any).人物快照.场景人物总览
            : [];
        const seen = new Set<string>();
        const anchors: Array<Pick<角色锚点结构, '名称' | '正面提示词' | '负面提示词' | '结构化特征'>> = [];
        overview.forEach((item: any) => {
            const npcId = typeof item?.id === 'string' ? item.id.trim() : '';
            if (!npcId) return;
            const anchor = 按NPC读取角色锚点(npcId);
            if (!anchor || seen.has(anchor.id) || anchor.场景生图自动注入 !== true) return;
            seen.add(anchor.id);
            anchors.push({
                名称: `角色${anchors.length + 1}`,
                正面提示词: anchor.正面提示词,
                负面提示词: anchor.负面提示词,
                结构化特征: anchor.结构化特征
            });
        });
        return anchors;
    };

    const 提取角色锚点 = async (
        npcId: string,
        options?: { 名称?: string; 额外要求?: string }
    ): Promise<角色锚点结构 | null> => {
        if (!npcId) return null;
        const targetNpc = (Array.isArray(deps.获取社交列表()) ? deps.获取社交列表() : []).find((npc: any) => npc && npc.id === npcId);
        if (!targetNpc) {
            throw new Error('未找到目标 NPC，无法提取角色锚点。');
        }
        const apiConfig = deps.获取接口配置();
        const anchorApi = 获取生图词组转化器接口配置(apiConfig) || 获取主剧情接口配置(apiConfig);
        if (!anchorApi || !接口配置是否可用(anchorApi)) {
            throw new Error('未配置可用的接口模型，无法提取角色锚点。');
        }
        const baseData = 提取NPC生图基础数据附带私密描述(targetNpc, {
            cultivationSystemEnabled: deps.isCultivationSystemEnabled?.() !== false
        });
        const imageAIService = await deps.加载图片AI服务();
        const extracted = await imageAIService.提取角色锚点提示词(baseData, anchorApi, {
            名称: options?.名称 || (typeof targetNpc?.姓名 === 'string' ? targetNpc.姓名.trim() : '角色锚点'),
            额外要求: options?.额外要求
        });
        if (!角色锚点含有效内容({
            正面提示词: extracted?.正面提示词,
            结构化特征: extracted?.结构化特征
        })) {
            throw new Error((extracted?.说明 || '').trim() || '角色锚点提取结果为空，未保存任何内容。');
        }
        const existing = 按NPC读取角色锚点(npcId);
        return 保存角色锚点({
            id: existing?.id || '',
            npcId,
            名称: extracted.名称 || options?.名称 || (typeof targetNpc?.姓名 === 'string' ? targetNpc.姓名.trim() : '角色锚点'),
            是否启用: true,
            生成时默认附加: existing?.生成时默认附加 ?? true,
            场景生图自动注入: existing?.场景生图自动注入 ?? true,
            正面提示词: extracted.正面提示词,
            负面提示词: extracted.负面提示词,
            结构化特征: extracted.结构化特征,
            来源: 'ai_extract',
            原始提取文本: JSON.stringify(baseData ?? {}, null, 2),
            提取模型信息: anchorApi.model || '',
            createdAt: existing?.createdAt || Date.now(),
            updatedAt: Date.now()
        }, { 设为当前: true });
    };

    const 提取主角角色锚点 = async (
        options?: { 名称?: string; 额外要求?: string }
    ): Promise<角色锚点结构 | null> => {
        const targetCharacter = deps.获取角色?.();
        if (!targetCharacter) {
            throw new Error('未找到主角数据，无法提取角色锚点。');
        }
        const apiConfig = deps.获取接口配置();
        const anchorApi = 获取生图词组转化器接口配置(apiConfig) || 获取主剧情接口配置(apiConfig);
        if (!anchorApi || !接口配置是否可用(anchorApi)) {
            throw new Error('未配置可用的接口模型，无法提取角色锚点。');
        }
        const baseData = 提取主角生图基础数据(targetCharacter, {
            cultivationSystemEnabled: deps.isCultivationSystemEnabled?.() !== false
        });
        const imageAIService = await deps.加载图片AI服务();
        const extracted = await imageAIService.提取角色锚点提示词(baseData, anchorApi, {
            名称: options?.名称 || (typeof targetCharacter?.姓名 === 'string' ? targetCharacter.姓名.trim() : '主角角色锚点'),
            额外要求: options?.额外要求
        });
        if (!角色锚点含有效内容({
            正面提示词: extracted?.正面提示词,
            结构化特征: extracted?.结构化特征
        })) {
            throw new Error((extracted?.说明 || '').trim() || '主角角色锚点提取结果为空，未保存任何内容。');
        }
        const existing = 读取主角角色锚点();
        return 保存角色锚点({
            id: existing?.id || '',
            npcId: 主角角色锚点标识,
            名称: extracted.名称 || options?.名称 || (typeof targetCharacter?.姓名 === 'string' ? targetCharacter.姓名.trim() : '主角角色锚点'),
            是否启用: true,
            生成时默认附加: existing?.生成时默认附加 ?? true,
            场景生图自动注入: existing?.场景生图自动注入 ?? false,
            正面提示词: extracted.正面提示词,
            负面提示词: extracted.负面提示词,
            结构化特征: extracted.结构化特征,
            来源: 'ai_extract',
            原始提取文本: JSON.stringify(baseData ?? {}, null, 2),
            提取模型信息: anchorApi.model || '',
            createdAt: existing?.createdAt || Date.now(),
            updatedAt: Date.now()
        }, { 设为当前: true });
    };

    return {
        savePngStylePreset: 保存PNG画风预设,
        deletePngStylePreset: 删除PNG画风预设,
        setCurrentPngStylePreset: 设置当前PNG画风预设,
        getPngStylePreset: 读取PNG画风预设,
        getCurrentPngStylePreset: 获取当前PNG画风预设摘要,
        exportPngStylePresets: 导出PNG画风预设,
        importPngStylePresets: 导入PNG画风预设,
        parsePngStylePreset,
        saveCharacterAnchor: 保存角色锚点,
        deleteCharacterAnchor: 删除角色锚点,
        setCurrentCharacterAnchor: 设置当前角色锚点,
        getCharacterAnchor: 读取角色锚点,
        getCharacterAnchorByNpcId: 按NPC读取角色锚点,
        getPlayerCharacterAnchor: 读取主角角色锚点,
        getSceneCharacterAnchors: 提取场景角色锚点,
        extractCharacterAnchor: 提取角色锚点,
        extractPlayerCharacterAnchor: 提取主角角色锚点
    };
};
