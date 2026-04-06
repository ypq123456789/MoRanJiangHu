import React from 'react';

type IconProps = {
    className?: string;
    size?: number;
};

const defaults = (props: IconProps, defaultSize = 20) => ({
    className: props.className || '',
    width: props.size || defaultSize,
    height: props.size || defaultSize,
});

// ─── 武器与装备 ───

/** 双剑交叉（武侠风格） — 主武器 / 战斗 */
export const IconSwords: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            {/* 剑1 (底层) - 左上至右下 */}
            <path d="M6 6 L18 18" strokeOpacity={0.3} /> {/* 剑脊 */}
            <path d="M19 19 L21 21 M21 21 Q20 23 18 22" /> {/* 剑柄与剑穗 */}
            <path d="M17 21 L21 17" /> {/* 剑格 */}
            <path d="M18 18 L6 4 L3 3 L4 6 Z" fill="currentColor" fillOpacity="0.1" /> {/* 剑身 */}
            
            {/* 剑2 (顶层) - 左下至右上 */}
            <path d="M6 18 L18 6" /> {/* 剑脊 */}
            <path d="M5 19 L3 21 M3 21 Q4 23 6 22" /> {/* 剑柄与剑穗 */}
            <path d="M4 17 L8 21" /> {/* 剑格 */}
            <path d="M6 18 L18 4 L21 3 L20 6 Z" fill="currentColor" fillOpacity="0.15" /> {/* 剑身 */}
        </svg>
    );
};

/** 飞刀/飞镖（武侠暗器） — 暗器 */
export const IconDagger: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M5 19 L11 13 L21 3 L15 15 Z" fill="currentColor" fillOpacity="0.15" />
            <path d="M5 19 L21 3" strokeOpacity={0.4} />
            <circle cx="4" cy="20" r="1.5" />
            <path d="M3 21 Q1 23 4 24 Q5 22 4 21" />
            <path d="M16 6 L22 8 L18 12 M8 16 L12 18 L6 22" strokeOpacity={0.3} />
        </svg>
    );
};

/** 兽纹盾（武侠防御） — 副武器 / 防御 */
export const IconShield: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.1" />
            <circle cx="12" cy="12" r="6" strokeOpacity={0.5} strokeDasharray="2 3" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <path d="M9 10 Q12 12 15 10 M12 14v3 M8 15 Q12 18 16 15" strokeOpacity={0.6} />
        </svg>
    );
};

/** 铠甲/明光铠（武侠护甲） — 防具 */
export const IconArmor: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M7 4 L4 7 L4 14 C4 18 8 21 12 22 C16 21 20 18 20 14 L20 7 L17 4 Z" fill="currentColor" fillOpacity="0.05" />
            <circle cx="9" cy="11" r="2.5" fill="currentColor" fillOpacity="0.2" />
            <circle cx="15" cy="11" r="2.5" fill="currentColor" fillOpacity="0.2" />
            <path d="M7 16 L7 20 M12 16 L12 22 M17 16 L17 20 M8 4 L12 6 L16 4 M12 6 L12 9" strokeOpacity={0.5} />
        </svg>
    );
};

/** 包袱（武侠行囊） — 杂物 / 背部装备 */
export const IconBackpack: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M4 12 C4 6 8 3 12 3 C16 3 20 6 20 12 C20 18 17 21 12 21 C7 21 4 18 4 12 Z" fill="currentColor" fillOpacity="0.1" />
            <path d="M12 3 Q10 1 8 2 M12 3 Q14 1 16 2 M10 6 L14 6 L12 3 Z" />
            <path d="M7 10 Q12 15 17 10 M8 15 Q12 18 16 15 M12 6 L12 14" strokeOpacity={0.4} />
        </svg>
    );
};

