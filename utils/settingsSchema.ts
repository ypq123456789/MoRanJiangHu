import { 自定义开局预设存储键 } from './customNewGamePresets';
import { 内置提示词存储键 } from './builtinPrompts';
import { 世界书存储键, 世界书预设组存储键 } from './worldbook';

export const 设置键 = {
    应用主题: 'app_theme',
    API配置: 'api_settings',
    提示词池: 'prompts',
    节日配置: 'festivals',
    视觉设置: 'visual_settings',
    图片管理设置: 'image_manager_settings',
    游戏设置: 'game_settings',
    记忆设置: 'memory_settings',
    小说分解数据集: 'novel_decomposition_datasets',
    小说分解任务: 'novel_decomposition_tasks',
    小说分解注入快照: 'novel_decomposition_snapshots',
    场景图片档案: 'scene_image_archive',
    内置提示词: 内置提示词存储键,
    世界书列表: 世界书存储键,
    世界书预设组: 世界书预设组存储键,
    音乐曲库: 'music_tracks',
    自定义天赋: 'new_game_custom_talents',
    自定义背景: 'new_game_custom_backgrounds',
    自定义开局预设: 自定义开局预设存储键,
    存档保护: 'storage_save_protection',
    图片资源迁移版本: 'image_asset_migration_v2'
} as const;

export type 设置键类型 = typeof 设置键[keyof typeof 设置键];
export type 设置分类类型 =
    | 'interface'
    | 'prompt'
    | 'world'
    | 'gameplay'
    | 'memory'
    | 'media'
    | 'customization'
    | 'system';

export interface 设置分类定义 {
    id: 设置分类类型;
    label: string;
    description: string;
    order: number;
}

export interface 设置项定义 {
    key: 设置键类型;
    label: string;
    category: 设置分类类型;
    description: string;
    order: number;
    internal?: boolean;
}

export const 设置分类定义表: Record<设置分类类型, 设置分类定义> = {
    interface: {
        id: 'interface',
        label: '界面与接入',
        description: '主题、视觉和 API 接入等基础配置。',
        order: 10
    },
    prompt: {
        id: 'prompt',
        label: '提示词与规则',
        description: '主提示词池与世界书相关配置。',
        order: 20
    },
    world: {
        id: 'world',
        label: '世界与场景',
        description: '节日、场景图片档案等世界展示相关数据。',
        order: 30
    },
    gameplay: {
        id: 'gameplay',
        label: '玩法配置',
        description: '难度、节奏和核心玩法设置。',
        order: 40
    },
    memory: {
        id: 'memory',
        label: '记忆系统',
        description: '记忆阈值与长期记忆策略。',
        order: 50
    },
    media: {
        id: 'media',
        label: '媒体资源',
        description: '音乐播放列表等媒体型设置。',
        order: 60
    },
    customization: {
        id: 'customization',
        label: '开局自定义',
        description: '自定义背景、天赋和开局方案。',
        order: 70
    },
    system: {
        id: 'system',
        label: '系统元数据',
        description: '保护开关和迁移标记等系统维护项。',
        order: 80
    }
};

export const 设置项定义列表: 设置项定义[] = [
    {
        key: 设置键.应用主题,
        label: '应用主题',
        category: 'interface',
        description: '当前界面主题方案。',
        order: 10
    },
    {
        key: 设置键.API配置,
        label: 'API 配置',
        category: 'interface',
        description: '模型接口地址、密钥与模型选择。',
        order: 20
    },
    {
        key: 设置键.视觉设置,
        label: '视觉设置',
        category: 'interface',
        description: '字体、背景、时间显示和渲染层等视觉参数。',
        order: 30
    },
    {
        key: 设置键.图片管理设置,
        label: '图片管理设置',
        category: 'interface',
        description: '场景图历史上限等图片管理参数。',
        order: 35
    },
    {
        key: 设置键.提示词池,
        label: '提示词池',
        category: 'prompt',
        description: '主提示词管理器中的提示词列表。',
        order: 40
    },
    {
        key: 设置键.内置提示词,
        label: '内置提示词',
        category: 'prompt',
        description: '独立管理的内置提示词接管配置。',
        order: 45
    },
    {
        key: 设置键.世界书列表,
        label: '世界书列表',
        category: 'prompt',
        description: '附加世界书列表，不包含内置提示词。',
        order: 50
    },
    {
        key: 设置键.世界书预设组,
        label: '世界书预设组',
        category: 'prompt',
        description: '世界书预设组与其快照内容。',
        order: 60
    },
    {
        key: 设置键.节日配置,
        label: '节日配置',
        category: 'world',
        description: '世界日期对应的节日列表。',
        order: 70
    },
    {
        key: 设置键.场景图片档案,
        label: '场景图片档案',
        category: 'world',
        description: '场景背景图和场景图片归档。',
        order: 80
    },
    {
        key: 设置键.游戏设置,
        label: '游戏设置',
        category: 'gameplay',
        description: '核心玩法、现实模式和其它游戏级设置。',
        order: 90
    },
    {
        key: 设置键.记忆设置,
        label: '记忆设置',
        category: 'memory',
        description: '记忆阈值、上传条数和记忆提示词参数。',
        order: 100
    },
    {
        key: 设置键.小说分解数据集,
        label: '小说分解数据集',
        category: 'gameplay',
        description: '小说分解后的分段资产、关键事件、推进结构与注入树数据。',
        order: 102
    },
    {
        key: 设置键.小说分解任务,
        label: '小说分解任务',
        category: 'gameplay',
        description: '长篇小说后台拆分任务、断点与进度记录。',
        order: 104
    },
    {
        key: 设置键.小说分解注入快照,
        label: '小说分解注入快照',
        category: 'gameplay',
        description: '主剧情、规划分析、世界演变链路实际使用的小说分解注入内容快照。',
        order: 106
    },
    {
        key: 设置键.音乐曲库,
        label: '音乐曲库',
        category: 'media',
        description: '本地音乐曲目与歌词列表。',
        order: 110
    },
    {
        key: 设置键.自定义天赋,
        label: '自定义天赋',
        category: 'customization',
        description: '新游戏向导中的自定义天赋库。',
        order: 120
    },
    {
        key: 设置键.自定义背景,
        label: '自定义背景',
        category: 'customization',
        description: '新游戏向导中的自定义背景库。',
        order: 130
    },
    {
        key: 设置键.自定义开局预设,
        label: '自定义开局预设',
        category: 'customization',
        description: '新游戏向导中的自定义开局方案。',
        order: 140
    },
    {
        key: 设置键.存档保护,
        label: '存档保护',
        category: 'system',
        description: '删除和清空存档时使用的保护开关。',
        order: 150,
        internal: true
    },
    {
        key: 设置键.图片资源迁移版本,
        label: '图片资源迁移版本',
        category: 'system',
        description: '图片外置迁移完成标记。',
        order: 160,
        internal: true
    }
];

const 设置定义映射 = new Map<string, 设置项定义>(
    设置项定义列表.map((item) => [item.key, item])
);

export const 获取设置项定义 = (key: string): 设置项定义 | null => 设置定义映射.get(key) || null;
