import type {
    世界书导出结构,
    世界书预设组导出结构,
    世界书预设组结构,
    世界书结构,
    世界书条目结构,
    世界书条目形态,
    世界书内置分类,
    世界书注入模式,
    世界书作用域,
    世界书类型,
    聊天记录结构
} from '../types';
import { normalizeCanonicalGameTime, 环境时间转标准串 } from '../hooks/useGame/timeUtils';
import { 构建AI角色声明提示词 } from '../prompts/runtime/roleIdentity';
import { 构建真实世界模式提示词 } from '../prompts/runtime/realWorldMode';
import { 构建变量校准提示词 } from '../prompts/runtime/variableCalibration';
import { 获取开场初始化任务提示词 } from '../prompts/runtime/opening';
import { 构建剧情风格助手提示词 } from '../prompts/runtime/storyStyles';
import type { 剧情风格类型, NTL后宫档位 } from '../models/system';
import { 默认文章优化提示词 } from '../prompts/runtime/defaults';
import { 核心_文章优化思维链 } from '../prompts/core/cotPolish';
import { 剧情回忆检索COT提示词, 剧情回忆检索输出格式提示词 } from '../prompts/runtime/recall';
import { 世界演变系统提示词 } from '../prompts/runtime/worldEvolution';
import { 世界演变COT提示词 } from '../prompts/runtime/worldEvolutionCot';
import { 变量校准COT提示词 } from '../prompts/runtime/variableCot';
import { 核心_世界观 } from '../prompts/core/world';
import { 核心_输出格式 } from '../prompts/core/format';
import { 核心_思维链, } from '../prompts/core/cot';
import { 核心_思维链_女主规划版, 核心_思维链_NTL女主规划版 } from '../prompts/core/cotHeroine';
import { 核心_女主剧情规划, 核心_女主剧情规划_NTL } from '../prompts/core/heroinePlan';
import { 核心_女主剧情规划_思考, 核心_女主剧情规划_思考_NTL } from '../prompts/core/heroinePlanCot';
import { 构建变量模型系统提示词, 构建变量模型用户附加规则提示词 } from '../prompts/runtime/variableModel';
import { 写作_风格 } from '../prompts/writing/style';
import { 写作_避免极端情绪 } from '../prompts/writing/emotionGuard';
import { 写作_防止说话 } from '../prompts/writing/noControl';

export const 世界书存储键 = 'extra_worldbooks';
export const 世界书预设组存储键 = 'worldbook_preset_groups';
export const 世界书导出版本 = 3;
export const 世界书预设组导出版本 = 1;
export const 内置世界书ID = 'builtin_worldbook_prompt_console';

export const 世界书类型选项: Array<{ value: 世界书类型; label: string; description: string }> = [
    { value: 'world_lore', label: '世界观补充', description: '追加到世界观母本后，用于补充势力、地理、历史与设定。' },
    { value: 'system_rule', label: '系统规则', description: '并入系统规则区，用于补充叙事、判定与行为约束。' },
    { value: 'command_rule', label: '命令规则', description: '并入命令协议区，用于补充命令写法和变量更新要求。' },
    { value: 'output_rule', label: '输出规则', description: '并入输出协议区，用于补充标签、格式和正文输出要求。' }
];

export const 世界书作用域选项: Array<{ value: 世界书作用域; label: string }> = [
    { value: 'main', label: '主剧情' },
    { value: 'opening', label: '开局生成' },
    { value: 'world_evolution', label: '世界演变' },
    { value: 'variable_calibration', label: '变量生成' },
    { value: 'story_plan', label: '剧情规划' },
    { value: 'heroine_plan', label: '女主规划' },
    { value: 'tavern', label: '酒馆模式' },
    { value: 'all', label: '全部流程' }
];

export const 世界书作用域说明: Record<世界书作用域, string> = {
    main: '主剧情请求阶段',
    opening: '开局生成阶段',
    world_evolution: '世界演变独立 API',
    variable_calibration: '变量生成独立 API',
    story_plan: '剧情规划独立 API',
    heroine_plan: '女主规划独立 API',
    tavern: '酒馆预设组包阶段',
    recall: '剧情回忆检索 API',
    all: '全部流程'
};

export const 世界书条目形态选项: Array<{ value: 世界书条目形态; label: string; description: string }> = [
    { value: 'normal', label: '普通条目', description: '常规附加条目，按条目类型与作用域注入。' },
    { value: 'timeline_outline', label: '时间线大纲条目', description: '常驻时间线纲要，默认覆盖主剧情与独立 API。' },
    { value: 'time_injection', label: '时间注入条目', description: '按游戏时间区间命中注入，可选起始和结束时间。' }
];

export const 世界书注入模式选项: Array<{ value: 世界书注入模式; label: string; description: string }> = [
    { value: 'always', label: '始终注入', description: '只要命中作用域，就始终注入。' },
    { value: 'match_any', label: '关键词命中', description: '仅当关键词命中当前上下文时注入。' }
];

const 默认作用域: 世界书作用域[] = ['main'];
const 默认类型: 世界书类型 = 'world_lore';
const 默认注入模式: 世界书注入模式 = 'always';
const 默认条目形态: 世界书条目形态 = 'normal';
const 全部流程作用域: 世界书作用域[] = [
    'main',
    'opening',
    'world_evolution',
    'variable_calibration',
    'story_plan',
    'heroine_plan',
    'tavern'
];

const 世界书预算映射: Record<世界书作用域, number> = {
    main: 6000,
    opening: 7000,
    world_evolution: 4000,
    variable_calibration: 5000,
    story_plan: 5000,
    heroine_plan: 5000,
    recall: 0,
    tavern: 6000,
    all: 7000
};

const 类型标签映射: Record<世界书类型, string> = {
    world_lore: '世界观附加',
    system_rule: '系统规则附加',
    command_rule: '命令规则附加',
    output_rule: '输出规则附加'
};

const 条目形态标签映射: Record<世界书条目形态, string> = {
    normal: '普通条目',
    timeline_outline: '时间线大纲条目',
    time_injection: '时间注入条目'
};

