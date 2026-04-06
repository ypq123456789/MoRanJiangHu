export type 小说拆分来源类型 = 'novel' | 'txt' | 'epub' | 'shared_json';

export type 小说拆分任务状态类型 = 'idle' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type 小说拆分分段模式类型 = 'single_chapter' | 'n_chapters' | 'custom_ranges';

export type 小说拆分注入目标类型 = 'main_story' | 'planning' | 'world_evolution';

export type 小说拆分分段处理状态类型 = '待处理' | '处理中' | '已完成' | '失败';

export type 小说拆分树节点类型 =
    | 'summary'
    | 'stage_summary'
    | 'timeline_group'
    | 'timeline_event'
    | 'segment_group'
    | 'segment';

export interface 小说拆分时间线事件结构 {
    标题: string;
    时间锚点: string;
    描述: string;
    涉及角色: string[];
}

export interface 小说拆分信息可见性结构 {
    谁知道: string[];
    谁不知道: string[];
    是否仅读者视角可见: boolean;
}

export interface 小说拆分可见信息条目结构 {
    内容: string;
    信息可见性: 小说拆分信息可见性结构;
}

export interface 小说拆分事件结构 {
    事件名: string;
    事件说明: string;
    开始时间: string;
    最早开始时间: string;
    最迟开始时间: string;
    结束时间: string;
    前置条件: string[];
    触发条件: string[];
    阻断条件: string[];
    事件结果: string[];
    对下一组影响: string[];
    信息可见性: 小说拆分信息可见性结构;
}

export interface 小说拆分角色推进结构 {
    角色名: string;
    本组前状态: string[];
    本组变化: string[];
    本组后状态: string[];
    对下一组影响: string[];
}

export interface 小说拆分章节结构 {
    id: string;
    数据集ID: string;
    序号: number;
    标题: string;
    内容: string;
    字数: number;
    createdAt: number;
    updatedAt: number;
}

export interface 小说拆分分段结构 {
    id: string;
    数据集ID: string;
    组号: number;
    标题: string;
    章节范围: string;
    章节标题: string[];
    是否开局组: boolean;
    起始章序号: number;
    结束章序号: number;
    启用注入: boolean;
    原文内容: string;
    字数: number;
    原文摘要: string;
    本组概括: string;
    开局已成立事实: string[];
    前组延续事实: string[];
    本组结束状态: string[];
    给下一组参考: string[];
    原著硬约束: 小说拆分可见信息条目结构[];
    可提前铺垫: 小说拆分可见信息条目结构[];
    关键事件: 小说拆分事件结构[];
    角色推进: 小说拆分角色推进结构[];
    登场角色: string[];
    时间线: 小说拆分时间线事件结构[];
    时间线起点: string;
    时间线终点: string;
    处理状态: 小说拆分分段处理状态类型;
    最近错误?: string;
    createdAt: number;
    updatedAt: number;
}

export interface 小说拆分树节点结构 {
    id: string;
    数据集ID: string;
    父节点ID?: string;
    类型: 小说拆分树节点类型;
    标题: string;
    内容: string;
    目标链路: 小说拆分注入目标类型[];
    关联分段ID列表?: string[];
    排序: number;
    子节点?: 小说拆分树节点结构[];
}

export interface 小说拆分数据集结构 {
    id: string;
    标题: string;
    作品名: string;
    来源类型: 小说拆分来源类型;
    schemaVersion: number;
    原始文件名?: string;
    原始文本长度: number;
    原始文本?: string;
    原始文本摘要?: string;
    总章节数: number;
    章节列表: 小说拆分章节结构[];
    分段模式: 小说拆分分段模式类型;
    每批章数: number;
    默认时间线起点: string;
    是否识别原著时间线: boolean;
    激活注入: boolean;
    当前阶段概括?: string;
    核心角色摘要: string[];
    核心角色: string[];
    分段列表: 小说拆分分段结构[];
    注入树: 小说拆分树节点结构[];
    createdAt: number;
    updatedAt: number;
}

export interface 小说拆分任务进度结构 {
    总分段数: number;
    已完成分段数: number;
    失败分段数: number;
    当前分段索引: number;
    百分比: number;
}

export interface 小说拆分任务结构 {
    id: string;
    数据集ID: string;
    名称: string;
    状态: 小说拆分任务状态类型;
    当前阶段: 'idle' | 'prepare' | 'segmenting' | 'processing' | 'snapshotting' | 'completed' | 'failed';
    分段模式: 小说拆分分段模式类型;
    每批章数: number;
    后台运行: boolean;
    自动续跑: boolean;
    单次处理批量: number;
    自动重试次数: number;
    当前游标: number;
    已完成分段ID列表: string[];
    失败分段ID列表: string[];
    最近错误?: string;
    进度: 小说拆分任务进度结构;
    createdAt: number;
    updatedAt: number;
    lastRunAt?: number;
    completedAt?: number;
}

export interface 小说拆分注入快照结构 {
    数据集ID: string;
    目标链路: 小说拆分注入目标类型;
    标题: string;
    条目数: number;
    文本: string;
    节点列表: 小说拆分树节点结构[];
    updatedAt: number;
}
