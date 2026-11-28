import type { TavernCommand } from '../types';
import { normalizeStateCommandKey, 是否废弃世界地图字段路径 } from './stateHelpers';

type 路径片段 = string | number;

export type 变量命令校验结果 = {
    allowed: boolean;
    reason?: string;
    normalizedKey: string;
};

const 变量登记根路径 = [
    '角色',
    '环境',
    '社交',
    '世界',
    '战斗',
    '剧情',
    '剧情规划',
    '女主剧情规划',
    '同人剧情规划',
    '同人女主剧情规划',
    '玩家门派',
    '任务列表',
    '约定列表',
    '记忆系统'
] as const;

const 解析路径片段 = (rawPath: string): 路径片段[] => {
    const tokens: 路径片段[] = [];
    const regex = /([^. \[\]]+)|\[(\d+)\]/g;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(rawPath || ''))) {
        if (match[1]) tokens.push(match[1]);
        if (match[2] !== undefined) tokens.push(Number(match[2]));
    }
    return tokens;
};

const 提取根路径 = (normalizedKey: string): { root: string; rest: string } | null => {
    for (const root of 变量登记根路径) {
        const exact = `gameState.${root}`;
        if (normalizedKey === exact) return { root, rest: '' };
        if (normalizedKey.startsWith(`${exact}.`)) return { root, rest: normalizedKey.slice(exact.length + 1) };
        if (normalizedKey.startsWith(`${exact}[`)) return { root, rest: normalizedKey.slice(exact.length) };
    }
    return null;
};

const 读取路径值 = (source: any, tokens: 路径片段[]): { exists: boolean; value: any; parent: any; lastToken?: 路径片段 } => {
    let current = source;
    let parent: any = undefined;
    let lastToken: 路径片段 | undefined;
    for (const token of tokens) {
        if (current === undefined || current === null) {
            return { exists: false, value: undefined, parent, lastToken: token };
        }
        parent = current;
        lastToken = token;
        if (typeof token === 'number') {
            if (!Array.isArray(current) || token < 0 || token >= current.length) {
                return { exists: false, value: undefined, parent, lastToken };
            }
            current = current[token];
            continue;
        }
        if (typeof current !== 'object' || !(token in current)) {
            return { exists: false, value: undefined, parent, lastToken };
        }
        current = current[token];
    }
    return { exists: true, value: current, parent, lastToken };
};

const 在同数组对象中存在字段 = (rootValue: any, tokens: 路径片段[]): boolean => {
    const lastToken = tokens[tokens.length - 1];
    if (typeof lastToken !== 'string') return false;

    for (let index = tokens.length - 2; index >= 0; index -= 1) {
        if (typeof tokens[index] !== 'number') continue;
        const arrayPath = tokens.slice(0, index);
        const arrayRead = 读取路径值(rootValue, arrayPath);
        if (!Array.isArray(arrayRead.value)) return false;
        return arrayRead.value.some((item: any) => item && typeof item === 'object' && !Array.isArray(item) && lastToken in item);
    }

    return false;
};

const 社交NPC可新增字段 = new Set([
    'id',
    '姓名',
    '性别',
    '年龄',
    '外观年龄',
    '身份',
    '境界',
    '境界层级',
    '简介',
    '关系状态',
    '是否主要角色',
    '是否在场',
    '是否队友',
    '好感度',
    '记忆',
    '天赋列表',
    '出身背景',
    '当前装备',
    '背包',
    'BUFF',
    'DEBUFF',
    '技艺',
    '力量',
    '敏捷',
    '体质',
    '根骨',
    '悟性',
    '福源',
    '核心性格特征',
    '曾用名',
    '好感度突破条件',
    '关系突破条件',
    '关系网变量',
    '外貌描写',
    '身材描写',
    '衣着风格',
    '生日',
    '对主角称呼',
    '胸部描述',
    '小穴描述',
    '屁穴描述',
    '肉棒描述',
    '男娘设定',
    '扶她设定',
    '性癖',
    '敏感点',
    '子宫',
    '子宫档案',
    '名器档案',
    '初夜夺取者',
    '初夜时间',
    '初夜描述',
    '首次亲密记录',
    '当前位置',
    '当前地点',
    '位置路径',
    '当前任务',
    '行动意图',
    '待执行指令',
    '指令来源',
    '指令时间',
    '预期汇合地点',
    '攻击力',
    '防御力',
    '当前血量',
    '最大血量',
    '当前精力',
    '最大精力',
    '当前内力',
    '最大内力',
    '灵根',
    '灵根资质',
    '当前灵力',
    '最大灵力',
    '当前神识',
    '最大神识',
    '丹田状态',
    '道基状态',
    '心魔值',
    '功德',
    '业力',
    '头部当前血量',
    '头部最大血量',
    '头部状态',
    '胸部当前血量',
    '胸部最大血量',
    '胸部状态',
    '腹部当前血量',
    '腹部最大血量',
    '腹部状态',
    '左手当前血量',
    '左手最大血量',
    '左手状态',
    '右手当前血量',
    '右手最大血量',
    '右手状态',
    '左腿当前血量',
    '左腿最大血量',
    '左腿状态',
    '右腿当前血量',
    '右腿最大血量',
    '右腿状态'
]);

const 角色可新增字段 = new Set([
    '灵根',
    '灵根资质',
    '当前灵力',
    '最大灵力',
    '当前神识',
    '最大神识',
    '丹田状态',
    '道基状态',
    '心魔值',
    '功德',
    '业力',
    '外观年龄',
    '胸部描述',
    '小穴描述',
    '屁穴描述',
    '肉棒描述',
    '男娘设定',
    '扶她设定',
    '性癖',
    '敏感点'
]);