/** 扳指/玉戒（武侠饰品） — 饰品 */
export const IconRing: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <ellipse cx="12" cy="12" rx="7" ry="5" />
            <path d="M5 12 V15 Q12 20 19 15 V12" fill="currentColor" fillOpacity="0.15" />
            <path d="M12 7 L14 5 L16 7 L14 9 Z" fill="currentColor" fillOpacity="0.3" />
            <path d="M10 16 Q12 17 14 16" strokeOpacity={0.5} />
        </svg>
    );
};

/** 束腰/玉佩（武侠腰带） — 腰部装备 */
export const IconBelt: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M2 10 Q12 12 22 10 V14 Q12 16 2 14 Z" fill="currentColor" fillOpacity="0.1" />
            <rect x="10" y="9" width="4" height="6" rx="1" />
            <path d="M12 15 L12 18 M11 18 h2 v2 h-2 z M12 20 L12 22 M11 22 L13 22" />
        </svg>
    );
};

// ─── 物品类型 ───

/** 葫芦/丹药瓶（武侠消耗品） — 消耗品 / 丹药 */
export const IconPotion: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M10 3 h4 v2 M11 5 Q14 7 14 9 Q14 11 12 12 C16 13 18 16 18 19 C18 22 12 23 12 23 C12 23 6 22 6 19 C6 16 8 13 12 12 Q10 11 10 9 Q10 7 13 5" fill="currentColor" fillOpacity="0.15" />
            <path d="M8 17 Q12 15 16 17" strokeOpacity={0.4} />
            <path d="M15 8 L17 7 L18 9" />
        </svg>
    );
};

/** 灵石/玉石（武侠材料） */
export const IconGem: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M12 2 L18 7 L16 17 L12 22 L8 17 L6 7 Z" fill="currentColor" fillOpacity="0.15" />
            <path d="M12 2 L12 22 M6 7 L12 11 L18 7 M8 17 L12 11 L16 17 M18 4 L20 2 M4 4 L6 6 M20 20 L18 18" strokeOpacity={0.5} />
        </svg>
    );
};

/** 骏马（武侠坐骑） — 坐骑 */
export const IconHorse: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M10 4 L12 2 L16 4 Q19 7 21 11 L18 14 L15 11 L14 15 L9 15 L7 18 L4 18 Q5 14 7 11 L8 6 L10 5" fill="currentColor" fillOpacity="0.1" />
            <path d="M12 2 C13 4 12 6 10 8 M14 3 C15 5 13 8 11 10" strokeOpacity={0.5} />
            <circle cx="15" cy="6" r="1" fill="currentColor" />
        </svg>
    );
};

/** 食盒/热食（武侠食物） */
export const IconFood: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <ellipse cx="12" cy="17" rx="8" ry="3" />
            <path d="M4 17 V20 Q12 22 20 20 V17" />
            <path d="M6 16 C6 10 18 10 18 16" fill="currentColor" fillOpacity="0.15" />
            <path d="M9 12 Q12 10 15 12 M10 7 Q11 5 10 3 M14 8 Q15 6 14 4 M12 6 C13 4 11 3 12 1" strokeOpacity={0.5} />
        </svg>
    );
};

// ─── 通用 UI ───

/** 竹简/古卷（武侠剧情/功法） — 剧情 / 史册 / 功法 */
export const IconScroll: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M6 4 L18 4 M6 20 L18 20" />
            <rect x="7" y="4" width="2" height="16" fill="currentColor" fillOpacity="0.1" />
            <rect x="11" y="4" width="2" height="16" fill="currentColor" fillOpacity="0.1" />
            <rect x="15" y="4" width="2" height="16" fill="currentColor" fillOpacity="0.1" />
            <path d="M5 8 H19 M5 16 H19" strokeOpacity={0.5} />
            <circle cx="5" cy="4" r="1.5" />
            <circle cx="19" cy="4" r="1.5" />
            <circle cx="5" cy="20" r="1.5" />
            <circle cx="19" cy="20" r="1.5" />
        </svg>
    );
};