export const 世界书本体槽位 = {
    主剧情AI角色声明: 'builtin_slot_main_ai_role',
    主剧情世界观: 'builtin_slot_main_world_prompt',
    主剧情输出协议: 'builtin_slot_main_output_protocol',
    写作文风: 'builtin_slot_writing_style',
    写作避免极端情绪: 'builtin_slot_writing_emotion_guard',
    写作NoControl: 'builtin_slot_writing_no_control',
    主剧情COT_常规: 'builtin_slot_main_cot_default',
    主剧情COT_女主规划: 'builtin_slot_main_cot_heroine',
    主剧情COT_NTL女主规划: 'builtin_slot_main_cot_heroine_ntl',
    主剧情女主规划_常规: 'builtin_slot_main_heroine_plan',
    主剧情女主规划_NTL: 'builtin_slot_main_heroine_plan_ntl',
    主剧情女主规划思考_常规: 'builtin_slot_main_heroine_plan_cot',
    主剧情女主规划思考_NTL: 'builtin_slot_main_heroine_plan_cot_ntl',
    真实世界模式: 'builtin_slot_real_world_mode',
    主剧情变量校准_常规: 'builtin_slot_main_variable_calibration_normal',
    主剧情变量校准_世界演变: 'builtin_slot_main_variable_calibration_world_evolution',
    变量模型系统_常规: 'builtin_slot_variable_model_system_normal',
    变量模型系统_世界演变已更新: 'builtin_slot_variable_model_system_world_updated',
    变量模型用户_常规: 'builtin_slot_variable_model_user_normal',
    变量模型用户_世界演变已更新: 'builtin_slot_variable_model_user_world_updated',
    变量模型COT: 'builtin_slot_variable_model_cot',
    开局初始化任务_启用生存: 'builtin_slot_opening_init_task_survival_on',
    开局初始化任务_禁用生存: 'builtin_slot_opening_init_task_survival_off'
} as const;

export const 内置世界书分类顺序: 世界书内置分类[] = ['常驻', '开局', '主剧情', '变量生成', '文章优化', '回忆', '世界演变'];

type 世界书本体槽位值 = typeof 世界书本体槽位[keyof typeof 世界书本体槽位];
const 是本体槽位 = (slotId: unknown): boolean => typeof slotId === 'string' && slotId.startsWith('builtin_slot_');

const 获取剧情风格槽位ID = (
    _scope: 'main' | 'opening',
    style: 剧情风格类型,
    ntlTier?: NTL后宫档位
): string => {
    if (style === 'NTL后宫') {
        if (ntlTier === '假乱伦') return 'builtin_slot_style_ntl_fake_incest';
        if (ntlTier === '禁止乱伦') return 'builtin_slot_style_ntl_no_incest';
        return 'builtin_slot_style_ntl_unlimited';
    }
    const styleKeyMap: Record<Exclude<剧情风格类型, 'NTL后宫'>, string> = {
        一般: 'general',
        修炼: 'cultivation',
        后宫: 'harem',
        修罗场: 'shura',
        纯爱: 'pure_love'
    };
    return `builtin_slot_style_${styleKeyMap[style as Exclude<剧情风格类型, 'NTL后宫'>] || 'general'}`;
};

const 读取文本 = (value: unknown): string => (typeof value === 'string' ? value : '');

const 读取字符串数组 = (value: unknown): string[] => (
    Array.isArray(value)
        ? value.map((item) => 读取文本(item).trim()).filter(Boolean)
        : []
);

const 去重字符串数组 = (list: string[]): string[] => Array.from(new Set(list.filter(Boolean)));

const 生成ID = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const 展开作用域列表 = (scopes: 世界书作用域[]): 世界书作用域[] => {
    const baseScopes = Array.isArray(scopes) && scopes.length > 0 ? scopes : 默认作用域;
    if (baseScopes.includes('all')) return [...全部流程作用域];
    return baseScopes.filter((scope) => scope !== 'all');
};

const 获取条目形态默认配置 = (形态: 世界书条目形态): Pick<世界书条目结构, '条目形态' | '类型' | '作用域' | '注入模式' | '优先级' | '时间线开始时间' | '时间线结束时间'> => {
    switch (形态) {
        case 'timeline_outline':
            return {
                条目形态: 'timeline_outline',
                类型: 'world_lore',
                作用域: ['all'],
                注入模式: 'always',
                优先级: 120,
                时间线开始时间: '',
                时间线结束时间: ''
            };
        case 'time_injection':
            return {
                条目形态: 'time_injection',
                类型: 'world_lore',
                作用域: ['all'],
                注入模式: 'always',
                优先级: 90,
                时间线开始时间: '',
                时间线结束时间: ''
            };
        default:
            return {
                条目形态: 'normal',
                类型: 默认类型,
                作用域: 默认作用域,
                注入模式: 默认注入模式,
                优先级: 50,
                时间线开始时间: '',
                时间线结束时间: ''
            };
    }
};

export const 渲染世界书模板文本 = (
    content: string,
    variables?: Record<string, string | number | boolean | null | undefined>
): string => {
    const source = 读取文本(content);
    const rendered = source.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
        const value = variables?.[key];
        if (value === null || value === undefined || value === false) return '';
        return String(value);
    });
    return rendered
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

