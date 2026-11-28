import type { DirectorWorldBible } from '../../models/directorBible';
import type { 功法结构 } from '../../models/kungfu';
import type { NPC结构, 场外战果暂存结构, 战斗状态结构, 角色数据结构 } from '../../types';
import { 判断角色对话位置, type 角色对话位置判定 } from '../../utils/roleChatLocation';
import { 有开局伙伴身份标记 } from '../../utils/openingCompanion';

export type TacticalMoveId = 'press' | 'deflect' | 'feint' | 'withdraw';

export interface StatReasonItem {
    label: string;
    delta: number;
    hint?: string;
}

export interface CombatantStanceProfile {
    name: string;
    realm: string;
    offense: number;
    defense: number;
    agility: number;
    maxStamina: number;
    offenseReasons: StatReasonItem[];
    defenseReasons: StatReasonItem[];
    agilityReasons: StatReasonItem[];
    signatureArtName?: string;
    upgradeTips: string[];
}

export interface ClashTargetCandidate {
    npc: NPC结构;
    locationCheck: 角色对话位置判定;
}

export interface ClashBeatLog {
    beat: number;
    playerMove: TacticalMoveId;
    enemyMove: TacticalMoveId;
    usedSignature: boolean;
    playerDmg: number;
    enemyDmg: number;
    momentumDelta: number;
    summary: string;
}

export interface ClashSessionState {
    targetName: string;
    npcId?: string;
    mode: '切磋试探' | '生死交锋';
    beat: number;
    playerPosture: number; // 0..100
    enemyPosture: number;  // 0..100
    playerStamina: number;
    momentum: number; // -4..+5, positive favors player
    enemyExposed: boolean;
    nextEnemyTelegraph: string;
    predictedEnemyBias: TacticalMoveId;
    finished: boolean;
    outcome?: 场外战果暂存结构['结果'];
    logs: ClashBeatLog[];
}

export interface ClashFighter {
    key: string;
    npcId?: string;
    profile: CombatantStanceProfile;
    posture: number;
    stamina: number;
    exposed: boolean;
    leftScene?: boolean;
}

export interface ClashRoster {
    allies: ClashFighter[];
    enemies: ClashFighter[];
    sparringPartners: ClashFighter[];
}

export interface TeamClashSession extends ClashSessionState {
    allies: ClashFighter[];
    enemies: ClashFighter[];
    targetKey: string;
}

const 品质加值表: Record<string, number> = {
    凡品: 1,
    下品: 1,
    良品: 2,
    中品: 2,
    上品: 4,
    极品: 6,
    绝世: 8,
    传说: 10
};

const 境界基础档位 = (realm?: string, tierNum?: number): number => {
    if (Number.isFinite(Number(tierNum)) && Number(tierNum) > 0) {
        return Math.min(12, Math.max(1, Math.floor(Number(tierNum)) * 2));
    }
    const r = String(realm || '').trim();
    if (/化神|渡劫|天人|陆地神仙|大宗师/u.test(r)) return 12;
    if (/元婴|先天|宗师/u.test(r)) return 9;
    if (/金丹|一流|绝顶/u.test(r)) return 7;
    if (/筑基|二流|内功小成/u.test(r)) return 5;
    if (/炼气|练气|三流|外门/u.test(r)) return 3;
    return 2;
};

const 查找主角物品品质 = (role: 角色数据结构, itemRef?: string): string => {
    const ref = (itemRef || '').trim();
    if (!ref) return '';
    const item = (role.物品列表 || []).find((it: any) => it?.名称 === ref || it?.ID === ref);
    return String(item?.品质 || '良品');
};

export const 获取可选战术交锋目标 = (社交列表: NPC结构[], env: any): ClashTargetCandidate[] => (
    (Array.isArray(社交列表) ? 社交列表 : [])
        .map((npc) => ({ npc, locationCheck: 判断角色对话位置(npc, env) }))
        .filter((item) => item.locationCheck.可选)
);

