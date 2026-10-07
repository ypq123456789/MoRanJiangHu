import type {
    接口设置结构,
    聊天记录结构,
    场外对话消息结构,
    记忆配置结构,
    提示词结构
} from '../../types';
import { 获取角色对话接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 默认角色对话提示词, 默认场外对话注入指令 } from '../../prompts/runtime/defaults';
import { generateRoleChatReply, 清理角色对话输出 } from '../../services/ai/text';
import { 规范化环境信息 } from './stateTransforms';
import { 环境时间转标准串 } from './timeUtils';
import { 判断角色对话位置 } from '../../utils/roleChatLocation';
import { 执行带完整性校验的请求 } from './streamIntegrity';

// 「角色对话」侧聊工作流。
// 设计原则：注入的是“这一名角色的认知范围”，不是主剧情 AI 的全知视角——
// 别的 NPC 的记忆、离场角色现状、中长期世界记忆、未来剧情规划一律不进扮演上下文。

const 首次响应超时毫秒 = 45 * 1000;
const 流式空闲超时毫秒 = 90 * 1000;
const 亲历回顾扫描回合上限 = 12; // 最多往前扫多少回合找该 NPC 的出场
const 亲历回顾保留回合上限 = 6; // 命中再多也只保留最近 N 个出场回合
const 暂存消息回放上限 = 60;
const 常识块字符上限 = 8000;

export type 角色对话依赖 = {
    apiConfig: 接口设置结构;
    社交: any[];
    环境: any;
    角色: any;
    历史记录: 聊天记录结构[];
    memoryConfig?: Partial<记忆配置结构> | null;
    prompts?: 提示词结构[];
};

export type 角色对话参数 = {
    npcId?: string;
    npcName?: string;
    玩家输入: string;
    暂存对话?: 场外对话消息结构[];
    已确认位置?: boolean;
    signal?: AbortSignal;
    onDelta?: (delta: string, accumulated: string) => void;
};

export type 角色对话结果 = {
    reply: string;
    npcName: string;
    新增消息: 场外对话消息结构[];
};

const 取文本 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const 取数值 = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : NaN);

type 通用消息结构 = { role: 'system' | 'user' | 'assistant'; content: string };

export const 规范化场外对话列表 = (raw: unknown): 场外对话消息结构[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item: any): 场外对话消息结构 | null => {
            const 内容 = 取文本(item?.内容);
            if (!内容) return null;
            const role = item?.role === 'npc' ? 'npc' : 'player';
            const npcId = 取文本(item?.npcId);
            const 会话类型 = item?.会话类型 === 'group' ? 'group' : item?.会话类型 === 'single' ? 'single' : undefined;
            const 群聊ID = 取文本(item?.群聊ID);
            const 听众NPCIds = Array.isArray(item?.听众NPCIds) ? item.听众NPCIds.map(取文本).filter(Boolean) : [];
            const 听众 = Array.isArray(item?.听众) ? item.听众.map(取文本).filter(Boolean) : [];
            const 完成状态 = item?.完成状态 === 'partial' ? 'partial' : item?.完成状态 === 'complete' ? 'complete' : undefined;
            return {
                ...(npcId ? { npcId } : {}),
                ...(会话类型 ? { 会话类型 } : {}),
                ...(群聊ID ? { 群聊ID } : {}),
                ...(听众NPCIds.length > 0 ? { 听众NPCIds: Array.from(new Set(听众NPCIds)) } : {}),
                ...(听众.length > 0 ? { 听众: Array.from(new Set(听众)) } : {}),
                ...(完成状态 ? { 完成状态 } : {}),
                role,
                发言人: 取文本(item?.发言人) || (role === 'npc' ? 'NPC' : '玩家'),
                内容,
                时间: Number.isFinite(Number(item?.时间)) ? Number(item.时间) : 0
            };
        })
        .filter((item): item is 场外对话消息结构 => item !== null)
        .slice(-200);
};

// 目标 NPC 的稳定标识：优先 id，缺 id 时退回姓名（与 解析目标NPC 的查找口径一致）。
const 取目标NPC标识 = (npc: any): string => 取文本(npc?.id) || 取文本(npc?.姓名);