export const 获取世界书条目注入说明 = (entry: Pick<世界书条目结构, '条目形态' | '类型' | '作用域' | '内置槽位' | '时间线开始时间' | '时间线结束时间'>): string => {
    const scopeList = Array.isArray(entry.作用域) && entry.作用域.length > 0 ? entry.作用域 : 默认作用域;
    const resolvedScopes = 展开作用域列表(scopeList).filter((scope) => scope !== 'recall');
    const uniqueScopes = 去重字符串数组(resolvedScopes) as 世界书作用域[];
    const isBuiltinBaseSlot = 是本体槽位(entry.内置槽位);
    const entryShape = entry.条目形态 || 默认条目形态;
    const buildDetail = (scope: 世界书作用域): string => {
        switch (scope) {
            case 'main':
                switch (entry.类型) {
                    case 'world_lore': return isBuiltinBaseSlot ? '主剧情：接管世界观本体槽位' : '主剧情：追加到 `core_world` 世界观母本末尾';
                    case 'system_rule': return isBuiltinBaseSlot ? '主剧情：接管系统规则本体槽位' : '主剧情：并入系统规则区 `otherPrompts`';
                    case 'command_rule': return isBuiltinBaseSlot ? '主剧情：接管命令规则本体槽位' : '主剧情：并入输出协议中的命令规则段';
                    case 'output_rule': return isBuiltinBaseSlot ? '主剧情：接管输出规则本体槽位' : '主剧情：并入输出协议末尾';
                    default: return '主剧情：追加到主流程提示词';
                }
            case 'opening':
                switch (entry.类型) {
                    case 'world_lore': return isBuiltinBaseSlot ? '开局生成：接管世界观本体槽位' : '开局生成：追加到开局世界观母本末尾';
                    case 'system_rule': return isBuiltinBaseSlot ? '开局生成：接管系统规则本体槽位' : '开局生成：并入开局系统规则区';
                    case 'command_rule': return isBuiltinBaseSlot ? '开局生成：接管命令规则本体槽位' : '开局生成：并入开局输出协议中的命令规则段';
                    case 'output_rule': return isBuiltinBaseSlot ? '开局生成：接管输出规则本体槽位' : '开局生成：并入开局输出协议末尾';
                    default: return '开局生成：追加到开局流程提示词';
                }
            case 'world_evolution':
                switch (entry.类型) {
                    case 'world_lore': return isBuiltinBaseSlot ? '世界演变：接管世界观本体槽位' : '世界演变：作为独立 API 的世界观附加段';
                    case 'system_rule': return isBuiltinBaseSlot ? '世界演变：接管系统规则本体槽位' : '世界演变：作为独立 API 的系统规则附加段';
                    case 'command_rule': return isBuiltinBaseSlot ? '世界演变：接管命令规则本体槽位' : '世界演变：作为独立 API 的命令规则附加段';
                    case 'output_rule': return isBuiltinBaseSlot ? '世界演变：接管输出规则本体槽位' : '世界演变：作为独立 API 的输出规则附加段';
                    default: return '世界演变：附加到独立 API 请求';
                }
            case 'variable_calibration':
                switch (entry.类型) {
                    case 'world_lore': return '变量生成：附加到变量上下文中的世界/背景补充段';
                    case 'system_rule': return '变量生成：附加到变量规则段';
                    case 'command_rule': return '变量生成：附加到变量命令约束段';
                    case 'output_rule': return '变量生成：附加到变量输出约束段';
                    default: return '变量生成：附加到独立 API 请求';
                }
            case 'story_plan':
                switch (entry.类型) {
                    case 'world_lore': return '剧情规划：附加到剧情规划上下文中的世界/时间线补充段';
                    case 'system_rule': return '剧情规划：附加到剧情规划规则段';
                    case 'command_rule': return '剧情规划：附加到剧情规划命令约束段';
                    case 'output_rule': return '剧情规划：附加到剧情规划输出约束段';
                    default: return '剧情规划：附加到独立 API 请求';
                }
            case 'heroine_plan':
                switch (entry.类型) {
                    case 'world_lore': return '女主规划：附加到女主规划上下文中的世界/时间线补充段';
                    case 'system_rule': return '女主规划：附加到女主规划规则段';
                    case 'command_rule': return '女主规划：附加到女主规划命令约束段';
                    case 'output_rule': return '女主规划：附加到女主规划输出约束段';
                    default: return '女主规划：附加到独立 API 请求';
                }
            case 'tavern':
                switch (entry.类型) {
                    case 'world_lore': return '酒馆模式：追加到酒馆世界观段';
                    case 'system_rule': return '酒馆模式：并入酒馆系统规则段';
                    case 'command_rule': return '酒馆模式：并入酒馆命令规则段';
                    case 'output_rule': return '酒馆模式：并入酒馆输出规则段';
                    default: return '酒馆模式：附加到酒馆组包流程';
                }
            default:
                return '附加到对应流程的提示词区';
        }
    };
    const detailText = uniqueScopes.length > 0
        ? uniqueScopes.map(buildDetail).join(' / ')
        : '当前未配置有效作用域';
    const typeLabel = 类型标签映射[entry.类型] || '附加条目';
    const shapeLabel = 条目形态标签映射[entryShape] || 条目形态标签映射.normal;
    const scopeLabel = scopeList.includes('all')
        ? '全部流程'
        : uniqueScopes.map((scope) => 世界书作用域说明[scope] || scope).join(' / ');
    const timeText = entryShape === 'time_injection'
        ? ` · 时间区间 ${entry.时间线开始时间 || '未设起点'} ~ ${entry.时间线结束时间 || '未设终点'}`
        : '';
    return `${shapeLabel} · ${typeLabel} · ${scopeLabel || '未配置作用域'} · ${detailText}${timeText}`;
};

const 创建内置预设条目 = (params: {
    id: string;
    标题: string;
    类型: 世界书类型;
    作用域: 世界书作用域[];
    内置槽位?: string;
    内置分类?: 世界书内置分类;
    内容?: string;
    注入模式?: 世界书注入模式;
    优先级?: number;
}): 世界书条目结构 => {
    const now = 1;
    const base: 世界书条目结构 = {
        id: params.id,
        标题: params.标题,
        内容: params.内容 || '',
        条目形态: 'normal',
        类型: params.类型,
        作用域: params.作用域,
        内置槽位: params.内置槽位 || params.id,
        内置分类: params.内置分类,
        注入说明: '',
        注入模式: params.注入模式 || 'always',
        时间线开始时间: '',
        时间线结束时间: '',
        关键词: [],
        优先级: params.优先级 ?? 80,
        启用: true,
        内置: true,
        创建时间: now,
        更新时间: now
    };
    return {
        ...base,
        注入说明: 获取世界书条目注入说明(base)
    };
};

