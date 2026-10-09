import type { GameResponse, TavernCommand } from '../../types';
import type { VariableReviewInput } from './variableReviewWorkflow';
import type { 响应命令处理状态 } from './responseCommandProcessor';
import { normalizeNpcNameKey } from '../../utils/npcName';

export const variableReviewRoots = ['角色', '环境', '世界', '社交', '战斗', '玩家门派', '任务列表', '约定列表'] as const;
export const isVariableReviewExcludedField = (key: string): boolean => /图片|图像|头像|立绘|base64|b64_json|dataurl|本地路径|生图历史|最近生图结果|缓存|cache|avatar|portrait|thumbnail|image(?:url|data)|^(?:ui(?:state)?|loading|isLoading|rawJson|thinking|t_var_plan)$/iu.test(key);
export const stripVariableReviewNonBusiness = (value: any): any => {
    if (typeof value === 'string' && /^data:image\//i.test(value)) return undefined;
    if (Array.isArray(value)) return value.map(stripVariableReviewNonBusiness); // 不按token预算裁剪业务数组。
    if (!value || typeof value !== 'object') return value;
    const copy: Record<string, any> = {};
    for (const key of Object.keys(value)) {
        // 先检查key再读取值，避免访问或复制大型图片/cache字段。
        if (!isVariableReviewExcludedField(key)) copy[key] = stripVariableReviewNonBusiness(value[key]);
    }
    return copy;
};
export const extractVariableReviewBusinessState = (state: any): 响应命令处理状态 => Object.fromEntries(
    variableReviewRoots.map(root => [root, stripVariableReviewNonBusiness(state?.[root])])
) as 响应命令处理状态;
export const variableReviewCommandTouchesExcludedData = (command: TavernCommand): boolean => {
    if (String(command.key).split(/[.\[\]]/).some(isVariableReviewExcludedField)) return true;
    const contains = (v: any): boolean => {
        if (typeof v === 'string') return /^data:image\//i.test(v);
        if (!v || typeof v !== 'object') return false;
        return Object.keys(v).some(key => isVariableReviewExcludedField(key) || contains(v[key]));
    };
    return contains(command.value);
};
export const stableVariableReviewJson = (value: any): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);

export const selectVariableReviewTurn = (input: VariableReviewInput) => {
    if (input.turnInProgress) throw new Error('当前回合尚未完成，不能运行变量审查。');
    const history = input.history || [];
    let index = history.length - 1;
    while (index >= 0 && history[index]?.role !== 'assistant') index--;
    const turn = history[index];
    if (!turn?.structuredResponse?.logs?.length || history.slice(index + 1).some(row => row.role === 'user')) throw new Error('缺少最后一个已完成回合的结构化正文。');
    const logs = turn.structuredResponse.logs.map(log => ({ sender: String(log.sender || '旁白'), text: String(log.text || '') }));
    if (!logs.some(log => log.text.trim())) throw new Error('当前回合正文为空，不能审查。');
    let userIndex = index - 1;
    while (userIndex >= 0 && history[userIndex]?.role !== 'user') userIndex--;
    const originalPlayerInput = history[userIndex]?.content || '';
    if (input.originalPlayerInput !== undefined && input.originalPlayerInput !== originalPlayerInput) throw new Error('原回合玩家输入与所选回合不匹配，不能将审查备注替代原输入。');
    return { sourceTurnId: `assistant:${turn.timestamp}:${index}`, response: { logs, tavern_commands: [] } as GameResponse, originalPlayerInput,
        originalCommands: (turn.structuredResponse.tavern_commands || []).map(command => ({ action: command.action, key: command.key,
            value: String(command.key).split(/[.\[\]]/).some(isVariableReviewExcludedField) ? undefined : stripVariableReviewNonBusiness(command.value) })) };
};
export const createVariableReviewBusinessSnapshot = (input: VariableReviewInput) => {
    const turn = selectVariableReviewTurn(input);
    const trusted = input.beforeTurn?.provenance === 'live-before-turn' && input.beforeTurn.sourceTurnId === turn.sourceTurnId;
    return { state: extractVariableReviewBusinessState(input.currentState), logs: turn.response.logs, sourceTurnId: turn.sourceTurnId,
        originalCommands: turn.originalCommands, originalPlayerInput: turn.originalPlayerInput,
        beforeTurn: trusted ? { sourceTurnId: input.beforeTurn!.sourceTurnId, provenance: 'live-before-turn' as const, state: extractVariableReviewBusinessState(input.beforeTurn!.state) } : undefined,
        version: input.stateVersion };
};
export const variableReviewBusinessSeal = (input: VariableReviewInput): string => stableVariableReviewJson(createVariableReviewBusinessSnapshot(input));

// 合并刚重新执行的业务结果与最新非业务数据；图片/cache引用不复制、不规范化、不改写。
export const mergeVariableReviewBusinessState = (live: 响应命令处理状态, business: 响应命令处理状态): 响应命令处理状态 => {
    const id = (v: any) => String(v?.id || v?.ID || '');
    const name = (v: any) => normalizeNpcNameKey(v?.姓名 || v?.名称 || v?.name);
    const merge = (next: any, previous: any): any => {
        if (Array.isArray(next)) return next.map((entry, index) => {
            const list = Array.isArray(previous) ? previous : [];
            const matched = id(entry) ? list.find(old => id(old) === id(entry)) : undefined;
            const byName = name(entry) ? list.filter(old => name(old) === name(entry) && (!id(entry) || !id(old))) : [];
            const old = matched || (byName.length === 1 ? byName[0] : !id(entry) && !name(entry) ? list[index] : undefined);
            return merge(entry, old);
        });
        if (!next || typeof next !== 'object') return next;
        // 替换成另一件物品时不能把旧物品图片合并给新ID；同一身份的图片继续原样保留。
        if (id(next) && id(previous) && id(next) !== id(previous)) previous = undefined;
        const result: any = {};
        for (const key of Object.keys(next)) result[key] = merge(next[key], previous?.[key]);
        if (previous && typeof previous === 'object' && !Array.isArray(previous)) {
            for (const key of Object.keys(previous)) if (isVariableReviewExcludedField(key)) result[key] = previous[key];
        }
        return result;
    };
    const state: any = { ...live };
    for (const root of variableReviewRoots) state[root] = merge(business[root], live[root]);
    return state;
};