export const 构建主角明牌交锋面板 = (role: 角色数据结构): CombatantStanceProfile => {
    const realm = role?.境界 || '凡胎境';
    const baseRealmScore = 境界基础档位(realm, role?.境界层级);
    const offenseReasons: StatReasonItem[] = [{ label: `境界底子(${realm})`, delta: baseRealmScore }];
    const defenseReasons: StatReasonItem[] = [{ label: `体魄根骨(${realm})`, delta: Math.max(1, Math.floor(baseRealmScore * 0.8)) }];
    const agilityReasons: StatReasonItem[] = [{ label: `基础身法`, delta: Math.max(1, Math.floor((Number(role?.敏捷) || 10) / 5)) }];
    const upgradeTips: string[] = [];

    const mainWeapon = (role?.装备?.主武器 || '').trim();
    if (mainWeapon) {
        const quality = 查找主角物品品质(role, mainWeapon);
        const bonus = 品质加值表[quality] || 2;
        offenseReasons.push({ label: `主武器《${mainWeapon}》(${quality})`, delta: bonus });
    } else {
        upgradeTips.push('主武器空缺(+0 攻势)：前往坊市购买或从行囊装备称手兵刃可直接 +2~4 攻势。');
    }

    const armor = (role?.装备?.盔甲 || role?.装备?.胸部 || '').trim();
    if (armor) {
        const quality = 查找主角物品品质(role, armor);
        const bonus = Math.max(1, Math.floor((品质加值表[quality] || 2) * 0.8));
        defenseReasons.push({ label: `护具《${armor}》`, delta: bonus });
    } else {
        upgradeTips.push('身上暂无防具(+0 守御)：穿戴护甲或内衬可降低被强攻压崩风险。');
    }

    const subHidden = (role?.装备?.暗器 || role?.装备?.副武器 || '').trim();
    if (subHidden) {
        agilityReasons.push({ label: `副手/暗器《${subHidden}》`, delta: 2 });
    }

    const skills: 功法结构[] = Array.isArray(role?.功法列表) ? role.功法列表 : [];
    const sortedSkills = [...skills].sort((a, b) => (Number(b?.当前重数) || 1) - (Number(a?.当前重数) || 1));
    const topSkill = sortedSkills[0];
    if (topSkill) {
        const lv = Math.max(1, Number(topSkill.当前重数) || 1);
        offenseReasons.push({ label: `主修《${topSkill.名称}》(${lv}重)`, delta: Math.min(6, lv) });
        if (lv <= 2) {
            upgradeTips.push(`主修功法《${topSkill.名称}》仅第 ${lv} 重：多加研习提升重数，每重均可直观增加压制力。`);
        }
    } else {
        upgradeTips.push('尚未修习成体系武学/功法：寻访高人或搜集残卷习得一门招式可立刻解锁爆发绝学。');
    }

    const hurtCount = [
        role?.头部当前血量 / Math.max(1, role?.头部最大血量 || 100),
        role?.胸部当前血量 / Math.max(1, role?.胸部最大血量 || 100),
        role?.左手当前血量 / Math.max(1, role?.左手最大血量 || 100),
        role?.右手当前血量 / Math.max(1, role?.右手最大血量 || 100),
        role?.左腿当前血量 / Math.max(1, role?.左腿最大血量 || 100),
        role?.右腿当前血量 / Math.max(1, role?.右腿最大血量 || 100)
    ].filter((ratio) => Number.isFinite(ratio) && ratio < 0.7).length;
    if (hurtCount > 0) {
        defenseReasons.push({ label: `旧伤/负伤部位(${hurtCount}处)`, delta: -hurtCount });
        upgradeTips.push(`身上有 ${hurtCount} 处伤势拉低守御：先服伤药/调息再战更稳妥。`);
    }

    const sum = (arr: StatReasonItem[]) => Math.max(1, arr.reduce((acc, x) => acc + x.delta, 0));
    return {
        name: role?.姓名 || '你',
        realm,
        offense: sum(offenseReasons),
        defense: sum(defenseReasons),
        agility: sum(agilityReasons),
        maxStamina: 3,
        offenseReasons,
        defenseReasons,
        agilityReasons,
        signatureArtName: topSkill?.名称,
        upgradeTips
    };
};

