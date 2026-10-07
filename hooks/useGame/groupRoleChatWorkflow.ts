import type { 场外对话消息结构 } from '../../types';
import { 获取角色对话接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 判断角色对话位置 } from '../../utils/roleChatLocation';
import { generateRoleChatRawReply, 清理角色对话输出 } from '../../services/ai/text';
import { 默认角色对话提示词 } from '../../prompts/runtime/defaults';
import {
    执行角色对话请求带超时,
    序列化NPC档案,
    序列化当前情境,
    序列化眼前的人,
    序列化江湖常识,
    规范化场外对话列表,
    解析目标NPC,
    type 角色对话依赖
} from './roleChatWorkflow';
import { 执行带完整性校验的请求 } from './streamIntegrity';

type 通用消息结构 = { role: 'system' | 'user' | 'assistant'; content: string };

export type 群聊调度动作 = 'continue' | 'wait' | 'stop';

export type 群聊模型输出 = {
    正文: string;
    动作: 群聊调度动作;
    下一位NPCId?: string;
    调度有效: boolean;
    完整: boolean;
};

export type 角色群聊参数 = {
    参与者NPCIds: string[];
    玩家输入: string;
    继续群聊?: boolean;
    首位NPCId?: string;
    群聊ID?: string;
    自动回复上限?: number;
    暂存对话?: 场外对话消息结构[];
    已确认全部位置?: boolean;
    signal?: AbortSignal;
    onTurnDelta?: (payload: { npcId: string; npcName: string; text: string }) => void;
    onTurnComplete?: (payload: { message: 场外对话消息结构; turnIndex: number }) => void;
    shouldStopAfterTurn?: () => boolean;
};

export type 角色群聊结果 = {
    groupId: string;
    新增消息: 场外对话消息结构[];
    发言次数: number;
    结束原因: 'model_wait' | 'model_stop' | 'limit' | 'invalid_scheduler' | 'stopped' | 'request_error';
};

const 取文本 = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const 取NPCId = (npc: any): string => 取文本(npc?.id) || 取文本(npc?.姓名);