export const 创建内置预设世界书 = (): 世界书结构 => {
    const buildStyleEntries = (): 世界书条目结构[] => ([
        { style: '一般' as 剧情风格类型, title: '一般' },
        { style: '修炼' as 剧情风格类型, title: '修炼' },
        { style: '后宫' as 剧情风格类型, title: '后宫' },
        { style: '修罗场' as 剧情风格类型, title: '修罗场' },
        { style: '纯爱' as 剧情风格类型, title: '纯爱' }
    ]).map((item) => 创建内置预设条目({
        id: 获取剧情风格槽位ID('main', item.style),
        内置槽位: 获取剧情风格槽位ID('main', item.style),
        标题: `叙事风格 · ${item.title}`,
        内置分类: '常驻',
        类型: 'system_rule',
        作用域: ['main', 'opening'],
        内容: 构建剧情风格助手提示词(item.style)
    })).concat([
        创建内置预设条目({
            id: 获取剧情风格槽位ID('main', 'NTL后宫', '禁止乱伦'),
            内置槽位: 获取剧情风格槽位ID('main', 'NTL后宫', '禁止乱伦'),
            标题: '叙事风格 · NTL后宫（禁止乱伦）',
            内置分类: '常驻',
            类型: 'system_rule',
            作用域: ['main', 'opening'],
            内容: 构建剧情风格助手提示词('NTL后宫', '禁止乱伦')
        }),
        创建内置预设条目({
            id: 获取剧情风格槽位ID('main', 'NTL后宫', '假乱伦'),
            内置槽位: 获取剧情风格槽位ID('main', 'NTL后宫', '假乱伦'),
            标题: '叙事风格 · NTL后宫（假乱伦）',
            内置分类: '常驻',
            类型: 'system_rule',
            作用域: ['main', 'opening'],
            内容: 构建剧情风格助手提示词('NTL后宫', '假乱伦')
        }),
        创建内置预设条目({
            id: 获取剧情风格槽位ID('main', 'NTL后宫', '无限制'),
            内置槽位: 获取剧情风格槽位ID('main', 'NTL后宫', '无限制'),
            标题: '叙事风格 · NTL后宫（无限制）',
            内置分类: '常驻',
            类型: 'system_rule',
            作用域: ['main', 'opening'],
            内容: 构建剧情风格助手提示词('NTL后宫', '无限制')
        })
    ]);

    return {
        id: 内置世界书ID,
        标题: '内置预设世界书',
        描述: '用于承载系统内置本体提示词。你可以直接在这里修改主剧情、开局生成等流程里按设置切换的本体提示词；附加规则请新建独立世界书维护。',
        常驻大纲: '',
        启用: true,
        内置: true,
        条目: [
            创建内置预设条目({
                id: 世界书本体槽位.主剧情AI角色声明,
                内置槽位: 世界书本体槽位.主剧情AI角色声明,
                标题: '主剧情 · AI角色声明本体',
                内置分类: '常驻',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 构建AI角色声明提示词('${playerName}')
            }),
            创建内置预设条目({
                id: 世界书本体槽位.写作文风,
                内置槽位: 世界书本体槽位.写作文风,
                标题: '常驻 · 文风',
                内置分类: '常驻',
                类型: 'system_rule',
                作用域: ['main', 'opening'],
                内容: 写作_风格.内容
            }),
            创建内置预设条目({
                id: 世界书本体槽位.写作避免极端情绪,
                内置槽位: 世界书本体槽位.写作避免极端情绪,
                标题: '常驻 · 避免极端情绪',
                内置分类: '常驻',
                类型: 'system_rule',
                作用域: ['main', 'opening'],
                内容: 写作_避免极端情绪.内容
            }),
            创建内置预设条目({
                id: 世界书本体槽位.写作NoControl,
                内置槽位: 世界书本体槽位.写作NoControl,
                标题: '常驻 · NoControl（跟随设置）',
                内置分类: '常驻',
                类型: 'system_rule',
                作用域: ['main', 'opening'],
                内容: 写作_防止说话.内容
            }),
            创建内置预设条目({
                id: 世界书本体槽位.主剧情世界观,
                内置槽位: 世界书本体槽位.主剧情世界观,
                标题: '主剧情 · 世界观本体',
                内置分类: '主剧情',
                类型: 'world_lore',
                作用域: ['main'],
                内容: 核心_世界观.内容
            }),
            创建内置预设条目({
                id: 世界书本体槽位.主剧情输出协议,
                内置槽位: 世界书本体槽位.主剧情输出协议,
                标题: '主剧情 · 输出协议本体',
                内置分类: '主剧情',
                类型: 'output_rule',
                作用域: ['main'],
                内容: 核心_输出格式.内容
            }),
            ...buildStyleEntries(),
            创建内置预设条目({
                id: 世界书本体槽位.真实世界模式,
                内置槽位: 世界书本体槽位.真实世界模式,
                标题: '真实世界模式',
                内置分类: '常驻',
                类型: 'system_rule',
                作用域: ['main', 'opening'],
                内容: 构建真实世界模式提示词()
            }),
            创建内置预设条目({
                id: 世界书本体槽位.主剧情COT_常规,
                内置槽位: 世界书本体槽位.主剧情COT_常规,
                标题: '主剧情 · 思维链（常规）',
                内置分类: '主剧情',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 核心_思维链.内容
            }),
            创建内置预设条目({
                id: 世界书本体槽位.主剧情COT_女主规划,
                内置槽位: 世界书本体槽位.主剧情COT_女主规划,
                标题: '主剧情 · 思维链（女主规划）',
                内置分类: '主剧情',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 核心_思维链_女主规划版.内容
            }),
            创建内置预设条目({
                id: 世界书本体槽位.主剧情COT_NTL女主规划,
                内置槽位: 世界书本体槽位.主剧情COT_NTL女主规划,
                标题: '主剧情 · 思维链（NTL女主规划）',
                内置分类: '主剧情',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 核心_思维链_NTL女主规划版.内容
            }),
            创建内置预设条目({
                id: 世界书本体槽位.主剧情女主规划_常规,
                内置槽位: 世界书本体槽位.主剧情女主规划_常规,
                标题: '主剧情 · 女主剧情规划协议',
                内置分类: '主剧情',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 核心_女主剧情规划.内容
            }),
            创建内置预设条目({
                id: 世界书本体槽位.主剧情女主规划_NTL,
                内置槽位: 世界书本体槽位.主剧情女主规划_NTL,
                标题: '主剧情 · 女主剧情规划协议（NTL）',
                内置分类: '主剧情',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 核心_女主剧情规划_NTL.内容
            }),
            创建内置预设条目({
                id: 世界书本体槽位.主剧情女主规划思考_常规,
                内置槽位: 世界书本体槽位.主剧情女主规划思考_常规,
                标题: '主剧情 · 女主剧情规划思考协议',
                内置分类: '主剧情',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 核心_女主剧情规划_思考.内容
            }),
            创建内置预设条目({
                id: 世界书本体槽位.主剧情女主规划思考_NTL,
                内置槽位: 世界书本体槽位.主剧情女主规划思考_NTL,
                标题: '主剧情 · 女主剧情规划思考协议（NTL）',
                内置分类: '主剧情',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 核心_女主剧情规划_思考_NTL.内容
            }),
            创建内置预设条目({
                id: 世界书本体槽位.主剧情变量校准_常规,
                内置槽位: 世界书本体槽位.主剧情变量校准_常规,
                标题: '主剧情注入 · 变量生成协议（常规）',
                内置分类: '变量生成',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 构建变量校准提示词({ worldEvolutionEnabled: false })
            }),
            创建内置预设条目({
                id: 世界书本体槽位.主剧情变量校准_世界演变,
                内置槽位: 世界书本体槽位.主剧情变量校准_世界演变,
                标题: '主剧情注入 · 变量生成协议（世界演变分流）',
                内置分类: '变量生成',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 构建变量校准提示词({ worldEvolutionEnabled: true })
            }),
            创建内置预设条目({
                id: 世界书本体槽位.变量模型系统_常规,
                内置槽位: 世界书本体槽位.变量模型系统_常规,
                标题: '独立变量生成API · 系统补充（常规）',
                内置分类: '变量生成',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 构建变量模型系统提示词({ worldEvolutionEnabled: false, worldEvolutionUpdated: false, survivalNeedsEnabled: true })
            }),
            创建内置预设条目({
                id: 世界书本体槽位.变量模型系统_世界演变已更新,
                内置槽位: 世界书本体槽位.变量模型系统_世界演变已更新,
                标题: '独立变量生成API · 系统补充（世界演变已更新）',
                内置分类: '变量生成',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 构建变量模型系统提示词({ worldEvolutionEnabled: true, worldEvolutionUpdated: true, survivalNeedsEnabled: true })
            }),
            创建内置预设条目({
                id: 世界书本体槽位.变量模型用户_常规,
                内置槽位: 世界书本体槽位.变量模型用户_常规,
                标题: '独立变量生成API · 附加规则（常规）',
                内置分类: '变量生成',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 构建变量模型用户附加规则提示词()
            }),
            创建内置预设条目({
                id: 世界书本体槽位.变量模型用户_世界演变已更新,
                内置槽位: 世界书本体槽位.变量模型用户_世界演变已更新,
                标题: '独立变量生成API · 附加规则（世界演变已更新）',
                内置分类: '变量生成',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 构建变量模型用户附加规则提示词()
            }),
            创建内置预设条目({
                id: 世界书本体槽位.变量模型COT,
                内置槽位: 世界书本体槽位.变量模型COT,
                标题: '独立变量生成API · COT',
                内置分类: '变量生成',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 变量校准COT提示词
            }),
            创建内置预设条目({
                id: 世界书本体槽位.开局初始化任务_启用生存,
                内置槽位: 世界书本体槽位.开局初始化任务_启用生存,
                标题: '开局生成 · 初始化任务本体（启用生存）',
                内置分类: '开局',
                类型: 'system_rule',
                作用域: ['opening'],
                内容: 获取开场初始化任务提示词({ 启用饱腹口渴系统: true })
            }),
            创建内置预设条目({
                id: 世界书本体槽位.开局初始化任务_禁用生存,
                内置槽位: 世界书本体槽位.开局初始化任务_禁用生存,
                标题: '开局生成 · 初始化任务本体（禁用生存）',
                内置分类: '开局',
                类型: 'system_rule',
                作用域: ['opening'],
                内容: 获取开场初始化任务提示词({ 启用饱腹口渴系统: false })
            }),
            创建内置预设条目({
                id: 'builtin_body_polish_prompt',
                内置槽位: 'builtin_body_polish_prompt',
                标题: '文章优化 · 默认提示词',
                内置分类: '文章优化',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 默认文章优化提示词
            }),
            创建内置预设条目({
                id: 'builtin_body_polish_cot',
                内置槽位: 'builtin_body_polish_cot',
                标题: '文章优化 · COT',
                内置分类: '文章优化',
                类型: 'system_rule',
                作用域: ['main'],
                内容: 核心_文章优化思维链.内容
            }),
            创建内置预设条目({
                id: 'builtin_recall_system_prompt',
                内置槽位: 'builtin_recall_system_prompt',
                标题: '回忆 · 检索系统提示词',
                内置分类: '回忆',
                类型: 'system_rule',
                作用域: ['recall'],
                内容: `${剧情回忆检索COT提示词}\n\n${剧情回忆检索输出格式提示词}`
            }),
            创建内置预设条目({
                id: 'builtin_world_evolution_system_prompt',
                内置槽位: 'builtin_world_evolution_system_prompt',
                标题: '世界演变 · 系统提示词',
                内置分类: '世界演变',
                类型: 'system_rule',
                作用域: ['world_evolution'],
                内容: 世界演变系统提示词
            }),
            创建内置预设条目({
                id: 'builtin_world_evolution_cot',
                内置槽位: 'builtin_world_evolution_cot',
                标题: '世界演变 · COT',
                内置分类: '世界演变',
                类型: 'system_rule',
                作用域: ['world_evolution'],
                内容: 世界演变COT提示词
            }),
        ],
        创建时间: 1,
        更新时间: 1
    };
};