export const 构建NPC明牌交锋面板 = (
    npc: Pick<NPC结构, '姓名'> & Partial<Pick<NPC结构, '境界' | '境界层级' | '当前装备'>>,
    directorBible?: DirectorWorldBible | null
): CombatantStanceProfile => {
    const cast = directorBible?.核心卡司?.find((c) => c.姓名 === npc.姓名);
    const tierHint = Number(npc.境界层级) || (cast?.所处层级 ? cast.所处层级 : 1);
    const realm = npc.境界 || (tierHint >= 3 ? '高阶好手' : tierHint === 2 ? '中坚人物' : '初入江湖');
    const base = 境界基础档位(npc.境界, tierHint);
    const offenseReasons: StatReasonItem[] = [{ label: `修为(${realm})`, delta: base }];
    const defenseReasons: StatReasonItem[] = [{ label: `护体根底`, delta: Math.max(1, Math.floor(base * 0.85)) }];
    const agilityReasons: StatReasonItem[] = [{ label: `临敌应变`, delta: Math.max(2, Math.floor(base * 0.7)) }];

    if (npc.当前装备?.主武器) {
        offenseReasons.push({ label: `持械《${npc.当前装备.主武器}》`, delta: 2 });
    }
    if (npc.当前装备?.服装) {
        defenseReasons.push({ label: `护身甲衣`, delta: 1 });
    }
    const sum = (arr: StatReasonItem[]) => Math.max(1, arr.reduce((acc, x) => acc + x.delta, 0));
    return {
        name: npc.姓名,
        realm,
        offense: sum(offenseReasons),
        defense: sum(defenseReasons),
        agility: sum(agilityReasons),
        maxStamina: 3,
        offenseReasons,
        defenseReasons,
        agilityReasons,
        upgradeTips: []
    };
};

const 创建参战者 = (key: string, profile: CombatantStanceProfile, npcId?: string): ClashFighter => ({
    key, npcId, profile, posture: 100, stamina: profile.maxStamina, exposed: false
});

const 取人物称呼 = (npc: NPC结构) => [npc.姓名, npc.叙事名称, ...(npc.曾用名 || [])].filter(Boolean);

export const 可继续交锋 = (fighter: ClashFighter) => !fighter.leftScene && fighter.posture > 0;

