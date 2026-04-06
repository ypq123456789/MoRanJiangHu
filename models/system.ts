
// 系统配置相关定义 - 解耦自 types.ts

import { 角色数据结构 } from './character';
import { 环境信息结构 } from './environment';
import { 生图目标类型, 生图筛选性别类型, 生图筛选重要性类型, 场景图片档案 } from './imageGeneration';
import { NPC结构 } from './social';
import { 世界数据结构 } from './world';
import { 详细门派结构 } from './sect';
import { 任务结构, 约定结构 } from './task';
import { 剧情系统结构 } from './story';
import { 剧情规划结构 } from './storyPlan';
import { 女主剧情规划结构 } from './heroinePlan';
import { 同人剧情规划结构 } from './fandomPlanning/story';
import { 同人女主剧情规划结构 } from './fandomPlanning/heroinePlan';
import { 战斗状态结构 } from './battle';

export type 接口供应商类型 = 'gemini' | 'claude' | 'openai' | 'deepseek' | 'zhipu' | 'openai_compatible';

export type OpenAI兼容方案类型 = 'custom' | 'siliconflow' | 'together' | 'groq';

export type 请求协议覆盖类型 = 'auto' | 'openai' | 'gemini' | 'claude' | 'deepseek';

export type 图片响应格式类型 = 'url' | 'b64_json';
export type 文生图后端类型 = 'openai' | 'novelai' | 'sd_webui' | 'comfyui';
export type 文生图接口路径模式类型 = 'preset' | 'custom';
export type 文生图预设接口路径类型 = 'openai_images' | 'openai_chat' | 'novelai_generate' | 'sd_txt2img' | 'comfyui_prompt';
export type 生图画风类型 = '通用' | '二次元' | '写实' | '国风';
export type NovelAI采样器类型 = 'k_euler' | 'k_euler_ancestral' | 'k_dpmpp_2m' | 'k_dpmpp_2s_ancestral' | 'k_dpmpp_sde' | 'k_dpmpp_2m_sde';
export type NovelAI噪点表类型 = 'native' | 'karras' | 'exponential' | 'polyexponential';
export type 画师串预设适用范围类型 = 'npc' | 'scene' | 'all';
export type 词组转化器提示词预设类型 = 'nai' | 'npc' | 'scene' | 'scene_judge';
export type 角色锚点来源类型 = 'ai_extract' | 'manual' | 'imported';
export type 图片词组序列化策略类型 = 'flat' | 'nai_character_segments' | 'gemini_structured' | 'grok_structured';

export interface 画师串预设结构 {
    id: string;
    名称: string;
    适用范围: 画师串预设适用范围类型;
    画师串: string;
    正面提示词: string;
    负面提示词: string;
    createdAt: number;
    updatedAt: number;
}

export interface 词组转化器提示词预设结构 {
    id: string;
    名称: string;
    类型: 词组转化器提示词预设类型;
    提示词: string;
    角色锚定模式提示词?: string;
    场景角色锚定模式提示词?: string;
    无锚点回退提示词?: string;
    输出格式提示词?: string;
    createdAt: number;
    updatedAt: number;
}

export interface 角色锚点特征结构 {
    外貌标签?: string[];
    身材标签?: string[];
    胸部标签?: string[];
    发型标签?: string[];
    发色标签?: string[];
    眼睛标签?: string[];
    肤色标签?: string[];
    年龄感标签?: string[];
    服装基底标签?: string[];
    特殊特征标签?: string[];
}

export interface 角色锚点结构 {
    id: string;
    npcId: string;
    名称: string;
    是否启用: boolean;
    生成时默认附加: boolean;
    场景生图自动注入: boolean;
    正面提示词: string;
    负面提示词: string;
    结构化特征?: 角色锚点特征结构;
    来源: 角色锚点来源类型;
    原始提取文本?: string;
    提取模型信息?: string;
    createdAt: number;
    updatedAt: number;
}

export type PNG画风预设来源类型 = 'novelai' | 'sd_webui' | 'unknown';