// —— 主回合注入块：把暂存的场外对话原文 + 处理指令打包给主剧情 AI ——
export const 构建场外对话记录块 = (
    场外对话: 场外对话消息结构[] | undefined | null,
    options?: { 注入指令?: string }
): string => {
    const list = 规范化场外对话列表(场外对话);
    if (list.length === 0) return '';
    const lines = list.map((item) => {
        const audience = item.会话类型 === 'group' && Array.isArray(item.听众) && item.听众.length > 0
            ? `｜在场听众：${item.听众.join('、')}`
            : '';
        const partial = item.完成状态 === 'partial' ? '｜未说完' : '';
        return `【${item.发言人}${audience}${partial}】${item.内容}`;
    });
    return [options?.注入指令?.trim() || 默认场外对话注入指令, ...lines].join('\n');
};

const 序列化NPC记忆 = (npc: any): string[] => {
    const lines: string[] = [];
    const 记忆列表 = Array.isArray(npc?.记忆) ? npc.记忆 : [];
    for (const item of 记忆列表) {
        const 内容 = 取文本(item?.内容);
        if (!内容) continue;
        const 时间 = 取文本(item?.时间);
        lines.push(`- ${时间 ? `[${时间}] ` : ''}${内容}`);
    }
    const 总结列表 = Array.isArray(npc?.总结记忆) ? npc.总结记忆 : [];
    for (const item of 总结列表) {
        const 内容 = 取文本(item?.内容);
        if (!内容) continue;
        const 时间 = 取文本(item?.时间);
        lines.push(`- [总结] ${时间 ? `[${时间}] ` : ''}${内容}`);
    }
    return lines;
};

// —— 本人档案：全量（含全部记忆）——“他很久以前说过喜欢某样东西”就靠这里命中 ——
export const 序列化NPC档案 = (npc: any): string => {
    const 档案字段: Array<[string, unknown]> = [
        ['姓名', npc?.姓名],
        ['性别', npc?.性别],
        ['年龄', npc?.年龄],
        ['境界', npc?.境界],
        ['境界层级', npc?.境界层级],
        ['身份', npc?.身份],
        ['是否主要角色', npc?.是否主要角色 === true ? '是' : npc?.是否主要角色 === false ? '否' : undefined],
        ['简介', npc?.简介],
        ['核心性格', npc?.核心性格特征],
        ['外貌', npc?.外貌描写],
        ['身材', npc?.身材描写],
        ['衣着', npc?.衣着风格],
        ['与主角关系', npc?.关系状态],
        ['对主角称呼', npc?.对主角称呼],
        ['好感度', Number.isFinite(取数值(npc?.好感度)) ? 取数值(npc?.好感度) : undefined]
    ];
    const lines = 档案字段
        .filter(([, value]) => value !== undefined && value !== null && String(value).trim().length > 0)
        .map(([key, value]) => `${key}：${String(value).trim()}`);
    const 记忆行 = 序列化NPC记忆(npc);
    if (记忆行.length > 0) {
        lines.push('他的记忆（他亲身经历并被记下的事，全量）：', ...记忆行);
    }
    return lines.join('\n');
};

// —— 当前情境：只给能感知到的（时间/地点/天气/节日/环境异象），不给坐标与游玩天数 ——
export const 序列化当前情境 = (环境: any): string => {
    const env = 规范化环境信息(环境 || {});
    const 地点 = [env?.大地点, env?.中地点, env?.小地点, env?.具体地点]
        .map((item) => 取文本(item))
        .filter(Boolean)
        .join(' · ');
    const lines: string[] = [];
    const 时间 = 环境时间转标准串(env);
    if (时间) lines.push(`时间：${时间}`);
    if (地点) lines.push(`地点：${地点}`);
    const 天气 = 取文本((env as any)?.天气?.天气);
    if (天气) lines.push(`天气：${天气}`);
    const 节日 = (env as any)?.节日;
    const 节日名 = 取文本(节日?.名称);
    if (节日名) {
        const 节日描述 = [取文本(节日?.简介), 取文本(节日?.效果)].filter(Boolean).join('；');
        lines.push(`节日：${节日名}${节日描述 ? `（${节日描述}）` : ''}`);
    }
    const 环境变量列表 = Array.isArray((env as any)?.环境变量) ? (env as any).环境变量 : [];
    for (const item of 环境变量列表) {
        const 名称 = 取文本(item?.名称);
        if (!名称) continue;
        const 描述 = [取文本(item?.描述), 取文本(item?.效果)].filter(Boolean).join('；');
        lines.push(`环境异象：${名称}${描述 ? `（${描述}）` : ''}`);
    }
    return lines.join('\n');
};