export const 构建战术交锋阵容 = (
    role: 角色数据结构, social: NPC结构[], env: any,
    battle?: 战斗状态结构, directorBible?: DirectorWorldBible | null
): ClashRoster => {
    const allies = [创建参战者('player', 构建主角明牌交锋面板(role))];
    const enemies: ClashFighter[] = [];
    const sparringPartners: ClashFighter[] = [];
    const battleEnemies = battle?.是否战斗中 ? battle.敌方 || [] : [];
    const activeEnemies = battleEnemies.filter((enemy) => enemy.名字 && !(enemy.当前血量 <= 0));
    const battleNames = new Set(activeEnemies.map((enemy) => enemy.名字));
    const spentNames = new Set(battleEnemies.filter((enemy) => enemy.当前血量 <= 0).map((enemy) => enemy.名字));
    const socialList = Array.isArray(social) ? social.filter((npc) => npc?.姓名) : [];
    const socialNames = new Set(socialList.flatMap(取人物称呼));
    const seen = new Set([role.姓名]);
    for (const { npc } of 获取可选战术交锋目标(socialList, env)) {
        if (!npc.姓名 || seen.has(npc.姓名)) continue;
        seen.add(npc.姓名);
        const fighter = 创建参战者('npc:' + (npc.id || npc.姓名), 构建NPC明牌交锋面板(npc, directorBible), npc.id);
        sparringPartners.push(fighter);
        // 2.0 导演把公开关系写入「关系」，旧档通常使用「关系状态」。
        const relation = String((npc as NPC结构 & { 关系?: string }).关系 || npc.关系状态 || '').trim();
        const ally = npc.是否队友 === true || 有开局伙伴身份标记(npc)
            || /^(?:主角的?)?(?:同伴|队友|同行伙伴|随行伙伴|结伴同行|并肩作战的伙伴)$/u.test(relation);
        if (ally) {
            allies.push(fighter);
            continue;
        }
        const hostile = /敌对|仇敌|死敌|宿敌|仇人|敌人|敌手|敌军|追兵|追杀者/u.test(relation)
            && !/非敌|并非.*敌|不是.*敌|不再.*敌|化敌为友|昔日|曾经|旧日|前敌|解除敌对/u.test(relation);
        const names = 取人物称呼(npc);
        if (!names.some((name) => spentNames.has(name)) && (names.some((name) => battleNames.has(name)) || hostile)) enemies.push(fighter);
    }
    // 在旧战斗名单上有名、尚无社交档案的临时敌人也能入场。
    for (const enemy of activeEnemies) {
        if (seen.has(enemy.名字) || socialNames.has(enemy.名字)) continue;
        seen.add(enemy.名字);
        const profile = 构建NPC明牌交锋面板({ 姓名: enemy.名字, 境界: enemy.境界, 境界层级: enemy.境界层级 }, directorBible);
        enemies.push(创建参战者('battle:' + enemy.名字, profile));
    }
    return { allies, enemies, sparringPartners };
};

const 挑选敌方下一拍征兆 = (beat: number, enemyPosture: number, playerMomentum: number): { move: TacticalMoveId; telegraph: string } => {
    if (enemyPosture <= 35 && (beat % 2 === 0)) {
        return { move: 'deflect', telegraph: `${beat > 0 ? '对方气息微喘，' : ''}架势转为保守卸力，正提防你乘胜强攻` };
    }
    if (playerMomentum <= -1 || beat % 3 === 1) {
        return { move: 'press', telegraph: '对方肩沉步进、衣袂鼓风，似欲趁势正面强攻压招' };
    }
    return { move: 'feint', telegraph: '对方眼神游移、指节虚抬，似在卖招蓄势准备虚晃寻隙' };
};

export const 创建战术交锋会话 = (params: {
    targetName: string;
    npcId?: string;
    mode: '切磋试探' | '生死交锋';
}): ClashSessionState => {
    const firstHint = 挑选敌方下一拍征兆(1, 100, 0);
    return {
        targetName: params.targetName,
        npcId: params.npcId,
        mode: params.mode,
        beat: 1,
        playerPosture: 100,
        enemyPosture: 100,
        playerStamina: 3,
        momentum: 0,
        enemyExposed: false,
        nextEnemyTelegraph: firstHint.telegraph,
        predictedEnemyBias: firstHint.move,
        finished: false,
        logs: []
    };
};

const 招式中文名: Record<TacticalMoveId, string> = {
    press: '强攻压招',
    deflect: '卸力借势',
    feint: '虚晃寻隙',
    withdraw: '借势脱身'
};