export interface PNG解析参数结构 {
    采样器?: string;
    噪声计划?: string;
    步数?: number;
    CFG强度?: number;
    CFGScale?: number;
    CFG重缩放?: number;
    反向提示引导强度?: number;
    ClipSkip?: number;
    宽度?: number;
    高度?: number;
    随机种子?: number;
    SMEA?: boolean;
    SMEA动态?: boolean;
    动态阈值?: boolean;
    动态阈值百分位?: number;
    动态阈值模拟CFG?: number;
    高Sigma跳过CFG?: number;
    低Sigma跳过CFG?: number;
    偏好布朗噪声?: boolean;
    Euler祖先采样Bug兼容?: boolean;
    精细细节增强?: boolean;
    最小化Sigma无穷?: boolean;
    高分修复?: string;
    Hires修复?: {
        放大倍数?: number;
        步数?: number;
        放大器?: string;
        去噪强度?: number;
    };
    ADetailer?: {
        模型?: string;
        正向提示词?: string;
        负向提示词?: string;
    };
    模型?: string;
    V4正向提示?: {
        useCoords?: boolean;
        useOrder?: boolean;
        legacyUc?: boolean;
        characterCaptions?: Array<string | Record<string, unknown>>;
    };
    V4负向提示?: {
        useCoords?: boolean;
        useOrder?: boolean;
        legacyUc?: boolean;
        characterCaptions?: Array<string | Record<string, unknown>>;
    };
    原始参数?: Record<string, unknown>;
    LoRA列表?: Array<{
        名称: string;
        权重?: number;
    }>;
}

export interface PNG画风预设结构 {
    id: string;
    名称: string;
    来源: PNG画风预设来源类型;
    原始正面提示词: string;
    剥离后正面提示词: string;
    AI提炼正面提示词: string;
    正面提示词: string;
    负面提示词: string;
    画师串: string;
    画师命中项: string[];
    优先复刻原参数?: boolean;
    参数?: PNG解析参数结构;
    封面?: string;
    原始元数据?: string;
    元数据标签?: Record<string, string>;
    createdAt: number;
    updatedAt: number;
}

export interface 模型词组转化器预设结构 {
    id: string;
    名称: string;
    是否启用: boolean;
    模型专属提示词: string;
    锚定模式模型提示词?: string;
    词组序列化策略?: 图片词组序列化策略类型;
    NPC词组转化器提示词预设ID: string;
    场景词组转化器提示词预设ID: string;
    场景判定提示词预设ID: string;
    createdAt: number;
    updatedAt: number;
}

export interface 单接口配置结构 {
    id: string;
    名称: string;
    供应商: 接口供应商类型;
    兼容方案?: OpenAI兼容方案类型;
    协议覆盖?: 请求协议覆盖类型;
    baseUrl: string;
    apiKey: string;
    model: string;
    maxTokens?: number;
    temperature?: number;
    createdAt: number;
    updatedAt: number;
}