const 取NPC可见外貌 = (npc: any): string => [
    取文本(npc?.外貌描写),
    取文本(npc?.衣着风格)
].filter(Boolean).join('；');

// —— 眼前的人：公开面。不含他人记忆、他人好感、主角面板数值 ——
export const 序列化眼前的人 = (社交: any[], 主角: any, 排除NPC?: any, 玩家门派?: any): string => {
    const lines: string[] = [];
    const playerName = 取文本(主角?.姓名) || '玩家';
    const playerLines = [
        `姓名：${playerName}`,
        取文本(主角?.性别) && `性别：${取文本(主角?.性别)}`,
        Number.isFinite(取数值(主角?.年龄)) && `年龄：${取数值(主角?.年龄)}`,
        取文本(主角?.外貌) && `外貌：${取文本(主角?.外貌)}`,
        取文本(主角?.称号) && `称号：${取文本(主角?.称号)}`,
        取文本(主角?.境界) && `境界：${取文本(主角?.境界)}`,
        取文本((主角?.门派信息 as any)?.名称 || 玩家门派?.名称) && `门派：${取文本((主角?.门派信息 as any)?.名称 || 玩家门派?.名称)}`
    ].filter(Boolean) as string[];
    // 可见伤情：只报异常部位状态（别人一眼能看出来的），不给血量数值
    const 部位状态 = Array.isArray((主角 as any)?.部位血量状态) ? (主角 as any).部位血量状态 : [];
    const 异常部位 = 部位状态
        .map((item: any) => ({ 部位: 取文本(item?.部位 || item?.名称), 状态: 取文本(item?.状态) }))
        .filter((item: { 部位: string; 状态: string }) => item.部位 && item.状态 && !/正常|健康|无恙/.test(item.状态))
        .map((item: { 部位: string; 状态: string }) => `${item.部位}（${item.状态}）`);
    if (异常部位.length > 0) playerLines.push(`可见伤情：${异常部位.join('、')}`);
    lines.push(`主角（玩家）：`, ...playerLines.map((line) => `  ${line}`));

    const 其他在场 = (Array.isArray(社交) ? 社交 : [])
        .filter((npc) => npc?.是否在场 === true)
        .filter((npc) => !排除NPC || npc !== 排除NPC)
        .slice(0, 12);
    if (其他在场.length > 0) {
        lines.push('其他在场的人（只写一眼可见的公开信息）：');
        for (const npc of 其他在场) {
            const 名称 = 取文本(npc?.姓名) || '未知人物';
            const 描述 = [
                取文本(npc?.性别) && `${取文本(npc?.性别)}`,
                取文本(npc?.身份) && `身份：${取文本(npc?.身份)}`,
                取NPC可见外貌(npc) && `外貌：${取NPC可见外貌(npc)}`
            ].filter(Boolean).join('，');
            lines.push(`  ${名称}${描述 ? `：${描述}` : ''}`);
        }
    }
    return lines.join('\n');
};

type 回合片段 = { 时间?: string; 玩家输入?: string; 正文行: string[] };

const 提取回合片段列表 = (历史记录: 聊天记录结构[]): 回合片段[] => {
    const rounds: 回合片段[] = [];
    let current: 回合片段 | null = null;
    for (const item of 历史记录 || []) {
        if (item?.role === 'user') {
            if (current) rounds.push(current);
            current = { 玩家输入: typeof item.content === 'string' ? item.content : '', 正文行: [] };
            if (item.gameTime) current.时间 = item.gameTime;
        } else if (item?.role === 'assistant' && current) {
            const response = (item as any).structuredResponse;
            const logs = Array.isArray(response?.body_original_logs) && response.body_original_logs.length > 0
                ? response.body_original_logs
                : (Array.isArray(response?.logs) ? response.logs : []);
            for (const log of logs) {
                const sender = 取文本(log?.sender);
                const text = typeof log?.text === 'string' ? log.text.trim() : '';
                if (!text) continue;
                current.正文行.push(sender ? ( /^【[^】]+】$/.test(sender) ? `${sender}${text}` : `${sender}：${text}` ) : text);
            }
        }
    }
    if (current) rounds.push(current);
    return rounds;
};

