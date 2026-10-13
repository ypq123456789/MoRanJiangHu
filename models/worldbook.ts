export type 世界书类型 = 'world_lore' | 'system_rule' | 'command_rule' | 'output_rule';
/**
 * 条目归属的可选功能模块。留空表示不属于任何模块（永远注入）。
 * 用于把世界书条目与设置页开关联动：关闭对应功能时该条目不再注入。
 * 枚举值与 utils/promptFeatureToggles.ts 的 PROMPT_FEATURE 标记协议保持一致。
 */
export type 世界书条目功能模块 = 'cultivation' | 'survival' | 'femboy_nsfw';
export type 世界书作用域 =
    | 'main'
    | 'opening'
    | 'world_evolution'
    | 'variable_calibration'
    | 'story_plan'
    | 'heroine_plan'
    | 'recall'
    | 'tavern'
    | 'all';
export type 世界书注入模式 = 'always' | 'match_any';
export type 世界书条目形态 = 'normal' | 'timeline_outline' | 'time_injection';
export type 世界书内置分类 = '常驻' | '开局' | '主剧情' | '变量生成' | '文章优化' | '回忆' | '世界演变' | '地图生成';
export type 内置提示词分类 = 世界书内置分类;

export interface 世界书条目结构 {
    id: string;
    标题: string;
    内容: string;
    条目形态?: 世界书条目形态;
    类型: 世界书类型;
    作用域: 世界书作用域[];
    内置槽位?: string;
    内置分类?: 世界书内置分类;
    内置生效条件?: string;
    注入说明?: string;
    注入模式: 世界书注入模式;
    时间线开始时间?: string;
    时间线结束时间?: string;
    关键词?: string[];
    优先级?: number;
    启用?: boolean;
    /** 归属的可选功能模块；关闭对应设置开关时该条目不注入（留空=始终注入） */
    功能模块?: 世界书条目功能模块;
    内置?: boolean;
    创建时间?: number;
    更新时间?: number;
}

export interface 世界书结构 {
    id: string;
    标题: string;
    描述?: string;
    常驻大纲?: string;
    启用?: boolean;
    内置?: boolean;
    条目: 世界书条目结构[];
    创建时间?: number;
    更新时间?: number;
}

/** 世界书联动过滤后的视图结构（条目可能少于原始书） */
export interface 世界书功能模块结构 {
    条目: 世界书条目结构[];
}

export interface 世界书导出结构 {
    version: number;
    exportedAt: string;
    books: 世界书结构[];
}

export interface 世界书预设组结构 {
    id: string;
    名称: string;
    描述?: string;
    启用?: boolean;
    书籍快照: 世界书结构[];
    创建时间?: number;
    更新时间?: number;
}

export interface 世界书预设组导出结构 {
    version: number;
    exportedAt: string;
    groups: 世界书预设组结构[];
}

export interface 内置提示词条目结构 {
    id: string;
    槽位ID: string;
    标题: string;
    分类: 内置提示词分类;
    内容: string;
    启用?: boolean;
    创建时间?: number;
    更新时间?: number;
}

export interface 内置提示词导出结构 {
    version: number;
    exportedAt: string;
    entries: 内置提示词条目结构[];
}