export interface 功能模型占位配置结构 {
    主剧情使用模型: string;
    剧情回忆独立模型开关: boolean;
    剧情回忆静默确认: boolean;
    剧情回忆完整原文条数N: number;
    剧情回忆最早触发回合: number;
    记忆总结独立模型开关: boolean;
    世界演变独立模型开关: boolean;
    变量计算独立模型开关: boolean;
    规划分析独立模型开关: boolean;
    女主规划独立模型开关: boolean;
    剧情规划独立模型开关: boolean;
    文章优化独立模型开关: boolean;
    小说拆分功能启用: boolean;
    小说拆分独立模型开关: boolean;
    剧情回忆使用模型: string;
    剧情回忆API地址: string;
    剧情回忆API密钥: string;
    记忆总结使用模型: string;
    记忆总结API地址: string;
    记忆总结API密钥: string;
    世界演变使用模型: string;
    世界演变API地址: string;
    世界演变API密钥: string;
    变量计算使用模型: string;
    变量计算API地址: string;
    变量计算API密钥: string;
    规划分析使用模型: string;
    规划分析API地址: string;
    规划分析API密钥: string;
    女主规划使用模型: string;
    女主规划API地址: string;
    女主规划API密钥: string;
    剧情规划使用模型: string;
    剧情规划API地址: string;
    剧情规划API密钥: string;
    文章优化使用模型: string;
    文章优化API地址: string;
    文章优化API密钥: string;
    文章优化提示词: string;
    小说拆分使用模型: string;
    小说拆分API地址: string;
    小说拆分API密钥: string;
    小说拆分RPM限制: number;
    小说拆分按N章分组: number;
    小说拆分单次处理批量: number;
    小说拆分自动重试次数: number;
    小说拆分后台运行: boolean;
    小说拆分自动续跑: boolean;
    小说拆分主剧情注入: boolean;
    小说拆分规划分析注入: boolean;
    小说拆分世界演变注入: boolean;
    小说拆分主剧情注入上限: number;
    小说拆分详细注入上限: number;
    文生图功能启用: boolean;
    文生图后端类型: 文生图后端类型;
    文生图模型使用模型: string;
    文生图模型API地址: string;
    文生图模型API密钥: string;
    ComfyUI工作流JSON: string;
    场景生图独立接口启用: boolean;
    场景生图后端类型: 文生图后端类型;
    场景生图模型使用模型: string;
    场景生图模型API地址: string;
    场景生图模型API密钥: string;
    场景ComfyUI工作流JSON: string;
    文生图接口路径模式: 文生图接口路径模式类型;
    文生图预设接口路径: 文生图预设接口路径类型;
    文生图接口路径: string;
    文生图响应格式: 图片响应格式类型;
    文生图OpenAI自定义格式: boolean;
    画师串预设列表: 画师串预设结构[];
    当前NPC画师串预设ID: string;
    当前场景画师串预设ID: string;
    当前NPCPNG画风预设ID: string;
    当前场景PNG画风预设ID: string;
    自动NPC生图画风: 生图画风类型;
    自动场景生图画风: 生图画风类型;
    自动场景生图构图要求?: '纯场景' | '故事快照';
    自动场景生图横竖屏?: '横屏' | '竖屏';
    自动场景生图分辨率?: string;
    NovelAI启用自定义参数: boolean;
    NovelAI采样器: NovelAI采样器类型;
    NovelAI噪点表: NovelAI噪点表类型;
    NovelAI步数: number;
    NovelAI负面提示词: string;
    NPC生图使用词组转化器: boolean;
    词组转化兼容模式: boolean;
    香闺秘档特写强制裸体语义: boolean;
    词组转化器启用独立模型: boolean;
    词组转化器使用模型: string;
    词组转化器API地址: string;
    词组转化器API密钥: string;
    词组转化器提示词: string;
    模型词组转化器预设列表: 模型词组转化器预设结构[];
    词组转化器提示词预设列表: 词组转化器提示词预设结构[];
    当前NAI词组转化器提示词预设ID: string;
    当前NPC词组转化器提示词预设ID: string;
    当前场景词组转化器提示词预设ID: string;
    当前场景判定提示词预设ID: string;
    角色锚点列表: 角色锚点结构[];
    当前角色锚点ID: string;
    PNG画风预设列表: PNG画风预设结构[];
    当前PNG画风预设ID: string;
    PNG提炼启用独立模型: boolean;
    PNG提炼使用模型: string;
    PNG提炼API地址: string;
    PNG提炼API密钥: string;
    场景生图启用: boolean;
    NPC生图启用: boolean;
    NPC生图性别筛选: 生图筛选性别类型;
    NPC生图重要性筛选: 生图筛选重要性类型;
}

export interface 接口设置结构 {
    activeConfigId: string | null;
    configs: 单接口配置结构[];
    功能模型占位: 功能模型占位配置结构;
}

export type 可用视觉区域 = '聊天' | '旁白' | '角色对话' | '判定' | '顶部栏' | '左侧栏' | '右侧栏' | '角色档案';
export type 可用UI文字令牌 = '页面标题' | '分组标题' | '正文' | '辅助文本' | '按钮' | '标签' | '数字' | '等宽信息';

export interface 字体资源结构 {
    id: string;
    名称: string;
    fontFamily: string;
    来源: 'system' | 'upload';
    文件名?: string;
    mimeType?: string;
    dataUrl?: string;
}

export interface 区域文字样式结构 {
    启用自定义?: boolean;
    字体ID?: string;
    字体颜色?: string;
    字号?: number;
    行高?: number;
    字形?: 'normal' | 'italic';
}

export interface UI文字样式结构 {
    启用自定义?: boolean;
    字体ID?: string;
    字体颜色?: string;
    字号?: number;
    行高?: number;
    字形?: 'normal' | 'italic';
}

export interface 图片管理设置结构 {
    场景图历史上限: number;
}

export interface 视觉设置结构 {
    时间显示格式: '传统' | '数字';
    背景图片?: string; // URL 或 Base64
    常驻壁纸?: string; // URL 或 Base64
    渲染层数: number; // New: Default 30
    字体大小?: number; // 兼容旧字段，默认 16
    段落间距?: number; // 兼容旧字段，默认 1.6
    AI思考流式折叠?: boolean; // 默认 true，流式与常规回合中默认折叠思考内容
    底部滚动关闭显示?: boolean; // 默认 false，开启后隐藏底部世界大事滚动区
    字体资源列表?: 字体资源结构[];
    区域文字样式?: Partial<Record<可用视觉区域, 区域文字样式结构>>;
    UI文字样式?: Partial<Record<可用UI文字令牌, UI文字样式结构>>;

    // 背景音乐设置
    启用背景音乐?: boolean;
    全局音量?: number; // 0 到 100
    音频播放模式?: 'list-loop' | 'single-loop' | 'random';
    当前播放曲目ID?: string;
}