/** 八卦定位（武侠目标） — 任务目标 */
export const IconTarget: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <circle cx="12" cy="12" r="8" fill="currentColor" fillOpacity="0.05" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2 V8 M12 16 V22 M2 12 H8 M16 12 H22" />
            <path d="M5 5 L8 8 M19 19 L16 16 M19 5 L16 8 M5 19 L8 16" strokeOpacity={0.5} />
        </svg>
    );
};

/** 铜钱/银两（武侠金钱） — 奖励 / 金钱 */
export const IconCoins: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <circle cx="10" cy="14" r="7" fill="currentColor" fillOpacity="0.1" />
            <rect x="8.5" y="12.5" width="3" height="3" />
            <path d="M14 8.5 A7 7 0 0 1 15.5 18" strokeOpacity={0.5} />
            <path d="M17 5 A7 7 0 0 1 19 15" strokeOpacity={0.3} />
            <path d="M10 5 L12 3 M4 14 L2 14" strokeOpacity={0.4} />
        </svg>
    );
};

/** 惊雷/风云（武侠事件） — 风云 / 事件 */
export const IconBolt: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M8 10 Q5 10 5 7 Q5 4 8 4 Q10 4 11 6 Q14 5 15 7 Q18 7 18 10 Q18 12 15 12 H8 Z" fill="currentColor" fillOpacity="0.1" strokeOpacity={0.5} />
            <path d="M13 10 L8 16 H14 L11 22 L20 12 H14 L16 10 Z" fill="currentColor" fillOpacity="0.2" />
        </svg>
    );
};

/** 傩面/鬼面（武侠剧情） — 剧情 / 群像 */
export const IconMask: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M5 8 Q12 2 19 8 C19 16 16 22 12 22 C8 22 5 16 5 8 Z" fill="currentColor" fillOpacity="0.1" />
            <path d="M7 10 L10 11 L10 13 Z" fill="currentColor" />
            <path d="M17 10 L14 11 L14 13 Z" fill="currentColor" />
            <path d="M12 15 L12 18 M10 18 H14" strokeOpacity={0.8} />
            <path d="M9 5 Q12 4 15 5" strokeOpacity={0.5} />
        </svg>
    );
};

/** 天眼/洞察（武侠观察） — 洞察 / 观察 */
export const IconEye: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M2 13 C5 8 9 5 12 5 C15 5 19 8 22 13 C19 18 15 21 12 21 C9 21 5 18 2 13 Z" fill="currentColor" fillOpacity="0.1" />
            <circle cx="12" cy="13" r="4" fill="currentColor" fillOpacity="0.2" />
            <circle cx="12" cy="13" r="1.5" fill="currentColor" />
            <path d="M12 5 V2 M18 7 L20 4 M6 7 L4 4" strokeOpacity={0.5} />
        </svg>
    );
};

/** 莲心（武侠好感） — NSFW / 好感 */
export const IconHeart: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M12 20.5 l-8.5-8.5 a5.5 5.5 0 0 1 7.78-7.78 L12 5.5 l.72-1.28 A5.5 5.5 0 0 1 20.5 12 Z" fill="currentColor" fillOpacity="0.15" />
            <path d="M12 15 Q14 12 16 11 M7 11 C8 9 9 9 10 11" strokeOpacity={0.5} />
        </svg>
    );
};

/** 气海/真气（武侠消耗） — 反馈 / 能量消耗 */
export const IconBattery: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <circle cx="12" cy="12" r="8" fill="currentColor" fillOpacity="0.15" />
            <path d="M12 22 A10 10 0 1 1 22 12" strokeDasharray="3 4" />
            <path d="M12 6 C16 9 8 15 12 18" />
            <path d="M4 12 H7 M17 12 H20 M12 4 V7 M12 17 V20" strokeOpacity={0.4} />
        </svg>
    );
};

/** 罗盘/风水（武侠罗盘） — 态势 */
export const IconCompass: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.05" />
            <circle cx="12" cy="12" r="7" />
            <polygon points="12 4 14 12 12 20 10 12" fill="currentColor" fillOpacity="0.2" />
            <path d="M12 2 V4 M12 20 V22 M2 12 H4 M20 12 H22 L 5 5 L 6.5 6.5 M 17.5 17.5 L 19 19 M 19 5 L 17.5 6.5 M 6.5 17.5 L 5 19" strokeOpacity={0.5} />
        </svg>
    );
};

