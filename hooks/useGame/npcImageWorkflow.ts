import * as imageAIService from '../../services/ai/image';
import type { NPC生图任务记录, 生图任务来源类型, 接口设置结构 } from '../../types';
import { 获取词组转化器预设上下文, type 当前可用接口结构 } from '../../utils/apiConfig';
import type { PNG解析参数结构, 角色锚点结构 } from '../../models/system';

type 图片功能配置 = {
    总开关: boolean;
    NPC开关: boolean;
    使用词组转化器: boolean;
    NPC画风: 当前可用接口结构['画风'];
};

type 画师串预设摘要 = {
    名称: string;
    画师串: string;
    正面提示词: string;
    负面提示词: string;
} | null;

type PNG画风预设摘要 = {
    id?: string;
    名称: string;
    画师串: string;
    正面提示词: string;
    负面提示词: string;
    优先复刻原参数?: boolean;
    参数?: PNG解析参数结构;
} | null;

type 角色锚点摘要 = Pick<角色锚点结构, '名称' | '正面提示词' | '负面提示词' | '结构化特征'> | null;

type NPC生图工作流依赖 = {
    apiConfig: 接口设置结构;
    获取NPC唯一标识: (npc: any, index?: number) => string;
    获取文生图接口配置: (config: 接口设置结构) => 当前可用接口结构 | null;
    获取生图词组转化器接口配置: (config: 接口设置结构) => 当前可用接口结构 | null;
    获取生图画师串预设: (config: 接口设置结构, scope: 'npc' | 'scene', preferredId?: string) => 画师串预设摘要;
    获取当前PNG画风预设: (preferredId?: string) => PNG画风预设摘要;
    获取NPC角色锚点: (npcId: string) => 角色锚点摘要;
    获取词组转化器预设提示词: (config: 接口设置结构, scope: 'npc' | 'scene', mode?: 'default' | 'anchor') => string;
    接口配置是否可用: (config: 当前可用接口结构) => boolean;
    读取文生图功能配置: () => 图片功能配置;
    NPC符合自动生图条件: (npc: any) => boolean;
    NPC生图进行中集合: Set<string>;
    提取NPC生图基础数据: (npc: any) => any;
    创建NPC生图任务: (params: {
        npc: any;
        npcKey: string;
        source: 生图任务来源类型;
        modelName: string;
        构图: '头像' | '半身' | '立绘';
        画风?: 当前可用接口结构['画风'];
        画师串?: string;
        额外要求?: string;
        尺寸?: string;
    }) => NPC生图任务记录;
    生成NPC生图记录ID: () => string;
    追加NPC生图任务: (task: NPC生图任务记录) => void;
    更新NPC生图任务: (taskId: string, updater: (task: NPC生图任务记录) => NPC生图任务记录) => void;
    更新NPC最近生图结果: (npcKey: string, updater: (npc: any) => any) => void;
};

const 获取画风附加要求 = (style?: 当前可用接口结构['画风']): string => {
    switch (style) {
        case '二次元':
            return '附加画风要求：整体画面偏高完成度二次元动漫插画，强调干净线稿、清晰赛璐璐体积、鲜明但协调的色彩组织。';
        case '国风':
            return '附加画风要求：整体画面偏国风武侠/仙侠 2D 插画，强调中式审美、写意气韵、丝绸与古典服饰纹理、含蓄雾气和笔触感。';
        case '写实':
            return '附加画风要求：整体画面偏细腻质感的 2D 写实插画，强调微观材质、体积光影和成熟审美，但禁止真人照片感。';
        default:
            return '';
    }
};