export interface MusicTrack {
    id: string;
    名称: string;
    URL: string; // Data URL or Blob URL
    时长: number;
    封面URL?: string;
    歌词?: string; // LRC format
}

export type 剧情风格类型 = '后宫' | '修炼' | '一般' | '修罗场' | '纯爱' | 'NTL后宫';
export type NTL后宫档位 = '禁止乱伦' | '假乱伦' | '无限制';
export type 酒馆提示词后处理类型 = '未选择' | '单一用户' | '严格' | '半严格';
export type 游戏难度 = 'relaxed' | 'easy' | 'normal' | 'hard' | 'extreme';
export type 初始关系模板类型 = '独行少系' | '家族牵引' | '师门牵引' | '世家官门' | '青梅旧识' | '旧仇旧债';
export type 关系侧重类型 = '亲情' | '友情' | '师门' | '情缘' | '利益' | '仇怨';
export type 开局切入偏好类型 = '日常低压' | '在途起手' | '家宅起手' | '门派起手' | '风波前夜';
export type 同人来源类型 = '小说' | '动漫' | '游戏' | '影视';
export type 同人融合强度类型 = '轻度映射' | '中度混编' | '显性同台';

export type 酒馆预设消息角色类型 = 'system' | 'user' | 'assistant';

export interface 同人角色替换规则结构 {
    原名称: string;
    替换为: string;
}

export interface 同人融合配置结构 {
    enabled: boolean;
    作品名: string;
    来源类型: 同人来源类型;
    融合强度: 同人融合强度类型;
    保留原著角色: boolean;
    启用角色替换: boolean;
    替换目标角色名: string;
    附加替换角色名列表: string[];
    附加角色替换规则列表: 同人角色替换规则结构[];
    启用附加小说: boolean;
    附加小说数据集ID: string;
}

export interface OpeningConfig {
    初始关系模板: 初始关系模板类型;
    关系侧重: 关系侧重类型[];
    开局切入偏好: 开局切入偏好类型;
    同人融合: 同人融合配置结构;
}

export interface WorldGenConfig {
    worldName: string;
    worldSize: '弹丸之地' | '九州宏大' | '无尽位面';
    dynastySetting: string;
    sectDensity: '稀少' | '适中' | '林立';
    tianjiaoSetting: string;
    worldExtraRequirement: string;
    manualWorldPrompt: string;
    manualRealmPrompt: string;
    difficulty: 游戏难度;
}

export type SaveType = 'manual' | 'auto';

export interface 酒馆预设提示词结构 {
    identifier: string;
    name?: string;
    role: 酒馆预设消息角色类型;
    content: string;
    system_prompt?: boolean;
}

export interface 酒馆预设顺序项结构 {
    identifier: string;
    enabled: boolean;
}

export interface 酒馆预设顺序结构 {
    character_id: number;
    order: 酒馆预设顺序项结构[];
}

export interface 酒馆预设结构 {
    prompts: 酒馆预设提示词结构[];
    prompt_order: 酒馆预设顺序结构[];
}

export interface 酒馆预设条目结构 {
    id: string;
    名称: string;
    预设: 酒馆预设结构;
    角色ID?: number | null;
    导入时间?: number;
}

export interface 游戏设置结构 {
    字数要求: number; // Minimum logs body length
    叙事人称: '第一人称' | '第二人称' | '第三人称';
    启用行动选项: boolean; // Whether to require action_options output
    启用COT伪装注入: boolean; // Inject pseudo historical COT message before latest user input
    启用GPT模式: boolean; // Main-story normal mode: send current user input directly as the user trigger message
    启用女主剧情规划: boolean; // Inject heroine planning prompts as optional addon
    启用防止说话: boolean; // Inject NoControl prompt to avoid speaking for player
    启用真实世界模式: boolean; // Inject realism guardrails so the world can reject, punish, or kill the protagonist
    启用免责声明输出: boolean; // Require a separate disclaimer block at the end
    启用标签检测完整性: boolean; // Validate required label protocol completeness before accepting response
    启用标签修复: boolean; // Auto repair malformed labels before parsing
    启用自动重试: boolean; // Auto retry failed generation/parsing up to the built-in max attempts
    启用NSFW模式: boolean; // Gate NSFW prompt and heroine privacy UI
    启用饱腹口渴系统: boolean; // Toggle hunger/thirst prompt injection and UI visibility
    启用修炼体系: boolean; // Toggle cultivation/realm/kungfu prompt injection and related UI visibility
    剧情风格: 剧情风格类型; // Story style injected as assistant context before COT
    NTL后宫档位: NTL后宫档位; // NTL-only tier selector
    启用酒馆预设模式: boolean; // Use SillyTavern preset prompt/order pipeline
    酒馆预设列表?: 酒馆预设条目结构[];
    当前酒馆预设ID?: string | null;
    酒馆提示词后处理?: 酒馆提示词后处理类型;
    酒馆角色卡描述?: string;
    酒馆预设?: 酒馆预设结构 | null;
    酒馆预设角色ID?: number | null;
    酒馆预设名称?: string;
    独立APIGPT模式?: {
        剧情回忆: boolean;
        记忆总结: boolean;
        文章优化: boolean;
        世界演变: boolean;
        变量生成: boolean;
        规划分析: boolean;
        小说拆分: boolean;
    };
    额外提示词: string; // Custom prompt injected at the end
}

