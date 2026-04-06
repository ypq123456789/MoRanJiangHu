import type {
    提示词结构,
    内置提示词条目结构,
    记忆配置结构,
    记忆系统结构,
    游戏设置结构,
    OpeningConfig,
    世界书作用域,
    世界书结构
} from '../../types';
import { 规范化记忆配置 } from './memoryUtils';
import { 格式化短期记忆展示文本 } from './memoryUtils';
import { 构建NPC上下文 } from './npcContext';
import { normalizeCanonicalGameTime, 环境时间转标准串, 结构化时间转标准串 } from './timeUtils';
import { 规范化游戏设置 } from '../../utils/gameSettings';
import {
    构建世界书注入文本,
    世界书本体槽位
} from '../../utils/worldbook';
import { 构建主剧情难度摘要提示词 } from '../../prompts/runtime/promptOwnership';
import { 获取内置提示词槽位内容 } from '../../utils/builtinPrompts';
import { 按功能开关过滤提示词内容, 裁剪修炼体系上下文数据 } from '../../utils/promptFeatureToggles';
import {
    构建运行时提示词池,
    剥离NoControl关联提示词,
    规范化比较文本,
} from './promptRuntime';
import { 构建AI角色声明提示词 } from '../../prompts/runtime/roleIdentity';
import {
    构建字数要求提示词,
    构建免责声明输出要求提示词,
    获取输出协议提示词,
    获取行动选项提示词
} from '../../prompts/runtime/protocolDirectives';
import { 规范化环境信息 } from './stateTransforms';
import {
    规范化剧情状态,
    规范化剧情规划状态,
    规范化女主剧情规划状态,
    规范化同人剧情规划状态,
    规范化同人女主剧情规划状态,
    规范化世界状态,
    规范化战斗状态
} from './storyState';
import { 构建同人运行时提示词包, 应用境界体系区块替换 } from '../../prompts/runtime/fandom';
import { 构建女主剧情规划协议 } from '../../prompts/core/heroinePlan';
import { 构建女主规划专项提示词 } from '../../prompts/core/heroinePlanCot';
import { 核心_境界体系 } from '../../prompts/core/realm';

export type 运行时提示词状态 = {
    当前启用: boolean;
    原始启用: boolean;
    受运行时接管: boolean;
    运行时注入: boolean;
};

export type 系统提示词上下文片段 = {
    AI角色声明: string;
    worldPrompt: string;
    地图建筑状态: string;
    同人设定摘要: string;
    境界体系提示词: string;
    otherPrompts: string;
    难度设置提示词: string;
    叙事人称提示词: string;
    字数设置提示词: string;
    COT提示词: string;
    格式提示词: string;
    输出协议提示词: string;
    字数要求提示词: string;
    免责声明输出提示词: string;
    离场NPC档案: string;
    长期记忆: string;
    中期记忆: string;
    在场NPC档案: string;
    剧情安排: string;
    女主剧情规划状态: string;
    世界状态: string;
    环境状态: string;
    角色状态: string;
    战斗状态: string;
    门派状态: string;
    任务状态: string;
    约定状态: string;
};

export type 系统提示词构建结果 = {
    systemPrompt: string;
    shortMemoryContext: string;
    runtimePromptStates: Record<string, 运行时提示词状态>;
    contextPieces: 系统提示词上下文片段;
};

type 系统提示词构建参数 = {
    promptPool: 提示词结构[];
    memoryData: 记忆系统结构;
    socialData: any[];
    statePayload: any;
    gameConfig: 游戏设置结构;
    memoryConfig: 记忆配置结构;
    fallbackPlayerName?: string;
    builtinPromptEntries?: 内置提示词条目结构[];
    worldbooks?: 世界书结构[];
    worldEvolutionEnabled: boolean;
    options?: {
        禁用中期长期记忆?: boolean;
        禁用短期记忆?: boolean;
        禁用世界演变分流?: boolean;
        禁用行动选项提示词?: boolean;
        注入剧情推动协议?: boolean;
        注入女主剧情规划协议?: boolean;
        世界书作用域?: 世界书作用域[];
        世界书附加文本?: string[];
        openingConfig?: OpeningConfig;
        强制剧情COT提示词ID?: string;
    };
};

const 格式化展示上下文 = <T,>(value: T): T => {
    if (Array.isArray(value)) {
        return value.map((item, index) => {
            const formatted = 格式化展示上下文(item);
            if (formatted && typeof formatted === 'object' && !Array.isArray(formatted)) {
                return {
                    [`[${index}]`]: index,
                    ...(formatted as Record<string, unknown>)
                };
            }
            return formatted;
        }) as T;
    }
    if (!value || typeof value !== 'object') return value;
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== '索引')
        .map(([key, child]) => [key, 格式化展示上下文(child)]);
    return Object.fromEntries(entries) as T;
};

const 序列化展示上下文 = (value: unknown): string => JSON.stringify(
    格式化展示上下文(value),
    null,
    2
).replace(
    /^(\s*)"(\[\d+\])":\s*\d+,?$/gm,
    '$1"$2"'
);

const 树状上下文缩进 = (depth: number): string => '  '.repeat(depth);

const 树状上下文为空 = (value: unknown): boolean => {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim().length <= 0;
    if (typeof value === 'number') return !Number.isFinite(value);
    if (typeof value === 'boolean') return false;
    if (Array.isArray(value)) {
        return value.every((item) => 树状上下文为空(item));
    }
    if (typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>)
            .filter(([key]) => key !== '索引')
            .every(([, child]) => 树状上下文为空(child));
    }
    return false;
};

const 格式化树状上下文标量 = (value: unknown): string => {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    if (typeof value === 'boolean') return value ? '是' : '否';
    return '';
};

const 树状上下文对象摘要键 = [
    '标题',
    '事件名',
    '镜头标题',
    '阶段名',
    '分歧线名',
    '女主姓名',
    '姓名',
    '对象',
    '名称',
    '类型'
];

const 读取树状上下文对象摘要 = (
    value: Record<string, unknown>,
    index: number
): { key: string; label: string } => {
    for (const key of 树状上下文对象摘要键) {
        const text = 格式化树状上下文标量(value[key]);
        if (text) {
            return {
                key,
                label: `[${index}] ${key}: ${text}`
            };
        }
    }
    return {
        key: '',
        label: `[${index}]`
    };
};

const 追加树状上下文行 = (
    lines: string[],
    label: string,
    value: unknown,
    depth: number
) => {
    if (树状上下文为空(value)) return;
    const indent = 树状上下文缩进(depth);

    if (Array.isArray(value)) {
        const items = value.filter((item) => !树状上下文为空(item));
        if (items.length <= 0) return;
        const scalarArray = items.every((item) => (
            item == null
            || typeof item === 'string'
            || typeof item === 'number'
            || typeof item === 'boolean'
        ));
        if (scalarArray) {
            const text = items
                .map((item) => 格式化树状上下文标量(item))
                .filter(Boolean)
                .join('；');
            if (text) {
                lines.push(`${indent}${label}: ${text}`);
            }
            return;
        }
        lines.push(`${indent}${label}:`);
        items.forEach((item, index) => {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const record = item as Record<string, unknown>;
                const summary = 读取树状上下文对象摘要(record, index);
                lines.push(`${树状上下文缩进(depth + 1)}- ${summary.label}`);
                Object.entries(record)
                    .filter(([key, child]) => key !== '索引' && key !== summary.key && !树状上下文为空(child))
                    .forEach(([key, child]) => {
                        追加树状上下文行(lines, key, child, depth + 2);
                    });
                return;
            }
            const text = 格式化树状上下文标量(item);
            if (text) {
                lines.push(`${树状上下文缩进(depth + 1)}- ${text}`);
            }
        });
        return;
    }

    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([key, child]) => key !== '索引' && !树状上下文为空(child));
        if (entries.length <= 0) return;
        lines.push(`${indent}${label}:`);
        entries.forEach(([key, child]) => {
            追加树状上下文行(lines, key, child, depth + 1);
        });
        return;
    }

    const text = 格式化树状上下文标量(value);
    if (text) {
        lines.push(`${indent}${label}: ${text}`);
    }
};

const 序列化树状上下文 = (value: unknown): string => {
    const lines: string[] = [];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.entries(value as Record<string, unknown>)
            .filter(([key, child]) => key !== '索引' && !树状上下文为空(child))
            .forEach(([key, child]) => {
                追加树状上下文行(lines, key, child, 0);
            });
        return lines.join('\n').trim();
    }
    追加树状上下文行(lines, '内容', value, 0);
    return lines.join('\n').trim();
};

const 包装树状上下文 = (title: string, value: unknown): string => {
    const body = 序列化树状上下文(value);
    return `【${title}】\n${body || '无'}`;
};

