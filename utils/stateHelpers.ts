import {
    角色数据结构,
    环境信息结构,
    NPC结构,
    世界数据结构,
    战斗状态结构,
    剧情系统结构,
    剧情规划结构,
    女主剧情规划结构,
    同人剧情规划结构,
    同人女主剧情规划结构,
    详细门派结构,
    任务结构,
    约定结构
} from '../types';

type 状态命令动作 = 'set' | 'add' | 'push' | 'delete' | 'sub';

const 根路径列表 = [
    '同人女主剧情规划',
    '同人剧情规划',
    '女主剧情规划',
    '剧情规划',
    '玩家门派',
    '任务列表',
    '约定列表',
    '记忆系统',
    '角色',
    '环境',
    '社交',
    '世界',
    '战斗',
    '剧情'
] as const;

type 支持根路径类型 = typeof 根路径列表[number];

type 命令结果结构 = {
    char: 角色数据结构;
    env: 环境信息结构;
    social: NPC结构[];
    world: 世界数据结构;
    battle: 战斗状态结构;
    story: 剧情系统结构;
    storyPlan: 剧情规划结构;
    heroinePlan: 女主剧情规划结构 | undefined;
    fandomStoryPlan: 同人剧情规划结构 | undefined;
    fandomHeroinePlan: 同人女主剧情规划结构 | undefined;
    sect: 详细门派结构;
    tasks: 任务结构[];
    agreements: 约定结构[];
};

const 深拷贝 = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const 是对象 = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const 深合并对象 = (left: any, right: any): any => {
    if (Array.isArray(right)) return 深拷贝(right);
    if (!是对象(right)) return 深拷贝(right);
    const seed = 是对象(left) ? 深拷贝(left) : {};
    Object.entries(right).forEach(([key, value]) => {
        seed[key] = 深合并对象(seed[key], value);
    });
    return seed;
};

const 世界相对根字段 = ['活跃NPC列表', '待执行事件', '进行中事件', '已结算事件', '世界镜头规划', '江湖史册', '地图', '建筑'];
const 环境相对根字段 = ['天气', '环境变量', '大地点', '中地点', '小地点', '具体地点', '节日', '时间'];
const 剧情相对根字段 = ['当前章节', '下一章预告', '历史卷宗'];
const 剧情规划相对根字段 = ['当前章目标', '当前章任务', '跨章延续事项', '待触发事件', '镜头规划', '换章规则'];
const 女主规划相对根字段 = ['阶段推进', '女主条目', '女主互动事件', '女主镜头规划'];
const 同人剧情规划相对根字段 = ['当前对齐信息', '当前章目标', '当前章任务', '分歧线', '待触发事件', '镜头规划', '换组规则'];

const 兼容值路径别名 = (rawPath: string): string => {
    const path = (rawPath || '').trim();
    if (!path) return '';
    if (path === '战斗态势') return '战斗';
    if (path.startsWith('战斗态势.主角.')) return `角色.${path.slice('战斗态势.主角.'.length)}`;
    if (path.startsWith('战斗态势.角色.')) return `角色.${path.slice('战斗态势.角色.'.length)}`;
    if (path.startsWith('战斗态势.')) return `战斗.${path.slice('战斗态势.'.length)}`;
    return path;
};

export const normalizeStateCommandKey = (rawKey: string): string => {
    const key = 兼容值路径别名(rawKey);
    if (!key) return '';

    if (key.startsWith('gameState.')) {
        return key;
    }

    for (const root of 根路径列表) {
        if (key === root) return `gameState.${root}`;
        if (key.startsWith(`${root}.`)) return `gameState.${key}`;
        if (key.startsWith(`${root}[`)) return `gameState.${key}`;
    }

    if (世界相对根字段.some((head) => key === head || key.startsWith(`${head}.`) || key.startsWith(`${head}[`))) {
        return `gameState.世界.${key}`;
    }
    if (环境相对根字段.some((head) => key === head || key.startsWith(`${head}.`) || key.startsWith(`${head}[`))) {
        return `gameState.环境.${key}`;
    }
    if (剧情相对根字段.some((head) => key === head || key.startsWith(`${head}.`) || key.startsWith(`${head}[`))) {
        return `gameState.剧情.${key}`;
    }
    if (剧情规划相对根字段.some((head) => key === head || key.startsWith(`${head}.`) || key.startsWith(`${head}[`))) {
        return `gameState.剧情规划.${key}`;
    }
    if (女主规划相对根字段.some((head) => key === head || key.startsWith(`${head}.`) || key.startsWith(`${head}[`))) {
        return `gameState.女主剧情规划.${key}`;
    }
    if (同人剧情规划相对根字段.some((head) => key === head || key.startsWith(`${head}.`) || key.startsWith(`${head}[`))) {
        return `gameState.同人剧情规划.${key}`;
    }

    return key;
};