const 获取内置世界书顺序映射 = (): Map<string, number> => {
    const builtin = 创建内置预设世界书();
    return new Map((builtin.条目 || []).map((entry, index) => [entry.id, index] as const));
};

const 规范化作用域列表 = (value: unknown): 世界书作用域[] => {
    const list = 读取字符串数组(value).filter((item): item is 世界书作用域 => (
        item === 'main'
        || item === 'opening'
        || item === 'world_evolution'
        || item === 'variable_calibration'
        || item === 'story_plan'
        || item === 'heroine_plan'
        || item === 'tavern'
        || item === 'all'
    ));
    if (list.includes('all')) return ['all'];
    return list.length > 0 ? 去重字符串数组(list) as 世界书作用域[] : 默认作用域;
};

const 规范化条目形态 = (value: unknown): 世界书条目形态 => (
    value === 'timeline_outline' || value === 'time_injection' || value === 'normal'
        ? value
        : 默认条目形态
);

const 规范化类型 = (value: unknown): 世界书类型 => (
    value === 'world_lore' || value === 'system_rule' || value === 'command_rule' || value === 'output_rule'
        ? value
        : 默认类型
);

const 规范化注入模式 = (value: unknown): 世界书注入模式 => (
    value === 'match_any' || value === 'always'
        ? value
        : 默认注入模式
);

const 规范化时间线时间 = (value: unknown): string => {
    const text = 读取文本(value).trim();
    if (!text) return '';
    const direct = normalizeCanonicalGameTime(text);
    if (direct) return direct;
    const match = text.match(/^(\d{1,6})[-/年](\d{1,2})[-/月](\d{1,2})(?:日)?(?:\s+|[T])?(\d{1,2})[:：时](\d{1,2})/);
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    if (
        !Number.isFinite(year) ||
        month < 1 || month > 12 ||
        day < 1 || day > 31 ||
        hour < 0 || hour > 23 ||
        minute < 0 || minute > 59
    ) {
        return '';
    }
    return normalizeCanonicalGameTime(`${year}:${String(month).padStart(2, '0')}:${String(day).padStart(2, '0')}:${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`) || '';
};

const 规范化时间线区间 = (start: unknown, end: unknown): { start: string; end: string } => {
    const normalizedStart = 规范化时间线时间(start);
    const normalizedEnd = 规范化时间线时间(end);
    if (normalizedStart && normalizedEnd && normalizedStart > normalizedEnd) {
        return { start: normalizedEnd, end: normalizedStart };
    }
    return { start: normalizedStart, end: normalizedEnd };
};

export const 创建空世界书条目 = (形态: 世界书条目形态 = 默认条目形态): 世界书条目结构 => {
    const now = Date.now();
    const defaults = 获取条目形态默认配置(形态);
    return {
        id: 生成ID('worldbook_entry'),
        标题: 形态 === 'timeline_outline' ? '未命名时间线大纲条目' : 形态 === 'time_injection' ? '未命名时间注入条目' : '未命名条目',
        内容: '',
        条目形态: defaults.条目形态,
        类型: defaults.类型,
        作用域: defaults.作用域,
        注入说明: 获取世界书条目注入说明(defaults),
        注入模式: defaults.注入模式,
        时间线开始时间: defaults.时间线开始时间,
        时间线结束时间: defaults.时间线结束时间,
        关键词: [],
        优先级: defaults.优先级,
        启用: true,
        内置: false,
        创建时间: now,
        更新时间: now
    };
};

