import * as imageAIService from '../../services/ai/image';
import type { NPC生图任务记录, 生图任务来源类型, 接口设置结构 } from '../../types';
import { 获取词组转化器预设上下文, type 当前可用接口结构 } from '../../utils/apiConfig';
import { 生图最大自动重试次数, 执行生图模型调用带重试 } from '../../utils/imageGenerationRetry';
import type { PNG解析参数结构, 角色锚点结构 } from '../../models/system';
import { 解析视觉年龄, type 视觉年龄解析结果 } from '../../utils/visualAge';

import { 入队NPC生图, 出队NPC生图 } from './npcImageQueue';

const NPC生图运行中计数 = { current: 0 };

type 图片功能配置 = {
    总开关: boolean;
    NPC开关: boolean;
    使用词组转化器: boolean;
    NPC画风: 当前可用接口结构['画风'];
   用头像?: boolean;
   用立绘?: boolean;
   用半身?: boolean;
   用私密部位?: boolean;
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
    获取社交列表?: () => any[];
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

const 图片记录有地址 = (record: any): boolean => (
    typeof record?.图片URL === 'string' && record.图片URL.trim().length > 0
) || (
    typeof record?.本地路径 === 'string' && record.本地路径.trim().length > 0
);

const NPC已有成功构图 = (npc: any, 构图: '头像' | '半身' | '立绘'): boolean => {
    const records = [
        npc?.图片档案?.最近生图结果,
        npc?.最近生图结果,
        ...(Array.isArray(npc?.图片档案?.生图历史) ? npc.图片档案.生图历史 : [])
    ].filter((record: any) => record && typeof record === 'object');
    if (records.some((record: any) => record?.状态 === 'success' && record?.构图 === 构图 && 图片记录有地址(record))) {
        return true;
    }
    return 构图 === '头像' && typeof npc?.头像图片URL === 'string' && npc.头像图片URL.trim().length > 0;
};

const 获取画风附加要求 = (style?: 当前可用接口结构['画风']): string => {
    switch (style) {
        case '二次元':
            return '附加画风要求：整体画面偏高完成度二次元动漫插画，强调干净线稿、清晰赛璐璐体积、鲜明但协调的色彩组织。';
        case '国风':
            return '附加画风要求：整体画面偏国风插画审美，强调中式构图、写意气韵、细腻材质和含蓄笔触；这只是画风审美，不强制古代、武侠或仙侠服饰。若题材、正文或附加要求指定现代都市、末日丧尸、灵气复苏等现代语境，必须以题材服装、道具和场景为最高优先级。';
        case '写实':
            return '附加画风要求：整体画面必须偏照片级写实/电影剧照质感（photorealistic cinematic still），强调真实皮肤、真实布料、真实金属与自然镜头光影，避免动漫线稿、赛璐璐、扁平插画和卡通脸。';
        default:
            return '';
    }
};

const 获取画风负面提示词 = (style?: 当前可用接口结构['画风']): string => {
    switch (style) {
        case '写实':
            return 'anime, manga, cartoon, cel shading, flat illustration, 2d illustration, line art, drawn face, toon face, game cg, visual novel, chibi, exaggerated anime eyes';
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

const 读取NPC姓名 = (npc: any): string => (
    typeof npc?.姓名 === 'string' ? npc.姓名.trim() : ''
);

const 解析Name标识姓名 = (npcKey: string): string => {
    if (typeof npcKey !== 'string' || !npcKey.startsWith('name:')) return '';
    const body = npcKey.slice('name:'.length);
    const withoutSuffix = body.split('::')[0] || '';
    const parts = withoutSuffix.split(':').filter(Boolean);
    return (parts.length >= 2 ? parts.slice(1).join(':') : withoutSuffix).trim();
};

const NPC生图标识匹配 = (
    npcKey: string,
    candidate: any,
    index: number,
    getNpcKey: (npc: any, index?: number) => string
): boolean => {
    if (getNpcKey(candidate, index) === npcKey) return true;
    const name = 解析Name标识姓名(npcKey);
    return Boolean(name && 读取NPC姓名(candidate) === name);
};

const NPC生图进行中标识匹配 = (activeKey: string, npcKey: string, npc: any): boolean => {
    if (activeKey === npcKey) return true;
    const activeName = 解析Name标识姓名(activeKey);
    const currentName = 解析Name标识姓名(npcKey) || 读取NPC姓名(npc);
    return Boolean(activeName && currentName && activeName === currentName);
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

type NPC生图性别 = '男' | '女' | '男娘' | '扶她' | '';

const 读取目标性别 = (source: any): NPC生图性别 => {
    const gender = typeof source?.性别 === 'string' ? source.性别.trim() : '';
    if (gender === '男') return '男';
    if (gender === '女') return '女';
    if (gender === '男娘') return '男娘';
    if (gender === '扶她') return '扶她';
    return '';
};

const 读取NPC性别状态 = (gender: NPC生图性别): 'explicit' | 'unknown' => (
    gender ? 'explicit' : 'unknown'
);

const 解析NPC视觉年龄 = (age?: number, source?: any): 视觉年龄解析结果 => 解析视觉年龄({
    actualAge: age,
    explicitVisualAge: source?.外观年龄,
    topicMode: source?.题材模式,
    realmLevel: source?.境界层级,
    realmText: source?.境界,
    identity: source?.身份,
    appearance: source?.外貌,
    body: source?.身材,
    clothing: source?.衣着,
    // 注意：不要把机器生成的 视觉年龄约束 放进 bio。它是上一轮解析产出的指令文本
    // （含“不得仅因真实年龄称为老妇、老妪或老太婆”等字样），回灌后会被老态关键词
    // 误读成老年外貌证据，把年轻角色推进 elderly 分支。年龄判断只信角色原始描述字段。
    bio: [source?.简介, source?.核心性格特征, source?.性格].filter(Boolean).join('；'),
    race: source?.种族,
    species: source?.血统,
    statusText: source?.状态,
    additionalTexts: [source?.灵根, source?.灵根资质, source?.来源, source?.性转记录]
});

const 构建年龄正向提示词 = (visualAge: 视觉年龄解析结果): string => (
    Array.isArray(visualAge?.positiveTags) ? visualAge.positiveTags.join(', ') : ''
);

const 构建男娘年龄正向提示词 = (visualAge: 视觉年龄解析结果): string => {
    if (!visualAge) return 'soft youthful face';
    if (visualAge.visualAgeBand === 'elderly') return [构建年龄正向提示词(visualAge), 'elegant feminine aging face'].filter(Boolean).join(', ');
    if (visualAge.visualAgeBand === 'middle_aged') return [构建年龄正向提示词(visualAge), 'beautiful mature face', 'soft refined features'].filter(Boolean).join(', ');
    return [构建年龄正向提示词(visualAge), 'youthful appearance', 'soft youthful face', 'young-looking'].filter(Boolean).join(', ');
};

const 构建扶她年龄正向提示词 = (visualAge: 视觉年龄解析结果): string => {
    if (!visualAge) return 'heroic beauty';
    if (visualAge.visualAgeBand === 'elderly') return [构建年龄正向提示词(visualAge), 'regal feminine elder beauty'].filter(Boolean).join(', ');
    if (visualAge.visualAgeBand === 'middle_aged') return [构建年龄正向提示词(visualAge), 'beautiful mature face', 'heroic mature beauty'].filter(Boolean).join(', ');
    return [构建年龄正向提示词(visualAge), 'youthful beautiful appearance', 'heroic beauty', 'young-looking adult'].filter(Boolean).join(', ');
};

const 构建扶她双性特征默认提示词 = (): string => (
    'concealed futanari traits, hidden genital bulge under clothing, subtle crotch outline if clothing is tight, no explicit exposure by default'
);

const 构建年龄负向提示词 = (visualAge: 视觉年龄解析结果): string => (
    Array.isArray(visualAge?.negativeTags) ? visualAge.negativeTags.join(', ') : ''
);

const 内置性别固定前缀: Record<Exclude<NPC生图性别, ''>, { adult: string; minor: string }> = {
    女: {
        adult: '1woman, female, adult woman, feminine face, female body',
        minor: '1girl, female, teenage girl, feminine face, female body'
    },
    男: {
        adult: '1man, male, adult man, masculine face, male body',
        minor: '1boy, male, teenage boy, masculine face, male body'
    },
    男娘: {
        adult: '1boy, femboy, passing as female, extremely feminine face, beautiful delicate features, soft pretty appearance, slim body, narrow shoulders, flat chest, subtle male traits only',
        minor: '1boy, femboy, passing as female, extremely feminine teen face, beautiful delicate features, soft pretty appearance, slim body, flat chest, subtle male traits only'
    },
    扶她: {
        adult: '1woman, futanari, dickgirl, extremely feminine face, beautiful or heroic beauty, fully female presentation, female body with subtle athletic strength, soft breasts',
        minor: '1girl, futanari, dickgirl, extremely feminine face, youthful beauty, fully female presentation, female body with slight athletic strength, soft breasts'
    }
};

// 自定义固定前缀（设置项 NPC生图固定前缀自定义_*）非空时整体替代对应性别的内置固定前缀；
// 年龄感提示词仍按视觉年龄解析结果追加，不受影响。
const 构建性别正向提示词 = (gender: NPC生图性别, visualAge: 视觉年龄解析结果, 自定义固定前缀?: string): string => {
    const isAdult = visualAge?.isAdultVisual === true;
    const agePrompt = 构建年龄正向提示词(visualAge);
    const 自定义 = (自定义固定前缀 || '').trim();
    if (gender === '女') return [自定义 || 内置性别固定前缀.女[isAdult ? 'adult' : 'minor'], agePrompt].filter(Boolean).join(', ');
    if (gender === '男') return [自定义 || 内置性别固定前缀.男[isAdult ? 'adult' : 'minor'], agePrompt].filter(Boolean).join(', ');
    if (gender === '男娘') return [自定义 || 内置性别固定前缀.男娘[isAdult ? 'adult' : 'minor'], 构建男娘年龄正向提示词(visualAge)].filter(Boolean).join(', ');
    if (gender === '扶她') return [自定义 || 内置性别固定前缀.扶她[isAdult ? 'adult' : 'minor'], 构建扶她年龄正向提示词(visualAge), 构建扶她双性特征默认提示词()].filter(Boolean).join(', ');
    return agePrompt;
};

const 构建性别负向提示词 = (gender: NPC生图性别): string => {
    if (gender === '女') return '1boy, 1man, male, man, masculine, beard, mustache, goatee, old man, elderly man';
    if (gender === '男') return '1girl, female, woman, feminine, breasts, young female';
    if (gender === '男娘') return 'old man, elderly man, rugged beard, heavy beard, hyper-masculine bodybuilder, broad macho face, bulky male body, large muscles, broad thick neck, thick body hair, rough masculine face, mature patriarch look';
    if (gender === '扶她') return 'old man, elderly man, rugged beard, hyper-masculine face, flat-chested male-only body, bulky male bodybuilder, fully masculine torso without female traits, rough macho face, thick body hair, explicit public flashing, exposed genitals by default';
    return '';
};

const 清理性别冲突词组 = (prompt: string, gender: NPC生图性别): string => {
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
        : gender === '男'
            ? [
            /\b1\s*girl\b/i,
            /\b1\s*woman\b/i,
            /\bfemale\b/i,
            /\bwoman\b/i,
            /\bgirl\b/i,
            /\blady\b/i,
            /\bfeminine\b/i,
            /\bbreasts?\b/i,
            /\bcleavage\b/i
            ]
            : gender === '男娘'
                ? [
                    /\bold\s*man\b/i,
                    /\belderly\s*man\b/i,
                    /\brugged\b/i,
                    /\bheavy\s*beard\b/i,
                    /\bhyper-?masculine\b/i
                ]
                : [
                    /\bold\s*man\b/i,
                    /\belderly\s*man\b/i,
                    /\brugged\b/i,
                    /\bhyper-?masculine\b/i
                ];
    return prompt
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item && !banned.some((pattern) => pattern.test(item)))
        .join(', ');
};

const 强制性别词组 = (prompt: string, gender: NPC生图性别, visualAge: 视觉年龄解析结果, 自定义固定前缀?: string): string => {
    const genderPrompt = 构建性别正向提示词(gender, visualAge, 自定义固定前缀);
    const cleanedPrompt = 清理性别冲突词组(prompt, gender);
    return [genderPrompt, cleanedPrompt].filter(Boolean).join(', ');
};

export const 构建词组转化性别硬约束 = (gender: NPC生图性别, age?: number, npcData?: any, 自定义固定前缀?: string): string => {
    if (!gender && !(typeof age === 'number' && Number.isFinite(age))) return '';
    const visualAge = 解析NPC视觉年龄(age, npcData);
    const positive = 构建性别正向提示词(gender, visualAge, 自定义固定前缀);
    const negative = 构建性别负向提示词(gender);
    const ageNegative = 构建年龄负向提示词(visualAge);
    return [
        '【角色性别硬约束】',
        gender ? `输入资料中的性别是“${gender}”，最终英文 tags 必须保持这个性别，禁止改写成相反性别或更换性别模板。` : '',
        typeof age === 'number' && Number.isFinite(age)
            ? `输入资料中的真实年龄是“${Math.floor(age)}岁”，它用于经历、资历与寿元，不必机械等同于外观年龄。`
            : '',
        visualAge.narrativeConstraints.length > 0 ? `视觉年龄约束：${visualAge.narrativeConstraints.join('；')}` : '',
        positive ? `最终 <提示词> 开头必须包含：${positive}` : '',
        negative || ageNegative ? `最终 <提示词> 不得包含这些冲突词或同义短语：${[negative, ageNegative].filter(Boolean).join(', ')}` : '',
        gender === '男'
            ? '男性角色禁止输出 lady、woman、girl、female、feminine face、female body、noble lady 等女性描述。'
            : gender === '女'
                ? '女性角色禁止输出 man、boy、male、masculine face、male body、old man、elderly man 等男性描述。'
                : gender === '男娘'
                    ? '男娘角色允许高度女性化，甚至外表近似女性；默认应呈现可被误认成女性的年轻美貌风格，但仍需保留男娘/男性基础设定，不要改成普通壮汉。'
                    : gender === '扶她'
                        ? '扶她角色允许高度女性化，默认应以美貌或英气的年轻女性主体呈现，再叠加隐藏式双性征暗示；日常默认不应主动露出，只在正文、构图或额外要求明确要求时才直接表现男根。不要简化成纯男性模板，也不要无依据删除其关键性征设定。'
                : ''
    ].filter(Boolean).join('\n');
};

const 读取NPC生图自定义固定前缀 = (deps: NPC生图工作流依赖, gender: NPC生图性别): string => {
    const 占位 = deps.apiConfig?.功能模型占位;
    if (!占位 || !gender) return '';
    if (gender === '女') return (占位.NPC生图固定前缀自定义_女 || '').trim();
    if (gender === '男') return (占位.NPC生图固定前缀自定义_男 || '').trim();
    if (gender === '男娘') return (占位.NPC生图固定前缀自定义_男娘 || '').trim();
    if (gender === '扶她') return (占位.NPC生图固定前缀自定义_扶她 || '').trim();
    return '';
};

const 角色锚点是否匹配NPC性别 = (anchor: 角色锚点摘要, gender: NPC生图性别): boolean => {
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
    const taskSource: 生图任务来源类型 = options?.source || 'auto';
    const 可绕过自动开关 = options?.force === true;
    // 自动生图子类型勾选：auto度但对应子类型未勾选时直接跳过（手动 force 不受限）
    if (!可绕过自动开关 && taskSource === 'auto') {
        const 目标构图 = options?.构图 || '头像';
        if (目标构图 === '头像' && imageFeature.用头像 === false) return;
        if (目标构图 === '立绘' && imageFeature.用立绘 === false) return;
        if (目标构图 === '半身' && imageFeature.用半身 === false) return;
    }
    const backendType = imageApi?.图片后端类型;
    const wantsPromptTransformer = backendType === 'novelai' || imageFeature.使用词组转化器 !== false;
    const promptApi = wantsPromptTransformer ? deps.获取生图词组转化器接口配置(deps.apiConfig) : null;
    const promptApiAvailable = Boolean(promptApi && deps.接口配置是否可用(promptApi));
    const shouldUsePromptTransformer = backendType === 'novelai'
        ? true
        : Boolean(wantsPromptTransformer && promptApiAvailable);
    if (!imageFeature.总开关) {
        const message = '文生图功能总开关未开启，无法执行 NPC 生图。';
        if (options?.force) throw new Error(message);
        return;
    }
    if (!可绕过自动开关 && !imageFeature.NPC开关) return;
    if (!可绕过自动开关 && !deps.NPC符合自动生图条件(npc)) return;
    if (!imageApi || !deps.接口配置是否可用(imageApi)) {
        const message = '未配置可用的文生图接口，无法执行 NPC 生图。';
        if (options?.force) {
            throw new Error(message);
        }
        console.warn(`NPC 生图已跳过：${message}`);
        return;
    }
    if (wantsPromptTransformer && !promptApiAvailable) {
        if (backendType === 'novelai') {
            const message = 'NovelAI 模式必须绑定可用的词组转化器接口，请先完成配置。';
            if (options?.force) {
                throw new Error(message);
            }
            console.warn(`NPC 生图已跳过：${message}`);
            return;
        }
        console.warn('NPC 生图词组转化器配置不可用，已改用角色资料直出提示词继续生成。');
    }
    if (Array.from(deps.NPC生图进行中集合).some((activeKey) => NPC生图进行中标识匹配(activeKey, npcKey, npc))) return;
    if (NPC生图运行中计数.current >= 1) {
        入队NPC生图({ npc, options, deps });
        return;
    }

    const npcName = typeof npc?.姓名 === 'string' ? npc.姓名.trim() : '未命名NPC';
    const npcImageBaseData = deps.提取NPC生图基础数据(npc);
    const modelName = 获取图片后端显示名(imageApi);
    const 构图: '头像' | '半身' | '立绘' = options?.构图 || '头像';
    const latestNpc = (typeof deps.获取社交列表 === 'function' ? deps.获取社交列表() : [])
        .find((candidate: any, index: number) => NPC生图标识匹配(npcKey, candidate, index, deps.获取NPC唯一标识));
    if (!options?.force && latestNpc && NPC已有成功构图(latestNpc, 构图)) return;

    deps.NPC生图进行中集合.add(npcKey);
    const 画风 = options?.画风 || imageFeature.NPC画风;
    const 画师串预设 = deps.获取生图画师串预设(deps.apiConfig, 'npc', options?.画师串预设ID);
    const PNG画风预设 = deps.获取当前PNG画风预设(options?.PNG画风预设ID);
    const 目标性别 = 读取目标性别(npcImageBaseData) || 读取目标性别(npc);
    const 目标性别状态 = 读取NPC性别状态(目标性别);
    const 目标年龄 = typeof npcImageBaseData?.年龄 === 'number' ? npcImageBaseData.年龄 : (typeof npc?.年龄 === 'number' ? npc.年龄 : undefined);
    const 视觉年龄 = 解析NPC视觉年龄(目标年龄, npcImageBaseData || npc);
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
    const 自定义性别固定前缀 = 读取NPC生图自定义固定前缀(deps, 目标性别);
    const 性别固定前缀来源: 'default' | 'custom' = 自定义性别固定前缀 ? 'custom' : 'default';
    const 性别正向提示词 = 构建性别正向提示词(目标性别, 视觉年龄, 自定义性别固定前缀);
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
    const 年龄负向提示词 = 构建年龄负向提示词(视觉年龄);
    const 画风负面提示词 = 获取画风负面提示词(画风);
    const 合并负向画师串 = [性别负向提示词, 年龄负向提示词, 画风负面提示词, (画师串预设?.负面提示词 || '').trim(), (角色锚点?.负面提示词 || '').trim(), (PNG画风预设?.负面提示词 || '').trim()].filter(Boolean).join(', ');
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
    const 词组转化性别硬约束 = 构建词组转化性别硬约束(目标性别, 目标年龄, npcImageBaseData, 自定义性别固定前缀);
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
        NPC性别状态: 目标性别状态,
        性别固定前缀来源,
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
            NPC性别状态: 目标性别状态,
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

        console.info('[npc.image.request]', {
            npcKey,
            npcName,
            构图,
            gender: 目标性别 || 'unknown',
            genderStatus: 目标性别状态,
            source: taskSource
        });

    NPC生图运行中计数.current += 1;

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
        const 生图词组 = 强制性别词组(原始生图词组, 目标性别, 视觉年龄, 自定义性别固定前缀);
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
            性别固定前缀来源,
            进度阶段: 'generating',
            进度文本: shouldUsePromptTransformer ? '词组转换完成，正在调用图片模型生成图片。' : '角色资料整理完成，正在调用图片模型生成图片。'
        }));
        console.info('[npc.image.prompt]', {
            npcKey,
            npcName,
            targetGender: 目标性别 || 'unknown',
            genderStatus: 目标性别状态,
            targetAge: 目标年龄,
            visualAgeBand: 视觉年龄.visualAgeBand,
            visualAgeLabel: 视觉年龄.visualAgeLabel,
            fixedGenderPrefixSource: 性别固定前缀来源,
            composition: 构图,
            useAIPromptTransformer: shouldUsePromptTransformer,
            modelName,
            style: 画风,
            additionalRequirements: 额外要求,
            finalPositivePrompt: 最终提示词.最终正向提示词?.slice(0, 500),
            finalNegativePrompt: 最终提示词.最终负向提示词?.slice(0, 200),
            rawTagsLength: 生图词组?.length || 0
        });
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
                NPC性别状态: 目标性别状态,
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
                PNG参数,
                随机种子生成: deps.apiConfig?.功能模型占位?.随机种子生成 !== false
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
        let localizedImageResult: any;
        try {
            localizedImageResult = await imageAIService.persistImageAssetLocally(imageResult);
        } catch (persistErr: any) {
            console.error('[NPC生图链路] 图片本地化异常', npcName, persistErr?.message);
            throw persistErr;
        }
        const 调试链路 = Array.isArray(imageResult?.调试链路) ? imageResult.调试链路 : undefined;
        console.info('[NPC生图链路] 本地化完成', {
            npcName, 构图,
            rawHasUrl: Boolean(imageResult?.图片URL),
            rawHasPath: Boolean(imageResult?.本地路径),
            localHasUrl: Boolean(localizedImageResult?.图片URL),
            localHasPath: Boolean(localizedImageResult?.本地路径),
            urlPrefix: typeof localizedImageResult?.图片URL === 'string' ? localizedImageResult.图片URL.slice(0, 60) : '',
            pathPrefix: typeof localizedImageResult?.本地路径 === 'string' ? localizedImageResult.本地路径.slice(0, 60) : ''
        });
        if (!localizedImageResult.图片URL && !localizedImageResult.本地路径) {
            throw new Error('图片已生成，但未得到可展示或可保存的图片资源。');
        }
        deps.更新NPC生图任务(task.id, (currentTask) => ({
            ...currentTask,
            进度阶段: 'saving',
            进度文本: localizedImageResult.客户提示 || '图片已生成，正在写回图片档案。'
        }));
        deps.更新NPC最近生图结果(npcKey, (currentNpc) => {
            const 新ID = currentNpc?.图片档案?.最近生图结果?.id || currentNpc?.最近生图结果?.id || deps.生成NPC生图记录ID();
            const 成功结果 = {
                id: 新ID,
                图片URL: localizedImageResult.图片URL,
                本地路径: localizedImageResult.本地路径,
                生图词组,
                最终正向提示词: localizedImageResult.最终正向提示词 || 最终提示词.最终正向提示词,
                最终负向提示词: localizedImageResult.最终负向提示词 || 最终提示词.最终负向提示词,
                原始描述,
                NPC姓名: npcName,
                NPC性别: 目标性别 || undefined,
                NPC性别状态: 目标性别状态,
                使用模型: modelName,
                生成时间: Date.now(),
                构图,
                画风,
                画师串: 前置正向提示词,
                尺寸,
                状态: 'success' as const,
                调试链路
            };
            const archive = currentNpc?.图片档案 && typeof currentNpc.图片档案 === 'object' ? currentNpc.图片档案 : {};
            const 旧头像ID = typeof archive.已选头像图片ID === 'string' ? archive.已选头像图片ID.trim() : undefined;
            const 旧立绘ID = typeof archive.已选立绘图片ID === 'string' ? archive.已选立绘图片ID.trim() : undefined;
            const 已选头像图片ID = 构图 === '头像' ? 新ID : 旧头像ID;
            const 已选立绘图片ID = 构图 === '立绘' ? 新ID : 旧立绘ID;
            if (构图 === '头像' && 已选头像图片ID !== 旧头像ID) {
                console.info('[npc.image.slot.set]', {
                    npcKey, npcName,
                    field: '已选头像图片ID',
                    imageId: 已选头像图片ID,
                    previousImageId: 旧头像ID,
                    source: 'auto-generate'
                });
            } else if (构图 === '立绘' && 已选立绘图片ID !== 旧立绘ID) {
                console.info('[npc.image.slot.set]', {
                    npcKey, npcName,
                    field: '已选立绘图片ID',
                    imageId: 已选立绘图片ID,
                    previousImageId: 旧立绘ID,
                    source: 'auto-generate'
                });
            }
            return {
                ...currentNpc,
                最近生图结果: 成功结果,
                图片档案: {
                    ...archive,
                    最近生图结果: 成功结果,
                    生图历史: 合并生图历史记录(currentNpc, 成功结果),
                    已选头像图片ID,
                    已选立绘图片ID
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
            性别固定前缀来源,
            图片URL: localizedImageResult.图片URL,
            本地路径: localizedImageResult.本地路径,
            错误信息: undefined,
            调试链路,
            进度阶段: 'success',
            进度文本: localizedImageResult.客户提示
                ? `${localizedImageResult.客户提示}，图片已生成并写入图片档案。`
                : '图片已生成并写入图片档案。'
        }));
        console.info('[npc.image.result]', {
            npcKey,
            npcName,
            targetGender: 目标性别 || 'unknown',
            genderStatus: 目标性别状态,
            composition: 构图,
            imageUrlPrefix: typeof localizedImageResult.图片URL === 'string' ? localizedImageResult.图片URL.slice(0, 60) : '(none)',
            localPathPrefix: typeof localizedImageResult.本地路径 === 'string' ? localizedImageResult.本地路径.slice(0, 60) : '(none)',
            modelName,
            status: 'success'
        });
    } catch (error: any) {
        const errorMessage = typeof error?.message === 'string' && error.message.trim()
            ? error.message.trim()
            : 'NPC 生图失败';
        const 调试链路 = Array.isArray(error?.生图调试链路) ? error.生图调试链路 : undefined;
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
                NPC性别状态: 目标性别状态,
                使用模型: modelName,
                生成时间: Date.now(),
                构图,
                画风,
                画师串: 前置正向提示词,
                状态: 'failed' as const,
                错误信息: errorMessage,
                调试链路
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
            性别固定前缀来源,
            错误信息: errorMessage,
            调试链路,
            进度阶段: 'failed',
            进度文本: errorMessage
        }));
        throw error;
    } finally {
        NPC生图运行中计数.current -= 1;
        deps.NPC生图进行中集合.delete(npcKey);
        const 下一项 = 出队NPC生图();
        if (下一项) {
            // 队列接续任务是「后台自动触发」的，没有调用方能接住它的 rejection。
            // 若这里裸 void，401/402/403 等上游错误会直接冒到 window.unhandledrejection，
            // 被 index.html 的 preboot 处理器误判成「应用启动失败」并整屏盖住游戏。
            void 执行NPC生图工作流(下一项.npc, 下一项.options, 下一项.deps).catch((error) => {
                try {
                    const 队列NPC名称 = typeof 下一项.npc?.姓名 === 'string' ? 下一项.npc.姓名.trim() : '';
                    console.warn('NPC 生图队列接续任务失败（已隔离，不影响后续队列）', 队列NPC名称, error);
                } catch {
                    /* 兜底日志本身不得再抛错 */
                }
            });
        }
    }
};