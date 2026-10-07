import * as textAIService from '../../services/ai/text';
import type { GameResponse, OpeningConfig, TavernCommand, 世界书结构, 内置提示词条目结构, 提示词结构 } from '../../types';
import { 获取变量计算接口配置, 接口配置是否可用, 变量校准功能已启用, 获取展开货币系统 } from '../../utils/apiConfig';
import { 规范化游戏设置 } from '../../utils/gameSettings';
import { 获取繁体输出指令 } from '../../utils/traditionalChinese';
import { normalizeStateCommandKey } from '../../utils/stateHelpers';
import { 构建世界书注入文本 } from '../../utils/worldbook';
import { 构建运行时额外提示词 } from '../../prompts/runtime/nsfw';
import {
    构建变量相关规则提示词
} from '../../prompts/runtime/variableCalibrationReference';
import type { 响应命令处理状态 } from './responseCommandProcessor';
import { 构建同人运行时提示词包 } from '../../prompts/runtime/fandom';
import { 按功能开关过滤提示词内容, 裁剪修炼体系上下文数据 } from '../../utils/promptFeatureToggles';
import { 构建变量路径登记提示, 校验变量命令是否登记 } from '../../utils/variableRegistry';
import { 构建女性姓名候选提示词, 收集女性姓名候选已用名 } from '../../utils/femaleNameCandidatePrompt';
import { 提取命中新女性角色姓名黑名单 } from '../../utils/femaleNameSelector';
import { 提取命中模板姓名黑名单, 构建模板姓名黑名单提示词 } from '../../utils/templateNameBlacklist';
import { 检测社交删除风险命令 } from '../../utils/npcRetentionGuard';
import { 检测NPC境界回退风险命令 } from '../../utils/npcRealmRegressionGuard';
import { 获取境界配置 } from '../../utils/realmConfig';
import { 检测NPC死亡判定风险命令 } from '../../utils/npcDeathGuard';
import { 执行带完整性校验的请求 } from './streamIntegrity';

export { 检测NPC死亡判定风险命令 } from '../../utils/npcDeathGuard';

type 变量模型基态 = Pick<
    响应命令处理状态,
    '角色' | '环境' | '世界' | '社交' | '战斗' | '玩家门派' | '任务列表' | '约定列表'
>;

export type 变量模型校准参数 = {
    playerInput: string;
    parsedResponse: GameResponse;
    baseState: 变量模型基态;
    promptPool: 提示词结构[];
    worldEvolutionEnabled: boolean;
    worldEvolutionUpdated?: boolean;
    builtinPromptEntries?: 内置提示词条目结构[];
    worldbooks?: 世界书结构[];
    signal?: AbortSignal;
    extraPromptAppend?: string;
    recentRounds?: Array<{
        回合: number;
        玩家输入: string;
        正文: string;
        本回合命令: string[];
        校准说明: string[];
        校准命令: string[];
    }>;
    openingConfig?: OpeningConfig;
    isOpeningRound?: boolean;
    openingTaskContext?: {
        currentGameTime?: string;
        openingRoleSetupText?: string;
        openingPartnerSetupText?: string;
        openingConfigText?: string;
    };
    onStreamDelta?: (delta: string, accumulated: string) => void;
};

type 变量模型依赖 = {
    apiConfig: any;
    gameConfig: any;
};

export type 变量模型校准结果 = {
    commands: TavernCommand[];
    reports: string[];
    rawText: string;
    model: string;
};

const 允许根路径 = [
    'gameState.角色',
    'gameState.环境',
    'gameState.世界',
    'gameState.社交',
    'gameState.战斗',
    'gameState.玩家门派',
    'gameState.任务列表',
    'gameState.约定列表'
] as const;

const 大型数组限制映射: Record<string, number> = {
    社交: 60,
    活跃NPC列表: 40,
    进行中事件: 30,
    已结算事件: 20,
    江湖史册: 20,
    地图层级: 30,
    任务列表: 30,
    约定列表: 30
};

const 忽略字段集合 = new Set([
    '头像图片URL',
    '图片URL',
    '本地路径',
    'dataUrl',
    'base64',
    'rawJson',
    '图片档案',
    '生图历史',
    '最近生图结果'
]);