export const 创建空世界书 = (): 世界书结构 => {
    const now = Date.now();
    return {
        id: 生成ID('worldbook'),
        标题: '未命名世界书',
        描述: '',
        常驻大纲: '',
        启用: true,
        内置: false,
        条目: [创建空世界书条目()],
        创建时间: now,
        更新时间: now
    };
};

export const 创建空世界书预设组 = (books: 世界书结构[] = []): 世界书预设组结构 => {
    const now = Date.now();
    const normalizedBooks = 规范化世界书列表(books);
    return {
        id: 生成ID('worldbook_group'),
        名称: '未命名预设组',
        描述: '',
        启用: true,
        书籍快照: normalizedBooks,
        创建时间: now,
        更新时间: now
    };
};

export const 规范化世界书条目 = (raw: unknown, fallback?: Partial<世界书条目结构>): 世界书条目结构 => {
    const source = raw && typeof raw === 'object' ? raw as Partial<世界书条目结构> : {};
    const base = fallback || {};
    const now = Date.now();
    const isBuiltinEntry = source.内置 === true || base.内置 === true;
    const entryShape = 规范化条目形态(source.条目形态 ?? base.条目形态);
    const shapeDefaults = 获取条目形态默认配置(entryShape);
    const id = 读取文本(source.id ?? base.id).trim() || 生成ID('worldbook_entry');
    const title = 读取文本(source.标题 ?? base.标题).trim() || '未命名条目';
    const content = 读取文本(source.内容 ?? base.内容);
    const priorityRaw = Number(source.优先级 ?? base.优先级 ?? shapeDefaults.优先级 ?? 50);
    const priority = Number.isFinite(priorityRaw) ? Math.max(0, Math.min(999, Math.floor(priorityRaw))) : 50;
    const timeline = 规范化时间线区间(
        source.时间线开始时间 ?? base.时间线开始时间 ?? shapeDefaults.时间线开始时间,
        source.时间线结束时间 ?? base.时间线结束时间 ?? shapeDefaults.时间线结束时间
    );
    const createdAtRaw = Number(source.创建时间 ?? base.创建时间 ?? now);
    const updatedAtRaw = Number(source.更新时间 ?? base.更新时间 ?? now);
    return {
        id,
        标题: title,
        内容: content,
        条目形态: entryShape,
        类型: 规范化类型(source.类型 ?? base.类型 ?? shapeDefaults.类型),
        作用域: 规范化作用域列表(source.作用域 ?? base.作用域 ?? shapeDefaults.作用域),
        内置槽位: isBuiltinEntry ? (读取文本(source.内置槽位 ?? base.内置槽位 ?? id).trim() || id) : undefined,
        内置分类: isBuiltinEntry ? (读取文本(source.内置分类 ?? base.内置分类).trim() as 世界书内置分类) : undefined,
        注入说明: 读取文本(source.注入说明 ?? base.注入说明).trim(),
        注入模式: 规范化注入模式(source.注入模式 ?? base.注入模式 ?? shapeDefaults.注入模式),
        时间线开始时间: timeline.start,
        时间线结束时间: timeline.end,
        关键词: 去重字符串数组(读取字符串数组(source.关键词 ?? base.关键词)),
        优先级: priority,
        启用: source.启用 !== undefined ? source.启用 === true : base.启用 !== false,
        内置: isBuiltinEntry,
        创建时间: Number.isFinite(createdAtRaw) ? Math.floor(createdAtRaw) : now,
        更新时间: Number.isFinite(updatedAtRaw) ? Math.floor(updatedAtRaw) : now
    };
};

export const 规范化世界书 = (raw: unknown, fallback?: Partial<世界书结构>): 世界书结构 => {
    const source = raw && typeof raw === 'object' ? raw as Partial<世界书结构> : {};
    const base = fallback || {};
    const now = Date.now();
    const id = 读取文本(source.id ?? base.id).trim() || 生成ID('worldbook');
    const title = 读取文本(source.标题 ?? base.标题).trim() || '未命名世界书';
    const description = 读取文本(source.描述 ?? base.描述);
    const outline = 读取文本(source.常驻大纲 ?? base.常驻大纲);
    const createdAtRaw = Number(source.创建时间 ?? base.创建时间 ?? now);
    const updatedAtRaw = Number(source.更新时间 ?? base.更新时间 ?? now);
    const rawEntries = Array.isArray(source.条目)
        ? source.条目
        : Array.isArray((source as any).entries)
            ? (source as any).entries
            : Array.isArray(base.条目)
                ? base.条目
                : [];
    const entryMap = new Map<string, 世界书条目结构>();
    rawEntries.forEach((item) => {
        const normalized = 规范化世界书条目(item);
        entryMap.set(normalized.id, normalized);
    });
    const entries = Array.from(entryMap.values()).sort((a, b) => {
        const priorityDiff = (b.优先级 || 0) - (a.优先级 || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return (b.更新时间 || 0) - (a.更新时间 || 0);
    });
    return {
        id,
        标题: title,
        描述: description,
        常驻大纲: outline,
        启用: source.启用 !== undefined ? source.启用 === true : base.启用 !== false,
        内置: source.内置 !== undefined ? source.内置 === true : base.内置 === true,
        条目: entries,
        创建时间: Number.isFinite(createdAtRaw) ? Math.floor(createdAtRaw) : now,
        更新时间: Number.isFinite(updatedAtRaw) ? Math.floor(updatedAtRaw) : now
    };
};

export const 规范化世界书预设组 = (raw: unknown, fallback?: Partial<世界书预设组结构>): 世界书预设组结构 => {
    const source = raw && typeof raw === 'object' ? raw as Partial<世界书预设组结构> : {};
    const base = fallback || {};
    const now = Date.now();
    const id = 读取文本(source.id ?? base.id).trim() || 生成ID('worldbook_group');
    const 名称 = 读取文本(source.名称 ?? base.名称).trim() || '未命名预设组';
    const 描述 = 读取文本(source.描述 ?? base.描述);
    const 书籍快照 = 规范化世界书列表(source.书籍快照 ?? (source as any).books ?? base.书籍快照 ?? []);
    const createdAtRaw = Number(source.创建时间 ?? base.创建时间 ?? now);
    const updatedAtRaw = Number(source.更新时间 ?? base.更新时间 ?? now);
    return {
        id,
        名称,
        描述,
        启用: source.启用 !== undefined ? source.启用 === true : base.启用 !== false,
        书籍快照,
        创建时间: Number.isFinite(createdAtRaw) ? Math.floor(createdAtRaw) : now,
        更新时间: Number.isFinite(updatedAtRaw) ? Math.floor(updatedAtRaw) : now
    };
};

const 旧版条目转世界书 = (entries: unknown[]): 世界书结构[] => {
    if (!Array.isArray(entries) || entries.length <= 0) return [];
    const now = Date.now();
    return [{
        id: 生成ID('worldbook'),
        标题: '导入世界书',
        描述: '由旧版单层条目结构自动转换',
        启用: true,
        条目: entries.map((item) => 规范化世界书条目(item)),
        创建时间: now,
        更新时间: now
    }];
};

export const 规范化世界书列表 = (raw: unknown): 世界书结构[] => {
    const list = (() => {
        if (Array.isArray(raw)) {
            const looksLikeBook = raw.some((item) => item && typeof item === 'object' && (Array.isArray((item as any).条目) || Array.isArray((item as any).entries)));
            return looksLikeBook ? raw : 旧版条目转世界书(raw);
        }
        if (raw && typeof raw === 'object') {
            const maybeBooks = (raw as any).books;
            if (Array.isArray(maybeBooks)) return maybeBooks;
            const maybeEntries = (raw as any).entries;
            if (Array.isArray(maybeEntries)) return 旧版条目转世界书(maybeEntries);
        }
        return [];
    })();

    const map = new Map<string, 世界书结构>();
    list.forEach((item) => {
        const normalized = 规范化世界书(item);
        if (normalized.内置 === true || normalized.id === 内置世界书ID) return;
        const entries = (normalized.条目 || []).map((entry) => {
            const normalizedEntry = 规范化世界书条目(entry);
            return {
                ...normalizedEntry,
                注入说明: normalizedEntry.注入说明 || 获取世界书条目注入说明(normalizedEntry)
            };
        });
        const finalBook = {
            ...normalized,
            内置: false,
            常驻大纲: normalized.常驻大纲,
            条目: entries
        };
        map.set(finalBook.id, finalBook);
    });
    return Array.from(map.values()).sort((a, b) => (b.更新时间 || 0) - (a.更新时间 || 0));
};

export const 规范化世界书预设组列表 = (raw: unknown): 世界书预设组结构[] => {
    const list = (() => {
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw === 'object') {
            const maybeGroups = (raw as any).groups;
            if (Array.isArray(maybeGroups)) return maybeGroups;
        }
        return [];
    })();
    const map = new Map<string, 世界书预设组结构>();
    list.forEach((item) => {
        const normalized = 规范化世界书预设组(item);
        map.set(normalized.id, normalized);
    });
    return Array.from(map.values()).sort((a, b) => (b.更新时间 || 0) - (a.更新时间 || 0));
};

