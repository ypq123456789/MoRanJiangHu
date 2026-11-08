import { normalizeNpcNameKey } from './npcName';
import { 是否主角姓名占位 } from './openingProtagonistName';
import { normalizeStateCommandKey } from './stateHelpers';

/**
 * 主角姓名保护
 *
 * 玩家反馈：剧情角色一多、进入群像剧情后，AI 有时会把主角当成普通 NPC，
 * 用 `set 角色.姓名` 或整体 `set 角色 = {...}` 把主角改名成凭空造出来的名字。
 * 一旦落库，后续每一回合的提示词都会带着这个错名字，AI 就真的「忘记」了主角姓名。
 *
 * 设计原则：
 * - 主角姓名只由玩家决定（建档或手动修改变量），AI 命令不得静默改名；
 * - 当前姓名本身是占位名时（开局尚未落名）允许 AI 补一个正式姓名；
 * - 只做丢弃/保留，不报错、不重试，避免因为一条命令拖垮整回合。
 */

const 读取姓名 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** 提取当前主角的可信正式姓名；空或占位名返回空串。 */
export const 提取可保护的主角姓名 = (role: unknown): string => {
    const name = 读取姓名((role as any)?.姓名);
    if (!name || 是否主角姓名占位(name)) return '';
    return name;
};

/**
 * 净化一条可能改写主角姓名的变量命令。
 *
 * - `set/add/delete 角色.姓名`：当前姓名可信时，改名成其他具体姓名或占位符一律丢弃；
 *   仅仅大小写/空格差异视为同一姓名，保留原始显示文本。
 * - `set/add 角色`（整对象）：保留当前姓名，避免整体覆盖时把姓名冲掉。
 *
 * 返回 `null` 表示丢弃该命令，返回对象表示按（可能修补过 value 的）命令执行。
 */
export const 净化主角姓名命令 = (cmd: any, currentRole: unknown): any | null => {
    if (!cmd || typeof cmd !== 'object') return cmd;
    const action = typeof cmd.action === 'string' && cmd.action ? cmd.action : 'set';
    const normalizedKey = normalizeStateCommandKey(typeof cmd.key === 'string' ? cmd.key : '')
        .replace(/^gameState\./, '');
    const protectedName = 提取可保护的主角姓名(currentRole);
    // 还没有正式姓名（开局空档 / 占位名）→ 允许 AI 补名
    if (!protectedName) return cmd;

    if (normalizedKey === '角色.姓名') {
        if (action === 'delete') return null;
        if (action !== 'set' && action !== 'add') return cmd;
        const nextName = 读取姓名(cmd.value);
        if (!nextName || 是否主角姓名占位(nextName)) return null;
        if (normalizeNpcNameKey(nextName) === normalizeNpcNameKey(protectedName)) {
            // 同一姓名的变体（大小写、空格）→ 纠正回原始显示
            return { ...cmd, value: protectedName };
        }
        return null;
    }

    if (normalizedKey === '角色' && (action === 'set' || action === 'add')) {
        const nextValue = cmd.value;
        if (!nextValue || typeof nextValue !== 'object' || Array.isArray(nextValue)) return cmd;
        const nextName = 读取姓名((nextValue as any).姓名);
        if (nextName === protectedName) return cmd;
        return { ...cmd, value: { ...(nextValue as any), 姓名: protectedName } };
    }

    return cmd;
};
