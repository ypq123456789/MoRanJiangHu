// 设置页左侧导航的分组数据。
//
// 为什么单独一个文件：桌面端（SettingsModal）与手机端（MobileSettingsModal）
// 现在各抄了一份 30 项的平铺列表，label 还不一致（桌面「游戏设定」/手机「游戏」）。
// 分组只写在这里，两边以后共用同一份，不会各长各的。
//
// 这里只有数据和一个展平函数，不含任何界面代码。

export type SettingsTab =
    | 'api' | 'workflow_graph' | 'image_generation'
    | 'recall' | 'memory_summary_model' | 'memory_refine_model' | 'map_model'
    | 'polish' | 'role_chat' | 'world_evolution' | 'variable_model' | 'planning_model'
    | 'independent_api_gpt' | 'novel_decomposition' | 'novel_decomposition_runtime'
    | 'prompt' | 'storage' | 'theme' | 'visual' | 'world' | 'game' | 'reality'
    | 'tavern_preset' | 'memory' | 'history' | 'context' | 'logs' | 'music'
    | 'npc_management' | 'variable_manager';

export type 设置项 = { id: SettingsTab; label: string };

export type 设置组 = {
    /** 稳定 id，折叠状态按它存 localStorage */
    id: string;
    /** 组标题文案 */
    title: string;
    /** 组内直接可见的项 */
    items: 设置项[];
    /** 可折叠的二级抽屉（当前只有「各环节独立模型」用） */
    sub?: { id: string; title: string; items: 设置项[] };
    /** 挂在组末尾的一行小字说明 */
    note?: string;
};

export const 设置导航分组: 设置组[] = [
    {
        id: 'play',
        title: '玩法与规则',
        items: [
            { id: 'game', label: '游戏设定' },
            { id: 'reality', label: '真实世界' },
            { id: 'tavern_preset', label: '酒馆预设' },
            { id: 'world', label: '世界设定' },
        ],
    },
    {
        id: 'world',
        title: '角色与世界',
        items: [
            { id: 'npc_management', label: 'NPC管理' },
            { id: 'variable_manager', label: '变量管理' },
            { id: 'memory', label: '记忆配置' },
        ],
    },
    {
        id: 'model',
        title: '模型与接口',
        items: [
            { id: 'api', label: '接口连接' },
            { id: 'workflow_graph', label: '生成流程图' },
            { id: 'image_generation', label: '文生图' },
        ],
        sub: {
            id: 'model:sub',
            title: '各环节独立模型',
            items: [
                { id: 'recall', label: '剧情回忆' },
                { id: 'memory_summary_model', label: '记忆总结' },
                { id: 'memory_refine_model', label: '记忆精炼' },
                { id: 'map_model', label: '地图生成' },
                { id: 'polish', label: '文章优化' },
                { id: 'role_chat', label: '角色对话' },
                { id: 'world_evolution', label: '世界演变' },
                { id: 'variable_model', label: '变量生成' },
                { id: 'planning_model', label: '规划分析' },
                { id: 'independent_api_gpt', label: '独立API GPT' },
                { id: 'novel_decomposition', label: '小说分解接口' },
                { id: 'novel_decomposition_runtime', label: '当前小说分解注入' },
            ],
        },
    },
    {
        id: 'look',
        title: '界面与声音',
        items: [
            { id: 'visual', label: '视觉显示' },
            { id: 'music', label: '背景音乐' },
            { id: 'theme', label: '界面风格' },
        ],
    },
    {
        id: 'data',
        title: '数据与排查',
        items: [
            { id: 'context', label: '上下文' },
            { id: 'prompt', label: '提示词' },
            { id: 'history', label: '互动历史' },
            { id: 'logs', label: '运行日志' },
            { id: 'storage', label: '数据存储' },
        ],
        note: '互动历史仅研发模式显示',
    },
];

/** 展平后的 30 项（顺序按分组展开），给手机那排横滑按钮和可见性纠偏用 */
export const 展平设置项 = (): 设置项[] =>
    设置导航分组.flatMap((组) => [...组.items, ...(组.sub?.items ?? [])]);

/**
 * 5 个组的 id（不含抽屉）。
 * 注意：组 id 与设置项 id 共用同一个字符串命名空间——例如组 `world` 与设置项
 * `world`（世界设定）同名。折叠状态只认本函数返回的键，所以目前不会串味；
 * 但以后新增组时请避开设置项 id，别再制造这种同名。
 */
export const 全部组ID = (): string[] => 设置导航分组.map((组) => 组.id);

/** 默认收起 = 五组全收 + 抽屉收起。用户 2026-11-21 拍板：首屏就是一屏五个标题。 */
export const 默认收起组 = (): string[] => [
    ...全部组ID(),
    ...设置导航分组.flatMap((组) => (组.sub ? [组.sub.id] : [])),
];

/** 折叠状态存这里 */
export const 折叠存储键 = 'moran.settingsNav.collapsedV2';

/** 只认「组 id / 抽屉 id」这类折叠键；项 id 不算折叠键 */
export const 是折叠键 = (id: string): boolean => 默认收起组().includes(id);

/** 读折叠状态；脏数据 / 旧键 / 读不到就退回默认全收 */
export const 读取收起组 = (): string[] => {
    if (typeof window === 'undefined') return 默认收起组();
    try {
        const raw = window.localStorage.getItem(折叠存储键);
        if (!raw) return 默认收起组();
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
            // 去掉认不出的键（例如旧版本没前缀的 'play'、或误存进来的项 id）
            const 干净 = (parsed as string[]).filter(是折叠键);
            return 干净.length === (parsed as string[]).length ? 干净 : 默认收起组();
        }
    } catch {
        // 读坏了就当没有，别让设置页打不开
    }
    return 默认收起组();
};