export const 获取内置世界书槽位原文 = (
    books: 世界书结构[] | undefined,
    slotId: 世界书本体槽位值 | string
): string => {
    const normalizedBooks = 规范化世界书列表(Array.isArray(books) ? books : []);
    for (const book of normalizedBooks) {
        for (const entry of Array.isArray(book.条目) ? book.条目 : []) {
            const normalizedEntry = 规范化世界书条目(entry);
            if (normalizedEntry.启用 === false) continue;
            if ((normalizedEntry.内置槽位 || normalizedEntry.id) === slotId) {
                return normalizedEntry.内容 || '';
            }
        }
    }
    return '';
};

export const 获取内置世界书槽位内容 = (params: {
    books?: 世界书结构[];
    slotId: 世界书本体槽位值 | string;
    fallback: string;
    variables?: Record<string, string | number | boolean | null | undefined>;
}): string => {
    const slotContent = 获取内置世界书槽位原文(params.books, params.slotId);
    return 渲染世界书模板文本(slotContent || params.fallback, params.variables);
};

export const 获取剧情风格世界书槽位 = (
    scope: 'main' | 'opening',
    style: 剧情风格类型,
    ntlTier?: NTL后宫档位
): string => 获取剧情风格槽位ID(scope, style, ntlTier);


export const 扁平化世界书条目 = (books: 世界书结构[]): 世界书条目结构[] => (
    规范化世界书列表(books).flatMap((book) => {
        if (book.启用 === false) return [];
        const allowAppendRoute = true;
        const outlineEntry = allowAppendRoute && (book.常驻大纲 || '').trim()
            ? [{
                id: `${book.id}__outline`,
                标题: book.标题 ? `${book.标题} / 常驻大纲` : '常驻大纲',
                内容: (book.常驻大纲 || '').trim(),
                条目形态: 'timeline_outline' as 世界书条目形态,
                类型: 'world_lore' as 世界书类型,
                作用域: ['all'] as 世界书作用域[],
                注入模式: 'always' as 世界书注入模式,
                时间线开始时间: '',
                时间线结束时间: '',
                关键词: [],
                优先级: 1000,
                启用: true,
                创建时间: book.创建时间,
                更新时间: book.更新时间
            }]
            : [];
        return [...outlineEntry, ...(book.条目 || [])]
            .map((entry) => 规范化世界书条目(entry))
            .filter((entry) => entry.启用 !== false)
            .map((entry) => ({
                ...entry,
                标题: book.标题 ? `${book.标题} / ${entry.标题}` : entry.标题
            }));
    })
);

export const 构建世界书导出数据 = (books: 世界书结构[]): 世界书导出结构 => ({
    version: 世界书导出版本,
    exportedAt: new Date().toISOString(),
    books: 规范化世界书列表(books)
});

export const 解析世界书导入数据 = (payload: unknown): 世界书结构[] => 规范化世界书列表(payload);

export const 构建世界书预设组导出数据 = (groups: 世界书预设组结构[]): 世界书预设组导出结构 => ({
    version: 世界书预设组导出版本,
    exportedAt: new Date().toISOString(),
    groups: 规范化世界书预设组列表(groups)
});

export const 解析世界书预设组导入数据 = (payload: unknown): 世界书预设组结构[] => 规范化世界书预设组列表(payload);

export const 应用世界书预设组到世界书列表 = (
    currentBooks: 世界书结构[],
    presetGroup: 世界书预设组结构
): 世界书结构[] => {
    const normalizedCurrent = 规范化世界书列表(currentBooks);
    const normalizedGroup = 规范化世界书预设组(presetGroup);
    const snapshotMap = new Map(normalizedGroup.书籍快照.map((book) => [book.id, book] as const));

    const merged = normalizedCurrent.map((book) => {
        const snapshot = snapshotMap.get(book.id);
        if (snapshot) {
            return {
                ...snapshot,
                启用: snapshot.启用 !== false,
                更新时间: Date.now()
            };
        }
        if (book.内置) {
            return book;
        }
        return {
            ...book,
            启用: false,
            更新时间: Date.now()
        };
    });

    snapshotMap.forEach((snapshot, id) => {
        if (merged.some((book) => book.id === id)) return;
        merged.push({
            ...snapshot,
            启用: snapshot.启用 !== false,
            更新时间: Date.now()
        });
    });

    return 规范化世界书列表(merged);
};

