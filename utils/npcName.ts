// 比较键只用于匹配，不写回显示姓名。
export const normalizeNpcNameKey = (value: unknown): string => typeof value === 'string'
    ? value.normalize('NFC').trim().replace(/\s+/gu, ' ').replace(/’/g, "'").toLowerCase()
    : '';

export const hasNpcNamePollution = (value: string): boolean => /[\p{Cc}\p{Cf}<>＝=\[\]{}]/u.test(value);

// 只检查字符格式，不证明文本是人物姓名；调用方仍须检查叙事语义和栏目/占位标签。
export const isNpcNameFormatValid = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    const name = value.trim();
    if (hasNpcNamePollution(value) || Array.from(name).length < 2 || Array.from(name).length > 64) return false;
    return /\p{L}/u.test(name) && /^[\p{L}\p{M}]+(?:(?: +|[’'\-])[\p{L}\p{M}]+)*$/u.test(name.normalize('NFC'));
};

export const isMultilingualNpcName = (value: string): boolean => (
    isNpcNameFormatValid(value) && !/^[\p{Script=Han}\p{M}]+$/u.test(value.trim())
);

/**
 * 代称身份词 / 外观词：正文里用来临时指代某人的说法。
 * 单一事实源——`hooks/useGame/stateTransforms.ts` 的姓名占位判定也复用这两张表。
 */
export const NPC代称身份词列表 = [
    '掌事太监', '教引姑姑', '贴身侍卫', '带队侍卫', '随行护卫', '值守护卫', '掌事宫女',
    '女人', '女子', '姑娘', '少女', '男子', '男人', '少年', '老者', '老人', '孩童',
    '蒙面人', '黑衣人', '神秘人', '陌生人', '来人', '那人', '此人', '某人',
    '太监', '内侍', '宫女', '侍卫', '守卫', '护卫', '姑姑', '嬷嬷', '管事',
    '掌柜', '老板', '摊主', '店小二', '伙计', '车夫', '丫鬟', '仆妇', '小厮',
    '僧人', '和尚', '道士', '道姑', '杀手', '刺客', '捕快', '官差',
    '弟子', '门人', '同门', '师兄', '师姐', '师弟', '师妹', '随行者', '队友', '路人'
];
export const NPC代称外观词列表 = [
    '黑衣', '白衣', '青衣', '红衣', '灰衣', '紫衣', '锦衣', '素衣', '蓝衣',
    '蒙面', '遮面', '覆面', '戴斗笠', '斗笠', '面纱', '年轻', '年老', '中年',
    '高瘦', '矮胖', '清瘦', '魁梧', '冷面', '带刀', '执剑', '持伞', '红裙',
    '青衫', '白发', '陌生', '神秘', '无名'
];

/**
 * 是否为「代称式 NPC 称呼」（青衣女子 / 白衣少女 / 老掌柜 / 蒙面人 / 掌事太监）。
 *
 * 这类称呼可以入库（有档案就保留，见 `是否应丢弃NPC条目`），但它不是真名：
 * 后续正文揭示真名时必须允许原地 `set 社交[i].姓名 = "真名"`，否则角色会长期显示代称，
 * 或模型另 `push 社交` 建出重复档案。判定只认「身份词结尾」，避免误伤「女子学院」这类正式名称。
 */
export const 是代称式NPC称呼 = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    const name = value.trim().replace(/\s+/gu, '');
    if (!name || Array.from(name).length > 12) return false;
    const 命中身份词 = NPC代称身份词列表
        .filter((token) => name.includes(token))
        .filter((token) => !NPC代称身份词列表.some((other) => other !== token && other.includes(token)));
    if (命中身份词.length === 0) return false;
    return 命中身份词.some((token) => name.endsWith(token));
};


// 外文名需要字母边界，避免 Alex 命中 Alexander；中文保留正文连续书写的匹配方式。
export const textMentionsNpcName = (text: string, name: string): boolean => {
    const key = normalizeNpcNameKey(name);
    if (!key) return false;
    const source = normalizeNpcNameKey(text);
    if (!isMultilingualNpcName(name)) return source.includes(key);
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\p{Script=Han}|[^\\p{L}\\p{M}\\p{N}'’-])${escaped}(?=$|\\p{Script=Han}|[^\\p{L}\\p{M}\\p{N}'’-])`, 'u').test(source);
};