export const 执行NPC生图工作流 = async (
    npc: any,
    options: { force?: boolean; source?: 生图任务来源类型; 构图?: '头像' | '半身' | '立绘'; 画风?: 当前可用接口结构['画风']; 画师串?: string; 画师串预设ID?: string; PNG画风预设ID?: string; 额外要求?: string; 尺寸?: string } | undefined,
    deps: NPC生图工作流依赖
): Promise<void> => {
    const npcKey = deps.获取NPC唯一标识(npc);
    if (!npcKey) return;

    const imageApi = deps.获取文生图接口配置(deps.apiConfig);
    const imageFeature = deps.读取文生图功能配置();
    const backendType = imageApi?.图片后端类型;
    const shouldUsePromptTransformer = backendType === 'novelai' || imageFeature.使用词组转化器 !== false;
    const promptApi = shouldUsePromptTransformer ? deps.获取生图词组转化器接口配置(deps.apiConfig) : null;
    if (!imageFeature.总开关) return;
    if (!options?.force && !imageFeature.NPC开关) return;
    if (!options?.force && !deps.NPC符合自动生图条件(npc)) return;
    if (!imageApi || !deps.接口配置是否可用(imageApi)) {
        const message = '未配置可用的文生图接口，无法执行 NPC 生图。';
        if (options?.force) {
            throw new Error(message);
        }
        console.warn(`NPC 生图已跳过：${message}`);
        return;
    }
    if (shouldUsePromptTransformer && (!promptApi || !deps.接口配置是否可用(promptApi))) {
        const message = backendType === 'novelai'
            ? 'NovelAI 模式必须绑定可用的词组转化器接口，请先完成配置。'
            : '词组转化器配置不可用，已跳过 NPC 生图。';
        if (options?.force || backendType === 'novelai') {
            throw new Error(message);
        }
        console.warn(`NPC 生图已跳过：${message}`);
        return;
    }
    if (deps.NPC生图进行中集合.has(npcKey)) return;

    deps.NPC生图进行中集合.add(npcKey);
    const npcName = typeof npc?.姓名 === 'string' ? npc.姓名.trim() : '未命名NPC';
    const npcImageBaseData = deps.提取NPC生图基础数据(npc);
    const modelName = imageApi.model;
    const taskSource: 生图任务来源类型 = options?.source || 'auto';
    const 构图: '头像' | '半身' | '立绘' = options?.构图 || '头像';
    const 画风 = options?.画风 || imageFeature.NPC画风;
    const 画师串预设 = deps.获取生图画师串预设(deps.apiConfig, 'npc', options?.画师串预设ID);
    const PNG画风预设 = deps.获取当前PNG画风预设(options?.PNG画风预设ID);
    const 角色锚点 = deps.获取NPC角色锚点(typeof npc?.id === 'string' ? npc.id.trim() : '');
    const 词组转化兼容模式 = deps.apiConfig?.功能模型占位?.词组转化兼容模式 === true;
    const 启用画师串预设 = Boolean(
        (画师串预设?.画师串 || '').trim()
        || (画师串预设?.正面提示词 || '').trim()
        || (画师串预设?.负面提示词 || '').trim()
    );
    const 启用PNG画风预设 = Boolean(
        (PNG画风预设?.画师串 || '').trim()
        || (PNG画风预设?.正面提示词 || '').trim()
        || (PNG画风预设?.负面提示词 || '').trim()
    );
    const 画师串 = [(画师串预设?.画师串 || '').trim(), (options?.画师串 || '').trim(), (PNG画风预设?.画师串 || '').trim()]
        .map((item) => item.trim())
        .filter(Boolean)
        .join(', ');
    const 非画师风格正面提示词 = [(画师串预设?.正面提示词 || '').trim(), (PNG画风预设?.正面提示词 || '').trim()]
        .filter(Boolean)
        .join(', ');
    const 兼容模式风格提示词 = 词组转化兼容模式 ? 非画师风格正面提示词 : '';
    const 角色锚点前置注入提示词 = !shouldUsePromptTransformer && 角色锚点
        ? imageAIService.构建角色锚点注入提示词({
            正面提示词: 角色锚点.正面提示词,
            结构化特征: 角色锚点.结构化特征
        }, { 构图 })
        : '';
    const 前置正向提示词 = [
        画师串,
        词组转化兼容模式 ? '' : 非画师风格正面提示词,
        角色锚点前置注入提示词
    ].filter(Boolean).join(', ');
    const 合并负向画师串 = [(画师串预设?.负面提示词 || '').trim(), (角色锚点?.负面提示词 || '').trim(), (PNG画风预设?.负面提示词 || '').trim()].filter(Boolean).join(', ');
    const PNG参数 = PNG画风预设?.优先复刻原参数 === true ? PNG画风预设?.参数 : undefined;
    const 额外要求 = (options?.额外要求 || '').trim();
    const 尺寸 = (options?.尺寸 || '').trim();
    const 后端类型 = backendType;
    const 画风附加要求 = 获取画风附加要求(画风);
    const 词组转化器预设上下文 = 获取词组转化器预设上下文(deps.apiConfig, 'npc', 角色锚点 ? 'anchor' : 'default');
    const NPC词组序列化策略 = backendType === 'novelai' && 词组转化器预设上下文.词组序列化策略 === 'flat'
        ? 'nai_character_segments'
        : 词组转化器预设上下文.词组序列化策略;
    const 词组转化器提示词 = [词组转化器预设上下文.相关提示词.trim(), 画风附加要求]
        .filter(Boolean)
        .join('\n\n');
    const promptApiForTask = promptApi ? {
        ...promptApi,
        词组转化器AI角色提示词: 词组转化器预设上下文.AI角色定制提示词,
        词组转化器提示词,
        词组转化输出策略: NPC词组序列化策略
    } : null;
    const safePromptApi = promptApiForTask || imageApi;
    const imageApiForTask = {
        ...imageApi,
        词组转化输出策略: promptApiForTask?.词组转化输出策略 || imageApi.词组转化输出策略
    };
    const task = deps.创建NPC生图任务({
        npc,
        npcKey,
        source: taskSource,
        modelName,
        构图,
        画风,
        画师串: 前置正向提示词,
        额外要求,
        尺寸
    });
    const recordId = deps.生成NPC生图记录ID();

    deps.追加NPC生图任务(task);
    deps.更新NPC生图任务(task.id, (currentTask) => ({
        ...currentTask,
        状态: 'running',
        开始时间: Date.now(),
        原始描述: JSON.stringify(npcImageBaseData ?? {}, null, 2),
        构图,
        画风,
        画师串: 前置正向提示词,
        额外要求,
        尺寸,
        进度阶段: 'prompting',
        进度文本: shouldUsePromptTransformer ? '正在整理角色基础资料并生成生图词组。' : '已跳过词组转化器，正在直接整理角色资料。'
    }));

    deps.更新NPC最近生图结果(npcKey, (currentNpc) => {
        const 待处理结果 = {
            id: recordId,
            图片URL: undefined,
            本地路径: undefined,
            生图词组: '',
            原始描述: JSON.stringify(npcImageBaseData ?? {}, null, 2),
            使用模型: modelName,
            生成时间: Date.now(),
            构图,
            画风,
            画师串: 前置正向提示词,
            尺寸,
            状态: 'pending' as const,
            错误信息: undefined
        };
        return {
            ...currentNpc,
            最近生图结果: 待处理结果,
            图片档案: {
                最近生图结果: 待处理结果,
                生图历史: [待处理结果]
            }
        };
    });

    try {
        const { 原始描述, 生图词组 } = shouldUsePromptTransformer && promptApi
            ? await imageAIService.generateNpcImagePrompt(
                npcImageBaseData,
                safePromptApi,
                undefined,
                undefined,
                undefined,
                {
                    构图,
                    画风,
                    额外要求,
                    后端类型,
                    启用画师串预设: !词组转化兼容模式 && (启用画师串预设 || 启用PNG画风预设),
                    兼容模式: 词组转化兼容模式,
                    风格提示词输入: 兼容模式风格提示词 || undefined,
                    角色锚点: 角色锚点 ? {
                        名称: 角色锚点.名称,
                        正面提示词: 角色锚点.正面提示词,
                        负面提示词: 角色锚点.负面提示词,
                        结构化特征: 角色锚点.结构化特征
                    } : undefined
                }
            )
            : imageAIService.buildNpcDirectImagePrompt(npcImageBaseData, { 构图, 画风, 额外要求, 后端类型, 启用画师串预设: !词组转化兼容模式 && (启用画师串预设 || 启用PNG画风预设), 兼容模式: 词组转化兼容模式, 风格提示词输入: 兼容模式风格提示词 || undefined });
        const 最终提示词 = imageAIService.构建最终图片提示词(生图词组, imageApiForTask, {
            构图,
            尺寸: 尺寸 || undefined,
            附加正向提示词: 前置正向提示词,
            附加负面提示词: 合并负向画师串,
            PNG参数
        });
        deps.更新NPC生图任务(task.id, (currentTask) => ({
            ...currentTask,
            原始描述,
            生图词组,
            最终正向提示词: 最终提示词.最终正向提示词,
            最终负向提示词: 最终提示词.最终负向提示词,
            构图,
            画风,
            画师串: 前置正向提示词,
            额外要求,
            尺寸,
            进度阶段: 'generating',
            进度文本: shouldUsePromptTransformer ? '词组转换完成，正在调用图片模型生成图片。' : '角色资料整理完成，正在调用图片模型生成图片。'
        }));
        deps.更新NPC最近生图结果(npcKey, (currentNpc) => {
            const 当前结果 = currentNpc?.图片档案?.最近生图结果 || currentNpc?.最近生图结果 || {};
            const 处理中结果 = {
                ...当前结果,
                id: 当前结果?.id || deps.生成NPC生图记录ID(),
                生图词组,
                最终正向提示词: 最终提示词.最终正向提示词,
                最终负向提示词: 最终提示词.最终负向提示词,
                原始描述,
                使用模型: modelName,
                生成时间: 当前结果?.生成时间 || Date.now(),
                构图,
                画风,
                画师串: 前置正向提示词,
                尺寸,
                状态: 'pending' as const,
                错误信息: undefined
            };
            return {
                ...currentNpc,
                最近生图结果: 处理中结果,
                图片档案: {
                    最近生图结果: 处理中结果,
                    生图历史: [处理中结果]
                }
            };
        });
        const imageResult = await imageAIService.generateImageByPrompt(生图词组, imageApiForTask, undefined, {
            构图,
            尺寸: 尺寸 || undefined,
            附加正向提示词: 前置正向提示词,
            附加负面提示词: 合并负向画师串,
            跳过基础负面提示词: Boolean((画师串预设?.负面提示词 || '').trim() || (PNG画风预设?.负面提示词 || '').trim()),
            PNG参数
        });
        const localizedImageResult = await imageAIService.persistImageAssetLocally(imageResult).catch(() => imageResult);
        deps.更新NPC生图任务(task.id, (currentTask) => ({
            ...currentTask,
            进度阶段: 'saving',
            进度文本: '图片已生成，正在写回图片档案。'
        }));
        deps.更新NPC最近生图结果(npcKey, (currentNpc) => {
            const 成功结果 = {
                id: currentNpc?.图片档案?.最近生图结果?.id || currentNpc?.最近生图结果?.id || deps.生成NPC生图记录ID(),
                图片URL: localizedImageResult.图片URL,
                本地路径: localizedImageResult.本地路径,
                生图词组,
                最终正向提示词: localizedImageResult.最终正向提示词 || 最终提示词.最终正向提示词,
                最终负向提示词: localizedImageResult.最终负向提示词 || 最终提示词.最终负向提示词,
                原始描述,
                使用模型: modelName,
                生成时间: Date.now(),
                构图,
                画风,
                画师串: 前置正向提示词,
                尺寸,
                状态: 'success' as const
            };
            return {
                ...currentNpc,
                最近生图结果: 成功结果,
                图片档案: {
                    最近生图结果: 成功结果,
                    生图历史: [成功结果]
                }
            };
        });
        deps.更新NPC生图任务(task.id, (currentTask) => ({
            ...currentTask,
            状态: 'success',
            完成时间: Date.now(),
            使用模型: modelName,
            原始描述,
            生图词组,
            最终正向提示词: localizedImageResult.最终正向提示词 || 最终提示词.最终正向提示词,
            最终负向提示词: localizedImageResult.最终负向提示词 || 最终提示词.最终负向提示词,
            构图,
            画风,
            画师串: 前置正向提示词,
            额外要求,
            尺寸,
            图片URL: localizedImageResult.图片URL,
            本地路径: localizedImageResult.本地路径,
            错误信息: undefined,
            进度阶段: 'success',
            进度文本: '图片已生成并写入图片档案。'
        }));
    } catch (error: any) {
        const errorMessage = typeof error?.message === 'string' && error.message.trim()
            ? error.message.trim()
            : 'NPC 生图失败';
        console.error(`NPC 生图失败: ${npcName}`, error);
        deps.更新NPC最近生图结果(npcKey, (currentNpc) => {
            const 失败结果 = {
                id: currentNpc?.图片档案?.最近生图结果?.id || currentNpc?.最近生图结果?.id || deps.生成NPC生图记录ID(),
                图片URL: currentNpc?.最近生图结果?.图片URL,
                本地路径: currentNpc?.最近生图结果?.本地路径,
                生图词组: currentNpc?.最近生图结果?.生图词组 || '',
                最终正向提示词: currentNpc?.最近生图结果?.最终正向提示词 || '',
                最终负向提示词: currentNpc?.最近生图结果?.最终负向提示词 || '',
                原始描述: currentNpc?.最近生图结果?.原始描述 || JSON.stringify(npcImageBaseData ?? {}, null, 2),
                使用模型: modelName,
                生成时间: Date.now(),
                构图,
                画风,
                画师串: 前置正向提示词,
                状态: 'failed' as const,
                错误信息: errorMessage
            };
            return {
                ...currentNpc,
                最近生图结果: 失败结果,
                图片档案: {
                    最近生图结果: 失败结果,
                    生图历史: [失败结果]
                }
            };
        });
        deps.更新NPC生图任务(task.id, (currentTask) => ({
            ...currentTask,
            状态: 'failed',
            完成时间: Date.now(),
            构图,
            最终正向提示词: currentTask.最终正向提示词,
            最终负向提示词: currentTask.最终负向提示词,
            画风,
            画师串: 前置正向提示词,
            额外要求,
            错误信息: errorMessage,
            进度阶段: 'failed',
            进度文本: errorMessage
        }));
        throw error;
    } finally {
        deps.NPC生图进行中集合.delete(npcKey);
    }
};
