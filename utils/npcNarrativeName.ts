/** NPC 叙事名 / 真实名的显示口径。姓名仍是全系统匹配主键，这里只负责显示层。 */

const 取文本 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** 正文里使用的称呼；老存档没有叙事名称时回退到姓名。 */
export const 取NPC叙事名 = (npc: any): string =>
    取文本(npc?.叙事名称) || 取文本(npc?.姓名) || '无名';

/** 档案真值姓名。 */
export const 取NPC真实名 = (npc: any): string =>
    取文本(npc?.姓名) || 取文本(npc?.叙事名称) || '无名';

/** 叙事名与真名不同才算剧透；相同则没有打码的必要。 */
export const NPC名称需要打码 = (npc: any): boolean => {
    const 叙事 = 取文本(npc?.叙事名称);
    const 真实 = 取文本(npc?.姓名);
    return Boolean(叙事 && 真实 && 叙事 !== 真实);
};

export const 取NPC稳定键 = (npc: any): string =>
    取文本(npc?.id) || 取文本(npc?.ID) || 取NPC真实名(npc);

/** 旧档可能用描述指代人物。先遍历所有精确引用，再尝试兼容这种旧格式。 */
export const 查找记录对应NPC = <T extends { id?: string; ID?: string; 姓名?: string; 名称?: string; 叙事名称?: string }>(
    references: string[], social: T[]
): T | undefined => {
    const normalize = (value?: string) => 取文本(value).replace(/\s+/g, '').toLowerCase();
    const keys = references.map(normalize).filter(Boolean);
    const entries = social.filter(Boolean).map(npc => ({
        npc, keys: [npc.id, npc.ID, npc.姓名, npc.名称, npc.叙事名称].map(normalize).filter(Boolean)
    }));
    for (const key of keys) {
        const exact = entries.filter(entry => entry.keys.includes(key));
        if (exact.length === 1) return exact[0].npc;
    }
    const matches = new Set<T>();
    for (const text of keys) {
        const mentions: { npc: T; start: number; end: number }[] = [];
        for (const entry of entries) {
            for (const value of entry.keys) {
                for (let at = text.indexOf(value); at >= 0; at = text.indexOf(value, at + 1)) {
                    mentions.push({ npc: entry.npc, start: at, end: at + value.length });
                }
            }
        }
        for (const m of mentions) {
            // “林风远”中的“林风”是嵌套短名，单独再出现一次的“林风”才指向另一个人。
            if (!mentions.some(other => other.start <= m.start && other.end >= m.end
                && (other.start < m.start || other.end > m.end))) matches.add(m.npc);
        }
        if (matches.size > 1) return undefined;
    }
    if (!matches.size) {
        for (const entry of entries) {
            if (keys.some(fragment => entry.keys.some(value => value.includes(fragment)))) matches.add(entry.npc);
        }
    }
    return matches.size === 1 ? matches.values().next().value : undefined;
};
