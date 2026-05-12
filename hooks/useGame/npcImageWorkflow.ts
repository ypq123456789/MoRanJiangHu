import * as imageAIService from '../../services/ai/image';
import type { NPC生图任务记录, 生图任务来源类型, 接口设置结构 } from '../../types';
import { 获取词组转化器预设上下文, type 当前可用接口结构 } from '../../utils/apiConfig';
import { 生图最大自动重试次数, 执行生图模型调用带重试 } from '../../utils/imageGenerationRetry';
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

type 角色锚点摘要 = Pick<角色锚点结构, '名称' | '正面提示词' | '负面提示词' | '结构化特征' | '原始提取文本'> | null;

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

const 获取图片后端显示名 = (apiConfig: 当前可用接口结构): string => {
    switch (apiConfig.图片后端类型) {
        case 'comfyui':
            return 'ComfyUI';
        case 'sd_webui':
            return 'Stable Diffusion WebUI';
        case 'novelai':
        case 'openai':
        default:
            return (apiConfig.model || '').trim() || '图片模型';
    }
};

const 读取记录原始描述姓名 = (record: any): string => {
    const rawText = typeof record?.原始描述 === 'string' ? record.原始描述.trim() : '';
    if (!rawText) return '';
    try {
        const parsed = JSON.parse(rawText);
        return typeof parsed?.姓名 === 'string' ? parsed.姓名.trim() : '';
    } catch {
        return '';
    }
};

const 生图记录属于当前NPC = (currentNpc: any, record: any): boolean => {
    if (!record || typeof record !== 'object') return false;
    const currentName = typeof currentNpc?.姓名 === 'string' ? currentNpc.姓名.trim() : '';
    const recordName = typeof record?.NPC姓名 === 'string' ? record.NPC姓名.trim() : 读取记录原始描述姓名(record);
    if (currentName && recordName && currentName !== recordName) return false;
    const currentGender = 读取目标性别(currentNpc);
    const recordGender = 读取目标性别({ 性别: record?.NPC性别 });
    if (currentGender && recordGender && currentGender !== recordGender) return false;
    return true;
};

const 合并生图历史记录 = (currentNpc: any, incoming: any): any[] => {
    const archive = currentNpc?.图片档案 && typeof currentNpc.图片档案 === 'object' ? currentNpc.图片档案 : {};
    const baseHistory = Array.isArray(archive?.生图历史)
        ? archive.生图历史
        : (currentNpc?.最近生图结果 ? [currentNpc.最近生图结果] : []);
    const normalizedHistory = baseHistory.filter((item: any) => 生图记录属于当前NPC(currentNpc, item));
    if (!incoming || typeof incoming !== 'object') return normalizedHistory;
    if (!生图记录属于当前NPC(currentNpc, incoming)) return normalizedHistory;
    const incomingId = typeof incoming.id === 'string' ? incoming.id.trim() : '';
    const withoutSame = incomingId
        ? normalizedHistory.filter((item: any) => item?.id !== incomingId)
        : normalizedHistory;
    return [incoming, ...withoutSame];
};

const 读取目标性别 = (source: any): '男' | '女' | '' => {
    const gender = typeof source?.性别 === 'string' ? source.性别.trim() : '';
    if (gender === '男' || gender.includes('男')) return '男';
    if (gender === '女' || gender.includes('女')) return '女';
    return '';
};

const 构建年龄正向提示词 = (age?: number): string => {
    if (typeof age !== 'number' || !Number.isFinite(age) || age <= 0) return '';
    const normalizedAge = Math.max(1, Math.floor(age));
    if (normalizedAge >= 18) return `${normalizedAge} years old, adult, age-accurate face`;
    if (normalizedAge >= 15) return `${normalizedAge} years old, teenage adolescent, age-accurate teen face, not a child`;
    if (normalizedAge >= 13) return `${normalizedAge} years old, early teen, age-accurate teen face`;
    return `${normalizedAge} years old, child, age-accurate child face`;
};

const 构建年龄负向提示词 = (age?: number): string => {
    if (typeof age !== 'number' || !Number.isFinite(age) || age <= 0) return '';
    if (age >= 18) return 'teen, child, little girl, little boy, toddler, prepubescent, baby face';
    if (age >= 15) return 'child, little girl, little boy, toddler, preschooler, prepubescent, baby face,幼童,小女孩,小男孩';
    return '';
};

const 构建性别正向提示词 = (gender: '男' | '女' | '', age?: number): string => {
    const isAdult = typeof age === 'number' && age >= 18;
    const agePrompt = 构建年龄正向提示词(age);
    if (gender === '女') return [isAdult ? '1woman, female, adult woman, feminine face, female body' : '1girl, female, teenage girl, feminine face, female body', agePrompt].filter(Boolean).join(', ');
    if (gender === '男') return [isAdult ? '1man, male, adult man, masculine face, male body' : '1boy, male, teenage boy, masculine face, male body', agePrompt].filter(Boolean).join(', ');
    return agePrompt;
};