/** 气爆/火石（武侠接战） — 战斗 / 攻击 / 爆炸 */
export const IconExplosion: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M12 2 L14 9 L21 8 L16 13 L20 20 L13 16 L8 22 L10 14 L3 11 L10 8 Z" fill="currentColor" fillOpacity="0.2" />
            <circle cx="5" cy="5" r="1" />
            <circle cx="20" cy="4" r="1" />
            <circle cx="4" cy="18" r="1" />
        </svg>
    );
};

/** 骨盅/古骰（武侠骰子） — 通用判定 */
export const IconDice: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M21 16 L12 22 L3 16 V8 L12 2 L21 8 Z" fill="currentColor" fillOpacity="0.1" />
            <path d="M12 2 L12 11 Z M3 8 L12 11 M21 8 L12 11 M12 22 L12 11" strokeOpacity={0.6} />
            <circle cx="8" cy="15" r="1" fill="currentColor" />
            <circle cx="16" cy="15" r="1" fill="currentColor" />
            <circle cx="12" cy="7" r="1" fill="currentColor" />
        </svg>
    );
};

/** 佛珠/结绳（武侠社交） — 社交 / 关系 */
export const IconBeads: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <circle cx="12" cy="12" r="8" strokeOpacity={0.4} />
            <circle cx="12" cy="4" r="2.5" fill="currentColor" />
            <circle cx="17.6" cy="6.3" r="1.5" />
            <circle cx="20" cy="12" r="1.5" />
            <circle cx="17.6" cy="17.7" r="1.5" />
            <circle cx="12" cy="20" r="1.5" />
            <circle cx="6.4" cy="17.7" r="1.5" />
            <circle cx="4" cy="12" r="1.5" />
            <circle cx="6.4" cy="6.3" r="1.5" />
            <path d="M12 22 L10 24 H14 Z" />
        </svg>
    );
};

/** 蛊毒/瘴气（武侠危险） — 毒性 / 危险 / 骷髅 */
export const IconSkull: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M16 19 H8 V15 Q5 14 5 9 A7 7 0 0 1 19 9 Q19 14 16 15 V19 Z" fill="currentColor" fillOpacity="0.1" />
            <circle cx="9" cy="11" r="2" fill="currentColor" />
            <circle cx="15" cy="11" r="2" fill="currentColor" />
            <path d="M12 14 V16 M10 19 V21 M14 19 V21 M3 16 Q2 13 4 11 M21 16 Q22 13 20 11 M8 4 C10 1 14 1 16 4" strokeOpacity={0.4} />
        </svg>
    );
};

/** 仙山/绝巘（武侠山岳） — 场景 / 风景 */
export const IconMountain: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M8 4 L2 20 H22 Z" fill="currentColor" fillOpacity="0.1" />
            <path d="M16 10 L10 20 H22 Z" fill="currentColor" fillOpacity="0.2" />
            <path d="M8 4 L12 12 M16 10 L18 15 M1 16 Q3 14 5 16 T9 16 T13 16" strokeOpacity={0.5} />
        </svg>
    );
};

/** 古琴/箫管（武侠音乐） — 音乐 */
export const IconMusic: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M3 21 L19 5 C20 4 21 5 20 6 L4 22 Z" fill="currentColor" fillOpacity="0.15" />
            <path d="M6 16 L8 18 M10 12 L12 14 M14 8 L16 10 M15 4 Q17 2 20 4 T22 9" strokeOpacity={0.5} />
            <circle cx="22" cy="9" r="0.5" fill="currentColor" />
        </svg>
    );
};