const normalizeStateValuePath = (rawPath: string): string => normalizeStateCommandKey(rawPath);

const 提取根路径 = (normalizedKey: string): { root: 支持根路径类型; rest: string } | null => {
    for (const root of 根路径列表) {
        const exact = `gameState.${root}`;
        if (normalizedKey === exact) {
            return { root, rest: '' };
        }
        if (normalizedKey.startsWith(`${exact}.`)) {
            return { root, rest: normalizedKey.slice(exact.length + 1) };
        }
        if (normalizedKey.startsWith(`${exact}[`)) {
            return { root, rest: normalizedKey.slice(exact.length) };
        }
    }
    return null;
};

const 解析路径片段 = (rawPath: string): Array<string | number> => {
    const tokens: Array<string | number> = [];
    const regex = /([^. \[\]]+)|\[(\d+)\]/g;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(rawPath || ''))) {
        if (match[1]) tokens.push(match[1]);
        if (match[2] !== undefined) tokens.push(Number(match[2]));
    }
    return tokens;
};

const 应用路径命令 = (
    rootValue: any,
    rawPath: string,
    action: 状态命令动作,
    nextValue: any
): any => {
    const tokens = 解析路径片段(rawPath);

    if (tokens.length === 0) {
        if (action === 'delete') return undefined;
        if (action === 'push') {
            const base = Array.isArray(rootValue) ? 深拷贝(rootValue) : [];
            base.push(深拷贝(nextValue));
            return base;
        }
        if (action === 'add') {
            return (Number(rootValue) || 0) + (Number(nextValue) || 0);
        }
        if (action === 'sub') {
            return (Number(rootValue) || 0) - (Number(nextValue) || 0);
        }
        if (是对象(rootValue) && 是对象(nextValue)) {
            return 深合并对象(rootValue, nextValue);
        }
        return 深拷贝(nextValue);
    }

    const draft = rootValue === undefined
        ? (typeof tokens[0] === 'number' ? [] : {})
        : 深拷贝(rootValue);

    let cursor: any = draft;
    for (let index = 0; index < tokens.length - 1; index += 1) {
        const token = tokens[index];
        const nextToken = tokens[index + 1];
        if (typeof token === 'number') {
            if (!Array.isArray(cursor)) return draft;
            if (cursor[token] === undefined) {
                cursor[token] = typeof nextToken === 'number' ? [] : {};
            }
            cursor = cursor[token];
            continue;
        }
        if (cursor[token] === undefined || cursor[token] === null || typeof cursor[token] !== 'object') {
            cursor[token] = typeof nextToken === 'number' ? [] : {};
        }
        cursor = cursor[token];
    }

    const lastToken = tokens[tokens.length - 1];
    if (typeof lastToken === 'number') {
        if (!Array.isArray(cursor)) return draft;
        if (action === 'delete') {
            if (lastToken >= 0 && lastToken < cursor.length) {
                cursor.splice(lastToken, 1);
            }
            return draft;
        }
        if (action === 'push') {
            const current = Array.isArray(cursor[lastToken]) ? cursor[lastToken] : [];
            current.push(深拷贝(nextValue));
            cursor[lastToken] = current;
            return draft;
        }
        if (action === 'add') {
            cursor[lastToken] = (Number(cursor[lastToken]) || 0) + (Number(nextValue) || 0);
            return draft;
        }
        if (action === 'sub') {
            cursor[lastToken] = (Number(cursor[lastToken]) || 0) - (Number(nextValue) || 0);
            return draft;
        }
        cursor[lastToken] = 深拷贝(nextValue);
        return draft;
    }

    if (action === 'delete') {
        delete cursor[lastToken];
        return draft;
    }
    if (action === 'push') {
        const current = Array.isArray(cursor[lastToken]) ? cursor[lastToken] : [];
        current.push(深拷贝(nextValue));
        cursor[lastToken] = current;
        return draft;
    }
    if (action === 'add') {
        cursor[lastToken] = (Number(cursor[lastToken]) || 0) + (Number(nextValue) || 0);
        return draft;
    }
    if (action === 'sub') {
        cursor[lastToken] = (Number(cursor[lastToken]) || 0) - (Number(nextValue) || 0);
        return draft;
    }
    if (是对象(cursor[lastToken]) && 是对象(nextValue)) {
        cursor[lastToken] = 深合并对象(cursor[lastToken], nextValue);
        return draft;
    }
    cursor[lastToken] = 深拷贝(nextValue);
    return draft;
};