const 构建性别负向提示词 = (gender: '男' | '女' | ''): string => {
    if (gender === '女') return '1boy, 1man, male, man, masculine, beard, mustache, goatee, old man, elderly man';
    if (gender === '男') return '1girl, female, woman, feminine, breasts, young female';
    return '';
};

const 清理性别冲突词组 = (prompt: string, gender: '男' | '女' | ''): string => {
    if (!prompt || !gender) return prompt;
    const banned = gender === '女'
        ? [
            /\b1\s*man\b/i,
            /\b1\s*boy\b/i,
            /\bmale\b/i,
            /\bman\b/i,
            /\bboy\b/i,
            /\bmasculine\b/i,
            /\bbeard\b/i,
            /\bmustache\b/i,
            /\bgoatee\b/i
        ]
        : [
            /\b1\s*girl\b/i,
            /\b1\s*woman\b/i,
            /\bfemale\b/i,
            /\bwoman\b/i,
            /\bgirl\b/i,
            /\blady\b/i,
            /\bfeminine\b/i,
            /\bbreasts?\b/i,
            /\bcleavage\b/i
        ];
    return prompt
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item && !banned.some((pattern) => pattern.test(item)))
        .join(', ');
};

const 强制性别词组 = (prompt: string, gender: '男' | '女' | '', age?: number): string => {
    const genderPrompt = 构建性别正向提示词(gender, age);
    const cleanedPrompt = 清理性别冲突词组(prompt, gender);
    return [genderPrompt, cleanedPrompt].filter(Boolean).join(', ');
};

const 构建词组转化性别硬约束 = (gender: '男' | '女' | '', age?: number): string => {
    if (!gender && !(typeof age === 'number' && Number.isFinite(age))) return '';
    const positive = 构建性别正向提示词(gender, age);
    const negative = 构建性别负向提示词(gender);
    const ageNegative = 构建年龄负向提示词(age);
    return [
        '【角色性别硬约束】',
        gender ? `输入资料中的性别是“${gender}”，最终英文 tags 必须保持这个性别，禁止改写成相反性别或更换性别模板。` : '',
        typeof age === 'number' && Number.isFinite(age) ? `输入资料中的年龄是“${Math.floor(age)}岁”，最终英文 tags 必须体现这个年龄段，禁止画成明显更小的幼童或明显更老的成年人。` : '',
        positive ? `最终 <提示词> 开头必须包含：${positive}` : '',
        negative || ageNegative ? `最终 <提示词> 不得包含这些冲突词或同义短语：${[negative, ageNegative].filter(Boolean).join(', ')}` : '',
        gender === '男'
            ? '男性角色禁止输出 lady、woman、girl、female、feminine face、female body、noble lady 等女性描述。'
            : gender === '女'
                ? '女性角色禁止输出 man、boy、male、masculine face、male body、old man、elderly man 等男性描述。'
                : ''
    ].filter(Boolean).join('\n');
};

const 角色锚点是否匹配NPC性别 = (anchor: 角色锚点摘要, gender: '男' | '女' | ''): boolean => {
    if (!anchor || !gender) return true;
    const rawText = typeof anchor?.原始提取文本 === 'string' ? anchor.原始提取文本.trim() : '';
    if (!rawText) return true;
    try {
        const raw = JSON.parse(rawText);
        const anchorGender = 读取目标性别(raw);
        return !anchorGender || anchorGender === gender;
    } catch {
        return true;
    }
};

