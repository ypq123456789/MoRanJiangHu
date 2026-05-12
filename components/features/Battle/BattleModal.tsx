import React from 'react';
import { NPC结构, 角色数据结构, 战斗状态结构 } from '../../../types';
import { IconSwords, IconYinYang } from '../../ui/Icons';
import { 生成战斗可视化数据, 逻辑判断知识库 } from '../../../utils/rulebook';
import { 计算角色总气血 } from '../../../utils/characterVitals';
import BattleRoundAnimation from './BattleRoundAnimation';

interface Props {
    character: 角色数据结构;
    battle: 战斗状态结构;
    teammates?: NPC结构[];
    contextText?: string;
    onClose: () => void;
}

type 扩展敌方 = 战斗状态结构['敌方'][number] & {
    当前内力?: number;
    最大内力?: number;
};

type 战场单位 = {
    id: string;
    side: 'ally' | 'enemy';
    名称: string;
    境界: string;
    x: number;
    y: number;
    height: number;
    row: '前排' | '后排';
    攻势: number;
    近战伤害: number;
    远程物理伤害: number;
    法术伤害: number;
    近战守势: number;
    远程物理守势: number;
    法术守势: number;
    身法: number;
    续航: number;
    掩体: number;
    毒性影响: number;
    技能文本: string;
};

