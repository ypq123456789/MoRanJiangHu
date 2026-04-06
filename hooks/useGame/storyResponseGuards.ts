import type { GameResponse, TavernCommand } from '../../types';
import { normalizeStateCommandKey } from '../../utils/stateHelpers';

const 命令属于世界域 = (key: string): boolean => {
    const normalized = normalizeStateCommandKey(typeof key === 'string' ? key : '');
    return normalized.startsWith('gameState.世界');
};

const 精简命令值 = (value: any): string => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 48 ? `${trimmed.slice(0, 48)}...` : trimmed;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `数组(${value.length})`;
    if (value && typeof value === 'object') {
        const title = typeof value.标题 === 'string' ? value.标题.trim() : '';
        const name = typeof value.名称 === 'string' ? value.名称.trim() : '';
        if (title) return `对象(${title})`;
        if (name) return `对象(${name})`;
        const keys = Object.keys(value).slice(0, 3);
        return `对象(${keys.join('/') || '匿名'})`;
    }
    return '空值';
};

const 构建世界命令线索 = (cmd: TavernCommand): string => {
    const normalized = normalizeStateCommandKey(cmd.key).replace(/^gameState\./, '');
    const prefix = cmd.action === 'delete'
        ? '主剧情提及世界层移除'
        : cmd.action === 'push'
            ? '主剧情提及世界层新增'
            : '主剧情提及世界层变化';
    const valueText = cmd.action === 'delete' ? '' : ` => ${精简命令值(cmd.value)}`;
    return `${prefix}：${normalized}${valueText}`;
};

export const 按世界演变分流净化响应 = (
    response: GameResponse,
    enabled: boolean
): { response: GameResponse; removedWorldCommands: TavernCommand[]; appendedDynamicHints: string[] } => {
    if (!enabled || !Array.isArray(response?.tavern_commands) || response.tavern_commands.length === 0) {
        return {
            response,
            removedWorldCommands: [],
            appendedDynamicHints: []
        };
    }

    const keptCommands: TavernCommand[] = [];
    const removedWorldCommands: TavernCommand[] = [];

    response.tavern_commands.forEach((cmd) => {
        if (命令属于世界域(cmd?.key || '')) {
            removedWorldCommands.push(cmd);
            return;
        }
        keptCommands.push(cmd);
    });

    if (removedWorldCommands.length === 0) {
        return {
            response,
            removedWorldCommands,
            appendedDynamicHints: []
        };
    }

    const appendedDynamicHints = removedWorldCommands.map(构建世界命令线索);

    return {
        response: {
            ...response,
            tavern_commands: keptCommands
        },
        removedWorldCommands,
        appendedDynamicHints
    };
};
