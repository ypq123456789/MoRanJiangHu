/**
 * 在开局场景里，AI 有时会返回空姓名 / 「未命名」/「未知角色」/「无名」/「unnamed」/「unknown」，
 * 直接写回会覆盖玩家开局时设定的主角姓名，导致存档与界面都呈现「未命名」。
 *
 * 该函数在写回前对角色对象就地修补：
 *   - 仅当 AI 返回的角色姓名确实是占位符（空 / 未命名 / 未知角色 / 无名 / unnamed / unknown）时才替换；
 *   - 否则**绝不**覆盖 AI 给出的具体名字（避免把"墨衣客"强行回退成玩家起的"陆凡"之类的奇怪行为）。
 *
 * 设计原则：兜底而非抹平。这是玩家反馈三的核心修复。
 */
const AI_NAME_PLACEHOLDERS = new Set([
    '',
    '未命名',
    '未知角色',
    '未知',
    '无名',
    'unnamed',
    'unknown'
]);

const matchesPlaceholder = (aiName: string): boolean => {
    if (!aiName) return true;
    if (AI_NAME_PLACEHOLDERS.has(aiName)) return true;
    // 大小写不敏感处理：'Unnamed' / 'UNKNOWN' 也算占位
    return AI_NAME_PLACEHOLDERS.has(aiName.toLowerCase());
};

export const 修补开局角色姓名占位 = (
    role: any,
    fallbackRole: any | null | undefined
): boolean => {
    if (!role || typeof role !== 'object') return false;
    if (!fallbackRole || typeof fallbackRole !== 'object') return false;
    const baseName = typeof fallbackRole.姓名 === 'string' ? String(fallbackRole.姓名).trim() : '';
    if (!baseName) return false;
    const aiName = typeof role.姓名 === 'string' ? String(role.姓名).trim() : '';
    if (matchesPlaceholder(aiName)) {
        if (role.姓名 !== baseName) {
            role.姓名 = baseName;
            return true;
        }
    }
    return false;
};
