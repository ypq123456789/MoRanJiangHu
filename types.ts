export * from './models/character';
export * from './models/environment';
export * from './models/system';
export * from './models/imageGeneration';
export * from './models/world';
export * from './models/item';
export * from './models/social';
export * from './models/kungfu'; 
export * from './models/sect'; 
export * from './models/task'; 
export * from './models/story'; 
export * from './models/storyPlan';
export * from './models/heroinePlan';
export * from './models/fandomPlanning/story';
export * from './models/fandomPlanning/heroinePlan';
export * from './models/battle';
export * from './models/worldbook';
export * from './models/novelDecomposition';

// New types for the advanced chat system

export interface TavernCommand {
    action: 'add' | 'set' | 'push' | 'delete' | 'sub';
    key: string;
    value: any;
}

export interface GameLog {
    sender: string;
    text: string;
    rawText?: string; // Optional debug source for the rendered bubble only.
    /** 酒馆预设 JS交互/HTML美化 脚本产出的 HTML 内容，由沙箱 iframe 或 DOMPurify 安全渲染 */
    htmlContent?: string;
    /** htmlContent 的渲染模式：'sandbox' = iframe 沙箱, 'purify' = DOMPurify 清洗后渲染 */
    htmlRenderMode?: 'sandbox' | 'purify';
}

export interface JudgmentThoughtBlock {
    raw: string;
    text: string;
    attachedTo?: string;
    isNsfw?: boolean;
}

export interface GameResponse {
    logs: GameLog[];
    thinking_pre?: string;
    thinking_native?: string;
    t_input?: string;
    t_plan?: string;
    t_var_plan?: string;
    t_state?: string;
    t_branch?: string;
    t_precheck?: string;
    t_logcheck?: string;
    t_var?: string;
    t_npc?: string;
    t_cmd?: string;
    t_audit?: string;
    t_fix?: string;
    thinking_post?: string;
    t_mem?: string;
    t_opts?: string;
    tavern_commands?: TavernCommand[];
    shortTerm?: string;
    action_options?: string[]; // Quick actions for the user
    dynamic_world?: string[]; // Hints for world-evolution model
    declaredSpeakers?: string[]; // Names declared via <角色名单> tag
    judge_blocks?: JudgmentThoughtBlock[];
    body_optimized?: boolean;
    body_optimized_manual?: boolean;
    body_optimized_at?: number;
    body_optimized_model?: string;
    body_original_logs?: GameLog[];
    variable_calibration_report?: string[];
    variable_calibration_commands?: TavernCommand[];
    variable_calibration_model?: string;
    planning_analysis_updated?: boolean;
    planning_analysis_report?: string;
    planning_analysis_commands?: TavernCommand[];
}

// Extend/Override the old history structure
export interface 聊天记录结构 {
    role: 'user' | 'assistant' | 'system';
    content: string; // Keep for backward compat or user input
    structuredResponse?: GameResponse; // The parsed object for assistant
    timestamp: number;
    rawJson?: string; // Raw model text for source view/edit
    gameTime?: string; // Added gameTime
    inputTokens?: number; // Estimated uploaded/input tokens
    responseDurationSec?: number; // Request start -> final reply duration (seconds)
    outputTokens?: number; // Estimated AI output tokens
    autoScrollToTurnIcon?: boolean;
    autoScrollToTurnStart?: boolean;
}

export interface 天赋结构 {
    名称: string;
    描述: string;
    效果: string; // 叙事依据：给 LLM 编故事用的因果逻辑描述
    叙事约束?: string; // 可选，高优先级叙事注意事项，注入 system prompt 最前面
    /** true = 不进入抽卡/列表选择池，仍可通过背景自带等系统入口注入 */
    隐藏?: boolean;
}

export type 背景初始物品 = {
    名称: string;
    数量?: number;
    描述?: string;
    类型?: string;
};

export type 背景开局货币 = {
    名称: string;
    数量?: number;
    最小数量?: number;
    最大数量?: number;
    描述?: string;
    类型?: string;
};

export interface 背景结构 {
    名称: string;
    描述: string;
    效果: string;
    /** 代码必然投放的开局物品。背景定义该字段后，不再追加题材默认物品。 */
    初始物品?: 背景初始物品[];
    /** 只提供给 LLM 在开局叙事中按背景选择，不由本地代码随机抽取。 */
    可选初始物品?: 背景初始物品[];
    /** 背景明确允许并由本地代码派发的开局货币；不写则不会从默认货币继承。 */
    开局货币?: 背景开局货币[];
    /** 引用天赋池名称：选中该背景时强制附带，不计入玩家可选上限 */
    自带天赋?: string[];
}