const 回合命中NPC = (round: 回合片段, npcName: string): boolean => {
    // 玩家只是在输入里提到姓名，并不能证明该 NPC 当时在场。
    return round.正文行.some((line) => line.includes(npcName));
};

const 格式化回合片段 = (round: 回合片段): string => {
    const sections: string[] = [];
    if (round.时间 && (round.玩家输入 || round.正文行.length > 0)) sections.push(`【${round.时间}】`);
    if (round.玩家输入) sections.push(`玩家：${round.玩家输入}`);
    if (round.正文行.length > 0) sections.push(round.正文行.join('\n'));
    return sections.join('\n').trim();
};

// —— 亲历回顾：只带“该 NPC 当时在场/被提及”的回合；不带主回合的剧情规划（未来剧本） ——
export const 提取亲历回顾 = (
    历史记录: 聊天记录结构[],
    npcName: string,
    options?: { 扫描窗口回合数?: number; memoryConfig?: Partial<记忆配置结构> | null }
): string => {
    const name = 取文本(npcName);
    if (!name) return '';
    const rounds = 提取回合片段列表(历史记录 || []);
    if (rounds.length === 0) return '';
    const 上传条数 = Math.max(1, Number(options?.memoryConfig?.即时消息上传条数N) || 10);
    const 窗口 = Math.min(rounds.length, Math.max(1, options?.扫描窗口回合数 ?? (上传条数 - 1)));
    const 扫描范围 = rounds.slice(-Math.max(窗口, 亲历回顾扫描回合上限));
    const 命中 = 扫描范围
        .map((round) => round)
        .filter((round) => 回合命中NPC(round, name))
        .slice(-亲历回顾保留回合上限);
    if (命中.length > 0) {
        const text = 命中.map(格式化回合片段).filter(Boolean).join('\n\n');
        if (!text) return '';
        return `${text}\n\n（以上是你亲身在场的最近经过；未出现在其中的事，除非在你的记忆里，你并不知情。）`;
    }
    // 一个都没命中：说明该 NPC 近年并未出现在正文里，不能假定他见过最近回合。
    // 直接把最近回合的主回合原文（玩家输入 + 全部正文）喂给他，会把主角私下的行动、
    // 镜头外的事件当成他的已知信息，违背本模块的认知边界承诺。此处返回空。
    return '';
};

const 读取核心提示词内容 = (prompts: 提示词结构[] | undefined, id: string): string => {
    const found = (Array.isArray(prompts) ? prompts : []).find((item) => item?.id === id);
    return typeof found?.内容 === 'string' ? found.内容.trim() : '';
};

const 截断 = (text: string, limit: number): string => (
    text.length <= limit ? text : `${text.slice(0, limit)}\n…（已截断）`
);

// —— 江湖常识：人人皆知的静态设定（世界观/境界体系），不是事件记忆 ——
export const 序列化江湖常识 = (prompts?: 提示词结构[]): string => {
    const lines: string[] = [];
    const worldPrompt = 读取核心提示词内容(prompts, 'core_world');
    if (worldPrompt) lines.push('【世界观】', 截断(worldPrompt, 常识块字符上限));
    const realmPrompt = 读取核心提示词内容(prompts, 'core_realm');
    if (realmPrompt) lines.push('【境界体系】', 截断(realmPrompt, 常识块字符上限));
    return lines.join('\n');
};

export const 解析目标NPC = (社交: any[], params: { npcId?: string; npcName?: string }): any | null => {
    const list = Array.isArray(社交) ? 社交 : [];
    const id = 取文本(params.npcId);
    if (id) {
        const byId = list.find((npc) => 取文本(npc?.id) === id);
        if (byId) return byId;
    }
    const name = 取文本(params.npcName);
    if (name) {
        const byName = list.find((npc) => 取文本(npc?.姓名) === name);
        if (byName) return byName;
    }
    return null;
};