const 去思考块 = (text: string): string => String(text || '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '');

export const 提取群聊流式正文 = (raw: string): string => {
    const cleaned = 去思考块(raw);
    const openIndex = cleaned.toLowerCase().lastIndexOf('<正文>');
    let body = openIndex >= 0 ? cleaned.slice(openIndex + '<正文>'.length) : cleaned;
    const closeIndex = body.toLowerCase().indexOf('</正文>');
    if (closeIndex >= 0) body = body.slice(0, closeIndex);
    const schedulerIndex = body.toLowerCase().indexOf('<调度>');
    if (schedulerIndex >= 0) body = body.slice(0, schedulerIndex);
    return body.trim();
};

export const 解析群聊模型输出 = (raw: string): 群聊模型输出 => {
    const text = 去思考块(raw);
    const bodyMatch = Array.from(text.matchAll(/<正文>([\s\S]*?)<\/正文>/gi)).at(-1);
    const 正文 = (bodyMatch?.[1] || 清理角色对话输出(text.replace(/<调度>[\s\S]*$/i, ''))).trim();
    const schedulerMatch = Array.from(text.matchAll(/<调度>([\s\S]*?)<\/调度>/gi)).at(-1);
    if (!schedulerMatch) {
        return { 正文, 动作: 'wait', 调度有效: false, 完整: Boolean(bodyMatch) };
    }
    try {
        const value = JSON.parse(schedulerMatch[1].trim());
        const actionValid = value?.action === 'continue' || value?.action === 'wait' || value?.action === 'stop';
        const action: 群聊调度动作 = actionValid ? value.action : 'wait';
        const nextNpcId = 取文本(value?.nextNpcId || value?.nextNpcName);
        const valid = actionValid && (action !== 'continue' || Boolean(nextNpcId));
        return {
            正文,
            动作: valid ? action : 'wait',
            ...(nextNpcId ? { 下一位NPCId: nextNpcId } : {}),
            调度有效: valid,
            完整: true
        };
    } catch {
        return { 正文, 动作: 'wait', 调度有效: false, 完整: Boolean(bodyMatch) };
    }
};

const 选择首位发言者 = (participants: any[], input: string, preferredId: string, history: 场外对话消息结构[]): any => {
    if (preferredId) {
        const preferred = participants.find(npc => 取NPCId(npc) === preferredId);
        if (preferred) return preferred;
    }
    const mentioned = participants
        .slice()
        .sort((a, b) => 取文本(b?.姓名).length - 取文本(a?.姓名).length)
        .find(npc => 取文本(npc?.姓名) && input.includes(取文本(npc?.姓名)));
    if (mentioned) return mentioned;

    const lastSpoken = new Map<string, number>();
    history.forEach((item, index) => {
        if (item.role === 'npc' && item.npcId) lastSpoken.set(item.npcId, index);
    });
    return participants.slice().sort((a, b) => {
        const aIndex = lastSpoken.get(取NPCId(a)) ?? -1;
        const bIndex = lastSpoken.get(取NPCId(b)) ?? -1;
        return aIndex - bIndex;
    })[0];
};

const 构建群聊消息序列 = (
    deps: 角色对话依赖,
    npc: any,
    participants: any[],
    groupId: string,
    transcript: 场外对话消息结构[]
): 通用消息结构[] => {
    const npcId = 取NPCId(npc);
    const roster = participants.map(item => `${取NPCId(item)}=${取文本(item?.姓名) || '未知人物'}`).join('；');
    const publicTranscript = transcript
        .filter(item => item.会话类型 === 'group' && item.群聊ID === groupId)
        .filter(item => Array.isArray(item.听众NPCIds) && item.听众NPCIds.includes(npcId))
        .slice(-80)
        .map(item => `【${item.发言人}】${item.内容}`)
        .join('\n');
    const customPrompt = 取文本((deps.apiConfig as any)?.功能模型占位?.角色对话提示词);
    const mandatoryProtocol = `<群聊输出协议>
你只扮演下方“你要扮演的角色”指定的一名 NPC。先以这个角色的有限认知完成一条自然发言，再以客观调度员身份建议下一位。
调度只能依据公开对话、是否被点名、是否需要回应及是否该等待玩家；不得把本角色的私人记忆当作调度理由。
本协议要求的 <正文>/<调度> 标签格式，优先于「角色对话协议」中“禁止输出标签”的限制。
必须严格输出：
<正文>角色说的话；完整意思之间用空行分段</正文>
<调度>{"action":"continue|wait|stop","nextNpcId":"继续时填写参与者ID，否则留空"}</调度>
不得输出其他文字，不得安排名单外人物。若玩家需要回应，action=wait。</群聊输出协议>`;
    const blocks = [
        customPrompt || 默认角色对话提示词,
        mandatoryProtocol,
        序列化江湖常识(deps.prompts) ? `## 江湖常识\n${序列化江湖常识(deps.prompts)}` : '',
        `## 当前情境\n${序列化当前情境(deps.环境)}`,
        `## 本群聊参与者（固定名单）\n${roster}`,
        `## 眼前的人\n${序列化眼前的人(participants, deps.角色)}`,
        `## 你要扮演的角色（ID：${npcId}）\n${序列化NPC档案(npc)}`,
        `## 你实际听到的本次群聊\n${publicTranscript || '（暂无）'}`
    ].filter(Boolean);
    return [
        ...blocks.map(content => ({ role: 'system' as const, content })),
        { role: 'user', content: '现在轮到你发言。只按群聊输出协议作答。' }
    ];
};

export const 执行角色群聊 = async (deps: 角色对话依赖, params: 角色群聊参数): Promise<角色群聊结果> => {
    const participantIds = Array.from(new Set(params.参与者NPCIds.map(取文本).filter(Boolean)));
    if (participantIds.length < 2) throw new Error('群聊至少需要选择两名角色。');
    const participants = participantIds
        .map(id => 解析目标NPC(deps.社交, { npcId: id, npcName: id }))
        .filter(Boolean);
    if (participants.length !== participantIds.length) throw new Error('群聊成员已经变化，请重新选择。');
    for (const npc of participants) {
        const check = 判断角色对话位置(npc, deps.环境);
        if (!check.可选) throw new Error(check.原因);
        if (check.需要确认 && params.已确认全部位置 !== true) {
            throw new Error('请先确认所有群聊成员都在附近并能听见。');
        }
    }
    const roleChatApi = 获取角色对话接口配置(deps.apiConfig);
    if (!接口配置是否可用(roleChatApi)) {
        throw new Error('角色对话独立模型未配置：请到 设置 → 角色对话 开启独立模型并选择模型。');
    }
    const playerInput = 取文本(params.玩家输入);
    if (!playerInput && params.继续群聊 !== true) throw new Error('输入内容为空。');
    if (params.继续群聊 === true && !取文本(params.群聊ID)) throw new Error('当前没有可继续的群聊。');
    const groupId = 取文本(params.群聊ID) || `role-group-${Date.now().toString(36)}`;
    const limit = Math.min(6, Math.max(1, Number(params.自动回复上限) || 3));
    const audienceIds = participants.map(取NPCId);
    const audienceNames = participants.map(npc => 取文本(npc?.姓名) || 取NPCId(npc));
    const history = 规范化场外对话列表(params.暂存对话);
    const newMessages: 场外对话消息结构[] = params.继续群聊 === true ? [] : [{
        会话类型: 'group', 群聊ID: groupId, role: 'player',
        发言人: 取文本(deps.角色?.姓名) || '玩家', 内容: playerInput, 时间: Date.now(),
        听众NPCIds: audienceIds, 听众: audienceNames, 完成状态: 'complete'
    }];
    let current = 选择首位发言者(
        participants,
        playerInput,
        取文本(params.首位NPCId),
        history.filter(item => item.会话类型 === 'group' && item.群聊ID === groupId)
    );
    let endReason: 角色群聊结果['结束原因'] = 'limit';

    for (let index = 0; index < limit; index += 1) {
        if (params.signal?.aborted) throw params.signal.reason ?? new DOMException('请求已取消', 'AbortError');
        const npcId = 取NPCId(current);
        const npcName = 取文本(current?.姓名) || npcId;
        const messages = 构建群聊消息序列(deps, current, participants, groupId, [...history, ...newMessages]);
        let raw = '';
        try {
            raw = await 执行角色对话请求带超时(
                async (signal, onDelta) => {
                    // 与角色对话同源的风险：空闲超时挡不住「快速断流」，
                    // 半截发言会被当成完整发言（`解析群聊模型输出` 只看 <正文> 是否闭合）。
                    const 完整性结果 = await 执行带完整性校验的请求({
                        功能名: '群聊发言',
                        发起流式请求: (streamOptions) => generateRoleChatRawReply(messages, roleChatApi as any, {
                            signal,
                            streamOptions: {
                                stream: true,
                                onDelta: (_delta, accumulated) => {
                                    onDelta(_delta, accumulated);
                                    params.onTurnDelta?.({ npcId, npcName, text: 提取群聊流式正文(accumulated) });
                                },
                                onStreamEnd: streamOptions.onStreamEnd
                            }
                        }),
                        发起非流式请求: () => generateRoleChatRawReply(messages, roleChatApi as any, { signal }),
                        onFallback: (info) => {
                            console.warn('[群聊] 流式输出疑似被上游中断，降级为非流式重新生成', info);
                        }
                    });
                    return 完整性结果.结果;
                },
                params.signal,
                { 中断时保留部分: true }
            );
        } catch (error) {
            if (params.signal?.aborted) { endReason = 'stopped'; break; }
            if (newMessages.some(item => item.role === 'npc')) { endReason = 'request_error'; break; }
            throw error;
        }
        const parsed = 解析群聊模型输出(raw);
        if (!parsed.正文) {
            // 已经有角色说完时，按“后续请求失败”处理：保留已完成发言并安全暂停，
            // 而不是抛错导致整批（含前面已完成的发言）都进不了暂存。
            if (newMessages.some(item => item.role === 'npc')) { endReason = 'request_error'; break; }
            throw new Error(`${npcName}返回了空回复。`);
        }
        const npcMessage: 场外对话消息结构 = {
            会话类型: 'group', 群聊ID: groupId, npcId, role: 'npc', 发言人: npcName,
            内容: parsed.正文, 时间: Date.now(), 听众NPCIds: audienceIds, 听众: audienceNames,
            完成状态: parsed.完整 ? 'complete' : 'partial'
        };
        newMessages.push(npcMessage);
        params.onTurnComplete?.({ message: npcMessage, turnIndex: index });
        if (params.shouldStopAfterTurn?.() === true) { endReason = 'stopped'; break; }

        if (!parsed.调度有效) { endReason = 'invalid_scheduler'; break; }
        if (parsed.动作 === 'wait') { endReason = 'model_wait'; break; }
        if (parsed.动作 === 'stop') { endReason = 'model_stop'; break; }
        const next = participants.find(item => {
            const nextId = 取文本(parsed.下一位NPCId);
            return 取NPCId(item) === nextId || 取文本(item?.姓名) === nextId;
        });
        if (!next) { endReason = 'invalid_scheduler'; break; }
        current = next;
    }

    return { groupId, 新增消息: newMessages, 发言次数: newMessages.filter(item => item.role === 'npc').length, 结束原因: endReason };
};
