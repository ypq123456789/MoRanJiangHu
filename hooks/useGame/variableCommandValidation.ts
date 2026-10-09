import type { GameResponse, OpeningConfig, TavernCommand } from '../../types';
import type { NpcTemplateNameContext } from '../../utils/npcTemplateNamePolicy';
import type { 响应命令处理状态 } from './responseCommandProcessor';
import { normalizeNpcNameKey } from '../../utils/npcName';
import { normalizeStateCommandKey } from '../../utils/stateHelpers';
import { 校验变量命令是否登记 } from '../../utils/variableRegistry';
import { 提取命中新女性角色姓名黑名单 } from '../../utils/femaleNameSelector';
import { 提取命中模板姓名黑名单 } from '../../utils/templateNameBlacklist';
import { 检测NPC姓名改写风险命令, 检测社交删除风险命令 } from '../../utils/npcRetentionGuard';
import { 检测NPC境界回退风险命令 } from '../../utils/npcRealmRegressionGuard';
import { 检测NPC死亡判定风险命令 } from '../../utils/npcDeathGuard';
import { 获取境界配置, type 境界配置 } from '../../utils/realmConfig';
const 读取文本 = (v: unknown): string => typeof v === 'string' ? v.trim() : '';

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

const 包含非法伪索引 = (key: string): boolean => /(?:\[(?:-?\d+|last|tail|尾项|最后一项)\])/i.test((key || '').trim())
    && (
        /\[-\d+\]/.test((key || '').trim())
        || /\[(?:last|tail|尾项|最后一项)\]/i.test((key || '').trim())
    );