export const 构建角色对话消息序列 = (deps: 角色对话依赖, params: 角色对话参数): 通用消息结构[] => {
    const npc = 解析目标NPC(deps.社交, params);
    if (!npc) throw new Error('未找到目标 NPC');
    const npcName = 取文本(npc.姓名) || '目标NPC';
    const npcId = 取目标NPC标识(npc);
    const playerName = 取文本(deps.角色?.姓名) || '玩家';
    const systemPrompt = (() => {
        const custom = 取文本((deps.apiConfig as any)?.功能模型占位?.角色对话提示词);
        return custom || 默认角色对话提示词;
    })();

    const knowledgeBlocks: string[] = [];
    const 档案块 = 序列化NPC档案(npc);
    knowledgeBlocks.push(`## 你要扮演的角色\n${档案块}`);
    const 情境块 = 序列化当前情境(deps.环境);
    if (情境块) knowledgeBlocks.push(`## 当前情境\n${情境块}`);
    const 近处可见角色 = (Array.isArray(deps.社交) ? deps.社交 : []).filter(item => {
        if (item === npc) return true;
        return 判断角色对话位置(item, deps.环境).状态 === 'nearby';
    });
    knowledgeBlocks.push(`## 眼前的人\n${序列化眼前的人(近处可见角色, deps.角色, npc)}`);
    const 回顾块 = 提取亲历回顾(deps.历史记录, npcName, { memoryConfig: deps.memoryConfig });
    if (回顾块) knowledgeBlocks.push(`## 你亲历的近期经过\n${回顾块}`);
    const 常识块 = 序列化江湖常识(deps.prompts);
    if (常识块) knowledgeBlocks.push(`## 江湖常识\n${常识块}`);

    const messages: 通用消息结构[] = [
        { role: 'system', content: systemPrompt },
        ...knowledgeBlocks.map((block) => ({ role: 'system' as const, content: block }))
    ];

    // 只回放「与当前这名 NPC」的对话：换人后另一人的私聊内容不得进入他的上下文。
    // 没有 npcId 的旧记录无法安全判定归属，一律不回放。
    const 暂存 = 规范化场外对话列表(params.暂存对话)
        .filter((item) => item.会话类型 !== 'group' && Boolean(取文本(item.npcId)) && 取文本(item.npcId) === npcId)
        .slice(-暂存消息回放上限);
    for (const item of 暂存) {
        messages.push({
            role: item.role === 'npc' ? 'assistant' : 'user',
            content: item.内容
        });
    }
    messages.push({ role: 'user', content: 取文本(params.玩家输入) });
    return messages;
};

const 创建超时错误 = (message: string): Error => {
    const error = new Error(message);
    error.name = 'TimeoutError';
    return error;
};

// 超时包装：流式断流时若已有部分回复则采用部分文本，避免面板卡死。
// 注意：settle 必须真正结算外层 Promise（resolve/reject），否则超时/取消后外层仍要等
// task 自己因 abort 抛错，部分回复会被丢掉、甚至一直挂着。
export const 执行角色对话请求带超时 = (
    task: (signal: AbortSignal, onDelta: (delta: string, accumulated: string) => void) => Promise<string>,
    parentSignal?: AbortSignal,
    options?: { 中断时保留部分?: boolean }
): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | null = null;
        let accumulated = '';
        let receivedResponse = false;
        let settled = false;

        const clearTimer = () => {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
        };
        const finish = (mode: 'resolve' | 'reject', value: unknown) => {
            if (settled) return;
            settled = true;
            clearTimer();
            parentSignal?.removeEventListener('abort', handleParentAbort);
            if (mode === 'resolve') resolve(value as string);
            else reject(value);
        };
        const handleParentAbort = () => {
            const reason = parentSignal?.reason ?? new DOMException('请求已取消', 'AbortError');
            if (options?.中断时保留部分 === true && accumulated.trim().length > 0) finish('resolve', accumulated);
            else finish('reject', reason);
            controller.abort(reason);
        };
        const handleTimeout = () => {
            if (accumulated.trim().length > 0) {
                finish('resolve', accumulated);
            } else {
                finish('reject', 创建超时错误(receivedResponse ? '角色对话流式输出空闲超时' : '角色对话等待首次响应超时'));
            }
            controller.abort(new DOMException('角色对话请求超时', 'AbortError'));
        };
        const resetTimer = (timeoutMs: number) => {
            clearTimer();
            timer = setTimeout(handleTimeout, timeoutMs);
        };

        if (parentSignal) {
            if (parentSignal.aborted) {
                finish('reject', parentSignal.reason ?? new DOMException('请求已取消', 'AbortError'));
                return;
            }
            parentSignal.addEventListener('abort', handleParentAbort, { once: true });
        }
        resetTimer(首次响应超时毫秒);

        task(controller.signal, (_delta, currentAccumulated) => {
            if (settled) return;
            receivedResponse = true;
            accumulated = currentAccumulated;
            resetTimer(流式空闲超时毫秒);
        }).then(
            (result) => finish('resolve', result),
            (error) => finish('reject', error)
        );
    });
};