/** 战盔/冠纶（武侠头盔） — 头部装备 */
export const IconHelmet: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M5 13 V9 A7 7 0 0 1 19 9 V13 A2 2 0 0 0 21 15 H3 A2 2 0 0 0 5 13 Z" fill="currentColor" fillOpacity="0.1" />
            <path d="M12 2 L12 4 M10 4 H14 M12 6 V10 M8 17 V20 M16 17 V20 M5 13 Q12 16 19 13" strokeOpacity={0.6} />
        </svg>
    );
};

/** 云头靴（武侠靴子） — 足部装备 */
export const IconBoot: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M6 4 H15 V12 L18 15 C20 17 20 20 18 20 H6 V4 Z" fill="currentColor" fillOpacity="0.1" />
            <path d="M5 7 H16 M18 20 C18 18 15 18 15 20 M10 12 L12 14" strokeOpacity={0.5} />
        </svg>
    );
};

/** 武服袴（武侠裤子） — 腿部装备 */
export const IconPants: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M6 3 L18 3 L20 18 L14 18 L12 12 L10 18 L4 18 Z" fill="currentColor" fillOpacity="0.1" />
            <path d="M5 6 H19 M7 12 V16 M17 12 V16" strokeOpacity={0.5} />
        </svg>
    );
};

/** 护腕（武侠手套） — 手腕/手部装备 */
export const IconGlove: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M7 6 A2 2 0 0 1 17 6 V14 L19 18 H5 L7 14 Z" fill="currentColor" fillOpacity="0.15" />
            <path d="M7 6 L7 10 M17 6 L17 10 M12 6 V10 M5 18 L19 18 M7 14 H17" strokeOpacity={0.5} />
        </svg>
    );
};

/** 群侠/双人（武侠群像） — 队伍 / 人物 */
export const IconUsers: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M2 13 L8 11 L14 13 M4 21 V16 Q8 14 12 16 V21" fill="currentColor" fillOpacity="0.1" />
            <circle cx="16" cy="8" r="3" />
            <path d="M12 21 V18 Q16 15 20 18 V21 M6 8 L3 4 M19 11 L22 8" strokeOpacity={0.5} />
        </svg>
    );
};

/** 乾罡/纯阳（武侠男性） — 男性档案 / 猛烈 */
export const IconMars: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <circle cx="9" cy="15" r="5" fill="currentColor" fillOpacity="0.1" />
            <path d="M13 11 L20 4 M16 4 H20 V8 M8 15 Q9 15 9 16 M20 4 L17 7" strokeOpacity={0.8} />
        </svg>
    );
};

/** 留影盒/法宝（武侠相机） — 相机 / 图片 */
export const IconCamera: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M4 8 L6 5 H18 L20 8 M4 8 V19 H20 V8 Z" fill="currentColor" fillOpacity="0.1" />
            <circle cx="12" cy="13.5" r="3.5" />
            <circle cx="12" cy="13.5" r="1.5" fill="currentColor" fillOpacity="0.5" />
            <path d="M7 11 H9 M15 11 H17" strokeOpacity={0.4} />
        </svg>
    );
};

/** 昆仑宝镜（武侠镜子） — 镜面 / 映照 / 女主规划 */
export const IconMirror: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <circle cx="12" cy="10" r="7" fill="currentColor" fillOpacity="0.1" />
            <circle cx="12" cy="10" r="5" strokeOpacity={0.4} />
            <path d="M10 17 L8 22 H16 L14 17 M9 7 L13 11 M14 8 L15 9" strokeOpacity={0.5} />
        </svg>
    );
};

/** 抱拳礼（武侠礼节） — 握手 / 协议 / 约定 */
export const IconHandshake: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M7 13 C7 9 11 8 13 10 L16 13 M10 19 L13 16 C15 14 18 16 16 20 Z" fill="currentColor" fillOpacity="0.1" />
            <path d="M7 13 L10 19 M16 13 L16 20 M14 11 Q12 14 9 13" strokeOpacity={0.5} />
            <circle cx="16" cy="15" r="2" />
        </svg>
    );
};