export const 是否允许变量生成命令 = (cmd: TavernCommand): boolean => {
    if (typeof cmd?.key !== 'string' || 包含非法伪索引(cmd.key)) return false;
    const normalizedKey = normalizeStateCommandKey(typeof cmd?.key === 'string' ? cmd.key : '');
    if (!normalizedKey) return false;
    if (/^gameState\.世界\.(地图|建筑|地图建筑|地图道路|地图人物)(?:\.|\[|$)/u.test(normalizedKey)) return false;

    const allowed = 允许根路径.find((root) => normalizedKey === root || normalizedKey.startsWith(`${root}.`) || normalizedKey.startsWith(`${root}[`));
    if (!allowed) return false;
    return cmd.action === 'add' || cmd.action === 'set' || cmd.action === 'push' || cmd.action === 'delete' || cmd.action === 'sub';
};

export const 校验变量命令角色安全 = (commands: TavernCommand[], params: {
    baseState: Pick<响应命令处理状态, '角色' | '社交'>;
    parsedResponse: GameResponse;
    openingConfig?: OpeningConfig;
    realmConfig?: 境界配置;
    npcNameContext: NpcTemplateNameContext;
}): void => {
        const blacklistHits = 提取命中新女性角色姓名黑名单({
            ...params.npcNameContext,
            commands: commands,
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
            ...params.npcNameContext,
            includeLogSenders: false,
            commands: commands,
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
            const normalizeKey = normalizeNpcNameKey;
            const playerKey = normalizeKey(playerName);
            const protagonistAsNpc = commands.filter((cmd: any) => {
                const action = cmd?.action || 'set';
                const rawKey = typeof cmd?.key === 'string' ? cmd.key : '';
                const normalizedKey = normalizeStateCommandKey(rawKey).replace(/^gameState\./, '');
                // push 社交 = {...}：新增 NPC
                if ((action === 'push' || action === 'add' || action === 'set') && (normalizedKey === '社交' || /^社交\[\d+\]$/.test(normalizedKey))) {
                    if (Array.isArray(cmd.value)) return cmd.value.some(npc => normalizeKey(npc?.姓名) === playerKey);
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

        const renameIssues = 检测NPC姓名改写风险命令(commands, params.baseState.社交);
        if (renameIssues.length > 0) {
            const message = `变量生成试图改写已生成 NPC 姓名：${renameIssues.join('；')}。前端不会修改既有变量，请重新生成变量命令并保留已有 NPC 姓名。`;
            const error = new Error(message);
            (error as any).parseDetail = message;
            throw error;
        }

        const deletionIssues = 检测社交删除风险命令(commands, params.baseState.社交);
        if (deletionIssues.length > 0) {
            const message = `变量生成试图删除或替换既有 NPC：${deletionIssues.join('；')}。未经玩家手动确认，变量生成只能更新 NPC 字段，不能删除角色或整组覆盖社交列表。`;
            const error = new Error(message);
            (error as any).parseDetail = message;
            throw error;
        }

        const realmRegressionIssues = 检测NPC境界回退风险命令(
            commands,
            params.baseState.社交,
            params.parsedResponse,
            params.realmConfig || 获取境界配置(params.openingConfig?.题材模式, params.openingConfig?.modeRuntimeProfile)
        );
        if (realmRegressionIssues.length > 0) {
            const message = `变量生成试图无依据降低既有 NPC 境界：${realmRegressionIssues.join('；')}。NPC 的境界文案与境界层级是持久真值；只有正文明确发生永久跌境、修为被废或证实旧档案有误时才能同步降低。请重新生成变量命令。`;
            const error = new Error(message);
            (error as any).parseDetail = message;
            throw error;
        }

        const rewardPlaceholderIssues = 提取命令中的任务奖励占位(commands);
        if (rewardPlaceholderIssues.length > 0) {
            const message = `变量生成写入了不可结算的任务奖励：${rewardPlaceholderIssues.join('；')}。请重新生成任务变量命令：奖励描述必须明确到可显示、可结算的奖励，例如“奖励点 +100”“D级支线剧情 +1”“可分配属性点 +1”“急救包 x1”，不能写未知、待定、看情况或无奖励。`;
            const error = new Error(message);
            (error as any).parseDetail = message;
            throw error;
        }

        const deathIssues = 检测NPC死亡判定风险命令(commands, params.baseState.社交, params.parsedResponse);
        if (deathIssues.length > 0) {
            const message = `变量生成试图把 NPC 判定为死亡/已故，但证据不足：${deathIssues.join('；')}。死亡判定必须同时写入：当前血量归零、死亡状态、死亡时间、死亡描述；否则只能写重伤、濒死、失踪或状态未知。请重新生成变量命令。`;
            const error = new Error(message);
            (error as any).parseDetail = message;
            throw error;
        }

};

export type VariableCommandRejectionCode = 'unregisteredPath' | 'invalidAction' | 'typeError' | 'npcRename' | 'npcDeletion' | 'protagonist' | 'templateName' | 'insufficientEvidence' | 'safety';
export const variableCommandProtectionCode = (reason: string): VariableCommandRejectionCode => {
    if (/改写.*姓名/.test(reason)) return 'npcRename';
    if (/删除|替换既有 NPC/.test(reason)) return 'npcDeletion';
    if (/主角.*NPC/.test(reason)) return 'protagonist';
    if (/模板姓名黑名单/.test(reason)) return 'templateName';
    if (/依据|证据/.test(reason)) return 'insufficientEvidence';
    return 'safety';
};

export const readVariableCommandValue = (state: any, rawKey: string): any => {
    const key = normalizeStateCommandKey(rawKey).replace(/^gameState\./, '');
    const tokens = key.replace(/\[(\d+)\]/g, '.$1').split('.');
    let value = state;
    for (const token of tokens) {
        if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, token)) return undefined;
        value = value[token];
    }
    return value;
};

// 生成/审查共用路径与动作入口。审查进一步执行严格类型检查，避免旧档兼容转换成为写入依据。
export const validateVariableCommandBasics = (cmd: TavernCommand, state: any, strictTypes = false): { code: VariableCommandRejectionCode; reason: string } | null => {
    if (!['set', 'add', 'sub', 'push', 'delete'].includes(cmd?.action)) return { code: 'invalidAction', reason: '非法 action' };
    const key = typeof cmd?.key === 'string' ? normalizeStateCommandKey(cmd.key) : '';
    if (strictTypes && !/^gameState\.[^.\s\[\]]+(?:\.[^.\s\[\]]+|\[\d+\])*$/.test(key)) return { code: 'unregisteredPath', reason: '命令路径语法非法' };
    if (!是否允许变量生成命令(cmd) || /(?:^|[.\[])(?:__proto__|constructor|prototype)(?:[.\]]|$)/.test(key)) {
        return { code: 'unregisteredPath', reason: '未登记路径或非法索引' };
    }
    const validation = 校验变量命令是否登记(cmd, state);
    if (!validation.allowed) return { code: 'unregisteredPath', reason: validation.reason || '未登记路径' };
    if (!strictTypes || cmd.action === 'delete') return null;
    const current = readVariableCommandValue(state, key);
    if (cmd.action === 'push' && !Array.isArray(current)) return { code: 'typeError', reason: 'push 的目标必须为现有数组' };
    const invalidObject = (v: any): boolean => {
        if (typeof v === 'number') return !Number.isFinite(v);
        if (!v || typeof v !== 'object') return false;
        return Object.entries(v).some(([k, child]) => ['__proto__', 'constructor', 'prototype'].includes(k) || invalidObject(child));
    };
    const mismatch = cmd.action === 'add' || cmd.action === 'sub'
        ? typeof cmd.value !== 'number' || !Number.isFinite(cmd.value) || typeof current !== 'number'
        : cmd.action === 'set' && current != null
            ? Array.isArray(current) ? !Array.isArray(cmd.value)
                : typeof current !== typeof cmd.value || (typeof current === 'object' && (cmd.value === null || Array.isArray(cmd.value)))
            : false;
    if (mismatch || invalidObject(cmd.value)) return { code: 'typeError', reason: '命令值类型错误或包含非法对象字段/数值' };
    return null;
};