export const readGameStateValueByPath = (stateLike: any, rawPath: string): any => {
    const normalizedPath = normalizeStateValuePath(rawPath);
    if (!normalizedPath.startsWith('gameState.')) return undefined;
    const parsed = 提取根路径(normalizedPath);
    if (!parsed) return undefined;

    let current = stateLike?.[parsed.root];
    for (const token of 解析路径片段(parsed.rest)) {
        if (current === undefined || current === null) return undefined;
        current = current[token as any];
    }
    return current;
};

export const applyStateCommand = (
    rootCharacter: 角色数据结构,
    rootEnv: 环境信息结构,
    rootSocial: NPC结构[],
    rootWorld: 世界数据结构,
    rootBattle: 战斗状态结构,
    rootStory: 剧情系统结构,
    rootStoryPlan: 剧情规划结构,
    rootHeroinePlan: 女主剧情规划结构 | undefined,
    rootFandomStoryPlan: 同人剧情规划结构 | undefined,
    rootFandomHeroinePlan: 同人女主剧情规划结构 | undefined,
    rootSect: 详细门派结构,
    rootTasks: 任务结构[],
    rootAgreements: 约定结构[],
    key: string,
    value: any,
    action: 状态命令动作
): 命令结果结构 => {
    const normalizedKey = normalizeStateCommandKey(key);
    const parsed = 提取根路径(normalizedKey);

    const result: 命令结果结构 = {
        char: 深拷贝(rootCharacter),
        env: 深拷贝(rootEnv),
        social: 深拷贝(rootSocial),
        world: 深拷贝(rootWorld),
        battle: 深拷贝(rootBattle),
        story: 深拷贝(rootStory),
        storyPlan: 深拷贝(rootStoryPlan),
        heroinePlan: rootHeroinePlan === undefined ? undefined : 深拷贝(rootHeroinePlan),
        fandomStoryPlan: rootFandomStoryPlan === undefined ? undefined : 深拷贝(rootFandomStoryPlan),
        fandomHeroinePlan: rootFandomHeroinePlan === undefined ? undefined : 深拷贝(rootFandomHeroinePlan),
        sect: 深拷贝(rootSect),
        tasks: 深拷贝(rootTasks),
        agreements: 深拷贝(rootAgreements)
    };

    if (!parsed) {
        return result;
    }

    const 写回根路径 = (root: 支持根路径类型, next: any) => {
        switch (root) {
            case '角色':
                result.char = next as 角色数据结构;
                break;
            case '环境':
                result.env = next as 环境信息结构;
                break;
            case '社交':
                result.social = Array.isArray(next) ? next as NPC结构[] : [];
                break;
            case '世界':
                result.world = next as 世界数据结构;
                break;
            case '战斗':
                result.battle = next as 战斗状态结构;
                break;
            case '剧情':
                result.story = next as 剧情系统结构;
                break;
            case '剧情规划':
                result.storyPlan = next as 剧情规划结构;
                break;
            case '女主剧情规划':
                result.heroinePlan = next as 女主剧情规划结构 | undefined;
                break;
            case '同人剧情规划':
                result.fandomStoryPlan = next as 同人剧情规划结构 | undefined;
                break;
            case '同人女主剧情规划':
                result.fandomHeroinePlan = next as 同人女主剧情规划结构 | undefined;
                break;
            case '玩家门派':
                result.sect = next as 详细门派结构;
                break;
            case '任务列表':
                result.tasks = Array.isArray(next) ? next as 任务结构[] : [];
                break;
            case '约定列表':
                result.agreements = Array.isArray(next) ? next as 约定结构[] : [];
                break;
            default:
                break;
        }
    };

    const 读取当前根值 = () => {
        switch (parsed.root) {
            case '角色':
                return result.char;
            case '环境':
                return result.env;
            case '社交':
                return result.social;
            case '世界':
                return result.world;
            case '战斗':
                return result.battle;
            case '剧情':
                return result.story;
            case '剧情规划':
                return result.storyPlan;
            case '女主剧情规划':
                return result.heroinePlan;
            case '同人剧情规划':
                return result.fandomStoryPlan;
            case '同人女主剧情规划':
                return result.fandomHeroinePlan;
            case '玩家门派':
                return result.sect;
            case '任务列表':
                return result.tasks;
            case '约定列表':
                return result.agreements;
            default:
                return undefined;
        }
    };

    写回根路径(parsed.root, 应用路径命令(读取当前根值(), parsed.rest, action, value));
    return result;
};