export const 执行角色对话 = async (deps: 角色对话依赖, params: 角色对话参数): Promise<角色对话结果> => {
    const npc = 解析目标NPC(deps.社交, params);
    if (!npc) throw new Error('未找到目标 NPC，请先选择一名在场角色。');
    const npcName = 取文本(npc.姓名) || '目标NPC';
    const npcId = 取目标NPC标识(npc);
    const 玩家输入 = 取文本(params.玩家输入);
    if (!玩家输入) throw new Error('输入内容为空。');
    const locationCheck = 判断角色对话位置(npc, deps.环境);
    if (!locationCheck.可选) throw new Error(locationCheck.原因);
    if (locationCheck.需要确认 && params.已确认位置 !== true) {
        throw new Error(`请先确认${npcName}就在附近并能听见你。`);
    }

    const roleChatApi = 获取角色对话接口配置(deps.apiConfig);
    if (!接口配置是否可用(roleChatApi)) {
        throw new Error('角色对话独立模型未配置：请到 设置 → 角色对话 开启独立模型并选择模型。');
    }

    const messages = 构建角色对话消息序列(deps, params);
    /**
     * 空闲超时只能挡住「长时间没有新数据」，挡不住「快速断流」——
     * 中转站在收到一部分 token 后直接关掉连接时，超时计时器根本不会触发，
     * 半句台词会被当成完整回复返回（2026-10-07 记忆总结截断的同一根因）。
     * 这里在超时包装之内再叠一层结束标记校验，疑似被掐断就降级非流式重试一次。
     */
    const reply = await 执行角色对话请求带超时(
        async (signal, onDelta) => {
            const 完整性结果 = await 执行带完整性校验的请求({
                功能名: '角色对话',
                发起流式请求: (streamOptions) => generateRoleChatReply(messages, roleChatApi as any, {
                    signal,
                    streamOptions: {
                        stream: true,
                        onDelta: (delta, accumulated) => {
                            onDelta(delta, accumulated);
                            params.onDelta?.(delta, accumulated);
                        },
                        onStreamEnd: streamOptions.onStreamEnd
                    }
                }),
                发起非流式请求: () => generateRoleChatReply(messages, roleChatApi as any, { signal }),
                onFallback: (info) => {
                    console.warn('[角色对话] 流式输出疑似被上游中断，降级为非流式重新生成', info);
                }
            });
            return 完整性结果.结果;
        },
        params.signal,
        { 中断时保留部分: true }
    );
    const 最终回复 = 清理角色对话输出(reply).trim();
    if (!最终回复) throw new Error('角色对话返回了空回复。');

    return {
        reply: 最终回复,
        npcName,
        新增消息: [
            { ...(npcId ? { npcId } : {}), 会话类型: 'single', role: 'player', 发言人: 取文本(deps.角色?.姓名) || '玩家', 内容: 玩家输入, 时间: Date.now() },
            { ...(npcId ? { npcId } : {}), 会话类型: 'single', role: 'npc', 发言人: npcName, 内容: 最终回复, 时间: Date.now() }
        ]
    };
};
