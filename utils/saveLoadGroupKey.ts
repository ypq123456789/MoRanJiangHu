import type { 存档摘要结构 } from '../services/dbService';

/**
 * 计算本地存档时间树分组的"系列 key"。
 *
 * 优先级（务必按顺序）：
 * 1. 元数据.存档系列ID（修复后的新谱系存档）。
 * 2. 元数据.存档根节点哈希（旧谱系存档指向根节点哈希）。
 * 3. 元数据.存档哈希（缺乏谱系元数据的旧存档——必须按存档自身哈希独立分组，
 *    **绝不**用角色名 fallback，否则同名玩家多开档会被错误合并到同一条时间树）。
 * 4. 存档 id（最后兜底，保证每条存档至少占用一个独立 key，绝不合并到同一个 unnamed 组）。
 *
 * 玩家反馈一/二的核心修复：同名"陆凡"等极常见角色名开多档时，绝不能因为同名
 * 就被错误分组画到同一条时间线。
 */
export const 读取存档本地分组键 = (save: 存档摘要结构 | null | undefined): string => {
    if (!save) return 'legacy-id:null';
    const metadata = (save as any).元数据;
    const metadataSeriesId = typeof metadata?.存档系列ID === 'string' ? metadata.存档系列ID.trim() : '';
    if (metadataSeriesId) return metadataSeriesId;
    const rootHash = typeof metadata?.存档根节点哈希 === 'string' ? metadata.存档根节点哈希.trim() : '';
    if (rootHash) return rootHash;
    const ownHash = typeof metadata?.存档哈希 === 'string' ? metadata.存档哈希.trim() : '';
    if (ownHash) return `legacy-hash:${ownHash}`;
    const idPart = typeof (save as any).id === 'number' ? String((save as any).id) : 'unknown';
    return `legacy-id:${idPart}`;
};
