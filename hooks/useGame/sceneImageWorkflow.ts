import * as imageAIService from '../../services/ai/image';
import type { 场景生图任务记录, 生图任务来源类型, 接口设置结构 } from '../../types';
import { 获取词组转化器预设上下文, type 当前可用接口结构 } from '../../utils/apiConfig';
import type { PNG解析参数结构, 角色锚点结构 } from '../../models/system';

type PNG画风预设摘要 = {
    id?: string;
    名称: string;
    画师串: string;
    正面提示词: string;
    负面提示词: string;
    优先复刻原参数?: boolean;
    参数?: PNG解析参数结构;
} | null;

type 角色锚点摘要 = Pick<角色锚点结构, '名称' | '正面提示词' | '负面提示词' | '结构化特征'>;

type 场景生图依赖 = {
    apiConfig: 接口设置结构;
    获取场景文生图接口配置: (config: 接口设置结构) => 当前可用接口结构 | null;
    获取生图词组转化器接口配置: (config: 接口设置结构) => 当前可用接口结构 | null;
    获取生图画师串预设: (config: 接口设置结构, scope: 'npc' | 'scene', preferredId?: string) => { 名称: string; 画师串: string; 正面提示词: string; 负面提示词: string } | null;
    获取当前PNG画风预设: (preferredId?: string) => PNG画风预设摘要;
    获取场景角色锚点: (sceneContext: unknown) => 角色锚点摘要[];
    获取词组转化器预设提示词: (config: 接口设置结构, scope: 'npc' | 'scene' | 'scene_judge', mode?: 'default' | 'anchor') => string;
    接口配置是否可用: (config: 当前可用接口结构 | null) => config is 当前可用接口结构;
    场景模式已开启: () => boolean;
    创建场景生图任务: (params: {
        source: 生图任务来源类型;
        modelName: string;
        画风?: 当前可用接口结构['画风'];
        画师串?: string;
        来源回合?: number;
        摘要?: string;
    }) => 场景生图任务记录;
    生成场景生图记录ID: () => string;
    追加场景生图任务: (task: 场景生图任务记录) => void;
    更新场景生图任务: (taskId: string, updater: (task: 场景生图任务记录) => 场景生图任务记录) => void;
    更新场景图片档案: (updater: (archive: any) => any) => void;
    应用场景图片为壁纸: (imageId: string) => Promise<void> | void;
    当前任务允许自动应用: (requestId?: string) => boolean;
};

const 获取画风附加要求 = (style?: 当前可用接口结构['画风']): string => {
    switch (style) {
        case '二次元':
            return '附加画风要求：整体场景偏高完成度二次元动漫背景插画，强调清晰层次、干净线稿、协调色彩与横向宽景镜头感。';
        case '国风':
            return '附加画风要求：整体场景偏国风武侠/仙侠 2D 插画，强调山水写意、中式建筑细节、空气透视、烟霞与古典氛围。';
        case '写实':
            return '附加画风要求：整体场景偏细腻质感的 2D 写实环境插画，强调木石布料材质、体积光影和空间真实感，但禁止照片感。';
        default:
            return '';
    }
};