const 是允许新增社交NPC字段 = (root: string, tokens: 路径片段[]): boolean => {
    if (root !== '社交') return false;
    if (tokens.length < 2) return false;
    if (typeof tokens[0] !== 'number') return false;
    const field = tokens[1];
    return typeof field === 'string' && 社交NPC可新增字段.has(field);
};

const 是允许新增角色字段 = (root: string, tokens: 路径片段[]): boolean => {
    if (root !== '角色') return false;
    if (tokens.length !== 1) return false;
    const field = tokens[0];
    return typeof field === 'string' && 角色可新增字段.has(field);
};

const 收集变量路径 = (value: any, prefix: string, result: string[], depth: number) => {
    result.push(prefix);
    if (depth <= 0 || value === null || value === undefined || typeof value !== 'object') return;

    if (Array.isArray(value)) {
        if (value.length > 0) {
            result.push(`${prefix}[]`);
            收集变量路径(value[0], `${prefix}[0]`, result, depth - 1);
        }
        return;
    }

    Object.keys(value).sort((left, right) => left.localeCompare(right, 'zh-CN')).forEach((key) => {
        收集变量路径(value[key], `${prefix}.${key}`, result, depth - 1);
    });
};

export const 构建变量路径登记表 = (
    stateLike: Record<string, any>,
    options?: { maxDepth?: number; maxLines?: number }
): string[] => {
    const maxDepth = Math.max(1, options?.maxDepth ?? 4);
    const maxLines = Math.max(20, options?.maxLines ?? 220);
    const roots = 变量登记根路径.filter((root) => root in (stateLike || {}));
    const details: string[] = [];

    for (const root of roots) {
        收集变量路径((stateLike as any)[root], root, details, maxDepth);
        if (details.length >= maxLines * 2) break;
    }

    const uniqueDetails = Array.from(new Set(details)).filter((path) => !roots.includes(path as any));
    return Array.from(new Set([...roots, ...uniqueDetails])).slice(0, maxLines);
};

export const 构建变量路径登记提示 = (stateLike: Record<string, any>): string => {
    const paths = 构建变量路径登记表(stateLike);
    if (paths.length === 0) return '';
    return [
        '【变量路径登记表】',
        '- 下面是当前存档允许变量模型直接写入的路径索引；不要自造根路径、分类名或字段名。',
        '- `set/add/delete` 只能写入登记表中已存在的路径；数组新增请对登记表中的数组路径使用 `push`。',
        '- 若必须新增人物、任务、约定等条目，请 `push` 到对应数组；条目内部字段应沿用同类条目的既有字段。',
        '- 已有势力可首次 set 世界.势力列表[i].主角声望，填写有剧情依据的当前声望整数（-100 至 100）。',
        '- `社交` 是长期 NPC 档案，只能补字段或新增人物；不要 `delete 社交`、`delete 社交[i]`、`set 社交 = [...]` 或 `set 社交[i] = {...}`。',
        '- 不在登记表中的字段视为未登记变量，本回合不要写入。',
        '',
        ...paths.map((path) => `- ${path}`)
    ].join('\n');
};

export const 校验变量命令是否登记 = (
    cmd: TavernCommand,
    stateLike: Record<string, any>
): 变量命令校验结果 => {
    const normalizedKey = normalizeStateCommandKey(typeof cmd?.key === 'string' ? cmd.key : '');
    if (cmd?.action !== 'delete' && 是否废弃世界地图字段路径(normalizedKey)) {
        return { allowed: false, normalizedKey, reason: '旧地图坐标字段已废弃' };
    }
    const parsed = 提取根路径(normalizedKey);
    if (!parsed) {
        return { allowed: false, normalizedKey, reason: '根路径未登记' };
    }

    const rootValue = (stateLike || {})[parsed.root];
    if (rootValue === undefined) {
        return { allowed: false, normalizedKey, reason: `根路径 ${parsed.root} 不存在` };
    }

    const tokens = 解析路径片段(parsed.rest);
    if (tokens.length === 0) {
        return { allowed: true, normalizedKey };
    }

    const read = 读取路径值(rootValue, tokens);
    if (parsed.root === '世界' && tokens.length === 3 && tokens[0] === '势力列表' && tokens[2] === '主角声望') {
        const index = tokens[1];
        if (typeof index !== 'number' || !rootValue.势力列表?.[index]) return { allowed: false, normalizedKey, reason: '势力不存在' };
        if (cmd.action === 'set' && Number.isInteger(cmd.value) && Math.abs(cmd.value as number) <= 100) return { allowed: true, normalizedKey };
        if (cmd.action !== 'delete') return { allowed: false, normalizedKey, reason: '请写入 -100 至 100 的声望终值' };
    }
    if (read.exists) {
        if (cmd.action === 'push' && !Array.isArray(read.value)) {
            return { allowed: false, normalizedKey, reason: 'push 目标不是数组' };
        }
        return { allowed: true, normalizedKey };
    }

    if ((cmd.action === 'set' || cmd.action === 'add') && (在同数组对象中存在字段(rootValue, tokens) || 是允许新增社交NPC字段(parsed.root, tokens) || 是允许新增角色字段(parsed.root, tokens))) {
        return { allowed: true, normalizedKey };
    }

    return { allowed: false, normalizedKey, reason: '目标路径未登记' };
};
