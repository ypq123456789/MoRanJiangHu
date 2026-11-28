import {
    规范化导演圣经,
    type DirectorCharacterProfile,
    type DirectorWorldBible,
    type FactionLedger
} from '../../models/directorBible';
import type { 剧情系统结构, 剧情规划结构, 世界数据结构, 角色数据结构 } from '../../types';

/**
 * 在流式生成期间提取干净的可见正文文本，自动折叠仍在生成中的 <thinking> 标签。
 */
export const 提取2_0流式正文预览 = (accumulated: string): string => {
    const raw = (accumulated || '').replace(/\r/g, '');
    if (!raw.trim()) return '';
    const bodyStart = raw.match(/<正文>/i);
    if (bodyStart && typeof bodyStart.index === 'number') {
        const afterOpen = raw.slice(bodyStart.index + bodyStart[0].length);
        const closeIdx = afterOpen.search(/<\/正文>/i);
        const bodySlice = closeIdx >= 0 ? afterOpen.slice(0, closeIdx) : afterOpen;
        return bodySlice.replace(/^\s*#{1,4}\s*正文\s*\n?/u, '').trimStart();
    }
    if (/^\s*<thinking>/i.test(raw) && !/<\/thinking>/i.test(raw)) {
        return '（导演正在推演本回合局势与伏笔衔接...）';
    }
    const stripped = raw
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/<角色名单>[\s\S]*?<\/角色名单>/gi, '')
        .trim();
    return stripped || '（正在推演正文...）';
};

/**
 * 为尚未持有 2.0 导演圣经的旧存档或手动开局无缝合成一份结构化导演圣经，
 * 让既有存档从下一回合起即可直接使用 2.0 因果推演、伏笔台账与动态重规划。
 */
export const 从状态构建2_0导演圣经 = (params: {
    worldPrompt?: string;
    role?: 角色数据结构 | null;
    social?: any[];
    world?: Partial<世界数据结构> | null;
    story?: 剧情系统结构 | null;
    storyPlan?: 剧情规划结构 | null;
}): DirectorWorldBible => {
    const { worldPrompt = '', role, social = [], world, story, storyPlan } = params;
    const playerName = (role?.姓名 || '主角').trim();

    const factionLedgers: FactionLedger[] = (Array.isArray(world?.势力列表) ? world.势力列表 : [])
        .filter((f) => f && f.名称)
        .map((f, idx) => ({
            id: f.ID || `FCT-${String(idx + 1).padStart(3, '0')}`,
            名称: f.名称,
            类型: f.类型 || '门派',
            实力等级: Number(f.实力等级) || 5,
            层级: Number(f.实力等级) >= 8 ? 3 : (Number(f.实力等级) >= 5 ? 2 : 1),
            领袖: '掌门执事',
            核心人物: [],
            内部裂痕: f.当前状态 || '各方利益暗中角力',
            对外公开立场: f.描述 || '维持既定格局',
            真实诉求与暗中图谋: f.代表性物品风格 ? `争夺核心传承与稀缺资源（${f.代表性物品风格}）` : '扩张势力范围与门路',
            致命弱点或忌讳: '内部资源分配失衡与外部宿敌渗入',
            跨势力账目: Object.entries(f.关系网 || {}).map(([peer, rel]) => ({
                对方势力: peer,
                关系: String(rel || '暗中制衡'),
                具体渊源: '旧局延续的利益牵扯'
            })),
            地盘: f.地盘归属 ? [f.地盘归属] : []
        }));

    const castProfiles: DirectorCharacterProfile[] = (Array.isArray(social) ? social : [])
        .filter((npc) => npc && npc.姓名 && npc.姓名 !== playerName)
        .slice(0, 8)
        .map((npc, idx) => ({
            id: npc.id || `CAST-${String(idx + 1).padStart(3, '0')}`,
            姓名: npc.姓名,
            性别: npc.性别 === '男' ? '男' : '女',
            身份与势力: npc.身份 || npc.所属门派 || '江湖中人',
            所处层级: npc.重要性 === '核心' ? 2 : 1,
            生平与过往执念: npc.简介 || `${npc.身份 || '身在江湖'}，各自背负过往纠葛`,
            表层伪装: npc.核心性格特征 || '依身份谨慎应对',
            真实诉求与利益底线: '保全自身安危与核心利益，在变局中寻找筹码',
            隐藏秘密: typeof npc.隐藏设定 === 'string' && npc.隐藏设定.trim() ? npc.隐藏设定.trim() : '尚待在后续交锋中显露的私心与旧账',
            初始认知边界: {
                已知事实: Array.isArray(npc.记忆) && npc.记忆.length > 0 ? npc.记忆.slice(-3) : ['与主角既有交集线索'],
                盲区: ['主角全部底牌与远端顶层全貌']
            },
            人际渊源: [{ 对象: playerName, 真实关系与心思: npc.关系 || '有所牵连' }],
            幕后当前日程: {
                当前目标: npc.是否在场 !== false ? '围绕当前场面观察试探并权衡得失' : '在外部暗中推进自身筹谋',
                正在推进的步骤: '按既有立场收集线索与试探盟友',
                行动倒计时回合: npc.是否在场 !== false ? 2 : (idx % 3) + 1,
                已触发影响: []
            },
            是否已登场: true
        }));

    const actTitle = story?.当前章节?.标题 || '承接变局';
    const legacyActNum = Number(story?.当前章节?.当前分解组);
    const resolvedActNum = Number.isInteger(legacyActNum) && legacyActNum >= 1 ? legacyActNum : 1;
    const actGoal = Array.isArray(storyPlan?.当前章目标) && storyPlan.当前章目标.length > 0
        ? storyPlan.当前章目标.join('；')
        : '理清眼前局势并撬动破局筹码';
    const problems = Array.isArray(story?.当前章节?.当前待解问题) ? story.当前章节.当前待解问题 : [];

    return 规范化导演圣经({
        版本: '2.0',
        世界观表层摘要: worldPrompt.slice(0, 400) || '既有世界观延续局面',
        顶层隐秘秩序: '各层级势力依靠关键修炼资源与情报渠道维持统治垄断，表层秩序下暗藏利益交换与派系倾轧。',
        核心历史原罪: '过往争霸或变故遗留的结构性裂痕正在向下传导。',
        终局方向与逆推因果: '顺着眼前危机深挖多方利益账本与关键信物，逐步撬动更高层级的势力格局。',
        空间阶梯: [
            {层级序号: 1, 层级名称: '底层江湖/散修圈', 典型区域: ['镇市据点'], 准入壁垒: '资源匮乏与生存压迫', 核心资源与垄断者: '基础资粮与门路', 主要压迫冲突: '地头盘剥与保命博弈'},
            {层级序号: 2, 层级名称: '宗门与地方势力', 典型区域: ['府城/宗门'], 准入壁垒: '门第/修为/投名状', 核心资源与垄断者: '灵脉与密令权', 主要压迫冲突: '派系倾轧与黑市暗流'}
        ],
        前史导火索: [
            {
                事件名: actTitle,
                发生时间: '既定前情',
                真实经过: problems.join('；') || actGoal,
                表层流言版本: actGoal,
                卷入各方: factionLedgers.slice(0, 3).map((f) => f.名称),
                留下的烫手筹码或危机: problems[0] || '多方试探已逼至眼前'
            }
        ],
        主角核心困局: {
            开局处境: actGoal,
            最大威胁源: factionLedgers[0]?.名称 || '既有对立势力',
            手中唯一筹码或信息差: '过往积累的同行羁绊与既有线索',
            短中期推进动力: problems[0] || actGoal
        },
        宏观分幕大纲: [
            {
                幕次: resolvedActNum,
                标题: actTitle,
                核心矛盾: problems[0] || actGoal,
                主角目标与破局路径: actGoal,
                关键势力与人物: castProfiles.slice(0, 3).map((c) => c.姓名),
                跃迁至下一幕条件: story?.当前章节?.原著换章条件?.[0] || '突破当前局面进入更高层级交锋',
                当前状态: '推进中'
            }
        ],
        当前幕次: resolvedActNum,
        势力暗账: factionLedgers,
        核心卡司: castProfiles,
        伏笔台账: (Array.isArray(storyPlan?.跨章延续事项) ? storyPlan.跨章延续事项 : []).slice(0, 4).map((c, idx) => {
            const carrier = c.标题 || `待查线索 ${idx + 1}`;
            const rawSecretHint = (c.后续接续条件 || []).join('；').trim();
            return {
                id: `FS-${String(idx + 1).padStart(3, '0')}`,
                类型: '前史旧案',
                表面载体: carrier,
                底层真相: rawSecretHint ? `待在后续剧情中揭晓：${rawSecretHint}` : '待在后续剧情中揭晓真实因果',
                知情人: [],
                盲区人物: [playerName],
                建议埋设阶段: '当前幕',
                建议回收阶段: c.延续到何时 || '后续幕次',
                触发或回收条件: `沿着「${carrier}」的线索追查关联人物与异动`,
                状态: '已埋设'
            };
        })
    });
};

