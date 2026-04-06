import * as imageAIService from '../../services/ai/image';
import type {
    接口设置结构,
    香闺秘档部位类型,
    NPC生图任务记录,
    生图任务来源类型,
} from '../../types';
import { 获取词组转化器预设上下文, type 当前可用接口结构 } from '../../utils/apiConfig';
import type { PNG解析参数结构, 角色锚点结构 } from '../../models/system';
type 图片功能配置 = {
    总开关: boolean;
    NPC开关: boolean;
    使用词组转化器: boolean;
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

type 角色锚点摘要 = Pick<角色锚点结构, '名称' | '正面提示词' | '负面提示词'> | null;

type NPC秘档部位生图工作流依赖 = {
    apiConfig: 接口设置结构;
    获取NPC唯一标识: (npc: any, index?: number) => string;
    获取文生图接口配置: (config: 接口设置结构) => 当前可用接口结构 | null;
    获取生图词组转化器接口配置: (config: 接口设置结构) => 当前可用接口结构 | null;
    获取生图画师串预设: (config: 接口设置结构, scope: 'npc' | 'scene', preferredId?: string) => 画师串预设摘要;
    获取当前PNG画风预设: (preferredId?: string) => PNG画风预设摘要;
    获取NPC角色锚点: (npcId: string) => 角色锚点摘要;
    获取词组转化器预设提示词: (config: 接口设置结构, scope: 'npc' | 'scene', mode?: 'default' | 'anchor') => string;
    接口配置是否可用: (config: 当前可用接口结构 | null) => boolean;
    读取文生图功能配置: () => 图片功能配置;
    NPC私密部位生图进行中集合: Set<string>;
    提取NPC香闺秘档部位生图数据: (npc: any, part: 香闺秘档部位类型) => any;
    创建NPC生图任务: (params: {
        npc: any;
        npcKey: string;
        source: 生图任务来源类型;
        modelName: string;
        构图: '部位特写';
        部位: 香闺秘档部位类型;
        画风?: 当前可用接口结构['画风'];
        画师串?: string;
        额外要求?: string;
        尺寸?: string;
    }) => NPC生图任务记录;
    生成NPC生图记录ID: () => string;
    追加NPC生图任务: (task: NPC生图任务记录) => void;
    更新NPC生图任务: (taskId: string, updater: (task: NPC生图任务记录) => NPC生图任务记录) => void;
    写入NPC图片历史记录: (npcKey: string, record: any, options?: { 同步最近结果?: boolean }) => void;
    更新NPC香闺秘档部位结果: (npcKey: string, part: 香闺秘档部位类型, updater: (current: any) => any) => void;
};

const 默认额外负面提示词 = 'face, eyes, portrait, headshot, upper body, half body, full body, torso, abdomen, legs, arm, feet, hands, multiple people, extra legs, extra arms, extra breasts, extra nipples, extra fingers, three legs, three breasts, merged body parts, room focus, scenery focus, environment focus, background focus, wide shot, mid shot, text, watermark, speech bubble, dialogue box, blurry, low quality, bad anatomy';
const 默认裸体正向提示词 = 'nude, naked, unclothed';

const 获取画风标签 = (style?: 当前可用接口结构['画风']): string => {
    switch (style) {
        case '二次元':
            return 'anime style, 2d illustration';
        case '国风':
            return 'guofeng, chinese ink painting, traditional chinese aesthetic';
        case '写实':
            return 'realistic, photorealistic';
        default:
            return '';
    }
};

export const 执行NPC香闺秘档部位生图工作流 = async (
    npc: any,
    part: 香闺秘档部位类型,
    options: { 画风?: 当前可用接口结构['画风']; 画师串?: string; 画师串预设ID?: string; PNG画风预设ID?: string; 额外要求?: string; 尺寸?: string } | undefined,
    deps: NPC秘档部位生图工作流依赖
): Promise<void> => {
    const npcKey = deps.获取NPC唯一标识(npc);
    if (!npcKey) return;

    const uniqueTaskKey = `${npcKey}::${part}`;
    if (deps.NPC私密部位生图进行中集合.has(uniqueTaskKey)) return;

    const imageApi = deps.获取文生图接口配置(deps.apiConfig);
    const imageFeature = deps.读取文生图功能配置();
    const backendType = imageApi?.图片后端类型;
    const shouldUsePromptTransformer = backendType === 'novelai' || imageFeature.使用词组转化器 !== false;
    const promptApi = shouldUsePromptTransformer ? deps.获取生图词组转化器接口配置(deps.apiConfig) : null;
    const modelName = imageApi?.model || '';
    const 画风 = options?.画风;
    const 额外要求 = (options?.额外要求 || '').trim();
    const 尺寸 = (options?.尺寸 || '').trim();
    const task = deps.创建NPC生图任务({
        npc,
        npcKey,
        source: 'manual',
        modelName,
        构图: '部位特写',
        部位: part,
        画风,
        画师串: '',
        额外要求,
        尺寸
    });
    const recordId = deps.生成NPC生图记录ID();
    deps.追加NPC生图任务(task);
    deps.更新NPC生图任务(task.id, (currentTask) => ({
        ...currentTask,
        状态: 'running',
        开始时间: Date.now(),
        构图: '部位特写',
        部位: part,
        画风,
        额外要求,
        尺寸,
        进度阶段: 'prompting',
        进度文本: `正在校验${part}特写的配置与描述文本。`
    }));

    deps.NPC私密部位生图进行中集合.add(uniqueTaskKey);
    let baseData: any = undefined;
    let partDescription = '';
    let 前置正向提示词 = '';
    let 合并负向画师串 = '';
    let PNG参数: PNG解析参数结构 | undefined = undefined;

    try {
        if (!imageFeature.总开关) {
            throw new Error('文生图总开关未启用，无法生成香闺秘档特写。');
        }
        if (!deps.接口配置是否可用(imageApi)) {
            throw new Error('未配置可用的文生图接口，无法生成香闺秘档特写。');
        }
        if (shouldUsePromptTransformer && !deps.接口配置是否可用(promptApi)) {
            throw new Error(backendType === 'novelai'
                ? 'NovelAI 模式必须绑定可用的词组转化器接口，请先完成配置。'
                : '词组转化器配置不可用，无法生成香闺秘档特写。');
        }

        baseData = deps.提取NPC香闺秘档部位生图数据(npc, part);
        const partDescriptionField = part === '胸部' ? '胸部描述' : part === '小穴' ? '小穴描述' : '屁穴描述';
        partDescription = typeof baseData?.[partDescriptionField] === 'string' ? baseData[partDescriptionField].trim() : '';
        if (!partDescription) {
            throw new Error(`${part}描述为空，无法生成${part}特写。`);
        }

        const 强制裸体语义 = deps.apiConfig?.功能模型占位?.香闺秘档特写强制裸体语义 === true;
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
    const 画师串负面 = [画师串预设?.负面提示词 || '', 默认额外负面提示词]
        .map((item) => item.trim())
        .filter(Boolean)
        .join(', ');
    const 非画师风格正面提示词 = [(画师串预设?.正面提示词 || '').trim(), (PNG画风预设?.正面提示词 || '').trim()].filter(Boolean).join(', ');
    const 兼容模式风格提示词 = 词组转化兼容模式 ? 非画师风格正面提示词 : '';
    前置正向提示词 = [
        画师串,
        词组转化兼容模式 ? '' : 非画师风格正面提示词,
        角色锚点
            ? imageAIService.构建角色锚点注入提示词({
                正面提示词: 角色锚点.正面提示词,
                结构化特征: (角色锚点 as any).结构化特征
            }, { 构图: '部位特写', 部位: part })
            : ''
    ].filter(Boolean).join(', ');
    合并负向画师串 = [画师串负面, (角色锚点?.负面提示词 || '').trim(), (PNG画风预设?.负面提示词 || '').trim()].filter(Boolean).join(', ');
    PNG参数 = PNG画风预设?.优先复刻原参数 === true ? PNG画风预设?.参数 : undefined;
    const 画风标签 = 获取画风标签(画风);
    const 合并额外要求 = [额外要求, 画风标签].filter(Boolean).join(', ');
    const 词组转化器预设上下文 = 获取词组转化器预设上下文(
        deps.apiConfig,
        'npc',
        角色锚点 ? 'anchor' : 'default',
        { 包含输出格式提示词: false }
    );
    // 私密部位特写不能复用普通 NPC 角色预设；那套预设会鼓励完整外观、服装和环境，容易把画面拉回普通角色图。
    const 词组转化器提示词 = '';
    const promptApiForTask = promptApi ? {
        ...promptApi,
        词组转化器AI角色提示词: 词组转化器预设上下文.AI角色定制提示词,
        词组转化器提示词
    } : null;
    deps.更新NPC生图任务(task.id, (currentTask) => ({
        ...currentTask,
        状态: 'running',
        开始时间: Date.now(),
        原始描述: JSON.stringify(baseData ?? {}, null, 2),
        构图: '部位特写',
        部位: part,
        画风,
        画师串: 前置正向提示词,
        额外要求,
        尺寸,
        进度阶段: 'prompting',
        进度文本: shouldUsePromptTransformer ? `正在整理${part}特写资料并生成生图词组。` : `已跳过词组转化器，正在直接整理${part}特写资料。`
    }));

    deps.更新NPC香闺秘档部位结果(npcKey, part, () => ({
        id: recordId,
        部位: part,
        图片URL: undefined,
        本地路径: undefined,
        生图词组: '',
        原始描述: JSON.stringify(baseData ?? {}, null, 2),
        使用模型: modelName,
        生成时间: Date.now(),
        构图: '部位特写' as const,
        画风,
        画师串: 前置正向提示词,
        状态: 'pending' as const,
        错误信息: undefined,
        描述文本: partDescription
    }));
    deps.写入NPC图片历史记录(npcKey, {
        id: recordId,
        部位: part,
        图片URL: undefined,
        本地路径: undefined,
        生图词组: '',
        原始描述: JSON.stringify(baseData ?? {}, null, 2),
        使用模型: modelName,
        生成时间: Date.now(),
        构图: '部位特写' as const,
        画风,
        画师串: 前置正向提示词,
        状态: 'pending' as const,
        错误信息: undefined
    }, { 同步最近结果: false });

        const { 原始描述, 生图词组 } = shouldUsePromptTransformer && promptApiForTask
            ? await imageAIService.generateNpcSecretPartImagePrompt(
                baseData,
                promptApiForTask,
                undefined,
                undefined,
                undefined,
                { 部位: part, 画风, 额外要求: 合并额外要求, 后端类型: backendType, 启用画师串预设: !词组转化兼容模式 && (启用画师串预设 || 启用PNG画风预设), 兼容模式: 词组转化兼容模式, 风格提示词输入: 兼容模式风格提示词 || undefined }
            )
            : imageAIService.buildNpcSecretPartDirectImagePrompt(baseData, {
                部位: part,
                画风,
                额外要求: 合并额外要求,
                后端类型: backendType,
                启用画师串预设: !词组转化兼容模式 && (启用画师串预设 || 启用PNG画风预设),
                兼容模式: 词组转化兼容模式,
                风格提示词输入: 兼容模式风格提示词 || undefined
            });
        const 特写附加正向提示词 = [强制裸体语义 ? 默认裸体正向提示词 : '', 前置正向提示词].filter(Boolean).join(', ');
        const 最终提示词 = imageAIService.构建最终图片提示词(生图词组, imageApi!, {
            构图: '部位特写',
            尺寸: 尺寸 || '1024x1024',
            附加正向提示词: 特写附加正向提示词,
            附加负面提示词: 合并负向画师串,
            PNG参数
        });
        deps.更新NPC生图任务(task.id, (currentTask) => ({
            ...currentTask,
            原始描述,
            生图词组,
            最终正向提示词: 最终提示词.最终正向提示词,
            最终负向提示词: 最终提示词.最终负向提示词,
            构图: '部位特写',
            部位: part,
            画风,
            画师串: 前置正向提示词,
            额外要求,
            尺寸,
            进度阶段: 'generating',
            进度文本: `${part}词组转换完成，正在调用图片模型生成特写。`
        }));
        deps.更新NPC香闺秘档部位结果(npcKey, part, (currentResult) => ({
            ...currentResult,
            id: currentResult?.id || recordId,
            部位: part,
            生图词组,
            最终正向提示词: 最终提示词.最终正向提示词,
            最终负向提示词: 最终提示词.最终负向提示词,
            原始描述,
            使用模型: modelName,
            生成时间: currentResult?.生成时间 || Date.now(),
            构图: '部位特写',
            画风,
            画师串: 前置正向提示词,
            状态: 'pending',
            错误信息: undefined,
            描述文本: partDescription
        }));
        deps.写入NPC图片历史记录(npcKey, {
            id: recordId,
            部位: part,
            图片URL: undefined,
            本地路径: undefined,
            生图词组,
            最终正向提示词: 最终提示词.最终正向提示词,
            最终负向提示词: 最终提示词.最终负向提示词,
            原始描述,
            使用模型: modelName,
            生成时间: Date.now(),
            构图: '部位特写' as const,
            画风,
            画师串: 前置正向提示词,
            状态: 'pending' as const,
            错误信息: undefined
        }, { 同步最近结果: false });
        const imageResult = await imageAIService.generateImageByPrompt(生图词组, imageApi!, undefined, {
            构图: '部位特写',
            尺寸: 尺寸 || '1024x1024',
            附加正向提示词: 特写附加正向提示词,
            附加负面提示词: 合并负向画师串,
            跳过基础负面提示词: Boolean((画师串预设?.负面提示词 || '').trim() || (PNG画风预设?.负面提示词 || '').trim()),
            PNG参数
        });
        const localizedImageResult = await imageAIService.persistImageAssetLocally(imageResult).catch(() => imageResult);
        deps.更新NPC生图任务(task.id, (currentTask) => ({
            ...currentTask,
            进度阶段: 'saving',
            进度文本: `${part}特写已生成，正在写回图片档案。`
        }));

        deps.更新NPC香闺秘档部位结果(npcKey, part, (currentResult) => ({
            ...currentResult,
            id: currentResult?.id || recordId,
            部位: part,
            图片URL: localizedImageResult.图片URL,
            本地路径: localizedImageResult.本地路径,
            生图词组,
            最终正向提示词: localizedImageResult.最终正向提示词 || 最终提示词.最终正向提示词,
            最终负向提示词: localizedImageResult.最终负向提示词 || 最终提示词.最终负向提示词,
            原始描述,
            使用模型: modelName,
            生成时间: Date.now(),
            构图: '部位特写',
            画风,
            画师串: 前置正向提示词,
            状态: 'success',
            错误信息: undefined,
            描述文本: partDescription
        }));
        deps.写入NPC图片历史记录(npcKey, {
            id: recordId,
            部位: part,
            图片URL: localizedImageResult.图片URL,
            本地路径: localizedImageResult.本地路径,
            生图词组,
            最终正向提示词: localizedImageResult.最终正向提示词 || 最终提示词.最终正向提示词,
            最终负向提示词: localizedImageResult.最终负向提示词 || 最终提示词.最终负向提示词,
            原始描述,
            使用模型: modelName,
            生成时间: Date.now(),
            构图: '部位特写' as const,
            画风,
            画师串: 前置正向提示词,
            状态: 'success' as const,
            错误信息: undefined
        }, { 同步最近结果: false });
        deps.更新NPC生图任务(task.id, (currentTask) => ({
            ...currentTask,
            状态: 'success',
            完成时间: Date.now(),
            使用模型: modelName,
            原始描述,
            生图词组,
            最终正向提示词: localizedImageResult.最终正向提示词 || 最终提示词.最终正向提示词,
            最终负向提示词: localizedImageResult.最终负向提示词 || 最终提示词.最终负向提示词,
            构图: '部位特写',
            部位: part,
            画风,
            画师串: 前置正向提示词,
            额外要求,
            图片URL: localizedImageResult.图片URL,
            本地路径: localizedImageResult.本地路径,
            错误信息: undefined,
            进度阶段: 'success',
            进度文本: `${part}特写已生成并写入历史记录。`
        }));
    } catch (error: any) {
        const errorMessage = typeof error?.message === 'string' && error.message.trim()
            ? error.message.trim()
            : `${part}特写生成失败`;
        deps.更新NPC香闺秘档部位结果(npcKey, part, (currentResult) => ({
            id: currentResult?.id || recordId,
            部位: part,
            图片URL: currentResult?.图片URL,
            本地路径: currentResult?.本地路径,
            生图词组: currentResult?.生图词组 || '',
            最终正向提示词: currentResult?.最终正向提示词 || '',
            最终负向提示词: currentResult?.最终负向提示词 || '',
            原始描述: currentResult?.原始描述 || JSON.stringify(baseData ?? {}, null, 2),
            使用模型: modelName,
            生成时间: Date.now(),
            构图: '部位特写',
            画风,
            画师串: 前置正向提示词,
            状态: 'failed',
            错误信息: errorMessage,
            描述文本: partDescription
        }));
        deps.写入NPC图片历史记录(npcKey, {
            id: recordId,
            部位: part,
            图片URL: undefined,
            本地路径: undefined,
            生图词组: '',
            最终正向提示词: '',
            最终负向提示词: '',
            原始描述: JSON.stringify(baseData ?? {}, null, 2),
            使用模型: modelName,
            生成时间: Date.now(),
            构图: '部位特写' as const,
            画风,
            画师串: 前置正向提示词,
            状态: 'failed' as const,
            错误信息: errorMessage
        }, { 同步最近结果: false });
        deps.更新NPC生图任务(task.id, (currentTask) => ({
            ...currentTask,
            状态: 'failed',
            完成时间: Date.now(),
            构图: '部位特写',
            部位: part,
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
        deps.NPC私密部位生图进行中集合.delete(uniqueTaskKey);
    }
};