const 作用域命中 = (entryScopes: 世界书作用域[], activeScopes: 世界书作用域[]): boolean => {
    if (entryScopes.includes('all')) return true;
    return activeScopes.some((scope) => entryScopes.includes(scope));
};

const 提取环境文本 = (environment: any): string[] => {
    if (!environment || typeof environment !== 'object') return [];
    return [environment?.大地点, environment?.中地点, environment?.小地点, environment?.具体地点, environment?.时间]
        .map((item) => 读取文本(item).trim())
        .filter(Boolean);
};

const 提取社交文本 = (social: any[]): string[] => (
    (Array.isArray(social) ? social : []).flatMap((npc) => {
        if (!npc || typeof npc !== 'object') return [];
        return [npc?.姓名, npc?.称号, npc?.身份, npc?.所属势力, npc?.当前位置]
            .map((item) => 读取文本(item).trim())
            .filter(Boolean);
    })
);

const 提取历史文本 = (history: 聊天记录结构[]): string[] => (
    (Array.isArray(history) ? history : [])
        .slice(-12)
        .map((item) => 读取文本(item?.content).trim())
        .filter(Boolean)
);

const 提取世界文本 = (world: any): string[] => {
    if (!world || typeof world !== 'object') return [];
    const ongoingEvents = Array.isArray(world?.进行中事件) ? world.进行中事件 : [];
    return ongoingEvents.flatMap((event: any) => [event?.标题, event?.发生地点, event?.类型]
        .map((item) => 读取文本(item).trim())
        .filter(Boolean));
};

type 世界书命中参数 = {
    books: 世界书结构[];
    scopes: 世界书作用域[];
    environment?: any;
    social?: any[];
    history?: 聊天记录结构[];
    world?: any;
    extraTexts?: string[];
    maxChars?: number;
};

const 时间串转序数 = (value?: string): number | null => {
    const canonical = 规范化时间线时间(value);
    if (!canonical) return null;
    const match = canonical.match(/^(\d{1,6}):(\d{2}):(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    return ((((Number(match[1]) * 12) + Number(match[2])) * 31 + Number(match[3])) * 24 + Number(match[4])) * 60 + Number(match[5]);
};

const 时间线命中 = (entry: 世界书条目结构, currentTimeText: string): boolean => {
    const current = 时间串转序数(currentTimeText);
    if (current === null) return !(entry.时间线开始时间 || entry.时间线结束时间);
    const start = 时间串转序数(entry.时间线开始时间);
    const end = 时间串转序数(entry.时间线结束时间);
    if (start !== null && current < start) return false;
    if (end !== null && current > end) return false;
    return true;
};

export const 选择生效世界书条目 = ({
    books,
    scopes,
    environment,
    social,
    history,
    world,
    extraTexts,
    maxChars
}: 世界书命中参数): 世界书条目结构[] => {
    const activeScopes = Array.isArray(scopes) && scopes.length > 0 ? scopes : 默认作用域;
    const currentTimeText = 环境时间转标准串(environment) || 读取文本(environment?.时间).trim();
    const corpus = [
        ...提取环境文本(environment),
        ...提取社交文本(Array.isArray(social) ? social : []),
        ...提取历史文本(Array.isArray(history) ? history : []),
        ...提取世界文本(world),
        ...(Array.isArray(extraTexts) ? extraTexts.map((item) => 读取文本(item).trim()).filter(Boolean) : [])
    ].join('\n').toLowerCase();
    const budget = typeof maxChars === 'number' && Number.isFinite(maxChars)
        ? Math.max(0, Math.floor(maxChars))
        : Math.max(...activeScopes.map((scope) => 世界书预算映射[scope] || 0));

    const selected: 世界书条目结构[] = [];
    let totalChars = 0;

    扁平化世界书条目(books).forEach((entry) => {
        if (!作用域命中(entry.作用域 || 默认作用域, activeScopes)) return;
        if (!(entry.内容 || '').trim()) return;
        if (!时间线命中(entry, currentTimeText)) return;
        if (entry.注入模式 === 'match_any') {
            const keywords = Array.isArray(entry.关键词) ? entry.关键词.map((item) => item.trim().toLowerCase()).filter(Boolean) : [];
            if (keywords.length <= 0) return;
            if (!keywords.some((keyword) => corpus.includes(keyword))) return;
        }
        const estimated = `${entry.标题}\n${entry.内容}`.length;
        if (budget > 0 && selected.length > 0 && totalChars + estimated > budget) return;
        selected.push(entry);
        totalChars += estimated;
    });

    return selected;
};

const 类型标题映射: Record<世界书类型, string> = {
    world_lore: '附加世界观',
    system_rule: '附加系统规则',
    command_rule: '附加命令规则',
    output_rule: '附加输出规则'
};

const 构建分组文本 = (label: string, entries: 世界书条目结构[]): string => {
    const sections = entries.map((entry) => {
        const title = (entry.标题 || '').trim();
        const body = (entry.内容 || '').trim();
        if (!body) return '';
        return [`### ${title || '未命名条目'}`, body].filter(Boolean).join('\n');
    }).filter(Boolean);
    if (sections.length <= 0) return '';
    return `【${label}】\n${sections.join('\n\n')}`;
};

export const 构建世界书注入文本 = (params: 世界书命中参数): {
    selectedEntries: 世界书条目结构[];
    worldLoreText: string;
    systemRuleText: string;
    commandRuleText: string;
    outputRuleText: string;
    combinedText: string;
} => {
    const selectedEntries = 选择生效世界书条目(params);
    const grouped = {
        world_lore: selectedEntries.filter((entry) => entry.类型 === 'world_lore'),
        system_rule: selectedEntries.filter((entry) => entry.类型 === 'system_rule'),
        command_rule: selectedEntries.filter((entry) => entry.类型 === 'command_rule'),
        output_rule: selectedEntries.filter((entry) => entry.类型 === 'output_rule')
    };
    const worldLoreText = 构建分组文本(类型标题映射.world_lore, grouped.world_lore);
    const systemRuleText = 构建分组文本(类型标题映射.system_rule, grouped.system_rule);
    const commandRuleText = 构建分组文本(类型标题映射.command_rule, grouped.command_rule);
    const outputRuleText = 构建分组文本(类型标题映射.output_rule, grouped.output_rule);
    const combinedText = [worldLoreText, systemRuleText, commandRuleText, outputRuleText].filter(Boolean).join('\n\n');

    return {
        selectedEntries,
        worldLoreText,
        systemRuleText,
        commandRuleText,
        outputRuleText,
        combinedText
    };
};
