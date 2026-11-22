// 右侧「天机」菜单未读提示的纯逻辑。
// 未读状态由 App 持有（避免 RightPanel 卸载重挂时丢失），菜单项与收起书签共用同一套判断。

/**
 * 计算「回合身份」。同一回合内收起/展开菜单必须保留已读状态；
 * 新回合即使变化区域完全相同，也要重新提示。
 * 主剧情落地时会给 assistant 消息写入发送时间戳，整轮内稳定，用它当回合身份。
 * 旧存档的历史消息可能没有时间戳，此时退回区域签名（行为与改动前一致）。
 */
export const 计算回合键 = (turnTimestamp: unknown, sectionSignature: string): string => {
    const ts = Number(turnTimestamp);
    if (Number.isFinite(ts) && ts > 0) return `turn:${ts}`;
    return `sections:${sectionSignature}`;
};

/** 变化区域签名的规范化：排序后拼接，顺序不同视为同一组变化 */
export const 计算变化区域签名 = (changeSections: string[]): string => (
    Array.isArray(changeSections) ? changeSections.slice().sort().join('|') : ''
);

/** 是否有未读：只看被追踪的区域，且不在已读集合里 */
export const 判断是否有未读 = (
    changeSections: string[],
    trackedKeys: Set<string>,
    dismissedKeys: string[]
): boolean => {
    if (!Array.isArray(changeSections) || changeSections.length === 0) return false;
    const dismissed = new Set(Array.isArray(dismissedKeys) ? dismissedKeys : []);
    return changeSections.some((key) => trackedKeys.has(key) && !dismissed.has(key));
};

/** 合并已读键，保持去重与稳定顺序 */
export const 合并已读键 = (prev: string[], keys: string[]): string[] => {
    if (!Array.isArray(keys) || keys.length === 0) return prev;
    const next = new Set(Array.isArray(prev) ? prev : []);
    keys.forEach((key) => next.add(key));
    return Array.from(next);
};