/** 令旗/标记（武侠地图针） — 地图针 / 地点 */
export const IconMapPin: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M10 22 L10 4 L20 6 L12 12 L10 10" fill="currentColor" fillOpacity="0.1" />
            <path d="M8 2 H12 M13 7 L17 8" strokeOpacity={0.5} />
            <circle cx="10" cy="22" r="1.5" />
        </svg>
    );
};

/** 日晷/星象盘（武侠日历） — 日历 / 时间 */
export const IconCalendar: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <ellipse cx="12" cy="14" rx="9" ry="5" fill="currentColor" fillOpacity="0.05" />
            <path d="M12 14 L12 4 L15 14" fill="currentColor" fillOpacity="0.2" />
            <path d="M6 13 L8 14 M18 13 L16 14 M12 16 V18" strokeOpacity={0.4} />
            <path d="M3 8 Q8 2 15 4" strokeDasharray="2 3" />
        </svg>
    );
};

/** 剑光星芒（武侠特效） — 闪星 / 机缘 */
export const IconSparkles: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <path d="M12 2 L13.5 10.5 L22 12 L13.5 13.5 L12 22 L10.5 13.5 L2 12 L10.5 10.5 Z" fill="currentColor" fillOpacity="0.2" />
            <path d="M18 4 L18.5 6.5 L21 7 L18.5 7.5 L18 10 L17.5 7.5 L15 7 L17.5 6.5 Z M6 17 L6.5 18.5 L8 19 L6.5 19.5 L6 21 L5.5 19.5 L4 19 L5.5 18.5 Z" />
        </svg>
    );
};

/** 古锁/鲁班锁（武侠锁） — 锁头 / 锁定 / 限制 */
export const IconLock: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <rect x="5" y="11" width="14" height="8" rx="1" fill="currentColor" fillOpacity="0.1" />
            <path d="M7 11 V7 A5 5 0 0 1 17 7 V11 M12 14 V16 M10 15 H14" />
            <path d="M7 13 L7 17 M17 13 L17 17" strokeOpacity={0.4} />
        </svg>
    );
};

/** 太极（武侠阴阳） — 阴阳 / 修行 / 平衡 */
export const IconYinYang: React.FC<IconProps> = (props) => {
    const { className, width, height } = defaults(props);
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={width} height={height} className={className}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2 A 5 5 0 0 1 12 12 A 5 5 0 0 0 12 22 A 10 10 0 0 0 12 2 Z" fill="currentColor" fillOpacity="0.2" />
            <circle cx="12" cy="7" r="1.5" fill="#fff" strokeOpacity="0.8" />
            <circle cx="12" cy="17" r="1.5" fill="currentColor" />
            <path d="M4 8 Q1 12 4 16 M20 8 Q23 12 20 16" strokeOpacity={0.3} />
        </svg>
    );
};

// ─── 物品类型辅助映射 ───

/** 根据物品类型返回对应的 SVG 图标组件 */
export const ItemTypeIcon: React.FC<{ type: string } & IconProps> = ({ type, ...rest }) => {
    switch (type) {
        case '武器': return <IconSwords {...rest} />;
        case '防具': return <IconArmor {...rest} />;
        case '饰品': return <IconRing {...rest} />;
        case '消耗品': return <IconPotion {...rest} />;
        case '丹药': return <IconPotion {...rest} />;
        case '材料': return <IconGem {...rest} />;
        case '坐骑': return <IconHorse {...rest} />;
        case '暗器': return <IconDagger {...rest} />;
        case '食物': return <IconFood {...rest} />;
        case '秘籍': return <IconScroll {...rest} />;
        case '杂物': return <IconBackpack {...rest} />;
        case '杂项': return <IconBackpack {...rest} />;
        case '药材': return <IconPotion {...rest} />;
        case '矿石': return <IconGem {...rest} />;
        case '卷轴': return <IconScroll {...rest} />;
        case '任务': return <IconTarget {...rest} />;
        default: return <IconBackpack {...rest} />;
    }
};