const 清理变量模型上下文 = (value: unknown, parentKey = ''): unknown => {
    if (Array.isArray(value)) {
        const limit = 大型数组限制映射[parentKey] || value.length;
        return value.slice(0, limit).map((item) => 清理变量模型上下文(item));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    Object.entries(source).forEach(([key, child]) => {
        if (忽略字段集合.has(key)) return;
        result[key] = 清理变量模型上下文(child, key);
    });
    return result;
};

const 序列化变量模型状态 = (
    state: 变量模型基态,
    options?: { survivalNeedsEnabled?: boolean; cultivationSystemEnabled?: boolean }
): string => {
    const survivalNeedsEnabled = options?.survivalNeedsEnabled !== false;
    const cultivationSystemEnabled = options?.cultivationSystemEnabled !== false;
    const role = state.角色 && typeof state.角色 === 'object'
        ? {
            ...state.角色,
            ...(survivalNeedsEnabled
                ? {}
                : {
                    当前饱腹: undefined,
                    最大饱腹: undefined,
                    当前口渴: undefined,
                    最大口渴: undefined
                })
        }
        : state.角色;
    const payload = {
        角色: role,
        环境: state.环境,
        世界: state.世界,
        社交: state.社交,
        战斗: state.战斗,
        玩家门派: state.玩家门派,
        任务列表: state.任务列表,
        约定列表: state.约定列表
    };
    const trimmedPayload = cultivationSystemEnabled
        ? payload
        : 裁剪修炼体系上下文数据(payload, { 启用修炼体系: false });
    return JSON.stringify(清理变量模型上下文(trimmedPayload), null, 2);
};

const 读取文本 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const 任务奖励占位正则 = /(?:未知|不明|未明|未定|待定|待确认|暂定|另议|看情况|视情况|暂无|无奖励|无酬劳|无结算|奖励未知|未知奖励|奖励待定|待定奖励|奖励未定|未定奖励)/u;

const 提取命令中的任务奖励占位 = (commands: TavernCommand[]): string[] => {
    const issues: string[] = [];
    const collectReward = (reward: unknown, source: string) => {
        const list = Array.isArray(reward) ? reward : (typeof reward === 'string' ? [reward] : []);
        list.forEach((item) => {
            const text = 读取文本(item);
            if (!text) return;
            const normalized = ` ${text} `;
            if (任务奖励占位正则.test(normalized)) {
                issues.push(`${source} 奖励描述存在占位词“${text}”`);
            }
        });
    };
    const collectTask = (task: any, source: string) => {
        if (!task || typeof task !== 'object') return;
        collectReward(task.奖励描述, source);
    };

    commands.forEach((cmd: any) => {
        const action = cmd?.action || 'set';
        const rawKey = typeof cmd?.key === 'string' ? cmd.key : '';
        const normalizedKey = normalizeStateCommandKey(rawKey).replace(/^gameState\./, '');
        if (!/^任务列表(?:$|\[|\.)/.test(normalizedKey)) return;
        if (/奖励描述$/.test(normalizedKey)) {
            collectReward(cmd.value, normalizedKey);
            return;
        }
        if ((action === 'set' || action === 'add') && normalizedKey === '任务列表' && Array.isArray(cmd.value)) {
            cmd.value.forEach((task: any, index: number) => collectTask(task, `任务列表[${index}]`));
            return;
        }
        if (action === 'push' || /^任务列表\[\d+\]$/.test(normalizedKey)) {
            collectTask(cmd.value, normalizedKey);
        }
    });
    return Array.from(new Set(issues));
};

const 标准化人物匹配文本 = (value: unknown): string => (
    读取文本(value).replace(/\s+/g, '').replace(/[·・\-—_【】（）()《》“”"'，,。！？!?:：；;]/g, '')
);

const 非人物对白发送者集合 = new Set([
    '旁白',
    '判定',
    '系统',
    '提示',
    'disclaimer',
    '行动选项',
    '变量规划',
    '剧情规划'
]);

const 是否疑似主角发送者 = (sender: string, roleName: string): boolean => {
    const normalized = 标准化人物匹配文本(sender);
    const normalizedRole = 标准化人物匹配文本(roleName);
    if (!normalized) return true;
    if (normalizedRole && normalized === normalizedRole) return true;
    return normalized === '我' || normalized === '你' || normalized === '主角' || normalized === '玩家';
};

const 提取本回合对白发送者 = (response: GameResponse, roleName?: string): string[] => {
    const role = 读取文本(roleName);
    const seen = new Set<string>();
    const result: string[] = [];
    (Array.isArray(response?.logs) ? response.logs : []).forEach((log: any) => {
        const sender = 读取文本(log?.sender);
        const text = 读取文本(log?.text);
        if (!sender || !text) return;
        if (非人物对白发送者集合.has(sender) || 非人物对白发送者集合.has(sender.toLowerCase())) return;
        if (/^判定/.test(sender)) return;
        if (是否疑似主角发送者(sender, role)) return;
        const key = 标准化人物匹配文本(sender);
        if (!key || seen.has(key)) return;
        seen.add(key);
        result.push(sender);
    });
    return result.slice(0, 12);
};

export const 查找社交NPC索引 = (socialRaw: unknown, sender: string): number => {
    if (!Array.isArray(socialRaw)) return -1;
    const target = 标准化人物匹配文本(sender);
    if (!target) return -1;
    const 取姓名候选 = (npc: any): string[] => [npc?.姓名, ...(Array.isArray(npc?.曾用名) ? npc.曾用名 : [])].map(标准化人物匹配文本).filter(Boolean);
    const 取身份候选 = (npc: any): string[] => [npc?.身份, npc?.简介].map(标准化人物匹配文本).filter(Boolean);
    const 是主要角色 = (npc: any): boolean => npc?.是否主要角色 === true;
    // 常规命中：原名/身份/简介任一与发送者相等或互相包含（用于非主要角色，保留原有行为）
    const 常规命中 = (candidates: string[]): boolean => candidates.some((item) => item === target || item.includes(target) || target.includes(item));
    // 主要角色（女一等）姓名只接受精确相等，避免昵称子串串到女一（如“婉儿”⊆“林婉儿”）
    const 主要角色姓名命中 = (candidates: string[]): boolean => candidates.some((item) => item === target);
    // 主要角色身份/简介匹配：接受"身份包含发送者"（含精确相等，如身份'明月圣女'含'圣女'、或身份恰为'圣女'），
    // 但严禁"发送者包含身份片段"的反向命中（如发送者'丝绸商号掌柜'含女一简介里的'丝绸商号'），否则会误判成女一。
    const 主要角色身份命中 = (candidates: string[]): boolean => candidates.some((item) => item.length > 0 && item.includes(target));
    // 第一优先：主要角色按姓名精确匹配（跨角色类型优先，避免被非主要角色的模糊包含抢先，也避免昵称/片段串到女一）
    const majorByName = socialRaw.findIndex((npc: any) => npc && typeof npc === 'object' && 是主要角色(npc) && 主要角色姓名命中(取姓名候选(npc)));
    if (majorByName >= 0) return majorByName;
    // 第二优先：非主要角色按原名/身份/简介常规双向匹配
    const nonMajor = socialRaw.findIndex((npc: any) => npc && typeof npc === 'object' && !是主要角色(npc) && 常规命中([...取姓名候选(npc), ...取身份候选(npc)]));
    if (nonMajor >= 0) return nonMajor;
    // 第三优先：主要角色按身份/简介（仅"身份包含发送者"方向，含精确相等）匹配
    return socialRaw.findIndex((npc: any) => npc && typeof npc === 'object' && 是主要角色(npc) && 主要角色身份命中(取身份候选(npc)));
};

const 对白人物基础缺口 = (npc: any, options?: { xianxiaMode?: boolean }): string[] => {
    const missing: string[] = [];
    ['姓名', '性别', '年龄', '身份', '境界', '简介', '关系状态', '出身背景'].forEach((key) => {
        if (文本疑似占位(npc?.[key])) missing.push(key);
    });
    ['是否主要角色', '是否在场'].forEach((key) => {
        if (typeof npc?.[key] !== 'boolean') missing.push(key);
    });
    if (!npc?.当前装备 || typeof npc.当前装备 !== 'object' || Array.isArray(npc.当前装备)) missing.push('当前装备');
    ['天赋列表', '背包', 'BUFF', 'DEBUFF', '技艺', '记忆'].forEach((key) => {
        if (!Array.isArray(npc?.[key])) missing.push(key);
    });
    ['力量', '敏捷', '体质', '根骨', '悟性', '福源', '境界层级', '攻击力', '防御力', '当前血量', '最大血量', '当前精力', '最大精力'].forEach((key) => {
        if (!Number.isFinite(Number(npc?.[key]))) missing.push(key);
    });
    if (NPC缺少七部位状态(npc)) missing.push('七部位血量与状态');
    if (options?.xianxiaMode === true && 缺少仙侠字段(npc)) missing.push('仙侠修真字段');
    return Array.from(new Set(missing));
};

export const 构建正文对白人物审计提示 = (
    response: GameResponse,
    baseState: 变量模型基态,
    options?: { xianxiaMode?: boolean }
): string => {
    const senders = 提取本回合对白发送者(response, (baseState as any)?.角色?.姓名);
    if (senders.length <= 0) return '';
    const lines = senders.map((sender) => {
        const index = 查找社交NPC索引(baseState.社交, sender);
        if (index < 0) {
            return `- ${sender}：本回合有独立对白框，但当前 \`社交[]\` 未找到对应完整档案；必须通过 \`push 社交 = {...}\` 新建完整 NPC 档案，包含真实姓名(2-4字)、性别、年龄、境界、身份、简介、是否主要角色、是否在场、位置、记忆、天赋列表、出身背景、当前装备、背包、BUFF、DEBUFF、技艺、战斗数值与七部位状态；当前装备未确认的槽位写“无”，背包没有明确随身物就写空数组，禁止只写“剧情对话人物/未知身份/未知境界”。`;
        }
        const npc = Array.isArray(baseState.社交) ? (baseState.社交 as any[])[index] : null;
        const gaps = 对白人物基础缺口(npc, { xianxiaMode: options?.xianxiaMode === true });
        if (gaps.length <= 0) {
            return `- ${sender}：已匹配 \`社交[${index}]\`，仍需复核本回合对白是否带来位置、记忆、关系、指令、伤势、装备或技艺变化。`;
        }
        return `- ${sender}：已匹配 \`社交[${index}]\`，但档案仍缺 ${gaps.join('、')}；本回合必须用 \`set 社交[${index}].字段 = ...\` 或必要的 \`push 社交[${index}].数组字段 = ...\` 补齐，不能继续保留半残“剧情对话人物”档案。`;
    });
    return [
        '【本回合正文对白人物审计】',
        '- 变量生成必须逐个核对本回合 `【角色名】` 对话框人物；凡是非旁白、非判定、非主角的人物，都必须在 `社交[]` 中有长期可承接档案。',
        '- 有对白框的人物一律优先视为持续承接对象；未建档就完整建档，半残档就补齐字段。正文中可用代称，但变量里必须落真实姓名，并把代称优先写入 `身份/简介/记忆`；只有确有旧称、化名、曾用称呼时才写 `曾用名`，不要给每个 NPC 强行生成曾用名。',
        '- NPC 当前装备与背包只记录正文、设定或既有变量明确成立的事实；不得凭身份、性别、门派、境界或“时间过去了”自动补佩剑、制服、内衣、袜鞋、干粮等默认物。',
        '- 若该人物已被判定为女性主要角色或长期关系对象，还要按 NPC 协议补齐外貌、身材、衣着、称呼、关系突破、私密档案和名器档案；不要等后续回合再补。',
        '',
        ...lines
    ].join('\n');
};

const 文本疑似占位 = (value: unknown): boolean => {
    const text = 读取文本(value);
    if (!text) return true;
    const normalized = text.replace(/\s+/g, '');
    if (/未知|不详|待补充|待后续|待完善|未提供|未填写|暂无/.test(normalized)) return true;
    return /^(普通|正常|略)$/.test(normalized);
};

const 私密字段缺少名器锚点 = (value: unknown): boolean => {
    const text = 读取文本(value);
    if (文本疑似占位(text)) return true;
    if (/名器|无名器|无对应名器/.test(text)) return false;
    if (/^[^：:]{2,12}[：:]/.test(text)) return false;
    return true;
};

const 名器档案不完整 = (value: unknown): boolean => {
    if (!Array.isArray(value) || value.length < 3) return true;
    const requiredParts = ['胸部', '小穴', '屁穴'];
    return requiredParts.some((part) => {
        const entry = value.find((item: any) => item?.部位 === part);
        if (!entry || typeof entry !== 'object') return true;
        if (文本疑似占位(entry?.名称)) return true;
        if (文本疑似占位(entry?.稳定描述)) return true;
        if (!entry?.效果 || typeof entry.效果 !== 'object' || 文本疑似占位(entry.效果?.说明)) return true;
        return false;
    });
};

const NPC七部位键列表 = ['头部', '胸部', '腹部', '左手', '右手', '左腿', '右腿'];

const NPC缺少七部位状态 = (npc: any): boolean => (
    NPC七部位键列表.some((part) => {
        const cur = Number(npc?.[`${part}当前血量`]);
        const max = Number(npc?.[`${part}最大血量`]);
        const status = 读取文本(npc?.[`${part}状态`]);
        return !Number.isFinite(cur) || !Number.isFinite(max) || max <= 0 || !status;
    })
);

const 仙侠字段列表 = ['灵根', '灵根资质', '当前灵力', '最大灵力', '当前神识', '最大神识', '丹田状态', '道基状态', '心魔值', '功德', '业力'];

const 缺少仙侠字段 = (target: any): boolean => (
    仙侠字段列表.some((key) => {
        const value = target?.[key];
        if (['当前灵力', '最大灵力', '当前神识', '最大神识', '心魔值', '功德', '业力'].includes(key)) {
            return !Number.isFinite(Number(value));
        }
        return 文本疑似占位(value);
    })
);

const 判断是否主要女性NPC = (npc: any): boolean => (
    读取文本(npc?.性别) === '女' && npc?.是否主要角色 === true
);

const 判断是否主要男性NPC = (npc: any, options?: { femboyNsfwEnabled?: boolean }): boolean => (
    options?.femboyNsfwEnabled === true
    && 读取文本(npc?.性别) === '男'
    && npc?.是否主要角色 === true
);

const 构建社交档案完整性审计提示 = (
    socialRaw: unknown,
    options?: { femboyNsfwEnabled?: boolean; xianxiaMode?: boolean }
): string => {
    if (!Array.isArray(socialRaw) || socialRaw.length <= 0) return '';
    const femboyNsfwEnabled = options?.femboyNsfwEnabled === true;

    const auditLines: string[] = [];
    socialRaw.forEach((npc: any, index: number) => {
        if (!npc || typeof npc !== 'object') return;
        const 名称 = 读取文本(npc?.姓名) || `社交[${index}]`;
        const 通用缺口: string[] = [];
        if (文本疑似占位(npc?.身份)) 通用缺口.push('身份');
        if (文本疑似占位(npc?.境界)) 通用缺口.push('境界');
        if (文本疑似占位(npc?.简介)) 通用缺口.push('简介');
        if (文本疑似占位(npc?.关系状态)) 通用缺口.push('关系状态');
        if (!Array.isArray(npc?.记忆) || npc.记忆.length <= 0) 通用缺口.push('记忆');
        if (NPC缺少七部位状态(npc)) 通用缺口.push('七部位血量与状态');
        if (options?.xianxiaMode === true && 缺少仙侠字段(npc)) 通用缺口.push('仙侠修真字段(灵根/灵力/神识/丹田/道基/心魔/功德/业力)');

        const 重要女性缺口: string[] = [];
        const 重要男性缺口: string[] = [];
        if (判断是否主要女性NPC(npc)) {
            if (文本疑似占位(npc?.生日)) 重要女性缺口.push('生日');
            if (文本疑似占位(npc?.对主角称呼)) 重要女性缺口.push('对主角称呼');
            if (文本疑似占位(npc?.核心性格特征)) 重要女性缺口.push('核心性格特征');
            if (文本疑似占位(npc?.好感度突破条件)) 重要女性缺口.push('好感度突破条件');
            if (文本疑似占位(npc?.关系突破条件)) 重要女性缺口.push('关系突破条件');
            if (!Array.isArray(npc?.关系网变量) || npc.关系网变量.length < 2) 重要女性缺口.push('关系网变量(至少2条)');
            if (文本疑似占位(npc?.外貌描写)) 重要女性缺口.push('外貌描写');
            if (文本疑似占位(npc?.身材描写)) 重要女性缺口.push('身材描写');
            if (文本疑似占位(npc?.衣着风格)) 重要女性缺口.push('衣着风格');
            if (私密字段缺少名器锚点(npc?.胸部描述)) 重要女性缺口.push('胸部描述(需名器名称或无名器结论)');
            if (私密字段缺少名器锚点(npc?.小穴描述)) 重要女性缺口.push('小穴描述(需名器名称或无名器结论)');
            if (私密字段缺少名器锚点(npc?.屁穴描述)) 重要女性缺口.push('屁穴描述(需名器名称或无名器结论)');
            if (名器档案不完整(npc?.名器档案)) 重要女性缺口.push('名器档案(胸部/小穴/屁穴结构化效果)');
            if (文本疑似占位(npc?.性癖)) 重要女性缺口.push('性癖');
            if (文本疑似占位(npc?.敏感点)) 重要女性缺口.push('敏感点');
            if (!npc?.子宫 || 文本疑似占位(npc?.子宫?.状态) || 文本疑似占位(npc?.子宫?.宫口状态)) {
                重要女性缺口.push('子宫档案');
            }
            if (typeof npc?.是否处女 !== 'boolean') 重要女性缺口.push('是否处女');
            if (!npc?.失贞档案 || typeof npc?.失贞档案?.是否失贞 !== 'boolean') 重要女性缺口.push('失贞档案');
            if (!Array.isArray(npc?.首次亲密记录)) 重要女性缺口.push('首次亲密记录');
        }
        if (判断是否主要男性NPC(npc, { femboyNsfwEnabled })) {
            if (文本疑似占位(npc?.生日)) 重要男性缺口.push('生日');
            if (文本疑似占位(npc?.对主角称呼)) 重要男性缺口.push('对主角称呼');
            if (文本疑似占位(npc?.核心性格特征)) 重要男性缺口.push('核心性格特征');
            if (文本疑似占位(npc?.外貌描写)) 重要男性缺口.push('外貌描写');
            if (文本疑似占位(npc?.身材描写)) 重要男性缺口.push('身材描写');
            if (文本疑似占位(npc?.衣着风格)) 重要男性缺口.push('衣着风格');
            if (文本疑似占位(npc?.男娘设定)) 重要男性缺口.push('男娘设定');
            if (文本疑似占位(npc?.扶她设定)) 重要男性缺口.push('扶她设定');
            if (文本疑似占位(npc?.肉棒描述)) 重要男性缺口.push('肉棒描述');
            if (文本疑似占位(npc?.屁穴描述)) 重要男性缺口.push('屁穴描述');
            if (文本疑似占位(npc?.性癖)) 重要男性缺口.push('性癖');
            if (文本疑似占位(npc?.敏感点)) 重要男性缺口.push('敏感点');
            if (!Array.isArray(npc?.首次亲密记录)) 重要男性缺口.push('首次亲密记录');
        }

        const allMissing = [...通用缺口, ...重要女性缺口, ...重要男性缺口];
        if (allMissing.length <= 0) return;
        if (判断是否主要女性NPC(npc)) {
            auditLines.push(`- 社交[${index}] ${名称}：命中“女性 + 主要角色”，当前需补齐/修正：${allMissing.join('、')}。`);
            return;
        }
        if (判断是否主要男性NPC(npc, { femboyNsfwEnabled })) {
            auditLines.push(`- 社交[${index}] ${名称}：命中“男性 + 主要角色”，当前需补齐/修正：${allMissing.join('、')}。`);
            return;
        }
        auditLines.push(`- 社交[${index}] ${名称}：当前档案仍有结构缺口：${allMissing.join('、')}。`);
    });

    if (auditLines.length <= 0) return '';

    const visibleLines = auditLines.slice(0, 8);
    const remainingCount = auditLines.length - visibleLines.length;
    if (remainingCount > 0) {
        visibleLines.push(`- 其余还有 ${remainingCount} 个 NPC 档案存在待补齐项，本回合同样需要顺带复核。`);
    }

    return [
        '【当前社交档案完整性审计】',
        '- 每回合变量更新都要复核现有 `社交` 档案是否存在结构缺口、占位值或关键字段遗漏，不只看本回合新登场人物。',
        '- 若本回合正文、`<变量规划>`、当前状态与既有档案真值已经足以支撑缺项，就同步补齐；不要继续保留半残对象。',
        '- 对“女性 + 主要角色”的 NPC，每回合都要检查并补齐生日、对主角称呼、身材描写、衣着风格、胸部描述、小穴描述、屁穴描述、性癖、敏感点与子宫档案；变量层的 `胸部描述 / 小穴描述 / 屁穴描述` 必须分别写成“名器名称或无名器结论：具体档案描述”，但玩家可见正文禁止直呼名器名称，只能用代称、体质特征或自然描写；不要只写泛化形容词，也不要把名器判定只放在正文或记忆里。',
        '- `小穴描述`优先使用名器录的小穴名器名称，`屁穴描述`优先使用后庭篇名器名称，`胸部描述`若无胸乳类名器条目则写“无对应名器：...”并补足常态档案。',
        '- 同步维护 `名器档案`：至少胸部/小穴/屁穴三条，名称和三处描述一致；变量层写名称，正文层不写名称。若已启用名器世界书，效果字段必须从对应“固定机制效果表”复制，AI 只负责选择名器，不自行生成品质、修正、标签或说明。',
        femboyNsfwEnabled
            ? '- 对"男性/男娘/扶她 + 主要角色"的 NPC，在 NSFW 模式与"男娘 / 扶她相关 NSFW 内容"总开关同时开启时，也要维护长期私密档案：`男娘设定 / 扶她设定 / 肉棒描述 / 屁穴描述 / 性癖 / 敏感点`。若角色被设定为男娘或扶她，对应设定要写清性别表达、身体结构、衣着取向、身份边界与对外呈现；若不是，也要写明稳定否定说明或普通男性设定，避免空字段。'
            : '',
        '- 注意 NPC 的 `对主角称呼`、`身份` 应与 `性别` 一致：男性→用"公子/大哥/师父"等男性称谓；女性→用"姑娘/姐姐/小姐"等女性称谓；男娘→偏女性称谓为主但可允许男性称谓；扶她→默认女性称谓，但着装偏男性时不否认男性称谓。',
        '',
        ...visibleLines
    ].join('\n');
};

const 构建主角私密档案审计提示 = (baseState: 变量模型基态): string => {
    const role = (baseState as any)?.角色;
    if (!role || typeof role !== 'object') return '';
    const gender = 读取文本(role?.性别);
    if (!gender || gender === '男') return '';

    const missingFields: string[] = [];
    const checkField = (key: string, label: string) => {
        if (文本疑似占位(role?.[key])) missingFields.push(label);
    };

    if (gender === '女') {
        checkField('胸部描述', '胸部描述');
        checkField('小穴描述', '小穴描述');
        checkField('屁穴描述', '屁穴描述');
    } else if (gender === '男娘') {
        checkField('肉棒描述', '肉棒描述');
        checkField('屁穴描述', '屁穴描述');
    } else if (gender === '扶她') {
        checkField('胸部描述', '胸部描述');
        checkField('小穴描述', '小穴描述');
        checkField('屁穴描述', '屁穴描述');
        checkField('肉棒描述', '肉棒描述');
    } else {
        return '';
    }
    checkField('性癖', '性癖');
    checkField('敏感点', '敏感点');

    if (missingFields.length === 0) return '';

    return [
        '【当前主角私密档案审计】',
        `- 主角性别为「${gender}」，当前以下私密档案字段仍为占位或缺失：${missingFields.join('、')}。`,
        '- 根据变量模型职责第 11.1 条，主角若是女性、男娘或扶她，必须维护完整的私密档案字段。',
        '- 描述标准与 NPC 一致：必须详细写明真实常态，不得使用"普通/正常/略/未知/待补充"等泛化占位词。',
        '- 胸部描述、小穴描述、屁穴描述需包含名器名称或"无对应名器"结论，并在名器档案中同步维护结构化效果。',
        '- 本回合请以当前正文、变量规划、角色设定和世界观为依据，在本回合的 `<命令>` 中补齐上述缺失字段。',
    ].join('\n');
};

const 构建环境天气审计提示 = (baseState: 变量模型基态): string => {
    const env = (baseState as any)?.环境;
    if (!env || typeof env !== 'object') return '';

    const weather = env?.天气;
    const currentWeather = typeof weather?.天气 === 'string' ? weather.天气.trim() : '';
    const weatherEndDate = typeof weather?.结束日期 === 'string' ? weather.结束日期.trim() : '';

    const isMissing = !currentWeather || currentWeather === '未知' || currentWeather === '无';
    const hasNoEndDate = currentWeather && currentWeather !== '未知' && currentWeather !== '无' && !weatherEndDate;

    if (!isMissing && !hasNoEndDate) return '';

    const lines: string[] = [
        '【当前环境天气审计】',
    ];
    if (isMissing) {
        lines.push(
            '- 当前 `环境.天气.天气` 为空或「未知/无」，缺少有效的天气描述。',
            '- 天气缺失会导致顶栏天象变更面板空白、场景生图缺天气标签、世界叙事失去环境锚点。',
            '- 请根据本回合正文/变量规划的地点、季节、时间、事件氛围，在本回合 `<命令>` 中补全 `环境.天气`：至少写入 `天气` 字段（如「晴」「阴」「小雨」「大雪」「雾霾」「雷暴」等具体天气），并设定合理的 `结束日期`。',
            '- 若正文没有明确天气描写，可根据地点气候带、季节和当前事件氛围合理推断一个稳定常态天气。',
        );
    } else if (hasNoEndDate) {
        lines.push(
            '- 当前天气为「' + currentWeather + '」，但 环境.天气.结束日期 为空。',
            '- 请根据天气类型、季节和剧情节奏设定合理的结束日期（例如小雨可能持续半天、暴雪可能持续数日）。',
        );
    }

    return lines.join('\n');
};

const 名器世界书触发词 = [
    '名器',
    '名器录',
    '初次判定',
    '索引表',
    '名器概率表',
    '臀部名器',
    '索引表-臀部',
    '后庭名器',
    '索引表-后庭'
].join('\n');

const 序列化命令去重键 = (cmd: TavernCommand): string => {
    let valueText = 'null';
    try {
        valueText = JSON.stringify(cmd?.value ?? null);
    } catch {
        valueText = String(cmd?.value ?? null);
    }
    return [
        cmd?.action || 'set',
        normalizeStateCommandKey(typeof cmd?.key === 'string' ? cmd.key : ''),
        valueText
    ].join('::');
};

const 规范化姓名键 = (value: unknown): string => (
    typeof value === 'string'
        ? value.trim().replace(/[\s\u3000]+/g, '')
        : ''
);

const 提取变量命令NPC姓名改写 = (commands: TavernCommand[], currentSocial: any[]): string[] => {
    if (!Array.isArray(commands) || !Array.isArray(currentSocial)) return [];
    const issues: string[] = [];
    commands.forEach((cmd: any) => {
        if ((cmd?.action || 'set') !== 'set') return;
        const normalizedKey = normalizeStateCommandKey(typeof cmd?.key === 'string' ? cmd.key : '').replace(/^gameState\./, '');
        const direct = normalizedKey.match(/^社交\[(\d+)\]\.姓名$/);
        const whole = normalizedKey.match(/^社交\[(\d+)\]$/);
        const index = direct ? Number(direct[1]) : (whole ? Number(whole[1]) : NaN);
        if (!Number.isInteger(index) || index < 0) return;
        const currentName = 规范化姓名键(currentSocial[index]?.姓名);
        const nextName = direct
            ? 规范化姓名键(cmd?.value)
            : 规范化姓名键(cmd?.value?.姓名);
        if (currentName && nextName && currentName !== nextName) {
            issues.push(`社交[${index}].姓名：${currentName} -> ${nextName}`);
        }
    });
    return issues;
};

const 包含非法伪索引 = (key: string): boolean => /(?:\[(?:-?\d+|last|tail|尾项|最后一项)\])/i.test((key || '').trim())
    && (
        /\[-\d+\]/.test((key || '').trim())
        || /\[(?:last|tail|尾项|最后一项)\]/i.test((key || '').trim())
    );

const 是否允许变量生成命令 = (cmd: TavernCommand): boolean => {
    if (typeof cmd?.key !== 'string' || 包含非法伪索引(cmd.key)) return false;
    const normalizedKey = normalizeStateCommandKey(typeof cmd?.key === 'string' ? cmd.key : '');
    if (!normalizedKey) return false;
    if (/^gameState\.世界\.(地图|建筑|地图建筑|地图道路|地图人物)(?:\.|\[|$)/u.test(normalizedKey)) return false;

    const allowed = 允许根路径.find((root) => normalizedKey === root || normalizedKey.startsWith(`${root}.`) || normalizedKey.startsWith(`${root}[`));
    if (!allowed) return false;
    return cmd.action === 'add' || cmd.action === 'set' || cmd.action === 'push' || cmd.action === 'delete' || cmd.action === 'sub';
};

export const 执行变量模型校准工作流 = async (
    params: 变量模型校准参数,
    deps: 变量模型依赖
): Promise<变量模型校准结果 | null> => {
    const runtimeGameConfig = 规范化游戏设置(deps.gameConfig);
    const 启用饱腹口渴系统 = runtimeGameConfig.启用饱腹口渴系统 !== false;
    const 启用修炼体系 = runtimeGameConfig.启用修炼体系 !== false;
    const 启用男娘NSFW内容 = runtimeGameConfig.启用NSFW模式 === true && runtimeGameConfig.启用男娘NSFW内容 !== false;
    if (!变量校准功能已启用(deps.apiConfig)) return null;

    const variableApi = 获取变量计算接口配置(deps.apiConfig);
    if (!接口配置是否可用(variableApi)) return null;

    const runtimeExtraPrompt = 按功能开关过滤提示词内容(
        构建运行时额外提示词(runtimeGameConfig.额外提示词 || '', runtimeGameConfig),
        runtimeGameConfig
    );
    const worldPrompt = (() => {
        const hit = (Array.isArray(params.promptPool) ? params.promptPool : []).find((item) => item?.id === 'core_world');
        return typeof hit?.内容 === 'string' ? hit.内容.trim() : '';
    })();
    const realmPrompt = (() => {
        if (!启用修炼体系) return '';
        const hit = (Array.isArray(params.promptPool) ? params.promptPool : []).find((item) => item?.id === 'core_realm');
        const raw = typeof hit?.内容 === 'string' ? hit.内容.trim() : '';
        return raw.includes('开局后此处会被完整替换') ? '' : raw;
    })();
    const fandomPromptBundle = 构建同人运行时提示词包({
        openingConfig: params.openingConfig,
        worldPrompt,
        realmPrompt
    });
    const socialCompletenessAuditPrompt = 构建社交档案完整性审计提示(params.baseState.社交, {
        femboyNsfwEnabled: 启用男娘NSFW内容,
        xianxiaMode: params.openingConfig?.题材模式 === '仙侠'
    });
    const dialogueNpcAuditPrompt = 构建正文对白人物审计提示(params.parsedResponse, params.baseState, {
        xianxiaMode: params.openingConfig?.题材模式 === '仙侠'
    });
    const playerXianxiaAuditPrompt = params.openingConfig?.题材模式 === '仙侠' && 缺少仙侠字段((params.baseState as any)?.角色)
        ? '【当前主角仙侠字段审计】\n- 当前存档为仙侠模式，角色档案需要补齐/修正：灵根、灵根资质、当前灵力、最大灵力、当前神识、最大神识、丹田状态、道基状态、心魔值、功德、业力。'
        : '';
    const playerPrivateArchiveAuditPrompt = 构建主角私密档案审计提示(params.baseState);
    const weatherAuditPrompt = 构建环境天气审计提示(params.baseState);
    const variableRegistryPrompt = 构建变量路径登记提示(params.baseState as any);
    const femaleNameCandidatePrompt = 构建女性姓名候选提示词({
        usedNames: 收集女性姓名候选已用名(params.baseState),
        seed: [
            params.baseState?.角色?.姓名,
            params.baseState?.环境?.时间,
            params.baseState?.环境?.大地点,
            params.baseState?.环境?.中地点,
            params.baseState?.环境?.小地点,
            params.baseState?.环境?.具体地点
        ].filter(Boolean).join('|'),
        count: 100,
        fandomEnabled: params.openingConfig?.同人融合?.enabled === true
    });
    const templateNameBlacklistPrompt = 构建模板姓名黑名单提示词();
    const mergedExtraPrompt = [
        runtimeExtraPrompt,
        playerXianxiaAuditPrompt,
        playerPrivateArchiveAuditPrompt,
        weatherAuditPrompt,
        按功能开关过滤提示词内容(构建世界书注入文本({
            books: Array.isArray(params.worldbooks) ? params.worldbooks : [],
            scopes: ['variable_calibration'],
            environment: params.baseState.环境,
            social: params.baseState.社交,
            extraTexts: [
                params.playerInput,
                runtimeGameConfig.启用NSFW模式 === true ? 名器世界书触发词 : ''
            ]
        }).combinedText, runtimeGameConfig),
        按功能开关过滤提示词内容(fandomPromptBundle.同人设定摘要, runtimeGameConfig),
        dialogueNpcAuditPrompt,
        socialCompletenessAuditPrompt,
        femaleNameCandidatePrompt,
        templateNameBlacklistPrompt,
        variableRegistryPrompt,
        获取繁体输出指令(runtimeGameConfig),
        按功能开关过滤提示词内容((params.extraPromptAppend || '').trim(), runtimeGameConfig)
    ].filter(Boolean).join('\n\n');

    const calibrationRulesContext = 构建变量相关规则提示词({
        promptPool: Array.isArray(params.promptPool) ? params.promptPool : [],
        gameConfig: runtimeGameConfig
    });
    const calibrationRulesContextWithFandom = [
        calibrationRulesContext,
        按功能开关过滤提示词内容(fandomPromptBundle.变量校准补丁, runtimeGameConfig),
        启用修炼体系 ? fandomPromptBundle.境界母板补丁 : ''
    ]
        .filter(Boolean)
        .join('\n\n');

    const 展开货币系统 = 获取展开货币系统(params.openingConfig?.modeRuntimeProfile);
    const 变量模型请求参数 = {
        stateJson: 序列化变量模型状态(params.baseState, {
            survivalNeedsEnabled: 启用饱腹口渴系统,
            cultivationSystemEnabled: 启用修炼体系
        }),
        expandedCurrencySystem: 展开货币系统,
        世界: params.baseState?.世界,
        response: params.parsedResponse,
        calibrationRulesContext: calibrationRulesContextWithFandom,
        worldEvolutionEnabled: params.worldEvolutionEnabled,
        worldEvolutionUpdated: params.worldEvolutionUpdated === true,
        builtinPromptEntries: params.builtinPromptEntries,
        survivalNeedsEnabled: 启用饱腹口渴系统,
        cultivationSystemEnabled: 启用修炼体系,
        recentRounds: params.recentRounds,
        isOpeningRound: params.isOpeningRound === true,
        openingTaskContext: params.openingTaskContext
    };
    /**
     * 变量模型的命令块截断后往往仍能解析出**部分合法子集**（`解析命令块` 有 JSON 修复与逐行降级），
     * 所以 `dedupedCommands.length === 0` 的兜底不会触发，会出现「一半变量命令被静默合并」。
     * 这里用统一的完整性保护：走流式时校验结束标记，疑似被上游掐断就降级非流式重试一次。
     */
    const 请求变量模型 = async (retryHint = '') => {
        const 附加提示词 = [mergedExtraPrompt, retryHint].filter(Boolean).join('\n\n');
        const 独立GPT模式 = runtimeGameConfig.独立APIGPT模式?.变量生成 === true;
        const 结果 = await 执行带完整性校验的请求({
            功能名: '变量生成',
            强制非流式: !params.onStreamDelta,
            // 截断的命令块仍能解析出**部分合法命令**，`dedupedCommands.length === 0` 的兜底不触发，
            // 会静默合并一半变量命令。重试也失败时必须整体丢弃，宁可本轮不校正变量。
            重试失败处置: '抛出错误',
            发起流式请求: (streamOptions) => textAIService.generateVariableCalibrationUpdate(
                变量模型请求参数,
                variableApi,
                params.signal,
                附加提示词,
                params.onStreamDelta,
                独立GPT模式,
                streamOptions.onStreamEnd
            ),
            发起非流式请求: () => textAIService.generateVariableCalibrationUpdate(
                变量模型请求参数,
                variableApi,
                params.signal,
                附加提示词,
                undefined,
                独立GPT模式
            ),
            onFallback: (info) => {
                if (info.重试失败) {
                    console.warn('[变量生成] 降级非流式重试仍失败，丢弃本次不完整结果', info);
                    return;
                }
                console.warn('[变量生成] 流式输出疑似被上游中断，降级为非流式重新生成', info);
            }
        });
        return 结果.结果;
    };

    const 校验并规整变量结果 = (result: Awaited<ReturnType<typeof 请求变量模型>>): 变量模型校准结果 | null => {
        const baseCommands = Array.isArray(params.parsedResponse?.tavern_commands)
            ? params.parsedResponse.tavern_commands
            : [];
        const existingKeys = new Set(baseCommands.map(序列化命令去重键));

        const rejectedReports: string[] = [];
        const dedupedCommands = (Array.isArray(result.commands) ? result.commands : [])
            .filter((cmd) => {
                if (!是否允许变量生成命令(cmd)) return false;
                const validation = 校验变量命令是否登记(cmd, params.baseState as any);
                if (!validation.allowed) {
                    rejectedReports.push(`已拦截未登记变量命令：${cmd.action} ${validation.normalizedKey || cmd.key}（${validation.reason || '路径未登记'}）`);
                    return false;
                }
                return true;
            })
            .filter((cmd) => {
                const dedupeKey = 序列化命令去重键(cmd);
                if (existingKeys.has(dedupeKey)) return false;
                existingKeys.add(dedupeKey);
                return true;
            });

        const blacklistHits = 提取命中新女性角色姓名黑名单({
            commands: dedupedCommands,
            currentSocial: params.baseState.社交,
            includeLogSenders: false
        });
        if (blacklistHits.length > 0) {
            const message = `变量生成命中女性模板姓名黑名单：${blacklistHits.join('、')}。请重新生成变量命令，并确保正文 sender、人物称呼与社交姓名使用同一个非模板原创姓名。`;
            const error = new Error(message);
            (error as any).parseDetail = message;
            throw error;
        }

        const templateNameHits = 提取命中模板姓名黑名单({
            commands: dedupedCommands,
            currentSocial: params.baseState.社交
        });
        if (templateNameHits.length > 0) {
            const message = `变量生成命中男性/中性模板姓名黑名单：${templateNameHits.join('、')}。这些是被反复使用的模板名，请重新生成变量命令，为本局队友、伙伴、关键 NPC 起不同的原创姓名。`;
            const error = new Error(message);
            (error as any).parseDetail = message;
            throw error;
        }

        const playerName = typeof params.baseState?.角色?.姓名 === 'string' ? params.baseState.角色.姓名.trim() : '';
        if (playerName) {
            const normalizeKey = (v: unknown): string => typeof v === 'string' ? v.trim().replace(/\s+/g, '').toLowerCase() : '';
            const playerKey = normalizeKey(playerName);
            const protagonistAsNpc = dedupedCommands.filter((cmd: any) => {
                const action = cmd?.action || 'set';
                const rawKey = typeof cmd?.key === 'string' ? cmd.key : '';
                const normalizedKey = normalizeStateCommandKey(rawKey).replace(/^gameState\./, '');
                // push 社交 = {...}：新增 NPC
                if (action === 'push' && (normalizedKey === '社交' || /^社交\[/.test(normalizedKey))) {
                    const npcName = typeof cmd.value?.姓名 === 'string' ? cmd.value.姓名.trim() : '';
                    return npcName && normalizeKey(npcName) === playerKey;
                }
                // set 社交[i].姓名 = "主角名"：把既有 NPC 改名成主角
                if (action === 'set' && /^社交\[\d+\]\.姓名$/.test(normalizedKey)) {
                    const nextName = typeof cmd.value === 'string' ? cmd.value.trim() : '';
                    return nextName && normalizeKey(nextName) === playerKey;
                }
                return false;
            });
            if (protagonistAsNpc.length > 0) {
                const message = `变量生成试图将主角「${playerName}」作为 NPC 加入社交列表，这是禁止的。社交列表只存储 NPC 和配角，不包含主角。请重新生成变量命令，移除所有与主角同名的社交条目。`;
                const error = new Error(message);
                (error as any).parseDetail = message;
                throw error;
            }
        }

        const renameIssues = 提取变量命令NPC姓名改写(dedupedCommands, params.baseState.社交);
        if (renameIssues.length > 0) {
            const message = `变量生成试图改写已生成 NPC 姓名：${renameIssues.join('；')}。前端不会修改既有变量，请重新生成变量命令并保留已有 NPC 姓名。`;
            const error = new Error(message);
            (error as any).parseDetail = message;
            throw error;
        }

        const deletionIssues = 检测社交删除风险命令(dedupedCommands, params.baseState.社交);
        if (deletionIssues.length > 0) {
            const message = `变量生成试图删除或替换既有 NPC：${deletionIssues.join('；')}。未经玩家手动确认，变量生成只能更新 NPC 字段，不能删除角色或整组覆盖社交列表。`;
            const error = new Error(message);
            (error as any).parseDetail = message;
            throw error;
        }

        const realmRegressionIssues = 检测NPC境界回退风险命令(
            dedupedCommands,
            params.baseState.社交,
            params.parsedResponse,
            获取境界配置(params.openingConfig?.题材模式, params.openingConfig?.modeRuntimeProfile)
        );
        if (realmRegressionIssues.length > 0) {
            const message = `变量生成试图无依据降低既有 NPC 境界：${realmRegressionIssues.join('；')}。NPC 的境界文案与境界层级是持久真值；只有正文明确发生永久跌境、修为被废或证实旧档案有误时才能同步降低。请重新生成变量命令。`;
            const error = new Error(message);
            (error as any).parseDetail = message;
            throw error;
        }

        const rewardPlaceholderIssues = 提取命令中的任务奖励占位(dedupedCommands);
        if (rewardPlaceholderIssues.length > 0) {
            const message = `变量生成写入了不可结算的任务奖励：${rewardPlaceholderIssues.join('；')}。请重新生成任务变量命令：奖励描述必须明确到可显示、可结算的奖励，例如“奖励点 +100”“D级支线剧情 +1”“可分配属性点 +1”“急救包 x1”，不能写未知、待定、看情况或无奖励。`;
            const error = new Error(message);
            (error as any).parseDetail = message;
            throw error;
        }

        const deathIssues = 检测NPC死亡判定风险命令(dedupedCommands, params.baseState.社交, params.parsedResponse);
        if (deathIssues.length > 0) {
            const message = `变量生成试图把 NPC 判定为死亡/已故，但证据不足：${deathIssues.join('；')}。死亡判定必须同时写入：当前血量归零、死亡状态、死亡时间、死亡描述；否则只能写重伤、濒死、失踪或状态未知。请重新生成变量命令。`;
            const error = new Error(message);
            (error as any).parseDetail = message;
            throw error;
        }

        const normalizedReports = [
            ...(Array.isArray(result.reports) ? result.reports : []),
            ...rejectedReports
        ]
            .map((item) => (item || '').trim())
            .filter(Boolean);

        if (dedupedCommands.length === 0 && normalizedReports.length === 0) {
            return null;
        }

        return {
            commands: dedupedCommands,
            reports: normalizedReports,
            rawText: typeof result.rawText === 'string' ? result.rawText : '',
            model: variableApi.model
        };
    };

    const 构建变量重试提示 = (error: any, rawText?: string): string => [
        '【自动重试：变量生成结果未通过前端校验】',
        `失败原因：${error?.parseDetail || error?.message || String(error || '未知错误')}`,
        '请基于同一正文和同一当前变量状态重新生成一版完整变量结果。',
        '不要解释错误；不要输出补丁说明；直接重新输出 <thinking>、<说明>、<命令> 三个顶层标签。',
        '必须避开失败原因中指出的问题；若涉及已有 NPC，只允许更新字段，不得删除、替换、改名或整组覆盖社交列表。',
        rawText ? `【上一版未通过校验的变量模型原始输出】\n${rawText}` : ''
    ].filter(Boolean).join('\n\n');

    let firstResult = await 请求变量模型();
    try {
        return 校验并规整变量结果(firstResult);
    } catch (error: any) {
        if (params.signal?.aborted || error?.name === 'AbortError') throw error;
        const retryResult = await 请求变量模型(构建变量重试提示(error, firstResult.rawText));
        return 校验并规整变量结果(retryResult);
    }
};