export const 推演交锋一拍 = (
    session: ClashSessionState,
    playerMove: TacticalMoveId,
    playerProfile: CombatantStanceProfile,
    enemyProfile: CombatantStanceProfile,
    useSignature: boolean
): ClashSessionState => {
    if (session.finished) return session;
    const enemyMove = session.predictedEnemyBias;
    const next: ClashSessionState = {
        ...session,
        logs: [...session.logs]
    };

    const actualSig = Boolean(useSignature && playerProfile.signatureArtName && next.playerStamina >= 1);
    const sigBonus = actualSig ? 3 : 0;
    const spendStamina = (playerMove === 'press' ? 1 : 0) + (actualSig ? 1 : 0);
    if (spendStamina > next.playerStamina) {
        // Fallback smoothly if out of stamina on press
        return 推演交锋一拍(session, 'feint', playerProfile, enemyProfile, false);
    }

    if (playerMove === 'withdraw') {
        const disengageScore = playerProfile.agility + next.momentum + (actualSig ? 2 : 0);
        const enemyTrap = enemyProfile.agility + (enemyMove === 'feint' ? 1 : 0);
        if (disengageScore >= enemyTrap || next.beat >= 2) {
            next.finished = true;
            next.outcome = next.enemyPosture < 50 ? '逼退脱身' : '僵持罢手';
            next.logs.push({
                beat: session.beat,
                playerMove,
                enemyMove,
                usedSignature: actualSig,
                playerDmg: 0,
                enemyDmg: 0,
                momentumDelta: 0,
                summary: `第 ${session.beat} 拍：你借身法与余势拉开身位，安全脱离${session.targetName}的锁定范围。`
            });
            return next;
        }
        next.playerPosture = Math.max(0, next.playerPosture - 16);
        next.momentum = Math.max(-4, next.momentum - 1);
        const hint = 挑选敌方下一拍征兆(session.beat + 1, next.enemyPosture, next.momentum);
        next.beat += 1;
        next.nextEnemyTelegraph = hint.telegraph;
        next.predictedEnemyBias = hint.move;
        next.logs.push({
            beat: session.beat,
            playerMove,
            enemyMove,
            usedSignature: actualSig,
            playerDmg: 16,
            enemyDmg: 0,
            momentumDelta: -1,
            summary: `第 ${session.beat} 拍：你欲脱身却被${session.targetName}提前卡住退路（-16% 架势），需先挣回一点「势」。`
        });
        return next;
    }

    let playerDmg = 0;
    let enemyDmg = 0;
    let momentumDelta = 0;
    let beatNote = '';

    const playerPower = playerProfile.offense + sigBonus + next.momentum + (next.enemyExposed ? 3 : 0);
    const enemyPower = enemyProfile.offense;

    if (playerMove === 'press' && enemyMove === 'feint') {
        enemyDmg = Math.max(18, 22 + Math.round((playerPower - enemyProfile.defense) * 2.5));
        momentumDelta = 1;
        beatNote = `你的【强攻压招】${actualSig ? `(催动《${playerProfile.signatureArtName}》)` : ''}正打断对方的【虚晃寻隙】，实打实压退 ${enemyDmg}% 架势！`;
    } else if (playerMove === 'deflect' && enemyMove === 'press') {
        enemyDmg = Math.max(16, 18 + Math.round((playerProfile.agility + playerProfile.defense - enemyProfile.defense) * 2));
        momentumDelta = 2;
        next.enemyExposed = true;
        next.playerStamina = Math.min(playerProfile.maxStamina, next.playerStamina + 1);
        beatNote = `漂亮！你的【卸力借势】正克制对方【强攻压招】，卸劲反震打掉对方 ${enemyDmg}% 架势并逼出【破绽】(+2 势，回 1 气力)！`;
    } else if (playerMove === 'feint' && enemyMove === 'deflect') {
        enemyDmg = Math.max(15, 16 + Math.round((playerProfile.agility + sigBonus - enemyProfile.agility) * 2));
        momentumDelta = 1;
        beatNote = `你的【虚晃寻隙】晃空了对方的【卸力架势】，趁虚切入打掉 ${enemyDmg}% 架势(+1 势)！`;
    } else if (
        (playerMove === 'press' && enemyMove === 'deflect') ||
        (playerMove === 'deflect' && enemyMove === 'feint') ||
        (playerMove === 'feint' && enemyMove === 'press')
    ) {
        playerDmg = Math.max(14, 18 + Math.round((enemyPower - playerProfile.defense) * 2));
        momentumDelta = -1;
        next.enemyExposed = false;
        beatNote = `招式被克！你的【${招式中文名[playerMove]}】落入${session.targetName}的【${招式中文名[enemyMove]}】节奏，架势受挫 -${playerDmg}%（-1 势）。`;
    } else {
        // Mirror clash compares raw offense/agility cleanly
        if (playerPower >= enemyPower) {
            enemyDmg = Math.max(14, 15 + (playerPower - enemyPower) * 2);
            playerDmg = 8;
            momentumDelta = 1;
            beatNote = `正面硬碰！凭更胜一筹的${actualSig ? '绝学压制' : '面板底气'}压住对手（敌 -${enemyDmg}% / 己 -8%）。`;
        } else {
            playerDmg = Math.max(14, 15 + (enemyPower - playerPower) * 2);
            enemyDmg = 8;
            momentumDelta = -1;
            beatNote = `硬碰略逊一筹（敌攻势 ${enemyProfile.offense} 压过你），被震退（己 -${playerDmg}% / 敌 -8%）。`;
        }
    }

    next.playerStamina = Math.max(0, Math.min(playerProfile.maxStamina, next.playerStamina - spendStamina + (playerMove === 'deflect' ? 1 : 0)));
    next.playerPosture = Math.max(0, next.playerPosture - playerDmg);
    next.enemyPosture = Math.max(0, next.enemyPosture - enemyDmg);
    next.momentum = Math.max(-4, Math.min(5, next.momentum + momentumDelta));
    if (playerMove !== 'deflect') next.enemyExposed = false;

    next.logs.push({
        beat: session.beat,
        playerMove,
        enemyMove,
        usedSignature: actualSig,
        playerDmg,
        enemyDmg,
        momentumDelta,
        summary: `第 ${session.beat} 拍：${beatNote}`
    });

    if (next.enemyPosture <= 0) {
        next.finished = true;
        next.outcome = '胜出';
    } else if (next.playerPosture <= 0) {
        next.finished = true;
        next.outcome = '落败撤离';
    } else {
        next.beat += 1;
        const hint = 挑选敌方下一拍征兆(next.beat, next.enemyPosture, next.momentum);
        next.nextEnemyTelegraph = hint.telegraph;
        next.predictedEnemyBias = hint.move;
    }

    return next;
};