export const 执行NPC生图工作流 = async (
    npc: any,
    options: { force?: boolean; source?: 生图任务来源类型; 构图?: '头像' | '半身' | '立绘'; 画风?: 当前可用接口结构['画风']; 画师串?: string; 画师串预设ID?: string; PNG画风预设ID?: string; 额外要求?: string; 尺寸?: string; signal?: AbortSignal } | undefined,
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
    const modelName = 获取图片后端显示名(imageApi);
    const taskSource: 生图任务来源类型 = options?.source || 'auto';
    const 构图: '头像' | '半身' | '立绘' = options?.构图 || '头像';
    const 画风 = options?.画风 || imageFeature.NPC画风;
    const 画师串预设 = deps.获取生图画师串预设(deps.apiConfig, 'npc', options?.画师串预设ID);
    const PNG画风预设 = deps.获取当前PNG画风预设(options?.PNG画风预设ID);
    const 目标性别 = 读取目标性别(npcImageBaseData) || 读取目标性别(npc);
    const 目标年龄 = typeof npcImageBaseData?.年龄 === 'number' ? npcImageBaseData.年龄 : (typeof npc?.年龄 === 'number' ? npc.年龄 : undefined);
    const 原始角色锚点 = deps.获取NPC角色锚点(typeof npc?.id === 'string' ? npc.id.trim() : '');
    const 角色锚点 = 角色锚点是否匹配NPC性别(原始角色锚点, 目标性别) ? 原始角色锚点 : null;
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
    const 性别正向提示词 = 构建性别正向提示词(目标性别, 目标年龄);
    const 性别负向提示词 = 构建性别负向提示词(目标性别);
    const 角色锚点前置注入提示词 = !shouldUsePromptTransformer && 角色锚点
        ? imageAIService.构建角色锚点注入提示词({
            正面提示词: 角色锚点.正面提示词,
            结构化特征: 角色锚点.结构化特征
        }, { 构图 })
        : '';
    const 前置正向提示词 = [
        性别正向提示词,
        画师串,
        词组转化兼容模式 ? '' : 非画师风格正面提示词,
        角色锚点前置注入提示词
    ].filter(Boolean).join(', ');
    const 年龄负向提示词 = 构建年龄负向提示词(目标年龄);
    const 合并负向画师串 = [性别负向提示词, 年龄负向提示词, (画师串预设?.负面提示词 || '').trim(), (角色锚点?.负面提示词 || '').trim(), (PNG画风预设?.负面提示词 || '').trim()].filter(Boolean).join(', ');
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
    const 词组转化性别硬约束 = 构建词组转化性别硬约束(目标性别, 目标年龄);
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
            NPC姓名: npcName,
            NPC性别: 目标性别 || undefined,
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
                    ...(currentNpc?.图片档案 && typeof currentNpc.图片档案 === 'object' ? currentNpc.图片档案 : {}),
                    最近生图结果: 待处理结果,
                    生图历史: 合并生图历史记录(currentNpc, 待处理结果)
                }
            };
        });

    try {
        const { 原始描述, 生图词组: 原始生图词组 } = shouldUsePromptTransformer && promptApi
            ? await imageAIService.generateNpcImagePrompt(
                npcImageBaseData,
                safePromptApi,
                undefined,
                词组转化性别硬约束 || undefined,
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
        const 生图词组 = 强制性别词组(原始生图词组, 目标性别, 目标年龄);
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
                NPC姓名: npcName,
                NPC性别: 目标性别 || undefined,
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
                    ...(currentNpc?.图片档案 && typeof currentNpc.图片档案 === 'object' ? currentNpc.图片档案 : {}),
                    最近生图结果: 处理中结果,
                    生图历史: 合并生图历史记录(currentNpc, 处理中结果)
                }
            };
        });
        const imageResult = await 执行生图模型调用带重试(
            () => imageAIService.generateImageByPrompt(生图词组, imageApiForTask, options?.signal, {
                构图,
                尺寸: 尺寸 || undefined,
                附加正向提示词: 前置正向提示词,
                附加负面提示词: 合并负向画师串,
                跳过基础负面提示词: Boolean((画师串预设?.负面提示词 || '').trim() || (PNG画风预设?.负面提示词 || '').trim()),
                PNG参数
            }),
            {
                signal: options?.signal,
                onAttempt: (attempt, totalAttempts) => {
                    deps.更新NPC生图任务(task.id, (currentTask) => ({
                        ...currentTask,
                        状态: 'running',
                        重试次数: Math.max(0, attempt - 1),
                        最大重试次数: 生图最大自动重试次数,
                        进度阶段: 'generating',
                        进度文本: `${shouldUsePromptTransformer ? '词组转换完成' : '角色资料整理完成'}，正在调用图片模型生成图片（第 ${attempt}/${totalAttempts} 次尝试）。`
                    }));
                },
                onRetry: (attempt, totalAttempts, errorMessage) => {
                    deps.更新NPC生图任务(task.id, (currentTask) => ({
                        ...currentTask,
                        状态: 'running',
                        重试次数: attempt,
                        最大重试次数: 生图最大自动重试次数,
                        错误信息: errorMessage,
                        进度阶段: 'generating',
                        进度文本: `第 ${attempt}/${totalAttempts} 次图片生成失败：${errorMessage}；正在自动重试。`
                    }));
                }
            }
        );
        const localizedImageResult = await imageAIService.persistImageAssetLocally(imageResult);
        if (!localizedImageResult.图片URL && !localizedImageResult.本地路径) {
            throw new Error('图片已生成，但未得到可展示或可保存的图片资源。');
        }
        deps.更新NPC生图任务(task.id, (currentTask) => ({
            ...currentTask,
            进度阶段: 'saving',
            进度文本: localizedImageResult.客户提示 || '图片已生成，正在写回图片档案。'
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
                NPC姓名: npcName,
                NPC性别: 目标性别 || undefined,
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
                    ...(currentNpc?.图片档案 && typeof currentNpc.图片档案 === 'object' ? currentNpc.图片档案 : {}),
                    最近生图结果: 成功结果,
                    生图历史: 合并生图历史记录(currentNpc, 成功结果)
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
            进度文本: localizedImageResult.客户提示
                ? `${localizedImageResult.客户提示}，图片已生成并写入图片档案。`
                : '图片已生成并写入图片档案。'
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
                NPC姓名: npcName,
                NPC性别: 目标性别 || undefined,
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
                    ...(currentNpc?.图片档案 && typeof currentNpc.图片档案 === 'object' ? currentNpc.图片档案 : {}),
                    最近生图结果: 失败结果,
                    生图历史: 合并生图历史记录(currentNpc, 失败结果)
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