export interface 记忆配置结构 {
    短期记忆阈值: number; // 默认 30（短期 -> 中期）
    中期记忆阈值: number; // 默认 50（中期 -> 长期）
    重要角色关键记忆条数N: number; // 默认 20
    NPC记忆总结阈值: number; // 默认 20（NPC 记忆总结分段阈值）
    即时消息上传条数N: number; // 默认 10（按回合计数，用于即时 -> 短期滑动与 Script 上下文窗口）
    短期转中期提示词: string; 
    中期转长期提示词: string;
    NPC记忆总结提示词: string;
}

export interface 记忆系统结构 {
    回忆档案: 回忆条目结构[]; // 结构化回忆索引（用于互动历史存档）
    即时记忆: string[]; // 近期回合逐条记忆（第0回合开场也写入）
    短期记忆: string[]; // 短期摘要记忆条目
    中期记忆: string[];
    长期记忆: string[];
}

export interface 回忆条目结构 {
    名称: string; // 例如：【回忆001】
    概括: string; // 对应短期记忆
    原文: string; // 对应即时记忆
    回合: number; // 顺序号
    记录时间: string; // YYYY:MM:DD:HH:MM
    时间戳: string; // YYYY:MM:DD:HH:MM
}

export type ThemePreset = 'ink' | 'azure' | 'ember' | 'jade' | 'violet' | 'moon' | 'crimson' | 'sand';

export interface 聊天记录结构 {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    gameTime?: string; // 结构化时间戳字符串
    inputTokens?: number; // 上传/输入token估算值
    responseDurationSec?: number; // 发送到完整回复结束耗时（秒）
    outputTokens?: number; // AI输出token估算值
    [key: string]: any; // Allow extensibility for structuredResponse etc.
}

export interface 存档元数据结构 {
    schemaVersion?: number;
    历史记录条数?: number;
    历史记录是否裁剪?: boolean;
    自动存档签名?: string;
}

export interface 核心提示词快照结构 {
    世界观母本?: string;
    境界体系?: string;
}

export interface 存档结构 {
    id: number;
    类型: 'manual' | 'auto'; // Added Save Type
    时间戳: number;
    描述?: string; // Legacy field, no longer required by UI
    元数据?: 存档元数据结构;
    游戏初始时间?: string;
    角色数据: 角色数据结构;
    环境信息: 环境信息结构;
    历史记录: 聊天记录结构[];
    
    // Extended fields
    社交?: NPC结构[];
    世界?: 世界数据结构;
    战斗?: 战斗状态结构;
    玩家门派?: 详细门派结构;
    任务列表?: 任务结构[];
    约定列表?: 约定结构[];
    剧情?: 剧情系统结构;
    剧情规划?: 剧情规划结构;
    女主剧情规划?: 女主剧情规划结构;
    同人剧情规划?: 同人剧情规划结构;
    同人女主剧情规划?: 同人女主剧情规划结构;
    
    // New Settings in Save
    记忆系统?: 记忆系统结构;
    openingConfig?: OpeningConfig;
    游戏设置?: 游戏设置结构;
    记忆配置?: 记忆配置结构;
    视觉设置?: Partial<视觉设置结构>;
    场景图片档案?: 场景图片档案;
    核心提示词快照?: 核心提示词快照结构;
    角色锚点列表?: 角色锚点结构[];
    当前角色锚点ID?: string;
}

export type PromptCategory = '核心设定' | '数值设定' | '难度设定' | '写作设定' | '自定义';

export interface 提示词结构 {
    id: string;
    标题: string;
    内容: string;
    类型: PromptCategory;
    启用: boolean;
}

export interface 节日结构 {
    id: string;
    名称: string;
    月: number;
    日: number;
    描述: string;
    效果: string; // 如：鬼怪出现率增加
}