export const 执行场景生图工作流 = async (
    params: {
        bodyText: string;
        sceneContext: unknown;
        source?: 生图任务来源类型;
        来源回合?: number;
        摘要?: string;
        autoApply?: boolean;
        请求标识?: string;
        画风?: 当前可用接口结构['画风'];
        画师串预设ID?: string;
        PNG画风预设ID?: string;
        强制执行?: boolean;
        额外要求?: string;
        尺寸?: string;
        构图要求?: '纯场景' | '故事快照';
    },
    deps: 场景生图依赖
): Promise<void> => {
    const bodyText = (params.bodyText || '').trim();
    if (!bodyText) return;
    if (!deps.场景模式已开启() && !params.强制执行) return;

    const imageApi = deps.获取场景文生图接口配置(deps.apiConfig);
    const promptApi = deps.获取生图词组转化器接口配置(deps.apiConfig);
    if (!deps.接口配置是否可用(imageApi) || !deps.接口配置是否可用(promptApi)) {
        console.warn('场景生图已跳过：文生图模型或词组转化器配置不可用');
        return;
    }

    const modelName = imageApi.model;
    const 画师串预设 = deps.获取生图画师串预设(deps.apiConfig, 'scene', params.画师串预设ID);
    const PNG画风预设 = deps.获取当前PNG画风预设(params.PNG画风预设ID);
    const 角色锚点列表 = deps.获取场景角色锚点(params.sceneContext);
    const 词组转化兼容模式 = deps.apiConfig?.功能模型占位?.词组转化兼容模式 === true;
    const 角色锚点负面提示词 = 角色锚点列表.map((item) => (item.负面提示词 || '').trim()).filter(Boolean).join(', ');
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
    const 画师串 = [(画师串预设?.画师串 || '').trim(), (PNG画风预设?.画师串 || '').trim()]
        .map((item) => item.trim())
        .filter(Boolean)
        .join(', ');
    const 非画师风格正面提示词 = [(画师串预设?.正面提示词 || '').trim(), (PNG画风预设?.正面提示词 || '').trim()]
        .filter(Boolean)
        .join(', ');
    const 兼容模式风格提示词 = 词组转化兼容模式 ? 非画师风格正面提示词 : '';
    const 前置正向提示词 = [画师串, 词组转化兼容模式 ? '' : 非画师风格正面提示词].filter(Boolean).join(', ');
    const 合并负向画师串 = [(画师串预设?.负面提示词 || '').trim(), 角色锚点负面提示词, (PNG画风预设?.负面提示词 || '').trim()].filter(Boolean).join(', ');
    const 纯场景额外负面提示词 = params.构图要求 === '纯场景'
        ? 'people, person, human, man, woman, boy, girl, child, silhouette, crowd, face, eyes, hands, body, nude, nsfw, character, portrait, 1girl, 1boy, 1man, 1woman'
        : '';
    const 附加负面提示词 = [合并负向画师串, 纯场景额外负面提示词].filter(Boolean).join(', ');
    const PNG参数 = PNG画风预设?.优先复刻原参数 === true ? PNG画风预设?.参数 : undefined;
    const 画风 = params.画风;
    const 画风附加要求 = 获取画风附加要求(画风);
    const 场景词组转化器预设上下文 = 获取词组转化器预设上下文(deps.apiConfig, 'scene', 角色锚点列表.length > 0 ? 'anchor' : 'default');
    const 场景判定预设上下文 = 获取词组转化器预设上下文(deps.apiConfig, 'scene_judge');
    const 词组转化器提示词 = [场景词组转化器预设上下文.相关提示词.trim(), 画风附加要求]
        .filter(Boolean)
        .join('\n\n');
    const 场景判定提示词 = 场景判定预设上下文.相关提示词.trim();
    const promptApiForTask = {
        ...promptApi,
        词组转化器AI角色提示词: 场景词组转化器预设上下文.AI角色定制提示词,
        词组转化器提示词,
        场景判定提示词,
        词组转化输出策略: 场景词组转化器预设上下文.词组序列化策略
    };
    const imageApiForTask = {
        ...imageApi,
        词组转化输出策略: promptApiForTask.词组转化输出策略
    };
    const task = deps.创建场景生图任务({
        source: params.source || 'auto',
        modelName,
        画风,
        画师串: 前置正向提示词,
        来源回合: params.来源回合,
        摘要: params.摘要
    });
    const recordId = deps.生成场景生图记录ID();

    deps.追加场景生图任务(task);
    deps.更新场景生图任务(task.id, (currentTask) => ({
        ...currentTask,
        状态: 'running',
        开始时间: Date.now(),
        原始描述: JSON.stringify(params.sceneContext ?? {}, null, 2),
        构图: '场景',
        画风,
        额外要求: params.额外要求,
        尺寸: params.尺寸,
        进度阶段: 'prompting',
        进度文本: '正在根据最新正文整理场景快照词组。'
    }));
    deps.更新场景图片档案((archive) => ({
        ...archive,
        最近生图结果: {
            id: recordId,
            图片URL: undefined,
            本地路径: undefined,
            生图词组: '',
            原始描述: JSON.stringify(params.sceneContext ?? {}, null, 2),
            使用模型: modelName,
            生成时间: Date.now(),
            构图: '场景' as const,
            画风,
            画师串: 前置正向提示词,
            尺寸: params.尺寸,
            额外要求: params.额外要求,
            状态: 'pending' as const,
            错误信息: undefined,
            来源回合: params.来源回合,
            摘要: params.摘要
        }
    }));

    try {
        const { 原始描述, 生图词组, 场景类型, 场景判定说明 } = await imageAIService.generateSceneImagePrompt(
            bodyText,
            params.sceneContext,
            promptApiForTask,
            undefined,
            undefined,
            undefined,
            {
                启用画师串预设: !词组转化兼容模式 && (启用画师串预设 || 启用PNG画风预设),
                兼容模式: 词组转化兼容模式,
                风格提示词输入: 兼容模式风格提示词 || undefined,
                额外要求: params.额外要求,
                后端类型: imageApiForTask.图片后端类型,
                构图要求: params.构图要求,
                角色锚点列表
            }
        );
        const 合并生图词组 = [生图词组, 前置正向提示词]
            .map((item) => (item || '').trim())
            .filter(Boolean)
            .join(', ');
        const 最终提示词 = imageAIService.构建最终图片提示词(生图词组, imageApiForTask, {
            构图: '场景',
            场景类型,
            附加正向提示词: 前置正向提示词,
            附加负面提示词,
            尺寸: params.尺寸,
            PNG参数
        });
        deps.更新场景生图任务(task.id, (currentTask) => ({
            ...currentTask,
            原始描述,
            生图词组: 合并生图词组,
            最终正向提示词: 最终提示词.最终正向提示词,
            最终负向提示词: 最终提示词.最终负向提示词,
            构图: '场景',
            场景类型,
            场景判定说明,
            进度阶段: 'generating',
            进度文本: 场景类型 === '风景场景'
                ? '当前正文不适合直接做场景快照，已转为风景场景生成。'
                : '词组转换完成，正在生成场景快照。'
        }));
        deps.更新场景图片档案((archive) => ({
            ...archive,
            最近生图结果: {
                ...(archive?.最近生图结果 || {}),
                id: archive?.最近生图结果?.id || recordId,
                图片URL: archive?.最近生图结果?.图片URL,
                本地路径: archive?.最近生图结果?.本地路径,
                生图词组: 合并生图词组,
                最终正向提示词: 最终提示词.最终正向提示词,
                最终负向提示词: 最终提示词.最终负向提示词,
                原始描述,
                使用模型: modelName,
                生成时间: archive?.最近生图结果?.生成时间 || Date.now(),
                构图: '场景',
                场景类型,
                场景判定说明,
                画风,
                画师串: 前置正向提示词,
                尺寸: params.尺寸,
                额外要求: params.额外要求,
                状态: 'pending',
                错误信息: undefined,
                来源回合: params.来源回合,
                摘要: params.摘要
            }
        }));
        const imageResult = await imageAIService.generateImageByPrompt(生图词组, imageApiForTask, undefined, {
            构图: '场景',
            场景类型,
            附加正向提示词: 前置正向提示词,
            附加负面提示词,
            跳过基础负面提示词: Boolean((画师串预设?.负面提示词 || '').trim() || (PNG画风预设?.负面提示词 || '').trim()),
            尺寸: params.尺寸,
            PNG参数
        });
        const localizedImageResult = await imageAIService.persistImageAssetLocally(imageResult).catch(() => imageResult);
        deps.更新场景生图任务(task.id, (currentTask) => ({
            ...currentTask,
            进度阶段: 'saving',
            进度文本: '图片已生成，正在写入场景壁纸档案。'
        }));

        const result = {
            id: recordId,
            图片URL: localizedImageResult.图片URL,
            本地路径: localizedImageResult.本地路径,
            生图词组: 合并生图词组,
            最终正向提示词: localizedImageResult.最终正向提示词 || 最终提示词.最终正向提示词,
            最终负向提示词: localizedImageResult.最终负向提示词 || 最终提示词.最终负向提示词,
            原始描述,
            使用模型: modelName,
            生成时间: Date.now(),
            构图: '场景' as const,
            场景类型,
            场景判定说明,
            画风,
            画师串: 前置正向提示词,
            尺寸: params.尺寸,
            额外要求: params.额外要求,
            状态: 'success' as const,
            错误信息: undefined,
            来源回合: params.来源回合,
            摘要: params.摘要
        };

        deps.更新场景图片档案((archive) => ({
            ...archive,
            最近生图结果: result,
            生图历史: [
                result,
                ...(Array.isArray(archive?.生图历史) ? archive.生图历史 : [])
            ]
        }));

        let appliedAsWallpaper = false;
        if (params.autoApply !== false && deps.当前任务允许自动应用(params.请求标识)) {
            await deps.应用场景图片为壁纸(recordId);
            appliedAsWallpaper = true;
        }

        deps.更新场景生图任务(task.id, (currentTask) => ({
            ...currentTask,
            状态: 'success',
            完成时间: Date.now(),
            使用模型: modelName,
            原始描述,
            生图词组: 合并生图词组,
            最终正向提示词: localizedImageResult.最终正向提示词 || 最终提示词.最终正向提示词,
            最终负向提示词: localizedImageResult.最终负向提示词 || 最终提示词.最终负向提示词,
            构图: '场景',
            场景类型,
            场景判定说明,
            图片URL: localizedImageResult.图片URL,
            本地路径: localizedImageResult.本地路径,
            尺寸: params.尺寸,
            额外要求: params.额外要求,
            错误信息: undefined,
            进度阶段: 'success',
            进度文本: appliedAsWallpaper ? '图片已生成并自动应用为壁纸。' : '图片已生成并写入场景档案。',
            已应用为壁纸: appliedAsWallpaper
        }));
    } catch (error: any) {
        const errorMessage = typeof error?.message === 'string' && error.message.trim()
            ? error.message.trim()
            : '场景生图失败';
        deps.更新场景图片档案((archive) => ({
            ...archive,
            最近生图结果: {
                id: recordId,
                图片URL: archive?.最近生图结果?.图片URL,
                本地路径: archive?.最近生图结果?.本地路径,
                生图词组: archive?.最近生图结果?.生图词组 || '',
                最终正向提示词: archive?.最近生图结果?.最终正向提示词 || '',
                最终负向提示词: archive?.最近生图结果?.最终负向提示词 || '',
                原始描述: archive?.最近生图结果?.原始描述 || JSON.stringify(params.sceneContext ?? {}, null, 2),
                使用模型: modelName,
                生成时间: Date.now(),
                构图: '场景' as const,
                画风,
                画师串: 前置正向提示词,
                尺寸: params.尺寸,
                额外要求: params.额外要求,
                状态: 'failed' as const,
                错误信息: errorMessage,
                来源回合: params.来源回合,
                摘要: params.摘要
            }
        }));
        deps.更新场景生图任务(task.id, (currentTask) => ({
            ...currentTask,
            状态: 'failed',
            完成时间: Date.now(),
            构图: '场景',
            最终正向提示词: currentTask.最终正向提示词,
            最终负向提示词: currentTask.最终负向提示词,
            错误信息: errorMessage,
            进度阶段: 'failed',
            进度文本: errorMessage
        }));
        throw error;
    }
};