export interface 玩家可见世界圣经概览 {
    世界观表层摘要: string;
    当前幕次: number;
    空间阶梯: Array<{
        层级序号: number;
        层级名称: string;
        典型区域: string[];
        准入壁垒: string;
        核心资源与垄断者: string;
        主要压迫冲突: string;
    }>;
    公开分幕大纲: Array<{
        幕次: number;
        标题: string;
        核心矛盾: string;
        主角目标与破局路径: string;
        关键势力与人物: string[];
        当前状态: string;
    }>;
}

/**
 * 提取 strictly 非剧透的 2.0 世界观公共概览，供玩家在「世界 → 世界总纲」随时查阅世界格局、空间阶梯与当前可见分幕脉络。
 */
export const 提取玩家可见世界圣经概览 = (
    bible?: DirectorWorldBible | null
): 玩家可见世界圣经概览 | null => {
    if (!bible) return null;
    const currentAct = Number(bible.当前幕次) || 1;
    const acts = (Array.isArray(bible.宏观分幕大纲) ? bible.宏观分幕大纲 : [])
        .filter((act) => act && (act.幕次 <= currentAct || act.当前状态 === '推进中' || act.当前状态 === '已完成' || act.当前状态 === '已重规划'))
        .map((act) => ({
            幕次: act.幕次,
            标题: act.标题 || `第 ${act.幕次} 幕`,
            核心矛盾: act.核心矛盾 || '',
            主角目标与破局路径: act.主角目标与破局路径 || '',
            关键势力与人物: Array.isArray(act.关键势力与人物) ? act.关键势力与人物 : [],
            当前状态: act.当前状态 || '推进中'
        }));
    return {
        世界观表层摘要: (bible.世界观表层摘要 || '').trim(),
        当前幕次: currentAct,
        空间阶梯: Array.isArray(bible.空间阶梯) ? bible.空间阶梯 : [],
        公开分幕大纲: acts
    };
};