export const 创建阵营交锋会话 = (
    roster: ClashRoster, mode: ClashSessionState['mode'], sparringKey = ''
): TeamClashSession | null => {
    const partner = roster.sparringPartners.find((fighter) => fighter.key === sparringKey);
    const sparring = mode === '切磋试探';
    const enemies = sparring ? (partner ? [partner] : []) : roster.enemies;
    if (!enemies.length) return null;
    const target = enemies[0];
    return {
        ...创建战术交锋会话({ targetName: target.profile.name, npcId: target.npcId, mode }),
        allies: sparring ? roster.allies.slice(0, 1) : roster.allies,
        enemies, targetKey: target.key
    };
};

export const 选定交锋对手 = (session: TeamClashSession, key: string): TeamClashSession => {
    const target = session.enemies.find((fighter) => fighter.key === key && 可继续交锋(fighter));
    if (!target || session.finished) return session;
    const hint = 挑选敌方下一拍征兆(session.beat, target.posture, session.momentum);
    return {
        ...session, targetKey: target.key, targetName: target.profile.name, npcId: target.npcId,
        enemyPosture: target.posture, enemyExposed: target.exposed,
        nextEnemyTelegraph: hint.telegraph, predictedEnemyBias: hint.move
    };
};

export const 同步交锋在场阵容 = (
    session: TeamClashSession | null, roster: ClashRoster, mode: ClashSessionState['mode'], sparringKey: string
): TeamClashSession | null => {
    if (session?.finished) return session;
    const fresh = 创建阵营交锋会话(roster, mode, sparringKey);
    if (!fresh || !session) return fresh;
    const refreshSide = (previous: ClashFighter[], present: ClashFighter[]): ClashFighter[] => {
        const presentKeys = new Set(present.map((fighter) => fighter.key));
        const previousKeys = new Set(previous.map((fighter) => fighter.key));
        const arrivals = present.filter((fighter) => !previousKeys.has(fighter.key));
        const retained = previous.map((fighter) => {
            const leftScene = !presentKeys.has(fighter.key);
            return Boolean(fighter.leftScene) === leftScene ? fighter : { ...fighter, leftScene };
        });
        return [...retained, ...arrivals];
    };
    // 阵营已经反转时由新局面重新开场，避免同一个人出现在两边。
    if (fresh.allies.some((ally) => session.enemies.some((enemy) => enemy.key === ally.key))
        || fresh.enemies.some((enemy) => session.allies.some((ally) => ally.key === enemy.key))) return fresh;
    const allies = refreshSide(session.allies, fresh.allies);
    const enemies = refreshSide(session.enemies, fresh.enemies);
    const actor = allies.find(可继续交锋);
    const target = enemies.find((fighter) => fighter.key === session.targetKey && 可继续交锋(fighter)) ?? enemies.find(可继续交锋);
    if (!actor || !target) return null;
    return 选定交锋对手({ ...session, allies, enemies, playerPosture: actor.posture, playerStamina: actor.stamina }, target.key);
};

