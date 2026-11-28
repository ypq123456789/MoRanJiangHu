import type { DirectorCharacterProfile, DirectorWorldBible, ForeshadowingItem } from '../../models/directorBible';
import type { 游戏设置结构 } from '../../types';

export interface SceneBriefOutput {
    directorBriefText: string;
    knowledgeIsolationText: string;
    activeCastNames: string[];
    focusForeshadowId?: string;
}

const 匹配时间关键词排序 = (item: ForeshadowingItem): number => {
    const stage = item.建议埋设阶段 || '';
    if (/开局|第[012]/.test(stage)) return 0;
    if (/第一幕|前期/.test(stage)) return 1;
    return 2;
};

export const 挑选本回合待埋或推进伏笔 = (
    bible: DirectorWorldBible,
    turnIndex: number
): ForeshadowingItem | undefined => {
    const ledger = Array.isArray(bible.伏笔台账) ? bible.伏笔台账 : [];
    const briefId = bible.下回合导演简报?.待埋或推进伏笔ID;
    if (briefId) {
        const direct = ledger.find((f) => f.id === briefId && f.状态 !== '已回收');
        if (direct) return direct;
    }

    const unplanted = ledger
        .filter((f) => f.状态 === '未埋设')
        .sort((a, b) => 匹配时间关键词排序(a) - 匹配时间关键词排序(b));
    if (turnIndex === 0 || turnIndex <= 2) {
        if (unplanted.length > 0) return unplanted[0];
    }

    const plantedOrFermenting = ledger.filter((f) => f.状态 === '已埋设' || f.状态 === '发酵中');
    if (turnIndex >= 3 && plantedOrFermenting.length > 0) {
        return plantedOrFermenting[0];
    }
    return unplanted[0] || plantedOrFermenting[0];
};

const 格式化角色信息隔离卡片 = (cast: DirectorCharacterProfile, briefHintMap: Map<string, { 内心真实算计: string; 本回合绝不能透露: string }>): string => {
    const hint = briefHintMap.get(cast.姓名);
    const knows = (cast.初始认知边界?.已知事实 || []).slice(0, 4).join('；') || '仅掌握自身立场可见信息';
    const blind = (cast.初始认知边界?.盲区 || []).slice(0, 4).join('；') || '无特殊盲区';
    const dontLeak = hint?.本回合绝不能透露 || cast.隐藏秘密 || '幕后真凶与跨幕真相';
    return [
        `- 【${cast.姓名}】(${cast.身份与势力 || '散修/未明'} | 第${cast.所处层级}层)`,
        `  · 过往执念与动机：${cast.生平与过往执念}｜底线/诉求：${cast.真实诉求与利益底线}`,
        `  · 表面演法：${cast.表层伪装 || '按身份谨慎行事'}`,
        ...(hint?.内心真实算计 ? [`  · 此刻内心算计：${hint.内心真实算计}`] : []),
        `  · 信息隔离墙：已知=[${knows}]；盲区=[${blind}]；本回合严禁直接道破=[${dontLeak}]`
    ].join('\n');
};