const 资源条: React.FC<{
    label: string;
    current: number;
    max: number;
    tone: 'red' | 'cyan' | 'indigo';
    icon?: React.ReactNode;
}> = ({ label, current, max, tone: _tone, icon }) => {
    const safeMax = Math.max(1, Number(max) || 0);
    const safeCur = Math.max(0, Number(current) || 0);
    const pct = Math.max(0, Math.min(100, (safeCur / safeMax) * 100));
    const fillClass = 'bg-gradient-to-r from-wuxia-gold/70 via-wuxia-gold to-wuxia-gold/80 shadow-[0_0_10px_rgba(212,175,55,0.45)]';

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-wuxia-gold/80 font-serif tracking-widest">
                    {icon && <span className="opacity-80">{icon}</span>}
                    {label}
                </div>
                <span className="font-mono text-gray-200">{safeCur} <span className="text-gray-500">/</span> {safeMax}</span>
            </div>
            <div className="h-2 rounded-full border border-white/5 bg-black/60 overflow-hidden shadow-inner">
                <div className={`h-full ${fillClass} transition-all duration-500 ease-out`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

const 取数 = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const 取文本 = (value: unknown, fallback = '') => (
    typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const hashText = (value: string) => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash;
};

const 读取装备防护 = (unit: any) => {
    const items = Array.isArray(unit?.物品列表) ? unit.物品列表 : [];
    return items.filter((item: any) => item?.当前装备部位).reduce((acc, item: any) => {
        const durabilityMax = Math.max(1, 取数(item?.最大耐久, 100));
        const durabilityRatio = item?.最大耐久 === 0 ? 1 : clamp(取数(item?.当前耐久, durabilityMax) / durabilityMax, 0.15, 1);
        acc.物理 += 取数(item?.物理防御) * durabilityRatio;
        acc.法术 += 取数(item?.内功防御) * durabilityRatio;
        if (/盾|甲|铠|护/.test(`${item?.名称 || ''}${item?.描述 || ''}`)) acc.掩体 += 6 * durabilityRatio;
        if (/格挡|招架/.test(`${item?.名称 || ''}${item?.描述 || ''}`)) acc.近战 += 4 * durabilityRatio;
        return acc;
    }, { 物理: 0, 法术: 0, 掩体: 0, 近战: 0 });
};

const 读取毒性影响 = (unit: any) => {
    const source = `${unit?.状态 || ''} ${unit?.异常状态 || ''} ${unit?.简介 || ''} ${Array.isArray(unit?.技能) ? unit.技能.join(' ') : ''}`;
    const poisonText = /毒|中毒|淬毒|麻痹|致盲|腐蚀|毒雾|毒粉/.test(source);
    const explicit = 取数(unit?.毒性影响 ?? unit?.中毒层数 ?? unit?.毒伤);
    return clamp(explicit || (poisonText ? 8 : 0), 0, 30);
};

const 读取技能文本 = (unit: any) => `${Array.isArray(unit?.技能) ? unit.技能.join(' ') : ''} ${unit?.简介 || ''} ${unit?.身份 || ''}`;

const 读取法术基准 = (unit: any, baseMagic: number) => {
    const actionText = `${unit?.本回合行动 || ''} ${unit?.当前行动 || ''} ${unit?.正在施展 || ''} ${unit?.使用技能 || ''} ${unit?.使用法术 || ''}`;
    const kungfuList = Array.isArray(unit?.功法列表) ? unit.功法列表 : [];
    const spells = kungfuList.filter((skill: any) => {
        const text = `${skill?.名称 || ''} ${skill?.描述 || ''} ${skill?.类型 || ''} ${skill?.伤害类型 || ''} ${skill?.目标类型 || ''}`;
        return /法术|术法|咒|符|雷|火|冰|风|毒雾|神魂|精神|内功|AOE|范围|全体|扇形/.test(text)
            && 取数(skill?.基础伤害) > 0;
    });
    const currentSpell = spells.find((skill: any) => actionText && actionText.includes(`${skill?.名称 || ''}`.trim()));
    const selected = currentSpell || spells.reduce((best: any | null, skill: any) => {
        const score = 取数(skill?.基础伤害) + 取数(skill?.内力系数) * Math.max(1, 取数(unit?.当前内力)) + 取数(skill?.加成系数) * 10;
        const bestScore = best ? 取数(best?.基础伤害) + 取数(best?.内力系数) * Math.max(1, 取数(unit?.当前内力)) + 取数(best?.加成系数) * 10 : -1;
        return score > bestScore ? skill : best;
    }, null);
    if (!selected) return { 伤害: Math.max(1, Math.round(baseMagic)), 名称: '', 系数: 1 };
    const statBonus = 取数(unit?.[selected.加成属性], 取数(unit?.悟性, 0)) * 取数(selected?.加成系数);
    const innerBonus = Math.max(0, 取数(unit?.当前内力)) * 取数(selected?.内力系数);
    return {
        伤害: Math.max(1, Math.round(取数(selected?.基础伤害) + statBonus + innerBonus + baseMagic * 0.35)),
        名称: `${selected?.名称 || ''}`,
        系数: 1,
    };
};

const 计算战斗指标 = (unit: any, fallbackAttack = 0, fallbackDefense = 0) => {
    const hpRatio = clamp(取数(unit?.当前血量 ?? unit?.当前气血, 1) / Math.max(1, 取数(unit?.最大血量 ?? unit?.最大气血, 1)), 0, 1);
    const spRatio = clamp(取数(unit?.当前精力, 1) / Math.max(1, 取数(unit?.最大精力, 1)), 0, 1);
    const baseAttack = 取数(unit?.攻击力 ?? unit?.战斗力, fallbackAttack);
    const baseDefense = 取数(unit?.防御力, fallbackDefense);
    const agility = 取数(unit?.敏捷, Math.round(baseAttack * 0.35 + spRatio * 12));
    const physique = 取数(unit?.体质);
    const root = 取数(unit?.根骨);
    const inner = 取数(unit?.当前内力);
    const equip = 读取装备防护(unit);
    const skillText = 读取技能文本(unit);
    const realm = Math.max(1, 取数(unit?.境界层级, 1));
    const poison = 读取毒性影响(unit);
    const 攻势 = Math.max(1, Math.round(baseAttack + 取数(unit?.力量) * 1.2 + inner * 0.08 + realm * 3 + spRatio * 10 - poison * 0.35));
    const 身法 = Math.max(1, Math.round(agility * 1.2 + spRatio * 16 - poison * 0.45));
    const 近战守势 = Math.max(0, Math.round(baseDefense + physique * 0.7 + root * 0.5 + equip.物理 * 0.9 + equip.近战 + hpRatio * 8 - poison * 0.25));
    const 远程物理守势 = Math.max(0, Math.round(baseDefense * 0.85 + physique * 0.45 + equip.物理 * 0.75 + equip.掩体 + hpRatio * 6 - poison * 0.2));
    const 法术守势 = Math.max(0, Math.round(root * 0.9 + inner * 0.08 + equip.法术 + realm * 2 + hpRatio * 5 - poison * 0.15));
    const remoteFactor = /弓|弩|暗器|飞刀|飞剑|远程|投掷|箭/.test(skillText) ? 0.9 : 0.55;
    const spellFactor = /法术|术法|咒|符|雷|火|冰|风|毒雾|神魂|精神|内功|AOE|范围/.test(skillText) ? 0.95 : 0.42;
    const 法术基准 = 读取法术基准(unit, (攻势 + inner * 0.12) * spellFactor);
    return {
        攻势,
        近战伤害: 攻势,
        远程物理伤害: Math.max(1, Math.round(攻势 * remoteFactor)),
        法术伤害: 法术基准.伤害,
        近战守势,
        远程物理守势,
        法术守势,
        守势: Math.round((近战守势 + 远程物理守势 + 法术守势) / 3),
        身法,
        续航: Math.round(hpRatio * 45 + spRatio * 45 + Math.min(10, inner / 10) - poison * 0.25),
        掩体: Math.round(equip.掩体),
        毒性影响: poison,
        技能文本: 法术基准.名称 ? `${skillText} ${法术基准.名称}` : skillText,
    };
};

const 计算NPC战斗指标 = (unit: any) => {
    return 计算战斗指标(unit, 取数(unit?.战斗力), 取数(unit?.防御力));
};

const 指标说明 = {
    攻势: '每回合可形成的伤害压力；近战看贴身输出，远程看暗器、弓弩、飞剑等可越位输出。',
    守势: '拆分为近战物理、远程物理、法术守势；远程物理守势会吃掩体加成，法术守势主要看内力、根骨和内功防御。',
    身法: '身法是一回合最大移动预算；水平移动消耗距离，上坡额外消耗，下坡降低消耗，行动可夹在移动中。',
    续航: '持续作战能力，由气血余量、精力余量、内力余量和消耗压力综合估算；低续航代表容易失速、被迫防守或撤退。',
    目标: '本回合默认攻击目标。越过前排直打后排时，会比较身法差、距离和前排借机攻击风险。'
};

const 单位属性说明: Record<string, string> = {
    气血: '气血：当前承伤余量，低气血会降低续航并提高失能风险。',
    精力: '精力：影响身法、行动频率与攻势修正，精力低会更容易失速。',
    内力: '内力：影响法术伤害、法术守势与部分内功消耗。',
    力: '力量：影响攻势、近战伤害、破防压力与携带重物能力。',
    敏: '敏捷：影响身法、移动预算、闪避、突进和远程节奏。',
    体: '体质：影响气血承受、物理守势与持续作战稳定性。',
    根: '根骨：影响法术守势、内力承载、抗性与内功根基。',
    境层: '境界层级：按境界折算的战斗修正，会影响攻势、守势与法术抗压。',
    掩体: '掩体：来自地形、盾甲或遮挡，主要提高远程物理守势。',
    毒: '毒性影响：中毒、麻痹、腐蚀等负面影响，会压低攻势、守势、身法和续航。',
};

const 战斗指标条: React.FC<{ label: keyof typeof 指标说明; value: React.ReactNode; tone?: string }> = ({ label, value, tone = 'text-gray-100' }) => (
    <div title={指标说明[label]} className="rounded border border-white/10 bg-black/30 px-2 py-1">
        <div className="text-[9px] tracking-[0.18em] text-gray-500">{label}</div>
        <div className={`mt-0.5 font-mono text-sm ${tone}`}>{value}</div>
    </div>
);

const 全境界速查 = '凡人/普通人/未入境；开脉一至四重；聚息一至四重；归元一至四重；御劲一至四重；化罡一至四重；通玄初期/中期/圆满；神照境；返真境；天人境';

const 构建战场单位 = (
    params: {
        unit: any;
        side: 'ally' | 'enemy';
        index: number;
        total: number;
        name: string;
        realm: string;
        metrics: ReturnType<typeof 计算战斗指标>;
        contextText: string;
    }
): 战场单位 => {
    const { unit, side, index, total, name, realm, metrics, contextText } = params;
    const key = `${side}-${name}-${index}`;
    const hash = hashText(key);
    const step = total <= 1 ? 0 : index / Math.max(1, total - 1);
    const baseX = side === 'ally'
        ? 10 + step * 24
        : 90 - step * 24;
    const ySpread = ((hash % 21) - 10) / 10;
    const terrainBias = /高处|坡|崖|台|楼|墙|屋脊/.test(contextText) ? 1.2 : /水|泥|谷|坑|低洼/.test(contextText) ? -0.8 : 0;
    const height = clamp(取数(unit?.高度 ?? unit?.地势高度, terrainBias + ((hash >> 4) % 7 - 3) * 0.45), -3, 5);
    const x = clamp(Math.round(baseX + (((hash >> 8) % 9) - 4)), 4, 96);
    const y = clamp(Math.round(ySpread * 10 + height * 2), -24, 24);
    return {
        id: key,
        side,
        名称: name,
        境界: realm,
        x,
        y,
        height,
        row: '前排',
        攻势: metrics.攻势,
        近战伤害: metrics.近战伤害,
        远程物理伤害: metrics.远程物理伤害,
        法术伤害: metrics.法术伤害,
        近战守势: metrics.近战守势,
        远程物理守势: metrics.远程物理守势,
        法术守势: metrics.法术守势,
        身法: metrics.身法,
        续航: metrics.续航,
        掩体: metrics.掩体,
        毒性影响: metrics.毒性影响,
        技能文本: metrics.技能文本,
    };
};

const 自动划分前后排 = (units: 战场单位[]) => {
    const allies = units.filter((unit) => unit.side === 'ally');
    const enemies = units.filter((unit) => unit.side === 'enemy');
    const allyFrontX = allies.length ? Math.max(...allies.map((unit) => unit.x)) : 0;
    const enemyFrontX = enemies.length ? Math.min(...enemies.map((unit) => unit.x)) : 100;
    return units.map((unit) => {
        const frontLine = unit.side === 'ally' ? allyFrontX : enemyFrontX;
        const distanceToFront = Math.abs(unit.x - frontLine);
        return { ...unit, row: distanceToFront <= 7 ? '前排' : '后排' };
    });
};

const 计算两点距离 = (a: 战场单位, b: 战场单位) => Math.hypot(a.x - b.x, a.y - b.y);

const 计算高度修正 = (attacker: 战场单位, target: 战场单位) => {
    const diff = attacker.height - target.height;
    return {
        高度差: diff,
        远程倍率: clamp(1 + Math.max(0, diff) * 0.18 - Math.max(0, -diff) * 0.08, 0.65, 1.9),
        近战倍率: clamp(1 + Math.max(0, diff) * 0.06 - Math.max(0, -diff) * 0.04, 0.78, 1.35),
    };
};

const 资源数字 = (current: unknown, max: unknown) => {
    const 当前 = Math.max(0, 取数(current));
    const 上限 = Math.max(当前, 取数(max));
    return `${当前}/${上限}`;
};

const 战斗单位详情卡: React.FC<{
    unit: any;
    name: string;
    realm: string;
    row: '前排' | '后排';
    side: 'ally' | 'enemy';
    metrics: ReturnType<typeof 计算战斗指标>;
    targetName: string;
    emphasized?: boolean;
}> = ({ unit, name, realm, row, side, metrics, targetName, emphasized = false }) => {
    const isEnemy = side === 'enemy';
    const borderClass = isEnemy
        ? 'border-red-400/15 bg-black/30'
        : emphasized
            ? 'border-emerald-400/20 bg-black/35'
            : 'border-emerald-400/15 bg-black/30';
    const nameClass = isEnemy
        ? 'text-red-100'
        : emphasized
            ? 'text-wuxia-gold'
            : 'text-emerald-100';
    const rowClass = isEnemy ? 'text-red-200/70' : 'text-emerald-200/70';
    const targetClass = isEnemy
        ? 'border-red-500/25 bg-red-950/20 text-red-100'
        : 'border-wuxia-gold/20 bg-wuxia-gold/10 text-wuxia-gold';
    const hpCurrent = unit?.当前血量 ?? unit?.当前气血;
    const hpMax = unit?.最大血量 ?? unit?.最大气血;
    const statItems: Array<[string, number]> = [
        ['力', 取数(unit?.力量)],
        ['敏', 取数(unit?.敏捷)],
        ['体', 取数(unit?.体质)],
        ['根', 取数(unit?.根骨)],
        ['境层', Math.max(1, 取数(unit?.境界层级, 1))],
        ['掩体', metrics.掩体],
        ['毒', metrics.毒性影响],
    ];

    return (
        <div className={`rounded-lg border p-3 ${borderClass}`}>
            <div className="flex items-center justify-between gap-3">
                <div className={`font-serif ${emphasized ? 'text-base' : 'text-sm'} font-bold ${nameClass}`}>
                    {name}
                    <span className={`ml-2 text-[10px] ${rowClass}`}>{row}</span>
                </div>
                <div className="text-[10px] text-gray-500">{realm || '未明'}</div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div title={单位属性说明.气血} className="cursor-help rounded border border-red-500/20 bg-red-950/20 px-2 py-1 text-red-100">气血 <b>{资源数字(hpCurrent, hpMax)}</b></div>
                <div title={单位属性说明.精力} className="cursor-help rounded border border-cyan-500/20 bg-cyan-950/20 px-2 py-1 text-cyan-100">精力 <b>{资源数字(unit?.当前精力, unit?.最大精力)}</b></div>
                <div title={单位属性说明.内力} className="cursor-help rounded border border-indigo-500/20 bg-indigo-950/20 px-2 py-1 text-indigo-100">内力 <b>{资源数字(unit?.当前内力, unit?.最大内力)}</b></div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-gray-200">
                {statItems.map(([label, value]) => (
                    <div key={label} title={单位属性说明[label] || ''} className="cursor-help rounded border border-white/10 bg-black/25 px-2 py-1">
                        {label} <b className="font-mono text-gray-100">{value}</b>
                    </div>
                ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <战斗指标条 label="攻势" value={`近${metrics.近战伤害} 远${metrics.远程物理伤害} 法${metrics.法术伤害}`} tone="text-red-100" />
                <战斗指标条 label="守势" value={`近${metrics.近战守势} 远${metrics.远程物理守势} 法${metrics.法术守势}`} tone="text-sky-100" />
                <战斗指标条 label="身法" value={metrics.身法} tone="text-emerald-100" />
                <战斗指标条 label="续航" value={metrics.续航} tone="text-amber-100" />
                <div title={指标说明.目标} className={`col-span-2 rounded border px-2 py-1 ${targetClass}`}>目标：{targetName || '无'}</div>
            </div>
        </div>
    );
};

const BattleModal: React.FC<Props> = ({ character, battle, teammates = [], contextText = '', onClose }) => {
    const 敌方列表 = (Array.isArray(battle?.敌方) ? battle.敌方 : []) as 扩展敌方[];
    const 队友列表 = React.useMemo(() => (Array.isArray(teammates) ? teammates : []).filter((npc) => npc?.是否队友 === true), [teammates]);
    const 存活敌人数 = 敌方列表.filter((enemy) => (enemy?.当前血量 || 0) > 0).length;
    const 可视化 = 生成战斗可视化数据(character, battle, contextText);
    const 主角总气血 = React.useMemo(() => 计算角色总气血(character), [character]);

    const 部位列表 = [
        ['头部', character.头部当前血量, character.头部最大血量, character.头部状态],
        ['胸腹', character.胸部当前血量, character.胸部最大血量, character.胸部状态], // 简化合并展示，腹部胸部通常相关联，这里按原数据展示
        ['腹部', character.腹部当前血量, character.腹部最大血量, character.腹部状态],
        ['左手', character.左手当前血量, character.左手最大血量, character.左手状态],
        ['右手', character.右手当前血量, character.右手最大血量, character.右手状态],
        ['左腿', character.左腿当前血量, character.左腿最大血量, character.左腿状态],
        ['右腿', character.右腿当前血量, character.右腿最大血量, character.右腿状态],
    ] as const;

    const 合并展示部位 = [
        { label: '首', cur: character.头部当前血量, max: character.头部最大血量, status: character.头部状态 },
        { label: '胸', cur: character.胸部当前血量, max: character.胸部最大血量, status: character.胸部状态 },
        { label: '腹', cur: character.腹部当前血量, max: character.腹部最大血量, status: character.腹部状态 },
        { label: '臂', cur: (character.左手当前血量 || 0) + (character.右手当前血量 || 0), max: (character.左手最大血量 || 0) + (character.右手最大血量 || 0), status: character.右手状态 !== '正常' ? character.右手状态 : character.左手状态 },
        { label: '腿', cur: (character.左腿当前血量 || 0) + (character.右腿当前血量 || 0), max: (character.左腿最大血量 || 0) + (character.右腿最大血量 || 0), status: character.右腿状态 !== '正常' ? character.右腿状态 : character.左腿状态 },
    ];

    const 玩家总血量上限 = 部位列表.reduce((sum, [, , max]) => sum + Math.max(0, Number(max) || 0), 0);
    const 玩家总血量当前 = 部位列表.reduce((sum, [, cur]) => sum + Math.max(0, Number(cur) || 0), 0);
    const 境界值 = Math.max(1, Number(character.境界层级) || 1);
    const 玩家境界展示 = (character.境界 || '').trim() || `境界值 ${境界值}`;
    const 玩家战斗指标 = 计算战斗指标({
        ...character,
        当前血量: 玩家总血量当前,
        最大血量: 玩家总血量上限,
        攻击力: 取数(character.力量) * 2 + 取数(character.敏捷) * 0.8 + 境界值 * 8,
        防御力: 取数(character.体质) * 1.4 + 取数(character.根骨) * 1.2 + 境界值 * 4,
    });
    const 首个存活敌方 = 敌方列表.find((enemy) => (enemy?.当前血量 || 0) > 0);
    const 前排队友 = 队友列表.find((npc) => (npc?.当前血量 || 0) > 0);
    const 敌方默认目标 = 前排队友?.姓名 || character.姓名 || '主角';
    const 战场单位列表 = React.useMemo(() => {
        const allies = [
            构建战场单位({
                unit: {
                    ...character,
                    当前血量: 玩家总血量当前,
                    最大血量: 玩家总血量上限,
                    攻击力: 取数(character.力量) * 2 + 取数(character.敏捷) * 0.8 + 境界值 * 8,
                    防御力: 取数(character.体质) * 1.4 + 取数(character.根骨) * 1.2 + 境界值 * 4,
                },
                side: 'ally',
                index: 0,
                total: 队友列表.length + 1,
                name: character.姓名 || '主角',
                realm: 玩家境界展示,
                metrics: 玩家战斗指标,
                contextText,
            }),
            ...队友列表.map((npc, index) => 构建战场单位({
                unit: npc,
                side: 'ally',
                index: index + 1,
                total: 队友列表.length + 1,
                name: npc.姓名 || `队友${index + 1}`,
                realm: npc.境界 || '未明境界',
                metrics: 计算NPC战斗指标(npc),
                contextText,
            })),
        ];
        const enemies = 敌方列表.map((enemy, index) => 构建战场单位({
            unit: enemy,
            side: 'enemy',
            index,
            total: Math.max(1, 敌方列表.length),
            name: enemy?.名字 || `敌人${index + 1}`,
            realm: enemy?.境界 || '未明境界',
            metrics: 计算NPC战斗指标(enemy),
            contextText,
        }));
        return 自动划分前后排([...allies, ...enemies]);
    }, [character, contextText, 敌方列表, 境界值, 玩家境界展示, 玩家战斗指标, 玩家总血量上限, 玩家总血量当前, 队友列表]);
    const 我方参战者 = 战场单位列表.filter((unit) => unit.side === 'ally');
    const 敌方参战者 = 战场单位列表.filter((unit) => unit.side === 'enemy');
    const 默认攻击者 = 我方参战者[0];
    const 默认目标 = 敌方参战者[0] || 我方参战者[0];
    const 默认距离 = 默认攻击者 && 默认目标 && 默认攻击者 !== 默认目标 ? 计算两点距离(默认攻击者, 默认目标) : 0;
    const 默认高度 = 默认攻击者 && 默认目标 ? 计算高度修正(默认攻击者, 默认目标) : { 高度差: 0, 远程倍率: 1, 近战倍率: 1 };
    const 敌方前排数量 = 敌方参战者.filter((unit) => unit.row === '前排').length;
    const 突后风险 = 敌方前排数量 > 0
        ? `越过前排追后排：借机攻击风险 = 敌方前排数(${敌方前排数量}) * 18 + 距离差(${Math.round(默认距离)})；若 身法差 < 距离差，则追击失败。`
        : '当前敌方无有效前排，后排保护不成立。';

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[210] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-ink-black/95 w-full max-w-7xl max-h-[90vh] h-[90vh] flex flex-col rounded-2xl border border-wuxia-gold/20 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 relative overflow-hidden">
                
                {/* 装饰类背景层 */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-ink-wash/5 bg-cover bg-center opacity-30 mix-blend-luminosity filter blur-sm"></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-red-900/5 via-transparent to-black"></div>
                </div>

                {/* 顶栏 */}
                <div className="h-14 shrink-0 border-b border-wuxia-gold/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-6 relative z-50">
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full animate-pulse shadow-[0_0_14px_rgba(255,0,0,1)] ${battle?.是否战斗中 ? 'bg-red-600' : 'bg-wuxia-gold'}`}></div>
                        <h3 className="text-wuxia-gold font-serif font-bold text-xl tracking-[0.4em] drop-shadow-md">
                            战斗局势
                            <span className="text-[10px] text-wuxia-gold/50 ml-2 font-mono tracking-widest border border-wuxia-gold/20 px-2 py-0.5 rounded-full">COMBAT</span>
                        </h3>
                    </div>

                    <div className="flex items-center gap-6">
                        <span className={`text-xs px-4 py-1.5 rounded-full border tracking-widest font-serif shadow-inner ${
                            battle?.是否战斗中
                                ? 'border-red-900/50 text-red-300 bg-red-950/40 shadow-[0_0_10px_rgba(220,38,38,0.2)]'
                                : 'border-emerald-900/50 text-emerald-300 bg-emerald-950/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                        }`}>
                            {battle?.是否战斗中 ? `刀剑无眼 · 敌兵 ${存活敌人数} 名` : '休战整顿'}
                        </span>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-400 hover:bg-red-400/10 transition-all hover:rotate-90"
                            title="关闭"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* 主体内容 */}
                <div className="flex-1 min-h-0 flex flex-col relative z-10">
                    {/* 敌方单位列表（全宽版） */}
                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar relative">
                        <section className="mb-4 rounded-xl border border-wuxia-gold/20 bg-black/35 p-4">
                            <div className="mb-3 rounded-lg border border-wuxia-gold/15 bg-wuxia-gold/5 px-3 py-2 text-[11px] leading-5 text-wuxia-gold/80">
                                <span className="font-bold text-wuxia-gold">本存档境界划分：</span>{全境界速查}
                            </div>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="text-xs font-bold tracking-[0.22em] text-wuxia-gold/80">本存档境界与站位</div>
                                <div className="text-[11px] text-wuxia-gold/70">主角境界：{玩家境界展示} · 境界层级 {境界值}</div>
                            </div>
                            <div className="grid gap-3 lg:grid-cols-2">
                                <div className="rounded-lg border border-emerald-400/15 bg-emerald-950/10 p-3">
                                    <div className="mb-2 text-[11px] font-bold tracking-[0.18em] text-emerald-200">我方队伍</div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {我方参战者.map((unit) => (
                                            <div key={unit.id} className="rounded border border-white/10 bg-black/30 px-3 py-2 text-xs">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-serif font-bold text-gray-100">{unit.名称}</span>
                                                    <span className="rounded border border-emerald-400/25 bg-emerald-950/20 px-2 py-0.5 text-[10px] text-emerald-100">{unit.row}</span>
                                                </div>
                                                <div className="mt-1 text-[11px] text-wuxia-gold/75">{unit.境界} · 坐标({unit.x}, {unit.y}) · 高度{unit.height.toFixed(1)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="rounded-lg border border-red-400/15 bg-red-950/10 p-3">
                                    <div className="mb-2 text-[11px] font-bold tracking-[0.18em] text-red-200">敌方队伍</div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {敌方参战者.length > 0 ? 敌方参战者.map((unit) => (
                                            <div key={unit.id} className="rounded border border-white/10 bg-black/30 px-3 py-2 text-xs">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-serif font-bold text-gray-100">{unit.名称}</span>
                                                    <span className="rounded border border-red-400/25 bg-red-950/20 px-2 py-0.5 text-[10px] text-red-100">{unit.row}</span>
                                                </div>
                                                <div className="mt-1 text-[11px] text-wuxia-gold/75">{unit.境界} · 坐标({unit.x}, {unit.y}) · 高度{unit.height.toFixed(1)}</div>
                                            </div>
                                        )) : <div className="rounded border border-dashed border-red-400/20 p-3 text-center text-xs text-red-100/45">暂无敌方</div>}
                                    </div>
                                </div>
                            </div>
                        </section>
                        <section className="mb-4 rounded-xl border border-cyan-400/15 bg-cyan-950/10 p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="text-xs font-bold tracking-[0.22em] text-cyan-100">战场小人模型</div>
                                <div className="text-[11px] text-cyan-100/70">同一横线为地面，纵向偏移代表剧情高度差</div>
                            </div>
                            <div className="relative h-52 overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(16,185,129,0.06),rgba(0,0,0,0.28))]">
                                <div className="absolute left-4 right-4 top-1/2 h-px bg-wuxia-gold/45 shadow-[0_0_14px_rgba(212,175,55,0.4)]" />
                                <div className="absolute left-4 top-3 text-[10px] tracking-[0.16em] text-emerald-200/70">我方</div>
                                <div className="absolute right-4 top-3 text-[10px] tracking-[0.16em] text-red-200/70">敌方</div>
                                {战场单位列表.map((unit) => {
                                    const color = unit.side === 'ally' ? 'border-emerald-300/50 bg-emerald-950 text-emerald-50' : 'border-red-300/50 bg-red-950 text-red-50';
                                    const top = clamp(50 - unit.y - unit.height * 5, 14, 82);
                                    return (
                                        <div
                                            key={unit.id}
                                            className="absolute -translate-x-1/2 -translate-y-1/2"
                                            style={{ left: `${unit.x}%`, top: `${top}%` }}
                                            title={`${unit.名称}：${unit.row}，坐标(${unit.x}, ${unit.y})，高度${unit.height.toFixed(1)}，身法${unit.身法}`}
                                        >
                                            <div className={`flex h-11 w-8 items-center justify-center rounded-t-full rounded-b-md border shadow-[0_10px_24px_rgba(0,0,0,0.45)] ${color}`}>
                                                <span className="text-sm font-black">{unit.名称.slice(0, 1)}</span>
                                            </div>
                                            <div className="mt-1 max-w-[84px] truncate text-center text-[10px] text-gray-200">{unit.名称}</div>
                                            <div className="text-center text-[9px] text-wuxia-gold/70">{unit.row}</div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-3 grid gap-2 text-[11px] md:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded border border-white/10 bg-black/25 px-3 py-2 text-gray-300">距离 = sqrt((x1-x2)^2 + (y1-y2)^2)，当前默认距离 {Math.round(默认距离)}</div>
                                <div className="rounded border border-white/10 bg-black/25 px-3 py-2 text-gray-300">远程高低差倍率 = 1 + 高度优势*0.18 - 高度劣势*0.08，当前 x{默认高度.远程倍率.toFixed(2)}</div>
                                <div className="rounded border border-white/10 bg-black/25 px-3 py-2 text-gray-300">近战高低差倍率 = 1 + 高度优势*0.06 - 高度劣势*0.04，当前 x{默认高度.近战倍率.toFixed(2)}</div>
                                <div className="rounded border border-white/10 bg-black/25 px-3 py-2 text-gray-300">移动消耗 = 水平距离 + 上坡高度*1.6 - 下坡高度*0.45，预算 = 身法</div>
                            </div>
                        </section>
                        {battle?.是否战斗中 && (
                            <section className="mb-4">
                                <BattleRoundAnimation
                                    character={character}
                                    battle={battle}
                                    compact={false}
                                />
                            </section>
                        )}
                        <section className="mb-4 rounded-xl border border-white/10 bg-black/30 p-4">
                            <div className="mb-3 text-xs font-bold tracking-[0.22em] text-gray-300">计算规则</div>
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                                {[
                                    ['攻势', `基础攻势 = 攻击力 + 力量*1.2 + 当前内力*0.08 + 境界层级*3 + 精力比例*10 - 毒性影响*0.35；近战伤害 = 攻势；远程物理伤害 = 攻势*远程系数*高低差倍率；法术伤害 = 当前施展法术基础伤害 + 加成属性*加成系数 + 当前内力*内力系数 + 基准法术压力*0.35；若本回合未指定法术，默认取已学功法中最高伤害法术`],
                                    ['守势', '近战物理守势 = 防御力 + 体质*0.7 + 根骨*0.5 + 装备物防*0.9 + 招架 + 气血比例*8 - 毒性*0.25；远程物理守势 = 防御力*0.85 + 体质*0.45 + 装备物防*0.75 + 掩体 + 气血比例*6 - 毒性*0.2；法术守势 = 根骨*0.9 + 当前内力*0.08 + 装备内防 + 境界层级*2 + 气血比例*5 - 毒性*0.15'],
                                    ['身法', '身法 = 敏捷*1.2 + 精力比例*16 + 装备身法 - 毒性影响*0.45；移动消耗 = 平面距离 + 上坡高度*1.6 - 下坡高度*0.45；一回合可先前进、行动、再后撤，只要总消耗 <= 身法'],
                                    ['脱战/突后', `逃跑脱战：若 追杀者身法 - 逃跑者身法 < 双方距离，则脱战；突后排：${突后风险}`],
                                ].map(([name, formula]) => (
                                    <div key={name} className="rounded border border-white/8 bg-black/25 px-3 py-2 text-xs">
                                        <div className="font-semibold text-gray-100">{name}</div>
                                        <div className="mt-1 font-mono text-[10px] leading-5 text-wuxia-gold/75">{formula}</div>
                                    </div>
                                ))}
                            </div>
                        </section>
                        <div className="mb-4 grid gap-4 xl:grid-cols-2">
                            <section className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <div className="text-xs font-bold tracking-[0.22em] text-emerald-200">我方队伍</div>
                                    <div className="text-[11px] text-emerald-100/65">含主角与已入队成员</div>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <战斗单位详情卡
                                        unit={{
                                            ...character,
                                            当前血量: 玩家总血量当前,
                                            最大血量: 玩家总血量上限,
                                            攻击力: 取数(character.力量) * 2 + 取数(character.敏捷) * 0.8 + 境界值 * 8,
                                            防御力: 取数(character.体质) * 1.4 + 取数(character.根骨) * 1.2 + 境界值 * 4,
                                        }}
                                        name={character.姓名 || '主角'}
                                        realm={玩家境界展示}
                                        row={我方参战者[0]?.row || '前排'}
                                        side="ally"
                                        metrics={玩家战斗指标}
                                        targetName={首个存活敌方?.名字 || '无'}
                                        emphasized
                                    />
                                    {队友列表.map((npc, index) => {
                                        const 指标 = 计算NPC战斗指标(npc);
                                        return (
                                        <战斗单位详情卡
                                            key={npc.id || `${npc.姓名}-${index}`}
                                            unit={npc}
                                            name={npc.姓名 || `队友${index + 1}`}
                                            realm={npc.境界 || '未明'}
                                            row={我方参战者[index + 1]?.row || (index === 0 ? '前排' : '后排')}
                                            side="ally"
                                            metrics={指标}
                                            targetName={首个存活敌方?.名字 || '无'}
                                        />
                                    );})}
                                </div>
                            </section>
                            <section className="rounded-xl border border-red-500/20 bg-red-950/10 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <div className="text-xs font-bold tracking-[0.22em] text-red-200">敌方阵列</div>
                                    <div className="text-[11px] text-red-100/65">存活 {存活敌人数} / {敌方列表.length}</div>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    {敌方列表.length > 0 ? 敌方列表.map((enemy, index) => {
                                        const npc指标 = 计算NPC战斗指标(enemy);
                                        return (
                                        <战斗单位详情卡
                                            key={`${enemy?.名字 || 'enemy'}-${index}-summary`}
                                            unit={enemy}
                                            name={enemy.名字 || `敌人${index + 1}`}
                                            realm={enemy.境界 || '未明'}
                                            row={敌方参战者[index]?.row || (index === 0 ? '前排' : '后排')}
                                            side="enemy"
                                            metrics={npc指标}
                                            targetName={敌方默认目标}
                                        />
                                    );}) : <div className="rounded border border-dashed border-red-400/20 p-6 text-center text-sm text-red-100/45">暂无敌方</div>}
                                </div>
                            </section>
                        </div>
                        {敌方列表.length === 0 ? (
                            <div className="h-full rounded-2xl border border-dashed border-wuxia-gold/20 bg-black/20 flex flex-col items-center justify-center text-wuxia-gold/40 gap-4 font-serif">
                                <IconYinYang size={64} className="opacity-30 drop-shadow-lg" />
                                <span className="text-xl tracking-widest">四海升平，并无强压</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-max">
                                {敌方列表.map((enemy, idx) => {
                                    const hpCur = Math.max(0, enemy?.当前血量 || 0);
                                    const hpMax = Math.max(1, enemy?.最大血量 || 1);
                                    const spCur = Math.max(0, enemy?.当前精力 || 0);
                                    const spMax = Math.max(1, enemy?.最大精力 || 1);
                                    const qiCur = Math.max(0, enemy?.当前内力 || 0);
                                    const qiMax = Math.max(1, enemy?.最大内力 || Math.max(qiCur, 1));
                                    const 已失能 = hpCur <= 0;
                                    const enemyViz = 可视化.敌方[idx];

                                    return (
                                        <div key={`${enemy?.名字 || 'enemy'}-${idx}`} className={`relative rounded-xl border p-5 overflow-hidden group transition-all duration-300 ${
                                            已失能 
                                                ? 'border-gray-800 bg-black/40 opacity-50 grayscale scale-[0.98]' 
                                                : 'border-red-900/30 bg-gradient-to-br from-red-950/20 to-black hover:border-red-700/50 hover:shadow-[0_0_20px_rgba(220,38,38,0.1)]'
                                        }`}>
                                            {/* 背景血迹装饰 */}
                                            {!已失能 && <div className="absolute -right-4 -top-4 text-7xl text-red-500 opacity-[0.03] rotate-12 pointer-events-none font-serif">杀</div>}
                                            
                                            <div className="flex items-start justify-between gap-4 relative z-10">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-lg text-red-100 font-serif font-bold flex items-center gap-2 truncate drop-shadow-sm">
                                                        <IconSwords size={16} className={已失能 ? 'text-gray-500' : 'text-red-400'} />
                                                        {enemy?.名字 || `无名游卒 ${idx + 1}`}
                                                    </div>
                                                    <div className="text-[11px] text-red-300/70 mt-1.5 flex items-center gap-2">
                                                        <span className="border border-red-900/50 bg-red-950/50 px-2 py-0.5 rounded font-serif shadow-sm tracking-wider">
                                                            {enemy?.境界 || '未明修身'}
                                                        </span>
                                                        {已失能 && <span className="text-gray-400 border border-gray-700 bg-gray-900 px-2 py-0.5 rounded tracking-widest">失能/败北</span>}
                                                    </div>
                                                    {enemy?.简介 && <div className="text-[11px] text-gray-400 mt-3 leading-relaxed border-l-2 border-red-900/40 pl-2 line-clamp-2 italic">
                                                        {enemy.简介}
                                                    </div>}
                                                </div>
                                                
                                                <div className="grid grid-cols-1 gap-2 text-[10px] font-mono shrink-0">
                                                    <div className="bg-black/50 border border-red-900/30 rounded px-2.5 py-1.5 text-red-300 flex justify-between gap-3 shadow-inner">
                                                        <span>威</span> <strong>{enemy?.战斗力 || 0}</strong>
                                                    </div>
                                                    <div className="bg-black/50 border border-blue-900/30 rounded px-2.5 py-1.5 text-blue-300 flex justify-between gap-3 shadow-inner">
                                                        <span>护</span> <strong>{enemy?.防御力 || 0}</strong>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-5 space-y-2.5 relative z-10">
                                                <资源条 label="气血" current={hpCur} max={hpMax} tone="red" />
                                                <资源条 label="精力" current={spCur} max={spMax} tone="cyan" />
                                                {(enemy?.最大内力 !== undefined || enemy?.当前内力 !== undefined) && (
                                                    <资源条 label="内力" current={qiCur} max={qiMax} tone="indigo" />
                                                )}
                                            </div>

                                                 <div className="mt-4 pt-3 border-t border-white/5 relative z-10">
                                                {enemyViz ? (
                                                    <div className="mb-3 rounded-lg border border-amber-400/15 bg-amber-950/10 px-3 py-2 text-[11px] leading-5 text-amber-50/80">
                                                        <div className="mb-1 flex items-center justify-between">
                                                            <span className="font-bold text-amber-200">态势：{enemyViz.威胁}</span>
                                                            <span className="font-mono text-amber-100">攻 {enemyViz.攻势} / 守 {enemyViz.守势}</span>
                                                        </div>
                                                        {enemyViz.判定}
                                                    </div>
                                                ) : null}
                                                <div className="text-[10px] text-red-500/70 tracking-[0.2em] font-serif mb-2 flex items-center gap-1.5">
                                                    <span className="w-1 h-3 bg-red-900/80 rounded-full"></span> 功法路数
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {Array.isArray(enemy?.技能) && enemy.技能.length > 0 ? (
                                                        enemy.技能.map((skill) => (
                                                            <span key={skill} className="text-[10px] px-2 py-0.5 rounded border border-red-900/30 bg-red-950/20 text-gray-300 shadow-sm font-serif">
                                                                {skill}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-[10px] text-gray-600 italic">平平无奇，无招亦无式</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BattleModal;