// 本拍开始时仍有架势的支援者各出手一次，优先牵制主对手以外的敌人。
const 结算支援出招 = (support: ClashFighter[], opponents: ClashFighter[], beat: number): string[] => (
    support.map((fighter, index) => {
        const target = opponents[(index + beat - 1) % opponents.length];
        const damage = Math.max(5, Math.min(22, 10 + fighter.profile.offense - target.profile.defense));
        target.posture = Math.max(0, target.posture - damage);
        return `${fighter.profile.name}牵制${target.profile.name}（架势 -${damage}%）`;
    })
);

export const 推演阵营交锋一拍 = (session: TeamClashSession, move: TacticalMoveId, useSignature: boolean): TeamClashSession => {
    if (session.finished) return session;
    // 复制参战状态，已结算的上一拍和开场阵容都可安全复用。
    const allies = session.allies.map((fighter) => ({ ...fighter }));
    const enemies = session.enemies.map((fighter) => ({ ...fighter }));
    const [actor, ...otherAllies] = allies.filter(可继续交锋);
    const target = enemies.find((fighter) => fighter.key === session.targetKey && 可继续交锋(fighter));
    if (!actor || !target) return session;
    const otherEnemies = enemies.filter((fighter) => fighter !== target && 可继续交锋(fighter));
    const duel = 推演交锋一拍(
        { ...session, playerPosture: actor.posture, playerStamina: actor.stamina, logs: [] },
        move, actor.profile, target.profile, useSignature
    );
    const log = duel.logs[0];
    actor.posture = duel.playerPosture;
    actor.stamina = duel.playerStamina;
    target.posture = duel.enemyPosture;
    target.exposed = duel.enemyExposed;

    const withdrew = log.playerMove === 'withdraw' && duel.finished;
    const supportNotes = withdrew ? [] : [
        ...结算支援出招(otherAllies, otherEnemies.length ? otherEnemies : [target], session.beat),
        ...结算支援出招(otherEnemies, otherAllies.length ? otherAllies : [actor], session.beat)
    ];
    const nextActor = allies.find(可继续交锋);
    const nextEnemy = 可继续交锋(target) ? target : enemies.find(可继续交锋);
    let outcome = withdrew ? duel.outcome : undefined;
    if (!nextActor && !nextEnemy) outcome = '僵持罢手';
    else if (!nextEnemy) outcome = '胜出';
    else if (!nextActor) outcome = '落败撤离';
    const summary = [`${actor.profile.name}对${target.profile.name}，${log.summary}`, ...supportNotes].join('；');
    const next = {
        ...session, allies, enemies, finished: Boolean(outcome), outcome,
        beat: outcome ? session.beat : session.beat + 1, momentum: duel.momentum,
        playerPosture: (nextActor || actor).posture, playerStamina: (nextActor || actor).stamina,
        enemyPosture: target.posture, enemyExposed: target.exposed,
        logs: [...session.logs, { ...log, summary }]
    };
    return nextEnemy && !outcome ? 选定交锋对手(next, nextEnemy.key) : next;
};