const 剥离真实模式专项审计 = (content: string): string => {
    const source = typeof content === 'string' ? content : '';
    if (!source) return '';
    return source
        .replace(
            /\n### 真实模式（Real Mode）专项审计[\s\S]*?(?=\n### |\n## |\n<think>|\n<COT预思考协议>|$)/,
            '\n'
        )
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const 主剧情剥离提示词ID = new Set([
    'core_story',
    'core_heroine_plan',
    'core_heroine_plan_ntl',
    'core_heroine_plan_cot',
    'core_heroine_plan_cot_ntl',
    'stat_world_evo'
]);

export const 构建系统提示词 = ({
    promptPool,
    memoryData,
    socialData,
    statePayload,
    gameConfig,
    memoryConfig,
    fallbackPlayerName,
    builtinPromptEntries,
    worldbooks,
    worldEvolutionEnabled,
    options
}: 系统提示词构建参数): 系统提示词构建结果 => {
    const 构建环境状态文本 = (payload: any) => {
        const source = payload || {};
        const env = 规范化环境信息(source?.环境);
        const role = source?.角色 && typeof source.角色 === 'object' ? source.角色 : {};
        const 取文本 = (value: any) => (typeof value === 'string' ? value : '');
        const 取数值 = (value: any, fallback: number = 0) => (
            typeof value === 'number' && Number.isFinite(value) ? value : fallback
        );
        const 当前坐标X = typeof role?.当前坐标X === 'number' && Number.isFinite(role.当前坐标X) ? role.当前坐标X : 0;
        const 当前坐标Y = typeof role?.当前坐标Y === 'number' && Number.isFinite(role.当前坐标Y) ? role.当前坐标Y : 0;
        const 节日原始 = env?.节日 && typeof env.节日 === 'object' ? env.节日 : null;
        const 天气原始: any = env?.天气 && typeof env.天气 === 'object' ? env.天气 : {};
        const 环境变量列表原始 = Array.isArray(env?.环境变量)
            ? env.环境变量
            : (env?.环境变量 && typeof env.环境变量 === 'object' ? [env.环境变量] : []);
        const 天气结束日期 = (() => {
            if (typeof 天气原始?.结束日期 === 'string') {
                const canonical = normalizeCanonicalGameTime(天气原始.结束日期);
                return canonical || 天气原始.结束日期;
            }
            const structured = 结构化时间转标准串(天气原始?.结束日期);
            if (structured) {
                const canonical = normalizeCanonicalGameTime(structured);
                return canonical || structured;
            }
            const fallback = 环境时间转标准串(env);
            return fallback || '';
        })();
        const orderedEnv = {
            时间: 环境时间转标准串(env) || '',
            大地点: 取文本(env?.大地点),
            中地点: 取文本(env?.中地点),
            小地点: 取文本(env?.小地点),
            具体地点: 取文本(env?.具体地点),
            当前坐标: `[${当前坐标X},${当前坐标Y}]`,
            节日: 节日原始
                ? {
                    名称: 取文本(节日原始?.名称),
                    简介: 取文本(节日原始?.简介),
                    效果: 取文本(节日原始?.效果)
                }
                : null,
            天气: {
                天气: 取文本(天气原始?.天气),
                结束日期: 天气结束日期
            },
            环境变量: 环境变量列表原始
                .map((item: any, idx: number) => ({
                    索引: idx,
                    名称: 取文本(item?.名称),
                    描述: 取文本(item?.描述),
                    效果: 取文本(item?.效果)
                }))
                .filter((item: any) => item.名称 || item.描述 || item.效果)
        };
        return 包装树状上下文('当前环境', orderedEnv);
    };

    const 构建角色状态文本 = (payload: any) => {
        const source = payload || {};
        const role = source?.角色 && typeof source.角色 === 'object' ? source.角色 : {};
        const 启用饱腹口渴系统 = 规范化游戏设置(gameConfig).启用饱腹口渴系统 !== false;
        const 取文本 = (value: any) => (typeof value === 'string' ? value : '');
        const 取数值 = (value: any, fallback: number = 0) => (
            typeof value === 'number' && Number.isFinite(value) ? value : fallback
        );
        const 取数组 = (value: any) => (Array.isArray(value) ? value : []);
        const 天赋列表 = 取数组(role?.天赋列表).map((item: any) => ({
            名称: 取文本(item?.名称),
            描述: 取文本(item?.描述),
            效果: 取文本(item?.效果)
        }));
        const 出身背景原始 = role?.出身背景 && typeof role.出身背景 === 'object' ? role.出身背景 : {};
        const 出身背景 = {
            名称: 取文本(出身背景原始?.名称),
            描述: 取文本(出身背景原始?.描述),
            效果: 取文本(出身背景原始?.效果)
        };
        const 金钱原始 = role?.金钱 && typeof role.金钱 === 'object' ? role.金钱 : {};
        const 金钱 = {
            金元宝: 取数值(金钱原始?.金元宝),
            银子: 取数值(金钱原始?.银子),
            铜钱: 取数值(金钱原始?.铜钱)
        };
        const 装备原始 = role?.装备 && typeof role.装备 === 'object' ? role.装备 : {};
        const 装备 = {
            头部: 取文本(装备原始?.头部),
            胸部: 取文本(装备原始?.胸部),
            盔甲: 取文本(装备原始?.盔甲),
            内衬: 取文本(装备原始?.内衬),
            腿部: 取文本(装备原始?.腿部),
            手部: 取文本(装备原始?.手部),
            足部: 取文本(装备原始?.足部),
            主武器: 取文本(装备原始?.主武器),
            副武器: 取文本(装备原始?.副武器),
            暗器: 取文本(装备原始?.暗器),
            背部: 取文本(装备原始?.背部),
            腰部: 取文本(装备原始?.腰部),
            坐骑: 取文本(装备原始?.坐骑)
        };
        const 玩家BUFF列表 = 取数组(role?.玩家BUFF).map((item: any) => {
            const raw = item && typeof item === 'object' ? item : {};
            return {
                名称: 取文本(raw?.名称),
                描述: 取文本(raw?.描述),
                效果: 取文本(raw?.效果),
                结束时间: 取文本(raw?.结束时间)
            };
        });
        const 突破条件列表 = 取数组(role?.突破条件).map((item: any) => {
            const raw = item && typeof item === 'object' ? item : {};
            return {
                名称: 取文本(raw?.名称),
                描述: 取文本(raw?.描述),
                要求: 取文本(raw?.要求),
                当前进度: 取文本(raw?.当前进度)
            };
        });
        const 功法列表 = 取数组(role?.功法列表).map((item: any) => {
            const raw = item && typeof item === 'object' ? item : {};
            const 附带效果 = 取数组(raw?.附带效果).map((effect: any) => ({
                名称: 取文本(effect?.名称),
                触发概率: 取文本(effect?.触发概率),
                持续时间: 取文本(effect?.持续时间),
                数值参数: 取文本(effect?.数值参数),
                生效间隔: 取文本(effect?.生效间隔)
            }));
            const 被动修正 = 取数组(raw?.被动修正).map((passive: any) => ({
                属性名: 取文本(passive?.属性名),
                数值: 取数值(passive?.数值),
                类型: 取文本(passive?.类型)
            }));
            const 重数描述映射 = 取数组(raw?.重数描述映射).map((stage: any) => ({
                重数: 取数值(stage?.重数),
                描述: 取文本(stage?.描述)
            }));
            const 境界特效 = 取数组(raw?.境界特效).map((feature: any) => ({
                解锁重数: 取数值(feature?.解锁重数),
                描述: 取文本(feature?.描述)
            }));
            return {
                ID: 取文本(raw?.ID),
                名称: 取文本(raw?.名称),
                描述: 取文本(raw?.描述),
                类型: 取文本(raw?.类型),
                品质: 取文本(raw?.品质),
                来源: 取文本(raw?.来源),
                当前重数: 取数值(raw?.当前重数),
                最高重数: 取数值(raw?.最高重数),
                当前熟练度: 取数值(raw?.当前熟练度),
                升级经验: 取数值(raw?.升级经验),
                突破条件: 取文本(raw?.突破条件),
                境界限制: 取文本(raw?.境界限制),
                大成方向: 取文本(raw?.大成方向),
                圆满效果: 取文本(raw?.圆满效果),
                武器限制: 取数组(raw?.武器限制),
                消耗类型: 取文本(raw?.消耗类型),
                消耗数值: 取数值(raw?.消耗数值),
                施展耗时: 取文本(raw?.施展耗时),
                冷却时间: 取文本(raw?.冷却时间),
                基础伤害: 取数值(raw?.基础伤害),
                加成属性: 取文本(raw?.加成属性),
                加成系数: 取数值(raw?.加成系数),
                内力系数: 取数值(raw?.内力系数),
                伤害类型: 取文本(raw?.伤害类型),
                目标类型: 取文本(raw?.目标类型),
                最大目标数: 取数值(raw?.最大目标数),
                重数描述映射,
                附带效果,
                被动修正,
                境界特效
            };
        });

        const orderedRole = {
            姓名: 取文本(role?.姓名),
            性别: 取文本(role?.性别),
            年龄: 取数值(role?.年龄),
            出生日期: 取文本(role?.出生日期),
            外貌: 取文本(role?.外貌),
            性格: 取文本(role?.性格),
            称号: 取文本(role?.称号),
            境界: 取文本(role?.境界),
            境界层级: 取数值(role?.境界层级, 1),
            天赋列表,
            出身背景,
            所属门派ID: 取文本(role?.所属门派ID),
            门派职位: 取文本(role?.门派职位),
            门派贡献: 取数值(role?.门派贡献),
            金钱,
            当前精力: 取数值(role?.当前精力),
            最大精力: 取数值(role?.最大精力),
            当前内力: 取数值(role?.当前内力),
            最大内力: 取数值(role?.最大内力),
            ...(启用饱腹口渴系统 ? {
                当前饱腹: 取数值(role?.当前饱腹),
                最大饱腹: 取数值(role?.最大饱腹),
                当前口渴: 取数值(role?.当前口渴),
                最大口渴: 取数值(role?.最大口渴)
            } : {}),
            当前负重: 取数值(role?.当前负重),
            最大负重: 取数值(role?.最大负重),
            当前坐标X: 取数值(role?.当前坐标X),
            当前坐标Y: 取数值(role?.当前坐标Y),
            力量: 取数值(role?.力量),
            敏捷: 取数值(role?.敏捷),
            体质: 取数值(role?.体质),
            根骨: 取数值(role?.根骨),
            悟性: 取数值(role?.悟性),
            福源: 取数值(role?.福源),
            头部当前血量: 取数值(role?.头部当前血量),
            头部最大血量: 取数值(role?.头部最大血量),
            头部状态: 取文本(role?.头部状态),
            胸部当前血量: 取数值(role?.胸部当前血量),
            胸部最大血量: 取数值(role?.胸部最大血量),
            胸部状态: 取文本(role?.胸部状态),
            腹部当前血量: 取数值(role?.腹部当前血量),
            腹部最大血量: 取数值(role?.腹部最大血量),
            腹部状态: 取文本(role?.腹部状态),
            左手当前血量: 取数值(role?.左手当前血量),
            左手最大血量: 取数值(role?.左手最大血量),
            左手状态: 取文本(role?.左手状态),
            右手当前血量: 取数值(role?.右手当前血量),
            右手最大血量: 取数值(role?.右手最大血量),
            右手状态: 取文本(role?.右手状态),
            左腿当前血量: 取数值(role?.左腿当前血量),
            左腿最大血量: 取数值(role?.左腿最大血量),
            左腿状态: 取文本(role?.左腿状态),
            右腿当前血量: 取数值(role?.右腿当前血量),
            右腿最大血量: 取数值(role?.右腿最大血量),
            右腿状态: 取文本(role?.右腿状态),
            装备,
            物品列表: 取数组(role?.物品列表).map((item: any) => (
                item && typeof item === 'object'
                    ? { ...item }
                    : { 名称: 取文本(item) }
            )),
            功法列表,
            当前经验: 取数值(role?.当前经验),
            升级经验: 取数值(role?.升级经验),
            玩家BUFF: 玩家BUFF列表,
            突破条件: 突破条件列表
        };

        return 包装树状上下文('用户角色数据', 裁剪修炼体系上下文数据(orderedRole, normalizedGameConfig));
    };
    const 归一化文本 = (value: any) => (
        typeof value === 'string'
            ? value.trim().replace(/\s+/g, '').toLowerCase()
            : ''
    );
    const 构建世界状态文本 = (payload: any) => {
        const world = 规范化世界状态(payload?.世界);
        const 取文本 = (value: any) => (typeof value === 'string' ? value : '');
        const 取数组 = (value: any) => (Array.isArray(value) ? value : []);
        const orderedWorld = {
            活跃NPC列表: 取数组(world?.活跃NPC列表).map((npc: any, idx: number) => ({
                索引: idx,
                姓名: 取文本(npc?.姓名),
                所属势力: 取文本(npc?.所属势力),
                当前位置: 取文本(npc?.当前位置),
                当前状态: 取文本(npc?.当前状态),
                当前行动: 取文本(npc?.当前行动),
                行动开始时间: 取文本(npc?.行动开始时间),
                行动结束时间: 取文本(npc?.行动结束时间)
            })),
            待执行事件: 取数组(world?.待执行事件).map((event: any, idx: number) => ({
                索引: idx,
                事件名: 取文本(event?.事件名),
                类型: 取文本(event?.类型),
                事件说明: 取文本(event?.事件说明),
                计划执行时间: 取文本(event?.计划执行时间),
                最早执行时间: 取文本(event?.最早执行时间),
                最晚执行时间: 取文本(event?.最晚执行时间),
                前置条件: 取数组(event?.前置条件),
                触发条件: 取数组(event?.触发条件),
                阻断条件: 取数组(event?.阻断条件),
                执行后影响: 取数组(event?.执行后影响),
                错过后影响: 取数组(event?.错过后影响),
                关联人物: 取数组(event?.关联人物),
                关联势力: 取数组(event?.关联势力),
                关联地点: 取数组(event?.关联地点),
                关联分解组: 取数组(event?.关联分解组),
                关联分歧线: 取数组(event?.关联分歧线),
                当前状态: 取文本(event?.当前状态)
            })),
            进行中事件: 取数组(world?.进行中事件).map((event: any, idx: number) => ({
                索引: idx,
                事件名: 取文本(event?.事件名),
                类型: 取文本(event?.类型),
                事件说明: 取文本(event?.事件说明),
                开始时间: 取文本(event?.开始时间),
                预计结束时间: 取文本(event?.预计结束时间),
                当前进展: 取文本(event?.当前进展),
                已产生影响: 取数组(event?.已产生影响),
                关联人物: 取数组(event?.关联人物),
                关联势力: 取数组(event?.关联势力),
                关联地点: 取数组(event?.关联地点),
                关联分解组: 取数组(event?.关联分解组),
                关联分歧线: 取数组(event?.关联分歧线)
            })),
            已结算事件: 取数组(world?.已结算事件).map((event: any, idx: number) => ({
                索引: idx,
                事件名: 取文本(event?.事件名),
                类型: 取文本(event?.类型),
                事件说明: 取文本(event?.事件说明),
                结算时间: 取文本(event?.结算时间),
                事件结果: 取数组(event?.事件结果),
                长期影响: 取数组(event?.长期影响),
                是否进入史册: typeof event?.是否进入史册 === 'boolean' ? event.是否进入史册 : false,
                关联人物: 取数组(event?.关联人物),
                关联势力: 取数组(event?.关联势力),
                关联地点: 取数组(event?.关联地点),
                关联分解组: 取数组(event?.关联分解组),
                关联分歧线: 取数组(event?.关联分歧线)
            })),
            世界镜头规划: 取数组(world?.世界镜头规划).map((item: any, idx: number) => ({
                索引: idx,
                镜头标题: 取文本(item?.镜头标题),
                镜头内容: 取文本(item?.镜头内容),
                触发时间: 取文本(item?.触发时间),
                触发条件: 取数组(item?.触发条件),
                关联人物: 取数组(item?.关联人物),
                关联地点: 取数组(item?.关联地点),
                关联分解组: 取数组(item?.关联分解组),
                关联分歧线: 取数组(item?.关联分歧线),
                沉淀内容: 取数组(item?.沉淀内容),
                当前状态: 取文本(item?.当前状态)
            })),
            江湖史册: 取数组(world?.江湖史册).map((event: any, idx: number) => ({
                索引: idx,
                标题: 取文本(event?.标题),
                归档时间: 取文本(event?.归档时间),
                归档内容: 取数组(event?.归档内容),
                长期影响: 取数组(event?.长期影响),
                关联人物: 取数组(event?.关联人物),
                关联势力: 取数组(event?.关联势力),
                关联地点: 取数组(event?.关联地点),
                关联分歧线: 取数组(event?.关联分歧线)
            }))
        };

        return 包装树状上下文('世界', 裁剪修炼体系上下文数据(orderedWorld, normalizedGameConfig));
    };
    const 构建战斗状态文本 = (payload: any) => {
        const battle = 规范化战斗状态(payload?.战斗);
        const 取文本 = (value: any) => (typeof value === 'string' ? value : '');
        const 取数组 = (value: any) => (Array.isArray(value) ? value : []);
        const 取数值 = (value: any, fallback: number = 0) => (
            typeof value === 'number' && Number.isFinite(value) ? value : fallback
        );
        const enemyRawList = Array.isArray(battle?.敌方) ? battle.敌方 : [];
        const orderedEnemy = enemyRawList.map((enemyRaw: any, index: number) => ({
            索引: index,
            名字: 取文本(enemyRaw?.名字),
            境界: 取文本(enemyRaw?.境界),
            简介: 取文本(enemyRaw?.简介),
            技能: 取数组(enemyRaw?.技能),
            战斗力: 取数值(enemyRaw?.战斗力),
            防御力: 取数值(enemyRaw?.防御力),
            当前血量: 取数值(enemyRaw?.当前血量),
            最大血量: 取数值(enemyRaw?.最大血量),
            当前精力: 取数值(enemyRaw?.当前精力),
            最大精力: 取数值(enemyRaw?.最大精力)
        }));
        const orderedBattle = {
            是否战斗中: battle?.是否战斗中 === true,
            敌方: orderedEnemy
        };
        return 包装树状上下文('战斗', orderedBattle);
    };
    const 构建门派状态文本 = (payload: any) => {
        const sect = payload?.玩家门派 && typeof payload.玩家门派 === 'object' ? payload.玩家门派 : {};
        const 取文本 = (value: any) => (typeof value === 'string' ? value : '');
        const 取数组 = (value: any) => (Array.isArray(value) ? value : []);
        const 取数值 = (value: any, fallback: number = 0) => (
            typeof value === 'number' && Number.isFinite(value) ? value : fallback
        );
        const 任务列表 = 取数组(sect?.任务列表).map((task: any) => ({
            id: 取文本(task?.id),
            标题: 取文本(task?.标题),
            描述: 取文本(task?.描述),
            类型: 取文本(task?.类型),
            难度: 取数值(task?.难度),
            发布日期: 取文本(task?.发布日期),
            截止日期: 取文本(task?.截止日期),
            刷新日期: 取文本(task?.刷新日期),
            奖励贡献: 取数值(task?.奖励贡献),
            奖励资金: 取数值(task?.奖励资金),
            奖励物品: 取数组(task?.奖励物品),
            当前状态: 取文本(task?.当前状态)
        }));
        const 兑换列表 = 取数组(sect?.兑换列表).map((item: any) => ({
            id: 取文本(item?.id),
            物品名称: 取文本(item?.物品名称),
            类型: 取文本(item?.类型),
            兑换价格: 取数值(item?.兑换价格),
            库存: 取数值(item?.库存),
            要求职位: 取文本(item?.要求职位)
        }));
        const 重要成员 = 取数组(sect?.重要成员).map((member: any) => ({
            id: 取文本(member?.id),
            姓名: 取文本(member?.姓名),
            性别: 取文本(member?.性别),
            年龄: 取数值(member?.年龄),
            境界: 取文本(member?.境界),
            身份: 取文本(member?.身份),
            简介: 取文本(member?.简介)
        }));
        const orderedSect = {
            ID: 取文本(sect?.ID),
            名称: 取文本(sect?.名称),
            简介: 取文本(sect?.简介),
            门规: 取数组(sect?.门规),
            门派资金: 取数值(sect?.门派资金),
            门派物资: 取数值(sect?.门派物资),
            建设度: 取数值(sect?.建设度),
            玩家职位: 取文本(sect?.玩家职位),
            玩家贡献: 取数值(sect?.玩家贡献),
            任务列表,
            兑换列表,
            重要成员
        };
        return 包装树状上下文('玩家门派', 裁剪修炼体系上下文数据(orderedSect, normalizedGameConfig));
    };
    const 构建任务列表文本 = (payload: any) => {
        const tasks = Array.isArray(payload?.任务列表) ? payload.任务列表 : [];
        const 取文本 = (value: any) => (typeof value === 'string' ? value : '');
        const 取数组 = (value: any) => (Array.isArray(value) ? value : []);
        const 取数值 = (value: any, fallback: number = 0) => (
            typeof value === 'number' && Number.isFinite(value) ? value : fallback
        );
        const 取布尔 = (value: any) => (typeof value === 'boolean' ? value : false);
        const orderedTasks = tasks.map((task: any) => ({
            标题: 取文本(task?.标题),
            描述: 取文本(task?.描述),
            类型: 取文本(task?.类型),
            发布人: 取文本(task?.发布人),
            发布地点: 取文本(task?.发布地点),
            推荐境界: 取文本(task?.推荐境界),
            截止时间: 取文本(task?.截止时间),
            当前状态: 取文本(task?.当前状态),
            目标列表: 取数组(task?.目标列表).map((goal: any) => ({
                描述: 取文本(goal?.描述),
                当前进度: 取数值(goal?.当前进度),
                总需进度: 取数值(goal?.总需进度),
                完成状态: 取布尔(goal?.完成状态)
            })),
            奖励描述: 取数组(task?.奖励描述),
            剧情暗线: 取文本(task?.剧情暗线)
        }));
        return 包装树状上下文('任务列表', 裁剪修炼体系上下文数据(orderedTasks, normalizedGameConfig));
    };
    const 构建约定列表文本 = (payload: any) => {
        const agreements = Array.isArray(payload?.约定列表) ? payload.约定列表 : [];
        const 取文本 = (value: any) => (typeof value === 'string' ? value : '');
        const 取数值 = (value: any, fallback: number = 0) => (
            typeof value === 'number' && Number.isFinite(value) ? value : fallback
        );
        const orderedAgreements = agreements.map((item: any) => ({
            对象: 取文本(item?.对象),
            头衔: 取文本(item?.头衔),
            性质: 取文本(item?.性质),
            标题: 取文本(item?.标题),
            誓言内容: 取文本(item?.誓言内容),
            约定地点: 取文本(item?.约定地点),
            约定时间: 取文本(item?.约定时间),
            有效时段: 取数值(item?.有效时段),
            当前状态: 取文本(item?.当前状态),
            履行后果: 取文本(item?.履行后果),
            违约后果: 取文本(item?.违约后果),
            背景故事: 取文本(item?.背景故事)
        }));
        return 包装树状上下文('约定列表', orderedAgreements);
    };
    const 构建地图建筑状态文本 = (payload: any) => {
        const source = payload || {};
        const env = 规范化环境信息(source?.环境);
        const world = 规范化世界状态(source?.世界);

        const 当前具体地点 = typeof env?.具体地点 === 'string' ? env.具体地点.trim() : '';
        const 地图列表 = Array.isArray(world.地图) ? world.地图 : [];
        const 建筑列表 = Array.isArray(world.建筑) ? world.建筑 : [];

        const 地图文本 = 地图列表.length > 0
            ? 地图列表.map((mapItem: any) => {
                const name = typeof mapItem?.名称 === 'string' ? mapItem.名称.trim() : '未命名地图';
                const coord = typeof mapItem?.坐标 === 'string' ? mapItem.坐标.trim() : '未知坐标';
                const desc = typeof mapItem?.描述 === 'string' ? mapItem.描述.trim() : '无描述';
                const ownership = mapItem?.归属 && typeof mapItem.归属 === 'object'
                    ? [
                        mapItem.归属?.大地点 || '未知大地点',
                        mapItem.归属?.中地点 || '未知中地点',
                        mapItem.归属?.小地点 || '未知小地点'
                    ].join(' > ')
                    : '未知归属';
                const interiors = Array.isArray(mapItem?.内部建筑)
                    ? mapItem.内部建筑.filter((n: any) => typeof n === 'string' && n.trim().length > 0).join('、')
                    : '';
                return `- 名称: ${name} | 坐标: ${coord} | 归属: ${ownership}\n  描述: ${desc}\n  内部建筑: ${interiors || '无'}`;
            }).join('\n')
            : '- 暂无地图数据';

        const 当前地点归一 = 归一化文本(当前具体地点);
        const 命中建筑 = 建筑列表.filter((building: any) => {
            const 名称归一 = 归一化文本(building?.名称);
            if (!当前地点归一 || !名称归一) return false;
            return 当前地点归一 === 名称归一
                || 当前地点归一.startsWith(名称归一)
                || 当前地点归一.includes(名称归一);
        });

        const 建筑文本 = 命中建筑.length > 0
            ? 命中建筑.map((building: any) => {
                const name = typeof building?.名称 === 'string' ? building.名称.trim() : '未命名建筑';
                const desc = typeof building?.描述 === 'string' ? building.描述.trim() : '无描述';
                const ownership = building?.归属 && typeof building.归属 === 'object'
                    ? [
                        building.归属?.大地点 || '未知大地点',
                        building.归属?.中地点 || '未知中地点',
                        building.归属?.小地点 || '未知小地点'
                    ].join(' > ')
                    : '未知归属';
                return `- 名称: ${name} | 归属: ${ownership}\n  描述: ${desc}`;
            }).join('\n')
            : `- 当前具体地点「${当前具体地点 || '未知'}」未命中建筑变量数据（仅注入地图摘要）`;

        return [
            '【地图与建筑】',
            `当前具体地点: ${当前具体地点 || '未知'}`,
            '地图列表:',
            地图文本,
            '',
            '当前地点建筑数据（仅在具体地点命中对应建筑时注入）:',
            建筑文本
        ].join('\n');
    };
    const 构建剧情安排 = (payload: any) => {
        const normalizedStory = 规范化剧情状态(payload?.剧情);
        const fandomEnabled = payload?.开局配置?.同人融合?.enabled === true && payload?.开局配置?.同人融合?.启用附加小说 === true;
        const normalizedStoryPlan = fandomEnabled
            ? 规范化同人剧情规划状态(payload?.同人剧情规划)
            : 规范化剧情规划状态(payload?.剧情规划);
        const chapter = normalizedStory?.当前章节;

        const orderedStory = {
            当前章节: {
                标题: chapter?.标题 ?? '',
                当前分解组: chapter?.当前分解组 ?? 1,
                原著章节标题: chapter?.原著章节标题 ?? '',
                原著推进状态: chapter?.原著推进状态 ?? '未开始',
                原著换章条件: Array.isArray(chapter?.原著换章条件) ? chapter.原著换章条件 : [],
                原著切换说明: Array.isArray(chapter?.原著切换说明) ? chapter.原著切换说明 : [],
                已完成摘要: Array.isArray(chapter?.已完成摘要) ? chapter.已完成摘要 : [],
                当前待解问题: Array.isArray(chapter?.当前待解问题) ? chapter.当前待解问题 : [],
                切章后沉淀要点: Array.isArray(chapter?.切章后沉淀要点) ? chapter.切章后沉淀要点 : []
            },
            下一章预告: {
                标题: normalizedStory?.下一章预告?.标题 ?? '',
                大纲: Array.isArray(normalizedStory?.下一章预告?.大纲) ? normalizedStory.下一章预告.大纲 : [],
                进入条件: Array.isArray(normalizedStory?.下一章预告?.进入条件) ? normalizedStory.下一章预告.进入条件 : [],
                风险提示: Array.isArray(normalizedStory?.下一章预告?.风险提示) ? normalizedStory.下一章预告.风险提示 : []
            },
            历史卷宗: Array.isArray(normalizedStory?.历史卷宗)
                ? normalizedStory.历史卷宗.map((item: any, idx: number) => ({
                    索引: idx,
                    标题: item?.标题 ?? '',
                    所属章节范围: item?.所属章节范围 ?? '',
                    所属分解组: item?.所属分解组 ?? 1,
                    章节总结: Array.isArray(item?.章节总结) ? item.章节总结 : [],
                    延续事项: Array.isArray(item?.延续事项) ? item.延续事项 : [],
                    分歧线变化: Array.isArray(item?.分歧线变化) ? item.分歧线变化 : [],
                    记录时间: item?.记录时间 ?? ''
                }))
                : [],
            当前规划: normalizedStoryPlan
                ? (
                    fandomEnabled
                        ? {
                            当前对齐信息: (normalizedStoryPlan as any).当前对齐信息 ?? {},
                            当前章目标: Array.isArray((normalizedStoryPlan as any).当前章目标) ? (normalizedStoryPlan as any).当前章目标 : [],
                            当前章任务: Array.isArray((normalizedStoryPlan as any).当前章任务) ? (normalizedStoryPlan as any).当前章任务.map((item: any, idx: number) => ({
                                索引: idx,
                                标题: item?.标题 ?? '',
                                任务说明: item?.任务说明 ?? '',
                                关联分解组: Array.isArray(item?.关联分解组) ? item.关联分解组 : [],
                                关联原著事件: Array.isArray(item?.关联原著事件) ? item.关联原著事件 : [],
                                保持不变的原著基线: Array.isArray(item?.保持不变的原著基线) ? item.保持不变的原著基线 : [],
                                当前偏转点: Array.isArray(item?.当前偏转点) ? item.当前偏转点 : [],
                                计划执行时间: item?.计划执行时间 ?? '',
                                最早执行时间: item?.最早执行时间 ?? '',
                                最晚执行时间: item?.最晚执行时间 ?? '',
                                前置条件: Array.isArray(item?.前置条件) ? item.前置条件 : [],
                                触发条件: Array.isArray(item?.触发条件) ? item.触发条件 : [],
                                阻断条件: Array.isArray(item?.阻断条件) ? item.阻断条件 : [],
                                执行动作: Array.isArray(item?.执行动作) ? item.执行动作 : [],
                                完成判定: Array.isArray(item?.完成判定) ? item.完成判定 : [],
                                偏转后果: Array.isArray(item?.偏转后果) ? item.偏转后果 : [],
                                未偏转后果: Array.isArray(item?.未偏转后果) ? item.未偏转后果 : [],
                                完成后沉淀: Array.isArray(item?.完成后沉淀) ? item.完成后沉淀 : [],
                                当前状态: item?.当前状态 ?? ''
                            })) : [],
                            分歧线: Array.isArray((normalizedStoryPlan as any).分歧线) ? (normalizedStoryPlan as any).分歧线.map((item: any, idx: number) => ({
                                索引: idx,
                                分歧线名: item?.分歧线名 ?? '',
                                起点事件: item?.起点事件 ?? '',
                                关联分解组: Array.isArray(item?.关联分解组) ? item.关联分解组 : [],
                                偏转原因: Array.isArray(item?.偏转原因) ? item.偏转原因 : [],
                                与原著不同之处: Array.isArray(item?.与原著不同之处) ? item.与原著不同之处 : [],
                                当前阶段: item?.当前阶段 ?? '',
                                影响范围: Array.isArray(item?.影响范围) ? item.影响范围 : [],
                                下一步扩大条件: Array.isArray(item?.下一步扩大条件) ? item.下一步扩大条件 : [],
                                回收条件: Array.isArray(item?.回收条件) ? item.回收条件 : [],
                                当前状态: item?.当前状态 ?? ''
                            })) : [],
                            待触发事件: Array.isArray((normalizedStoryPlan as any).待触发事件) ? (normalizedStoryPlan as any).待触发事件.map((item: any, idx: number) => ({
                                索引: idx,
                                事件名: item?.事件名 ?? '',
                                事件说明: item?.事件说明 ?? '',
                                关联分解组: Array.isArray(item?.关联分解组) ? item.关联分解组 : [],
                                关联原著事件: Array.isArray(item?.关联原著事件) ? item.关联原著事件 : [],
                                计划触发时间: item?.计划触发时间 ?? '',
                                最早触发时间: item?.最早触发时间 ?? '',
                                最晚触发时间: item?.最晚触发时间 ?? '',
                                前置条件: Array.isArray(item?.前置条件) ? item.前置条件 : [],
                                触发条件: Array.isArray(item?.触发条件) ? item.触发条件 : [],
                                阻断条件: Array.isArray(item?.阻断条件) ? item.阻断条件 : [],
                                触发后影响: Array.isArray(item?.触发后影响) ? item.触发后影响 : [],
                                错过后影响: Array.isArray(item?.错过后影响) ? item.错过后影响 : [],
                                若偏转则转入哪条分歧线: Array.isArray(item?.若偏转则转入哪条分歧线) ? item.若偏转则转入哪条分歧线 : [],
                                当前状态: item?.当前状态 ?? ''
                            })) : [],
                            镜头规划: Array.isArray((normalizedStoryPlan as any).镜头规划) ? (normalizedStoryPlan as any).镜头规划.map((item: any, idx: number) => ({
                                索引: idx,
                                镜头标题: item?.镜头标题 ?? '',
                                关联分解组: Array.isArray(item?.关联分解组) ? item.关联分解组 : [],
                                镜头内容: item?.镜头内容 ?? '',
                                触发时间: item?.触发时间 ?? '',
                                触发条件: Array.isArray(item?.触发条件) ? item.触发条件 : [],
                                关联人物: Array.isArray(item?.关联人物) ? item.关联人物 : [],
                                关联地点: Array.isArray(item?.关联地点) ? item.关联地点 : [],
                                关联分歧线: Array.isArray(item?.关联分歧线) ? item.关联分歧线 : [],
                                作用: Array.isArray(item?.作用) ? item.作用 : [],
                                当前状态: item?.当前状态 ?? ''
                            })) : [],
                            换组规则: (normalizedStoryPlan as any).换组规则 ?? {}
                        }
                        : {
                            当前章目标: Array.isArray((normalizedStoryPlan as any).当前章目标) ? (normalizedStoryPlan as any).当前章目标 : [],
                            当前章任务: Array.isArray((normalizedStoryPlan as any).当前章任务) ? (normalizedStoryPlan as any).当前章任务.map((item: any, idx: number) => ({
                                索引: idx,
                                标题: item?.标题 ?? '',
                                任务说明: item?.任务说明 ?? '',
                                计划执行时间: item?.计划执行时间 ?? '',
                                前置条件: Array.isArray(item?.前置条件) ? item.前置条件 : [],
                                触发条件: Array.isArray(item?.触发条件) ? item.触发条件 : [],
                                当前状态: item?.当前状态 ?? ''
                            })) : [],
                            跨章延续事项: Array.isArray((normalizedStoryPlan as any).跨章延续事项) ? (normalizedStoryPlan as any).跨章延续事项.map((item: any, idx: number) => ({
                                索引: idx,
                                标题: item?.标题 ?? '',
                                当前状态: Array.isArray(item?.当前状态) ? item.当前状态 : [],
                                延续到何时: item?.延续到何时 ?? '',
                                后续接续条件: Array.isArray(item?.后续接续条件) ? item.后续接续条件 : []
                            })) : [],
                            待触发事件: Array.isArray((normalizedStoryPlan as any).待触发事件) ? (normalizedStoryPlan as any).待触发事件.map((item: any, idx: number) => ({
                                索引: idx,
                                事件名: item?.事件名 ?? '',
                                事件说明: item?.事件说明 ?? '',
                                计划触发时间: item?.计划触发时间 ?? '',
                                前置条件: Array.isArray(item?.前置条件) ? item.前置条件 : [],
                                触发条件: Array.isArray(item?.触发条件) ? item.触发条件 : [],
                                当前状态: item?.当前状态 ?? ''
                            })) : [],
                            镜头规划: Array.isArray((normalizedStoryPlan as any).镜头规划) ? (normalizedStoryPlan as any).镜头规划.map((item: any, idx: number) => ({
                                索引: idx,
                                镜头标题: item?.镜头标题 ?? '',
                                镜头内容: item?.镜头内容 ?? '',
                                触发时间: item?.触发时间 ?? '',
                                关联任务: Array.isArray(item?.关联任务) ? item.关联任务 : [],
                                当前状态: item?.当前状态 ?? ''
                            })) : [],
                            换章规则: (normalizedStoryPlan as any).换章规则 ?? {}
                        }
                )
                : {}
        };

        return 包装树状上下文('剧情安排', orderedStory);
    };
    const 构建女主剧情规划文本 = (payload: any) => {
        const fandomEnabled = payload?.开局配置?.同人融合?.enabled === true && payload?.开局配置?.同人融合?.启用附加小说 === true;
        const normalizedPlan = fandomEnabled
            ? 规范化同人女主剧情规划状态(payload?.同人女主剧情规划)
            : 规范化女主剧情规划状态(payload?.女主剧情规划);
        if (!normalizedPlan) {
            return '【女主剧情规划】\n无';
        }
        const orderedPlan = fandomEnabled
            ? {
                阶段推进: Array.isArray((normalizedPlan as any).阶段推进) ? (normalizedPlan as any).阶段推进.map((item: any, idx: number) => ({
                    索引: idx,
                    阶段名: item?.阶段名 ?? '',
                    关联分解组: Array.isArray(item?.关联分解组) ? item.关联分解组 : [],
                    主推女主: Array.isArray(item?.主推女主) ? item.主推女主 : [],
                    次推女主: Array.isArray(item?.次推女主) ? item.次推女主 : [],
                    关联分歧线: Array.isArray(item?.关联分歧线) ? item.关联分歧线 : [],
                    阶段目标: Array.isArray(item?.阶段目标) ? item.阶段目标 : [],
                    禁止越级对象: Array.isArray(item?.禁止越级对象) ? item.禁止越级对象 : [],
                    完成判定: Array.isArray(item?.完成判定) ? item.完成判定 : [],
                    切换条件: Array.isArray(item?.切换条件) ? item.切换条件 : []
                })) : [],
                女主条目: Array.isArray((normalizedPlan as any).女主条目) ? (normalizedPlan as any).女主条目.map((item: any, idx: number) => ({
                    索引: idx,
                    女主姓名: item?.女主姓名 ?? '',
                    类型: item?.类型 ?? '',
                    关联分解组: Array.isArray(item?.关联分解组) ? item.关联分解组 : [],
                    关联原著关系线: Array.isArray(item?.关联原著关系线) ? item.关联原著关系线 : [],
                    保持不变的原著基线: Array.isArray(item?.保持不变的原著基线) ? item.保持不变的原著基线 : [],
                    当前偏转点: Array.isArray(item?.当前偏转点) ? item.当前偏转点 : [],
                    所属分歧线: Array.isArray(item?.所属分歧线) ? item.所属分歧线 : [],
                    当前关系状态: item?.当前关系状态 ?? '',
                    当前阶段: item?.当前阶段 ?? '',
                    已成立事实: Array.isArray(item?.已成立事实) ? item.已成立事实 : [],
                    阶段目标: Array.isArray(item?.阶段目标) ? item.阶段目标 : [],
                    推进方式: Array.isArray(item?.推进方式) ? item.推进方式 : [],
                    阻断因素: Array.isArray(item?.阻断因素) ? item.阻断因素 : [],
                    允许突破条件: Array.isArray(item?.允许突破条件) ? item.允许突破条件 : [],
                    失败后回退: Array.isArray(item?.失败后回退) ? item.失败后回退 : []
                })) : [],
                女主互动事件: Array.isArray((normalizedPlan as any).女主互动事件) ? (normalizedPlan as any).女主互动事件.map((item: any, idx: number) => ({
                    索引: idx,
                    女主姓名: item?.女主姓名 ?? '',
                    事件名: item?.事件名 ?? '',
                    事件说明: item?.事件说明 ?? '',
                    关联分解组: Array.isArray(item?.关联分解组) ? item.关联分解组 : [],
                    关联原著事件: Array.isArray(item?.关联原著事件) ? item.关联原著事件 : [],
                    关联分歧线: Array.isArray(item?.关联分歧线) ? item.关联分歧线 : [],
                    计划触发时间: item?.计划触发时间 ?? '',
                    最早触发时间: item?.最早触发时间 ?? '',
                    最晚触发时间: item?.最晚触发时间 ?? '',
                    前置条件: Array.isArray(item?.前置条件) ? item.前置条件 : [],
                    触发条件: Array.isArray(item?.触发条件) ? item.触发条件 : [],
                    阻断条件: Array.isArray(item?.阻断条件) ? item.阻断条件 : [],
                    成功结果: Array.isArray(item?.成功结果) ? item.成功结果 : [],
                    失败结果: Array.isArray(item?.失败结果) ? item.失败结果 : [],
                    与主剧情联动: Array.isArray(item?.与主剧情联动) ? item.与主剧情联动 : [],
                    当前状态: item?.当前状态 ?? ''
                })) : [],
                女主镜头规划: Array.isArray((normalizedPlan as any).女主镜头规划) ? (normalizedPlan as any).女主镜头规划.map((item: any, idx: number) => ({
                    索引: idx,
                    女主姓名: item?.女主姓名 ?? '',
                    关联分解组: Array.isArray(item?.关联分解组) ? item.关联分解组 : [],
                    镜头标题: item?.镜头标题 ?? '',
                    镜头内容: item?.镜头内容 ?? '',
                    触发时间: item?.触发时间 ?? '',
                    触发条件: Array.isArray(item?.触发条件) ? item.触发条件 : [],
                    关联事件: Array.isArray(item?.关联事件) ? item.关联事件 : [],
                    关联分歧线: Array.isArray(item?.关联分歧线) ? item.关联分歧线 : [],
                    沉淀内容: Array.isArray(item?.沉淀内容) ? item.沉淀内容 : [],
                    当前状态: item?.当前状态 ?? ''
                })) : []
            }
            : {
                阶段推进: Array.isArray((normalizedPlan as any).阶段推进) ? (normalizedPlan as any).阶段推进.map((item: any, idx: number) => ({
                    索引: idx,
                    阶段名: item?.阶段名 ?? '',
                    主推女主: Array.isArray(item?.主推女主) ? item.主推女主 : [],
                    次推女主: Array.isArray(item?.次推女主) ? item.次推女主 : [],
                    阶段目标: Array.isArray(item?.阶段目标) ? item.阶段目标 : [],
                    禁止越级对象: Array.isArray(item?.禁止越级对象) ? item.禁止越级对象 : [],
                    关联剧情任务: Array.isArray(item?.关联剧情任务) ? item.关联剧情任务 : [],
                    阶段完成判定: Array.isArray(item?.阶段完成判定) ? item.阶段完成判定 : [],
                    切换条件: Array.isArray(item?.切换条件) ? item.切换条件 : []
                })) : [],
                女主条目: Array.isArray((normalizedPlan as any).女主条目) ? (normalizedPlan as any).女主条目.map((item: any, idx: number) => ({
                    索引: idx,
                    女主姓名: item?.女主姓名 ?? '',
                    类型: item?.类型 ?? '',
                    当前关系状态: item?.当前关系状态 ?? '',
                    当前阶段: item?.当前阶段 ?? '',
                    已成立事实: Array.isArray(item?.已成立事实) ? item.已成立事实 : [],
                    阶段目标: Array.isArray(item?.阶段目标) ? item.阶段目标 : [],
                    推进方式: Array.isArray(item?.推进方式) ? item.推进方式 : [],
                    阻断因素: Array.isArray(item?.阻断因素) ? item.阻断因素 : [],
                    允许突破条件: Array.isArray(item?.允许突破条件) ? item.允许突破条件 : [],
                    失败后回退: Array.isArray(item?.失败后回退) ? item.失败后回退 : []
                })) : [],
                女主互动事件: Array.isArray((normalizedPlan as any).女主互动事件) ? (normalizedPlan as any).女主互动事件.map((item: any, idx: number) => ({
                    索引: idx,
                    女主姓名: item?.女主姓名 ?? '',
                    事件名: item?.事件名 ?? '',
                    事件说明: item?.事件说明 ?? '',
                    计划触发时间: item?.计划触发时间 ?? '',
                    最早触发时间: item?.最早触发时间 ?? '',
                    最晚触发时间: item?.最晚触发时间 ?? '',
                    前置条件: Array.isArray(item?.前置条件) ? item.前置条件 : [],
                    触发条件: Array.isArray(item?.触发条件) ? item.触发条件 : [],
                    阻断条件: Array.isArray(item?.阻断条件) ? item.阻断条件 : [],
                    成功结果: Array.isArray(item?.成功结果) ? item.成功结果 : [],
                    失败结果: Array.isArray(item?.失败结果) ? item.失败结果 : [],
                    关联剧情任务: Array.isArray(item?.关联剧情任务) ? item.关联剧情任务 : [],
                    当前状态: item?.当前状态 ?? ''
                })) : [],
                女主镜头规划: Array.isArray((normalizedPlan as any).女主镜头规划) ? (normalizedPlan as any).女主镜头规划.map((item: any, idx: number) => ({
                    索引: idx,
                    女主姓名: item?.女主姓名 ?? '',
                    镜头标题: item?.镜头标题 ?? '',
                    镜头内容: item?.镜头内容 ?? '',
                    触发时间: item?.触发时间 ?? '',
                    触发条件: Array.isArray(item?.触发条件) ? item.触发条件 : [],
                    关联事件: Array.isArray(item?.关联事件) ? item.关联事件 : [],
                    关联剧情任务: Array.isArray(item?.关联剧情任务) ? item.关联剧情任务 : [],
                    沉淀内容: Array.isArray(item?.沉淀内容) ? item.沉淀内容 : [],
                    当前状态: item?.当前状态 ?? ''
                })) : []
            };

        return 包装树状上下文('女主剧情规划', orderedPlan);
    };

    const perspectivePromptIds = [
        'write_perspective_first',
        'write_perspective_second',
        'write_perspective_third'
    ];
    const normalizedGameConfig = 规范化游戏设置(gameConfig);
    const 启用修炼体系 = normalizedGameConfig.启用修炼体系 !== false;
    const activeWorldbookScopes: 世界书作用域[] = Array.isArray(options?.世界书作用域) && options.世界书作用域.length > 0
        ? options.世界书作用域
        : [normalizedGameConfig.启用酒馆预设模式 === true ? 'tavern' : 'main'];
    const openingConfig = options?.openingConfig
        || statePayload?.开局配置
        || statePayload?.openingConfig;
    const worldbookInjection = 构建世界书注入文本({
        books: Array.isArray(worldbooks) ? worldbooks : [],
        scopes: activeWorldbookScopes,
        environment: statePayload?.环境,
        social: socialData,
        world: statePayload?.世界,
        extraTexts: options?.世界书附加文本
    });
    const { promptPool: effectivePromptPool, selectedCotPromptIds } = 构建运行时提示词池(
        promptPool,
        normalizedGameConfig,
        {
            启用世界演变分流: options?.禁用世界演变分流 === true ? false : worldEvolutionEnabled,
            openingConfig,
            强制剧情COT提示词ID: options?.强制剧情COT提示词ID
        }
    );
    const selectedPerspectiveIdMap: Record<string, string> = {
        第一人称: 'write_perspective_first',
        第二人称: 'write_perspective_second',
        第三人称: 'write_perspective_third'
    };
    const selectedPerspectiveId = selectedPerspectiveIdMap[normalizedGameConfig.叙事人称] || 'write_perspective_second';
    const selectedPerspectivePrompt = effectivePromptPool.find(p => p.id === selectedPerspectiveId);
    const fallbackPerspectivePrompt = effectivePromptPool.find(p => perspectivePromptIds.includes(p.id) && p.启用);

    const playerName = statePayload?.角色?.姓名 || fallbackPlayerName || '未命名';
    const 渲染提示词文本 = (content: string) => {
        const rendered = (content || '').replace(/\$\{playerName\}/g, playerName);
        return normalizedGameConfig.启用防止说话 === false
            ? 剥离NoControl关联提示词(rendered)
            : rendered;
    };
    const 按当前设置过滤提示词 = (content: string): string => 按功能开关过滤提示词内容(content, normalizedGameConfig);
    const 读取主剧情内置槽位覆盖 = (promptId: string, fallbackContent: string): string => {
        switch (promptId) {
            case 'core_world':
                return fallbackContent;
            case 'core_format':
                return 获取内置提示词槽位内容({
                    entries: builtinPromptEntries,
                    slotId: 世界书本体槽位.主剧情输出协议,
                    fallback: fallbackContent,
                    variables: { playerName }
                });
            case 'core_heroine_plan':
                return 获取内置提示词槽位内容({
                    entries: builtinPromptEntries,
                    slotId: 世界书本体槽位.主剧情女主规划_常规,
                    fallback: fallbackContent,
                    variables: { playerName }
                });
            case 'core_heroine_plan_ntl':
                return 获取内置提示词槽位内容({
                    entries: builtinPromptEntries,
                    slotId: 世界书本体槽位.主剧情女主规划_NTL,
                    fallback: fallbackContent,
                    variables: { playerName }
                });
            case 'core_heroine_plan_cot':
                return 获取内置提示词槽位内容({
                    entries: builtinPromptEntries,
                    slotId: 世界书本体槽位.主剧情女主规划思考_常规,
                    fallback: fallbackContent,
                    variables: { playerName }
                });
            case 'core_heroine_plan_cot_ntl':
                return 获取内置提示词槽位内容({
                    entries: builtinPromptEntries,
                    slotId: 世界书本体槽位.主剧情女主规划思考_NTL,
                    fallback: fallbackContent,
                    variables: { playerName }
                });
            case 'core_cot':
                return 获取内置提示词槽位内容({
                    entries: builtinPromptEntries,
                    slotId: 世界书本体槽位.主剧情COT_常规,
                    fallback: fallbackContent,
                    variables: { playerName }
                });
            case 'core_cot_heroine_variant':
                return 获取内置提示词槽位内容({
                    entries: builtinPromptEntries,
                    slotId: 世界书本体槽位.主剧情COT_女主规划,
                    fallback: fallbackContent,
                    variables: { playerName }
                });
            case 'core_cot_heroine_ntl_variant':
                return 获取内置提示词槽位内容({
                    entries: builtinPromptEntries,
                    slotId: 世界书本体槽位.主剧情COT_NTL女主规划,
                    fallback: fallbackContent,
                    variables: { playerName }
                });
            case 'write_style':
                return 获取内置提示词槽位内容({
                    entries: builtinPromptEntries,
                    slotId: 世界书本体槽位.写作文风,
                    fallback: fallbackContent,
                    variables: { playerName }
                });
            case 'write_emotion_guard':
                return 获取内置提示词槽位内容({
                    entries: builtinPromptEntries,
                    slotId: 世界书本体槽位.写作避免极端情绪,
                    fallback: fallbackContent,
                    variables: { playerName }
                });
            case 'write_no_control':
                return 获取内置提示词槽位内容({
                    entries: builtinPromptEntries,
                    slotId: 世界书本体槽位.写作NoControl,
                    fallback: fallbackContent,
                    variables: { playerName }
                });
            default:
                return fallbackContent;
        }
    };
    const ai角色声明 = 获取内置提示词槽位内容({
        entries: builtinPromptEntries,
        slotId: 世界书本体槽位.主剧情AI角色声明,
        fallback: 构建AI角色声明提示词(playerName),
        variables: { playerName }
    });
    const 应用写作设置 = (promptId: string, content: string) => {
        if (promptId !== 'write_req') return content;
        const lengthRule = `<字数>本次<正文>标签内内容必须达到${normalizedGameConfig.字数要求}字以上。</字数>`;
        if (/<字数>[\s\S]*?<\/字数>/m.test(content)) {
            return content.replace(/<字数>[\s\S]*?<\/字数>/m, lengthRule);
        }
        if (/- 单条旁白建议.*$/m.test(content)) {
            return content.replace(/- 单条旁白建议.*$/m, lengthRule);
        }
        return `${content.trim()}\n${lengthRule}`;
    };

    const enabledPrompts = effectivePromptPool.filter(p => p.启用);
    const worldPromptSource = enabledPrompts.find(p => p.id === 'core_world');
    const realmPromptSource = enabledPrompts.find(p => p.id === 'core_realm');
    const worldPrompt = 按当前设置过滤提示词([
        渲染提示词文本(worldPromptSource?.内容 || ''),
        worldbookInjection.worldLoreText
    ]
        .filter(Boolean)
        .join('\n\n'));
    const realmPromptRaw = 启用修炼体系
        ? 渲染提示词文本(realmPromptSource?.内容 || '')
        : '';
    const realmPrompt = !启用修炼体系 || realmPromptRaw.includes('开局后此处会被完整替换')
        ? ''
        : realmPromptRaw;
    const fandomPromptBundle = 构建同人运行时提示词包({
        openingConfig,
        worldPrompt,
        realmPrompt
    });
    const 应用境界区块替换 = (content: string): string => (
        启用修炼体系 && fandomPromptBundle.enabled
            ? 应用境界体系区块替换(content, fandomPromptBundle)
            : content
    );
    const writeReqPrompt = enabledPrompts.find(p => p.id === 'write_req');
    const writeReqContent = writeReqPrompt
        ? 按当前设置过滤提示词(应用写作设置(writeReqPrompt.id, 渲染提示词文本(writeReqPrompt.内容)))
        : '';
    const 读取运行时提示词内容 = (promptId: string): string => {
        if (主剧情剥离提示词ID.has(promptId)) return '';
        const sourcePrompt = effectivePromptPool.find((item) => item.id === promptId)
            || promptPool.find((item) => item.id === promptId);
        if (!sourcePrompt?.内容) return '';
        return 按当前设置过滤提示词(应用境界区块替换(应用写作设置(
            promptId,
            渲染提示词文本(读取主剧情内置槽位覆盖(promptId, sourcePrompt.内容))
        )));
    };
    const 开局剧情推动协议内容 = options?.注入剧情推动协议 === true
        ? 读取运行时提示词内容('core_story')
        : '';
    const 读取运行时女主协议内容 = (params: { ntl: boolean; thinking: boolean }): { id: string; content: string } => {
        const id = params.thinking
            ? (params.ntl ? 'core_heroine_plan_cot_ntl' : 'core_heroine_plan_cot')
            : (params.ntl ? 'core_heroine_plan_ntl' : 'core_heroine_plan');
        if (主剧情剥离提示词ID.has(id)) {
            return { id, content: '' };
        }
        if (!fandomPromptBundle.enabled) {
            return {
                id,
                content: 读取运行时提示词内容(id)
            };
        }
        const runtimeContent = params.thinking
            ? 构建女主规划专项提示词({ ntl: params.ntl, fandom: true })
            : 构建女主剧情规划协议({ ntl: params.ntl, fandom: true });
        return {
            id,
            content: 应用写作设置(id, 渲染提示词文本(runtimeContent))
        };
    };
    const 开局女主协议提示词 = (() => {
        if (options?.注入女主剧情规划协议 !== true || normalizedGameConfig.启用女主剧情规划 !== true) {
            return [] as Array<{ id: string; content: string }>;
        }
        const ntlEnabled = normalizedGameConfig.剧情风格 === 'NTL后宫';
        return [
            读取运行时女主协议内容({ ntl: ntlEnabled, thinking: false }),
            读取运行时女主协议内容({ ntl: ntlEnabled, thinking: true })
        ]
            .filter((item) => item.content.trim().length > 0);
    })();
    const difficultyPromptSummary = 按当前设置过滤提示词(
        构建主剧情难度摘要提示词(promptPool)
    );
    const cotPromptEntries = enabledPrompts
        .filter(p => selectedCotPromptIds.includes(p.id))
        .map(p => ({ id: p.id, content: 应用境界区块替换(应用写作设置(p.id, 渲染提示词文本(读取主剧情内置槽位覆盖(p.id, p.内容)))) }));
    const formatPromptEntries = enabledPrompts
        .filter(p => p.id === 'core_format')
        .map(p => ({ id: p.id, content: 应用境界区块替换(应用写作设置(p.id, 渲染提示词文本(读取主剧情内置槽位覆盖(p.id, p.内容)))) }));
    const otherPromptEntries = enabledPrompts
        .filter(p => p.id !== 'core_world'
            && p.id !== 'core_realm'
            && p.id !== 'core_action_options'
            && p.id !== 'core_format'
            && p.id !== 'core_story'
            && p.id !== 'core_heroine_plan'
            && p.id !== 'core_heroine_plan_ntl'
            && p.id !== 'core_heroine_plan_cot'
            && p.id !== 'core_heroine_plan_cot_ntl'
            && !perspectivePromptIds.includes(p.id)
            && p.id !== 'write_req'
            && !selectedCotPromptIds.includes(p.id)
            && p.类型 !== '难度设定')
        .map(p => ({ id: p.id, content: 应用境界区块替换(应用写作设置(p.id, 渲染提示词文本(读取主剧情内置槽位覆盖(p.id, p.内容)))) }));
    const actionOptionsPromptContent = options?.禁用行动选项提示词
        ? ''
        : 按当前设置过滤提示词(渲染提示词文本(
            获取行动选项提示词(effectivePromptPool, normalizedGameConfig.启用行动选项)
        ));
    const activePerspectivePromptId = selectedPerspectivePrompt?.id || fallbackPerspectivePrompt?.id || '';
    const activePerspectiveContent = 应用写作设置(
        activePerspectivePromptId,
        渲染提示词文本(selectedPerspectivePrompt?.内容 || fallbackPerspectivePrompt?.内容 || '')
    );
    const difficultyPrompts = difficultyPromptSummary.trim();
    const fandomSummaryPrompt = 按当前设置过滤提示词(fandomPromptBundle.同人设定摘要 || '');
    const realmTemplatePrompt = 启用修炼体系
        ? 按当前设置过滤提示词(渲染提示词文本(核心_境界体系.内容))
        : '';
    const otherPrompts = [
        ...otherPromptEntries.map(item => item.content),
        开局剧情推动协议内容,
        ...开局女主协议提示词.map(item => item.content),
        actionOptionsPromptContent,
        按当前设置过滤提示词(worldbookInjection.systemRuleText)
    ]
        .filter(Boolean)
        .join('\n\n');
    const cotPromptRaw = cotPromptEntries.map(item => item.content).filter(Boolean).join('\n\n');
    const cotPromptAfterRealMode = normalizedGameConfig.启用真实世界模式 === true
        ? cotPromptRaw
        : 剥离真实模式专项审计(cotPromptRaw);
    const cotPrompt = cotPromptAfterRealMode.trim();
    const formatPrompt = formatPromptEntries.map(item => item.content).filter(Boolean).join('\n\n');
    const outputProtocolPromptRaw = [
        formatPrompt || 渲染提示词文本(获取输出协议提示词(effectivePromptPool)),
        worldbookInjection.commandRuleText,
        worldbookInjection.outputRuleText
    ]
        .filter(Boolean)
        .join('\n\n');
    const outputProtocolPrompt = (() => {
        const normalizedProtocol = 规范化比较文本(outputProtocolPromptRaw);
        if (!normalizedProtocol) return '';
        const normalizedOtherPrompts = 规范化比较文本(otherPrompts);
        if (!normalizedOtherPrompts) return outputProtocolPromptRaw.trim();
        return normalizedOtherPrompts.includes(normalizedProtocol)
            ? ''
            : outputProtocolPromptRaw.trim();
    })();
    const lengthRequirementPrompt = 构建字数要求提示词(normalizedGameConfig.字数要求);
    const disclaimerRequirementPrompt = normalizedGameConfig.启用免责声明输出
        ? 构建免责声明输出要求提示词()
        : '';
    const 实际发送提示词ID = new Set<string>();
    const 标记提示词发送 = (id: string, content: string) => {
        if (!id) return;
        if (!(content || '').trim()) return;
        实际发送提示词ID.add(id);
    };
    if (worldPromptSource) {
        标记提示词发送(worldPromptSource.id, worldPrompt);
    }
    if (realmPromptSource) {
        标记提示词发送(realmPromptSource.id, realmTemplatePrompt);
    }
    if (writeReqPrompt) {
        标记提示词发送(writeReqPrompt.id, writeReqContent);
    }
    cotPromptEntries.forEach(item => 标记提示词发送(item.id, item.content));
    otherPromptEntries.forEach(item => 标记提示词发送(item.id, item.content));
    标记提示词发送('core_story', 开局剧情推动协议内容);
    开局女主协议提示词.forEach(item => 标记提示词发送(item.id, item.content));
    标记提示词发送('core_action_options', actionOptionsPromptContent);
    标记提示词发送(activePerspectivePromptId, activePerspectiveContent);
    const 原始提示词索引 = new Map(promptPool.map(p => [p.id, p] as const));
    const runtimePromptStates: Record<string, 运行时提示词状态> = {};
    effectivePromptPool.forEach((runtimePrompt) => {
        const rawPrompt = 原始提示词索引.get(runtimePrompt.id);
        const 当前启用 = 实际发送提示词ID.has(runtimePrompt.id);
        const 原始启用 = rawPrompt?.启用 === true;
        runtimePromptStates[runtimePrompt.id] = {
            当前启用,
            原始启用,
            受运行时接管: rawPrompt ? 当前启用 !== 原始启用 : true,
            运行时注入: !rawPrompt
        };
    });
    promptPool.forEach((rawPrompt) => {
        if (runtimePromptStates[rawPrompt.id]) return;
        const 原始启用 = rawPrompt.启用 === true;
        const 当前启用 = 实际发送提示词ID.has(rawPrompt.id);
        runtimePromptStates[rawPrompt.id] = {
            当前启用,
            原始启用,
            受运行时接管: 当前启用 !== 原始启用,
            运行时注入: false
        };
    });
    实际发送提示词ID.forEach((id) => {
        if (runtimePromptStates[id]) return;
        runtimePromptStates[id] = {
            当前启用: true,
            原始启用: false,
            受运行时接管: true,
            运行时注入: true
        };
    });

    const npcContext = 构建NPC上下文(socialData || [], memoryConfig, {
        worldPrompt,
        realmPrompt,
        openingConfig,
        cultivationSystemEnabled: 启用修炼体系
    });
    const contextMapAndBuilding = 构建地图建筑状态文本(statePayload);
    const promptHeader = [
        worldPrompt.trim(),
        contextMapAndBuilding,
        npcContext.离场数据块,
        fandomSummaryPrompt,
        realmTemplatePrompt,
        otherPrompts.trim()
    ].filter(Boolean).join('\n\n');

    const longMemory = options?.禁用中期长期记忆
        ? ''
        : `【长期记忆】\n${memoryData.长期记忆.join('\n') || '暂无'}`;
    const midMemory = options?.禁用中期长期记忆
        ? ''
        : `【中期记忆】\n${memoryData.中期记忆.join('\n') || '暂无'}`;
    const contextMemory = options?.禁用中期长期记忆 ? '' : `${longMemory}\n${midMemory}`;
    const contextNPCData = npcContext.在场数据块;
    const contextStoryPlan = 构建剧情安排(statePayload);
    const contextHeroinePlan = normalizedGameConfig.启用女主剧情规划
        ? 构建女主剧情规划文本(statePayload)
        : '';
    const contextWorldState = 构建世界状态文本(statePayload);
    const contextEnvironmentState = 构建环境状态文本(statePayload);
    const contextRoleState = 构建角色状态文本(statePayload);
    const contextBattleState = 构建战斗状态文本(statePayload);
    const contextSectState = 构建门派状态文本(statePayload);
    const contextTaskState = 构建任务列表文本(statePayload);
    const contextAgreementState = 构建约定列表文本(statePayload);
    const normalizedMemoryConfig = 规范化记忆配置(memoryConfig);
    const shortMemoryInjectLimit = Math.max(1, Number(normalizedMemoryConfig.短期记忆阈值) || 30);
    const shortMemoryEntries = options?.禁用短期记忆
        ? []
        : memoryData.短期记忆
            .slice(-shortMemoryInjectLimit)
            .map((item) => 格式化短期记忆展示文本(item))
            .filter(Boolean);
    const shortMemoryContext = options?.禁用短期记忆
        ? ''
        : shortMemoryEntries.length > 0
            ? `【短期记忆】\n${shortMemoryEntries.join('\n')}`
            : '';

    return {
        systemPrompt: [
            promptHeader,
            difficultyPrompts,
            activePerspectiveContent,
            writeReqContent,
            contextMemory,
            contextStoryPlan,
            contextNPCData,
            contextHeroinePlan,
            contextWorldState,
            contextEnvironmentState,
            contextRoleState,
            contextBattleState,
            contextSectState,
            contextTaskState,
            contextAgreementState,
            cotPrompt
        ].filter(Boolean).join('\n\n'),
        shortMemoryContext,
        runtimePromptStates,
        contextPieces: {
            AI角色声明: ai角色声明,
            worldPrompt: worldPrompt.trim(),
            地图建筑状态: contextMapAndBuilding,
            同人设定摘要: fandomSummaryPrompt,
            境界体系提示词: realmTemplatePrompt,
            otherPrompts: otherPrompts.trim(),
            难度设置提示词: difficultyPrompts.trim(),
            叙事人称提示词: activePerspectiveContent.trim(),
            字数设置提示词: writeReqContent.trim(),
            COT提示词: cotPrompt.trim(),
            格式提示词: formatPrompt.trim(),
            输出协议提示词: outputProtocolPrompt,
            字数要求提示词: lengthRequirementPrompt,
            免责声明输出提示词: disclaimerRequirementPrompt,
            离场NPC档案: npcContext.离场数据块,
            长期记忆: longMemory,
            中期记忆: midMemory,
            在场NPC档案: contextNPCData,
            剧情安排: contextStoryPlan,
            女主剧情规划状态: contextHeroinePlan,
            世界状态: contextWorldState,
            环境状态: contextEnvironmentState,
            角色状态: contextRoleState,
            战斗状态: contextBattleState,
            门派状态: contextSectState,
            任务状态: contextTaskState,
            约定状态: contextAgreementState
        }
    };
};
