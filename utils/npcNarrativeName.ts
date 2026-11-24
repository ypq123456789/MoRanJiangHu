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