export const 结算战术交锋结果 = (params: {
    session: ClashSessionState | TeamClashSession;
    role: 角色数据结构;
}): { nextRole: 角色数据结构; record: 场外战果暂存结构 } => {
    const nextRole: 角色数据结构 = JSON.parse(JSON.stringify(params.role));
    const teams = 'allies' in params.session ? params.session : undefined;
    const postureLost = Math.max(0, 100 - (teams?.allies[0].posture ?? params.session.playerPosture));
    const energy = Math.max(0, Number(nextRole.当前精力 ?? 50));
    const internal = Math.max(0, Number(nextRole.当前内力 ?? 40));
    // 延续原有的 5 点精力保底，低于保底的旧档只按现有精力结算。
    const energyCost = Math.min(Math.max(0, energy - 5), 25, Math.max(5, Math.round(postureLost * 0.2)));
    const internalCost = Math.min(internal, 25, params.session.logs.filter((l) => l.usedSignature).length * 8);
    nextRole.当前精力 = energy - energyCost;
    nextRole.当前内力 = internal - internalCost;

    const outcome = params.session.outcome || '僵持罢手';
    const injuryNote = postureLost >= 60
        ? `激斗后气血震荡（精力-${energyCost}、内力-${internalCost}，受了轻中度挫伤）`
        : postureLost > 0
            ? `短暂交锋略有消耗（精力-${energyCost}、内力-${internalCost}）`
            : `全身而退（精力-${energyCost}、内力-${internalCost}）`;

    const lastBeatNote = params.session.logs[params.session.logs.length - 1]?.summary || '';
    const allyNames = teams?.allies.map((fighter) => fighter.profile.name) ?? [];
    const enemyNames = teams?.enemies.map((fighter) => fighter.profile.name) ?? [params.session.targetName];
    const opponentLabel = params.session.mode === '切磋试探' ? '切磋方' : '敌方';
    const sides = teams ? `己方「${allyNames.join('、')}」与${opponentLabel}「${enemyNames.join('、')}」` : `与「${params.session.targetName}」`;
    const avgPosture = (side: ClashFighter[]) => Math.round(side.reduce((total, fighter) => total + (fighter.leftScene ? 0 : fighter.posture), 0) / side.length);
    const record: 场外战果暂存结构 = {
        id: `clash-${Date.now()}`,
        对手姓名: enemyNames.join('、'),
        npcId: teams && teams.enemies.length > 1 ? undefined : params.session.npcId,
        ...(teams ? { 己方阵容: allyNames, 敌方阵容: enemyNames } : {}),
        模式: params.session.mode,
        结果: outcome,
        回合数: params.session.logs.length || 1,
        主角伤势消耗描述: injuryNote,
        战果摘要: `【战术交锋结果｜${params.session.mode}】${sides}交手 ${params.session.logs.length || 1} 拍，结局为「${outcome}」（己方余势 ${teams ? avgPosture(teams.allies) : params.session.playerPosture}% vs 对手余势 ${teams ? avgPosture(teams.enemies) : params.session.enemyPosture}%；${injuryNote}；收官一拍：${lastBeatNote}）`,
        时间: Date.now()
    };

    return { nextRole, record };
};

export const 构建场外战果注入块 = (records?: 场外战果暂存结构[] | null): string => {
    if (!Array.isArray(records) || records.length === 0) return '';
    return [
        '【本回合前置战术交锋既成事实（玩家已亲自操控出招并结算精力/内力消耗，主剧情必须承接此战果演出，不可推翻）】',
        ...records.map((r) => `- ${r.战果摘要}`)
    ].join('\n');
};