export const 构建本回合导演简报 = (params: {
    bible: DirectorWorldBible;
    turnIndex: number;
    playerName: string;
    partnerName?: string;
    presentNpcNames: string[];
    gameConfig: 游戏设置结构;
}): SceneBriefOutput => {
    const { bible, turnIndex, playerName, partnerName, presentNpcNames } = params;
    const activeAct = bible.宏观分幕大纲.find((a) => a.幕次 === bible.当前幕次)
        || bible.宏观分幕大纲.find((a) => a.当前状态 === '推进中')
        || bible.宏观分幕大纲[0];

    const focusForeshadow = 挑选本回合待埋或推进伏笔(bible, turnIndex);
    const brief = bible.下回合导演简报;

    const hintMap = new Map<string, { 内心真实算计: string; 本回合绝不能透露: string }>();
    for (const h of brief?.在场人物私密动向提示 || []) {
        if (h?.姓名) hintMap.set(h.姓名, h);
    }

    const nameSet = new Set([
        ...presentNpcNames,
        ...(partnerName ? [partnerName] : []),
        ...(brief?.在场人物私密动向提示 || []).map((h) => h.姓名)
    ].filter((n) => Boolean(n) && n !== playerName));

    const presentSet = new Set(presentNpcNames.filter((n) => Boolean(n) && n !== playerName));
    const npcCast = bible.核心卡司.filter((c) => c.姓名 !== playerName);

    const matchedCast = npcCast.filter((c) => nameSet.has(c.姓名));
    const fallbackLowTier = matchedCast.length > 0
        ? matchedCast
        : npcCast.filter((c) => c.所处层级 <= 2).slice(0, 3);

    const imminentSpillovers = [
        ...(brief?.即将落地的外溢世界波及 || []),
        ...npcCast
            .filter((c) => !presentSet.has(c.姓名) && c.幕后当前日程?.行动倒计时回合 <= 1 && c.幕后当前日程?.当前目标)
            .map((c) => `[逼近风波] ${c.姓名}(${c.身份与势力})的行动“${c.幕后当前日程.当前目标}”正处于临爆边缘（${c.幕后当前日程.正在推进的步骤}）`)
    ].filter(Boolean);

    const alreadyPlantedReminders = bible.伏笔台账
        .filter((f) => f.状态 === '已埋设' || f.状态 === '发酵中')
        .slice(0, 4)
        .map((f) => `- ${f.id} (${f.状态}): 载体「${f.表面载体}」${f.埋设落点描述 ? ` | 前文落点：${f.埋设落点描述}` : ''}`);

    if (turnIndex === 0) {
        const incident = bible.前史导火索[0];
        const secondIncident = bible.前史导火索[1];
        const directorLines = [
            `【2.0 剧情导演开局简报（绝密演出指导，禁止直接照念或剧透给主角/读者）】`,
            `- 当前幕次：第${activeAct?.幕次 || 1}幕「${activeAct?.标题 || '入局破冰'}」`,
            `- 本幕核心矛盾：${activeAct?.核心矛盾 || bible.主角核心困局.开局处境}`,
            `- 主角(${playerName})开局困局：处境=${bible.主角核心困局.开局处境}；最大威胁=${bible.主角核心困局.最大威胁源}；手里筹码=${bible.主角核心困局.手中唯一筹码或信息差}`,
            incident ? `- 【开局前已引爆的导火索（第0回合直接切入点）】：${incident.发生时间}发生「${incident.事件名}」——表层流言：${incident.表层流言版本}；实情暗流（严禁旁白全知直说）：${incident.真实经过}；留给主角眼前的烫手问题：${incident.留下的烫手筹码或危机}` : '',
            secondIncident ? `- 【外围背景暗潮】：${secondIncident.发生时间}「${secondIncident.事件名}」已牵动 ${secondIncident.卷入各方.join('、')}，正通过封锁/盘查/传闻波及本地。` : '',
            focusForeshadow ? `- 【第0回合必须悄然埋下的伏笔 ${focusForeshadow.id}】：只展现表面载体「${focusForeshadow.表面载体}」（允许作为物件异常、流言细节或人物下意识反应），绝对禁止点破底层真相「${focusForeshadow.底层真相}」` : '',
            '- 【开局硬约束】：禁止写“清晨起床洗漱散步、去砍三车竹子交差、跑腿干杂活”式流水账！第 0 回合必须在生活细节中立刻落下“已发生的变故余波 / 试探 / 烫手信物或隐秘危机”，让第一幕本身就有钩子与呼吸感。',
            '- 【风格与亲密约束】：尊重角色关系起点与危机压力；哪怕开启了 NTL/后宫偏好，开局也必须先立住人物立场、威胁与真实利益绑定，不得强行靠低级滑倒、莫名贴胸推进感情。'
        ].filter(Boolean).join('\n');

        const isolationLines = [
            '【开局核心卡司立场与信息隔离（只准演表面，严禁全知说漏）】',
            ...fallbackLowTier.map((c) => 格式化角色信息隔离卡片(c, hintMap))
        ].join('\n');

        return {
            directorBriefText: directorLines,
            knowledgeIsolationText: isolationLines,
            activeCastNames: fallbackLowTier.map((c) => c.姓名),
            focusForeshadowId: focusForeshadow?.id
        };
    }

    const directorLines = [
        `【2.0 剧情导演第 ${turnIndex} 回合演出简报（仅供演出调度，严禁剧透）】`,
        `- 当前幕次：第${activeAct?.幕次 || bible.当前幕次}幕「${activeAct?.标题 || '推进'}」| 主轴：${activeAct?.主角目标与破局路径 || bible.主角核心困局.短中期推进动力}`,
        brief?.本回合舞台焦点 ? `- 本回合舞台焦点：${brief.本回合舞台焦点}` : '',
        brief?.必须守住的悬念或冲突 ? `- 必须守住的核心张力：${brief.必须守住的悬念或冲突}` : '',
        focusForeshadow ? (() => {
            const matchedCustomDirection = brief?.待埋或推进伏笔ID === focusForeshadow.id && brief?.待埋伏笔演出方式
                ? brief.待埋伏笔演出方式
                : '';
            const defaultDirection = focusForeshadow.状态 === '未埋设'
                ? '本回合找自然契机在动作/细节/闲谈中悄悄露出此表面载体，切忌解释真相！'
                : `根据玩家行动评估是否继续发酵或触及回收条件「${focusForeshadow.触发或回收条件}」`;
            return `- 【本回合重点伏笔 ${focusForeshadow.id}（当前状态：${focusForeshadow.状态}）】：载体「${focusForeshadow.表面载体}」。${matchedCustomDirection || defaultDirection}`;
        })() : '',
        imminentSpillovers.length > 0 ? `- 【本回合正在传导至眼前的远端连锁反应】：\n  ${imminentSpillovers.map((x) => `* ${x}`).join('\n  ')}` : '',
        alreadyPlantedReminders.length > 0 ? `- 【前文已埋设线索提醒（保持连贯，不可吃书）】：\n  ${alreadyPlantedReminders.join('\n  ')}` : '',
        brief?.下一拍预计走向 ? `- 后续预埋势头：${brief.下一拍预计走向}` : ''
    ].filter(Boolean).join('\n');

    const isolationLines = [
        '【在场/关联角色心机与信息隔离墙】',
        ...fallbackLowTier.map((c) => 格式化角色信息隔离卡片(c, hintMap)),
        '（铁律：任何 NPC 只能依据自己的“已知事实”和“真实诉求”说话试探；若主角偏离原计划，角色要基于自身利益当场做出真实反应，不得强行降智配合。）'
    ].join('\n');

    return {
        directorBriefText: directorLines,
        knowledgeIsolationText: isolationLines,
        activeCastNames: fallbackLowTier.map((c) => c.姓名),
        focusForeshadowId: focusForeshadow?.id
    };
};
