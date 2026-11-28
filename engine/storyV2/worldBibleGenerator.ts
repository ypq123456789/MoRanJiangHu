import {
    将势力暗账投影为世界势力,
    规范化导演圣经,
    type DirectorWorldBible
} from '../../models/directorBible';
import { 地图层级命名契约, 地图层级命名自检 } from '../../prompts/runtime/mapLayerNaming';
import { 规范化文本补全消息链, 请求模型文本, type 通用消息 } from '../../services/ai/chatCompletionClient';
import { 提取首个标签内容 } from '../../services/ai/storyResponseParser';
import type { OpeningConfig, 角色数据结构, 地图层级结构, 游戏设置结构 } from '../../types';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { parseJsonWithRepair } from '../../utils/jsonRepair';
import { 读取伙伴列表 } from '../../utils/openingCompanion';
import { 题材是否仙侠 } from '../../utils/topicModeProfiles';

const 地图节点下限 = 24;
const 空间阶梯下限 = 3;
const 势力数量下限 = 6;
const 跨势力账目下限 = 2;
const 核心卡司下限 = 7;
const 伏笔数量下限 = 6;
const 宏观分幕下限 = 4;

const 地图层级深度: Record<string, number> = {
    寰宇: 0,
    大地点: 1,
    中地点: 2,
    小地点: 3,
    区地点: 4,
    子区域: 4,
    子地点: 5
};

const 校验地图树结构 = (mapLayers: 地图层级结构[]): string[] => {
    const issues: string[] = [];
    if (mapLayers.length < 地图节点下限) {
        issues.push(`<世界基底>地图层级仅 ${mapLayers.length} 个（需至少 ${地图节点下限} 个完整六层节点）`);
        return issues;
    }
    const byId = new Map<string, 地图层级结构>();
    for (const node of mapLayers) {
        if (!node.ID || byId.has(node.ID)) {
            issues.push(`<世界基底>存在空 ID 或重复节点 ID：${node.ID || node.名称}`);
            return issues;
        }
        byId.set(node.ID, node);
    }
    const roots = mapLayers.filter((n) => n.层级 === '寰宇');
    if (roots.length < 1) {
        issues.push('<世界基底>缺少根节点（层级=寰宇）');
        return issues;
    }
    for (const node of mapLayers) {
        const tier = 地图层级深度[node.层级];
        if (tier === undefined) {
            issues.push(`<世界基底>节点「${node.名称}」层级「${node.层级}」非法`);
            return issues;
        }
        if (node.层级 === '寰宇') continue;
        const pid = (node.父级ID || '').trim();
        if (!pid) {
            issues.push(`<世界基底>非根节点「${node.名称}」缺少父级ID`);
            return issues;
        }
        if (pid === node.ID) {
            issues.push(`<世界基底>节点「${node.名称}」父级ID指向自身`);
            return issues;
        }
        const parent = byId.get(pid);
        if (!parent) {
            issues.push(`<世界基底>节点「${node.名称}」的父级ID「${pid}」不存在`);
            return issues;
        }
        const parentTier = 地图层级深度[parent.层级];
        if (parentTier === undefined || tier !== parentTier + 1) {
            issues.push(`<世界基底>节点「${node.名称}」(${node.层级}) 与父节点「${parent.名称}」(${parent.层级}) 层级不相邻`);
            return issues;
        }
        // Check cycle
        const visited = new Set<string>([node.ID]);
        let cursor: 地图层级结构 | undefined = parent;
        while (cursor && cursor.层级 !== '寰宇') {
            if (visited.has(cursor.ID)) {
                issues.push(`<世界基底>节点「${node.名称}」存在父子循环引用`);
                return issues;
            }
            visited.add(cursor.ID);
            cursor = cursor.父级ID ? byId.get(cursor.父级ID) : undefined;
        }
    }
    return issues;
};

export interface WorldBibleGenerationResult {
    worldPrompt: string;
    mapLayers: 地图层级结构[];
    directorBible: DirectorWorldBible;
    rawText: string;
}

const 清理代码块 = (raw: string): string => (
    (raw || '')
        .replace(/^```(?:json|JSON|markdown|text)?\s*/g, '')
        .replace(/\s*```$/g, '')
        .trim()
);

const 规范化地图节点数组 = (raw: unknown): 地图层级结构[] => {
    if (!Array.isArray(raw)) return [];
    const items = raw.filter((item: any) => item && typeof item === 'object' && typeof item.名称 === 'string' && item.名称.trim());
    const byId = new Map<string, any>();
    items.forEach((item: any, idx: number) => {
        const id = typeof item.ID === 'string' && item.ID.trim() ? item.ID.trim() : `DT-${String(idx + 1).padStart(3, '0')}`;
        byId.set(id, { ...item, _resolvedId: id });
    });

    const resolveBelonging = (node: any) => {
        const chain: Array<{ 层级: string; 名称: string }> = [];
        let cur = node;
        const visited = new Set<string>();
        while (cur && !visited.has(cur._resolvedId)) {
            visited.add(cur._resolvedId);
            chain.push({ 层级: cur.层级 || '', 名称: String(cur.名称 || '').trim() });
            const pid = typeof cur.父级ID === 'string' ? cur.父级ID.trim() : '';
            cur = pid ? byId.get(pid) : undefined;
        }
        const findLayer = (lv: string) => chain.find((c) => c.层级 === lv)?.名称 || '';
        return {
            大地点: findLayer('大地点') || '九州境',
            中地点: findLayer('中地点') || findLayer('大地点') || String(node.名称 || '').trim(),
            小地点: findLayer('小地点') || findLayer('区地点') || findLayer('子地点') || findLayer('中地点') || String(node.名称 || '').trim()
        };
    };

    return Array.from(byId.values()).map((item: any) => {
        const x = Number.isFinite(Number(item.坐标X)) ? Number(item.坐标X) : 50;
        const y = Number.isFinite(Number(item.坐标Y)) ? Number(item.坐标Y) : 50;
        const r = Number.isFinite(Number(item.范围半径)) ? Number(item.范围半径) : 10;
        return {
            ID: item._resolvedId,
            名称: String(item.名称).trim(),
            层级: item.层级 || '中地点',
            父级ID: typeof item.父级ID === 'string' ? item.父级ID.trim() : '',
            描述: typeof item.描述 === 'string' ? item.描述.trim() : '',
            ...(typeof item.叙事核心 === 'string' && item.叙事核心.trim() ? { 叙事核心: item.叙事核心.trim() } : {}),
            归属: item.归属 && typeof item.归属 === 'object' ? item.归属 : resolveBelonging(item),
            锚点坐标: item.锚点坐标 || { x, y },
            网格宽度: Number.isFinite(Number(item.网格宽度)) ? Number(item.网格宽度) : r * 2,
            网格高度: Number.isFinite(Number(item.网格高度)) ? Number(item.网格高度) : r * 2,
            边界四角坐标: Array.isArray(item.边界四角坐标) && item.边界四角坐标.length === 4
                ? item.边界四角坐标
                : [
                    { x: x - r, y: y - r },
                    { x: x + r, y: y - r },
                    { x: x + r, y: y + r },
                    { x: x - r, y: y + r }
                ],
            建筑物ID列表: Array.isArray(item.建筑物ID列表) ? item.建筑物ID列表 : [],
            道路ID列表: Array.isArray(item.道路ID列表) ? item.道路ID列表 : [],
            人物ID列表: Array.isArray(item.人物ID列表) ? item.人物ID列表 : []
        } as 地图层级结构;
    });
};

const 评估圣经完整度 = (bible: DirectorWorldBible, partnerNames: string[] = []): string[] => {
    const issues: string[] = [];
    if (!bible.顶层隐秘秩序 || bible.顶层隐秘秩序.length < 15) issues.push('缺少具体的顶层隐秘秩序/垄断链条');
    if (!bible.核心历史原罪 || bible.核心历史原罪.length < 15) issues.push('缺少核心历史原罪/世界裂痕根源');
    if (bible.空间阶梯.length < 空间阶梯下限) issues.push(`空间阶梯不足（当前 ${bible.空间阶梯.length} 级，需至少 ${空间阶梯下限} 级）`);
    if (bible.势力暗账.length < 势力数量下限) issues.push(`势力暗账不足 ${势力数量下限} 个（当前 ${bible.势力暗账.length} 个）`);

    const missingLeader = bible.势力暗账.filter((f) => !f.领袖 || f.领袖 === '无' || f.领袖 === '暂无');
    if (missingLeader.length > 0) {
        issues.push(`存在无具名领袖的空壳势力：${missingLeader.map((f) => f.名称).join('、')}`);
    }
    const missingCross = bible.势力暗账.filter((f) => !f.跨势力账目 || f.跨势力账目.length < 跨势力账目下限);
    if (missingCross.length > 0) {
        issues.push(`存在跨势力账目不足 ${跨势力账目下限} 条的势力：${missingCross.map((f) => f.名称).join('、')}`);
    }
    if (bible.核心卡司.length < 核心卡司下限) issues.push(`核心卡司不足 ${核心卡司下限} 人（当前 ${bible.核心卡司.length} 人）`);
    const tiers = new Set(bible.核心卡司.map((c) => c.所处层级));
    if (tiers.size < 2) issues.push('核心卡司只集中在单一层级，缺少跨层级角色联动');
    for (const pName of partnerNames) {
        if (pName && !bible.核心卡司.some((c) => c.姓名 === pName)) {
            issues.push(`开局同伴「${pName}」未被写入核心卡司档案与秘密线`);
        }
    }
    if (bible.前史导火索.length < 1) issues.push('缺少开局前数日内已引爆的前史导火索事件');
    if (!bible.主角核心困局.最大威胁源 || !bible.主角核心困局.手中唯一筹码或信息差) {
        issues.push('缺少主角开局根本困局或信息差筹码');
    }
    if (bible.宏观分幕大纲.length < 宏观分幕下限) issues.push(`宏观分幕大纲不足 ${宏观分幕下限} 幕（当前 ${bible.宏观分幕大纲.length} 幕）`);
    if (bible.伏笔台账.length < 伏笔数量下限) issues.push(`伏笔台账不足 ${伏笔数量下限} 枚（当前 ${bible.伏笔台账.length} 枚）`);
    return issues;
};

const 确保核心结构兜底 = (
    bible: DirectorWorldBible,
    params: { charData: 角色数据结构; openingConfig: OpeningConfig; worldPrompt: string }
): DirectorWorldBible => {
    const playerName = (params.charData?.姓名 || '').trim();
    const filteredCast = (bible.核心卡司 || [])
        .filter((c) => c && c.姓名 && c.姓名.trim() !== playerName)
        .map((c) => ({
            ...c,
            幕后当前日程: {
                ...c.幕后当前日程,
                行动倒计时回合: Math.min(4, Math.max(1, Number(c.幕后当前日程?.行动倒计时回合) || 2))
            }
        }));
    const next: DirectorWorldBible = {
        ...bible,
        核心卡司: filteredCast,
        世界观表层摘要: bible.世界观表层摘要 || params.worldPrompt.slice(0, 500)
    };

    const enabledPartners = 读取伙伴列表(params.openingConfig);
    for (let idx = enabledPartners.length - 1; idx >= 0; idx -= 1) {
        const { partner, name } = enabledPartners[idx];
        if (!name || name === playerName || next.核心卡司.some((c) => c.姓名 === name)) continue;
        next.核心卡司.unshift({
            id: `CAST-${String(next.核心卡司.length + 1).padStart(3, '0')}`,
            姓名: name,
            性别: (partner.性别 as any) || '女',
            身份与势力: partner.背景名称 || '江湖旁支同路人',
            所处层级: 1,
            生平与过往执念: `${partner.背景描述 || '出身旁支'}，${partner.性格 || '重诺隐忍，深知底层身不由己'}`,
            表层伪装: '稳重可靠的同行伙伴，时刻提醒风险',
            真实诉求与利益底线: '保住自身与至亲生路，不被家族或宗门当作弃子献祭',
            隐藏秘密: `${name}所属支脉近期卷入了一桩涉及高层密令的旧案，正借同行掩护暗中脱身或寻觅生机。`,
            初始认知边界: {
                已知事实: ['主角的过往底色与性情', '自身支脉近期遭遇异常追索的端倪'],
                盲区: ['前史导火索背后的顶层博弈全貌']
            },
            人际渊源: [{ 对象: params.charData.姓名, 真实关系与心思: '自幼相识或患难与共、互为依托，却也各自藏有底牌' }],
            幕后当前日程: {
                当前目标: '在追查收紧前确认一件旧信物的安全去处',
                正在推进的步骤: '借日常同行遮掩行踪，暗中试探主角是否可托付重担',
                行动倒计时回合: 2,
                已触发影响: []
            },
            是否已登场: true
        });
    }

    if (next.宏观分幕大纲.length > 0 && !next.宏观分幕大纲.some((a) => a.当前状态 === '推进中')) {
        next.宏观分幕大纲[0].当前状态 = '推进中';
    }
    const activeAct = next.宏观分幕大纲.find((a) => a.当前状态 === '推进中') || next.宏观分幕大纲[0];
    if (activeAct) next.当前幕次 = activeAct.幕次;

    return next;
};

export const 生成世界与导演圣经V2 = async (params: {
    worldConfig: {
        worldName: string;
        worldSize?: string;
        dynastySetting?: string;
        sectDensity?: string;
        tianjiaoSetting?: string;
        difficulty?: string;
        worldExtraRequirement?: string;
    };
    charData: 角色数据结构;
    openingConfig: OpeningConfig;
    apiConfig: 当前可用接口结构;
    extraPrompt?: string;
    signal?: AbortSignal;
    stream?: boolean;
    onDelta?: (delta: string, accumulated: string) => void;
}): Promise<WorldBibleGenerationResult> => {
    const { worldConfig, charData, openingConfig, apiConfig, extraPrompt, signal, stream = true, onDelta } = params;
    const enabledPartners = 读取伙伴列表(openingConfig);
    const partnerHint = enabledPartners.length > 0
        ? `初始同伴（共 ${enabledPartners.length} 人）：${enabledPartners.map(({ partner, name }) => `${name}（${partner.性别 || '女'}，${partner.背景名称 || ''}，性格：${partner.性格 || ''}，关系：${partner.关系 || '自幼相识'}）`).join('；')}`
        : '无预设初始同伴';

    const systemPrompt = [
        '你是《墨色江湖 2.0》专精《道君》《庆余年》《蛊真人》级长篇因果网文架构的【总编剧兼世界架构师】。',
        '你的任务是构建一台【开局前就已经上了发条的高压因果机器】：',
        '所有势力利益链、跨层级重要角色、前史导火索与伏笔台账都像精密齿轮一样相互咬合，开局即卷入危局与博弈。',
        '你必须严格写出完整规模的结构化设定，绝不允许只用 1~2 条示例敷衍交差。'
    ].join('\n');

    const userPrompt = [
        `请为题材【${openingConfig?.题材模式 || '仙侠'}】世界「${worldConfig.worldName || '太古界'}」一次性生成表层世界观、树状地图基底与【2.0 导演圣经】。`,
        '',
        '【玩家输入与开局锚点】',
        `- 世界规模：${worldConfig.worldSize || '九州宏大'} | 局势：${worldConfig.dynastySetting || '群雄逐鹿，王朝末年'} | 宗门密度：${worldConfig.sectDensity || '林立'} | 天骄氛围：${worldConfig.tianjiaoSetting || '大争之世'}`,
        `- 主角建档：${charData.姓名}（${charData.性别}，${charData.年龄}岁），背景：${charData.出身背景?.名称 || '散修遗孤'}（${charData.出身背景?.描述 || ''}），性格：${charData.性格 || ''}，天赋：${(charData.天赋列表 || []).map((t) => `${t.名称}(${t.描述})`).join('、') || '无'}`,
        `- ${partnerHint}`,
        worldConfig.worldExtraRequirement ? `- 额外要求：${worldConfig.worldExtraRequirement}` : '',
        extraPrompt ? `\n【题材模式/边界系统补充规范】\n${extraPrompt}` : '',
        '',
        '【必须严格输出以下 3 个顶层标签块】',
        '<thinking>',
        '在这里先用极高密度推演：',
        '1. 本世界顶层的垄断利益链与历史原罪是什么？（类似《道君》商颂破天/离歌补天/八宝立国+九圣霸占狐仙果）',
        '2. 开局前 7~14 天刚发生了哪 1~2 件已经把各方炸锅的前史大事？这股冲击波怎么在今天直接砸到主角与同伴脸上？',
        '3. 各势力的实权领袖是谁、内部有什么裂痕、彼此有什么旧怨或暗账？',
        '4. 跨 1~4 个权力层级的 7~8 个核心人物分别求什么、藏着什么秘密、目前知道什么不知道什么、正在暗中推进什么日程？',
        '5. 埋哪 6 枚前期看似不起眼、实则勾连上层真相的伏笔（物件/流言/怪癖/旧案/地脉/暗桩）？',
        '</thinking>',
        '',
        '<世界观>',
        '写一份 800~1400 字的【表层世界共识】（纯中文散文分段，不使用 Markdown 标题/符号）。涵盖：世界格局、四级空间与阶层生态、修行/力量境界与代价、当前山雨欲来的社会潜流。只写“世人常识层面的认知”，不剧透底层幕后真相。',
        '</世界观>',
        '',
        '<世界基底>',
        '输出紧凑合法 JSON，包含：',
        '- `地图层级`：约 28~34 个节点，严格遵守六层树结构：`1个寰宇 -> 4个大地点 -> 8个中地点 -> 12~16个小地点 -> 2~3个区地点（开局所在小地点下设） -> 1~2个子地点`。',
        '  其中每个节点字段为 `{ "ID": "DT-001", "名称": "...", "层级": "寰宇|大地点|中地点|小地点|区地点|子地点", "父级ID": "...", "描述": "...", "叙事核心": "仅关键地点填写该处的历史隐患或暗流", "坐标X": 50, "坐标Y": 50, "范围半径": 10 }`。',
        地图层级命名契约,
        地图层级命名自检,
        '</世界基底>',
        '',
        '<导演圣经>',
        '输出紧凑合法 JSON（仅导演后端可见，放开手脚写透因果、秘密、人物驱动力与长线结构），必须严格匹配以下键名：',
        '{',
        '  "世界观表层摘要": "300字内概括",',
        '  "顶层隐秘秩序": "最高层靠什么规则/稀缺物/执法者垄断天下，世人误以为的规则与真实规则有何偏差",',
        '  "核心历史原罪": "造成如今崩坏/大争局面的源头事件与关键遗物",',
        '  "终局方向与逆推因果": "长线终局可能指向什么破局方向，需要集齐或撬动什么因果",',
        '  "空间阶梯": [',
        '    { "层级序号": 1, "层级名称": "底层求生圈", "典型区域": ["..."], "准入壁垒": "...", "核心资源与垄断者": "...", "主要压迫冲突": "..." },',
        '    { "层级序号": 2, "层级名称": "宗门与地方权谋", "典型区域": ["..."], "准入壁垒": "...", "核心资源与垄断者": "...", "主要压迫冲突": "..." },',
        '    { "层级序号": 3, "层级名称": "列国/大洲争锋", "典型区域": ["..."], "准入壁垒": "...", "核心资源与垄断者": "...", "主要压迫冲突": "..." },',
        '    { "层级序号": 4, "层级名称": "顶层秩序破局", "典型区域": ["..."], "准入壁垒": "...", "核心资源与垄断者": "...", "主要压迫冲突": "..." }',
        '  ],',
        '  "前史导火索": [',
        '    { "事件名": "...", "发生时间": "开局前3天", "真实经过": "...", "表层流言版本": "...", "卷入各方": ["..."], "留下的烫手筹码或危机": "必须在第0回合就影响主角处境的具体事物/压力" }',
        '  ],',
        '  "主角核心困局": {',
        '    "开局处境": "绝非普通杂役混日子，而是带着紧迫压力的入局处境",',
        '    "最大威胁源": "谁/哪股势力盯上或压迫主角",',
        '    "手中唯一筹码或信息差": "结合主角天赋/遗孤背景的独特优势或烫手筹码",',
        '    "短中期推进动力": "为什么第0回合就不得不采取行动、结盟或破局"',
        '  },',
        '  "宏观分幕大纲": [',
        '    { "幕次": 1, "标题": "玩家视角可读的当前局势标题（严禁剧透未揭晓伏笔真相）", "核心矛盾": "写当前局势可见危机与矛盾，不要直接剧透暗线真相", "主角目标与破局路径": "...", "关键势力与人物": ["..."], "跃迁至下一幕条件": "...", "当前状态": "推进中" },',
        '    { "幕次": 2, "标题": "...", "核心矛盾": "...", "主角目标与破局路径": "...", "关键势力与人物": ["..."], "跃迁至下一幕条件": "...", "当前状态": "未开始" },',
        '    { "幕次": 3, "标题": "...", "核心矛盾": "...", "主角目标与破局路径": "...", "关键势力与人物": ["..."], "跃迁至下一幕条件": "...", "当前状态": "未开始" },',
        '    { "幕次": 4, "标题": "...", "核心矛盾": "...", "主角目标与破局路径": "...", "关键势力与人物": ["..."], "跃迁至下一幕条件": "...", "当前状态": "未开始" }',
        '  ],',
        '  "势力暗账": [',
        '    { "id": "FCT-001", "名称": "...", "类型": "皇朝|宗门|世家|隐宗|情报|商会", "实力等级": 8, "层级": 3, "领袖": "必须有具体人名，绝不允许填无", "核心人物": ["人名1","人名2"], "内部裂痕": "...", "对外公开立场": "...", "真实诉求与暗中图谋": "...", "致命弱点或忌讳": "...", "跨势力账目": [{ "对方势力": "FCT-002或势力名", "关系": "敌对|利益互锁|暗中渗透|傀儡控制|表面盟友实则猜忌|宿仇", "具体渊源": "..." }], "地盘": ["对应地图节点名"] }',
        '  ],',
        '  "核心卡司": [',
        '    { "id": "CAST-001", "姓名": "...", "性别": "女|男", "身份与势力": "...", "所处层级": 1, "生平与过往执念": "...", "表层伪装": "...", "真实诉求与利益底线": "...", "隐藏秘密": "...", "初始认知边界": { "已知事实": ["..."], "盲区": ["..."] }, "人际渊源": [{ "对象": "...", "真实关系与心思": "..." }], "幕后当前日程": { "当前目标": "...", "正在推进的步骤": "...", "行动倒计时回合": 2, "已触发影响": [] }, "是否已登场": false }',
        '  ],',
        '  "伏笔台账": [',
        '    { "id": "FS-001", "类型": "物件|流言|人物怪癖|前史旧案|地理异象|身份暗桩", "表面载体": "看似寻常的载体细节", "底层真相": "真实因果联系", "知情人": ["..."], "盲区人物": ["..."], "建议埋设阶段": "开局第0~2回合", "建议回收阶段": "第1幕高潮或第2幕", "触发或回收条件": "...", "状态": "未埋设" }',
        '  ]',
        '}',
        '',
        '【铁律提醒（数组数量硬下限，少于此数将被判不合格打回重写）】',
        '- `<世界基底>.地图层级` 必须写满 **24~34 个**完整树状节点（不要偷懒只写几条！）；',
        '- `宏观分幕大纲` 必须写满 **4 幕**；',
        '- `势力暗账` 必须写满 **6 个及以上**且覆盖地图中不同层级；每个势力都必须有真实姓名 `领袖` 与至少 2 条 `跨势力账目`！',
        `- \`核心卡司\` 必须写满 **7 名及以上重要 NPC**（绝不要把主角「${charData.姓名}」自己写进核心卡司列表！），跨越高低 1~4 层级，若有初始同伴必须写入并赋予真实的族内隐患/秘密诉求；NPC 的 \`行动倒计时回合\` 控制在 1~4 回合之间，保证第 2~4 回合就能自然产生外溢连锁波及！`,
        '- `伏笔台账` 必须写满 **6 枚及以上**具体可演的线索伏笔，聚焦物证、流言、胎记怪癖、错期旧案或暗桩，不要写成泛泛黑市买卖！',
        '- 保证输出完全合法的标准 JSON，数组末尾不加多余逗号。'
    ].filter(Boolean).join('\n');

    const messages: 通用消息[] = 规范化文本补全消息链([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ], { 保留System: true, 合并同角色: false });

    const callGen = async (extraFix?: string): Promise<string> => {
        const reqMsgs = extraFix
            ? [...messages, { role: 'user' as const, content: extraFix }]
            : messages;
        return 请求模型文本(apiConfig, reqMsgs, {
            temperature: 0.75,
            signal,
            streamOptions: stream
                ? {
                    stream: true,
                    onDelta: (delta, acc) => onDelta?.(delta, acc)
                }
                : undefined
        });
    };

    const parseBundle = (rawText: string) => {
        const worldPrompt = 清理代码块(提取首个标签内容(rawText, '世界观', { 兼容错误闭合: true }) || '');
        const baseBlock = 清理代码块(提取首个标签内容(rawText, '世界基底', { 兼容错误闭合: true }) || '');
        const bibleBlock = 清理代码块(提取首个标签内容(rawText, '导演圣经', { 兼容错误闭合: true }) || '');
        const baseParsed = baseBlock ? parseJsonWithRepair<any>(baseBlock).value : null;
        const bibleParsed = bibleBlock ? parseJsonWithRepair<any>(bibleBlock).value : null;
        const mapLayers = 规范化地图节点数组(baseParsed?.地图层级 || baseParsed?.mapLayers || []);
        const rawBible = 规范化导演圣经(bibleParsed);
        const directorBible = 确保核心结构兜底(rawBible, { charData, openingConfig, worldPrompt });
        return { worldPrompt, mapLayers, directorBible, rawText };
    };

    const enabledPartnerNames = enabledPartners.map((item) => item.name);
    const countIssues = (candidate: WorldBibleGenerationResult) => [
        ...(!candidate.worldPrompt || candidate.worldPrompt.length < 220 ? ['<世界观>内容过短或缺失'] : []),
        ...校验地图树结构(candidate.mapLayers),
        ...评估圣经完整度(candidate.directorBible, enabledPartnerNames)
    ];

    let res = parseBundle(await callGen());
    let issues = countIssues(res);
    let lastRepairError: unknown = null;

    // Up to 2 targeted repair/regenerate passes if structural count gates failed
    for (let repairAttempt = 1; repairAttempt <= 2 && issues.length > 0; repairAttempt += 1) {
        try {
            const needMapRepair = 校验地图树结构(res.mapLayers).length > 0;
            const needWorldPromptRepair = !res.worldPrompt || res.worldPrompt.length < 220;
            const repairOnlyBible = !needMapRepair && !needWorldPromptRepair;
            const repairPrompt = [
                `你的上一版输出未通过第 ${repairAttempt} 次结构完整性验收，存在以下硬性数量/字段缺失：`,
                ...issues.map((i) => `- ${i}`),
                '',
                repairOnlyBible
                    ? `表层<世界观>与六层<世界基底>均已合格，本次【切勿重写】<thinking>、<世界观> 或 <世界基底>，只需直接输出完整的 <导演圣经>...</导演圣经> JSON（必须补齐 ${势力数量下限}+ 势力暗账且每个势力至少 ${跨势力账目下限} 条跨势力账目、${核心卡司下限}+ 跨层级 NPC 核心卡司、${伏笔数量下限}+ 伏笔台账、${宏观分幕下限} 幕大纲）！`
                    : needMapRepair
                        ? `请补全并输出完整的 \`<世界基底>\`（至少 ${地图节点下限} 个合规六层树状 \`地图层级\` 节点）以及 \`<导演圣经>\`（必须真正写出 ${势力数量下限}+ 势力暗账且每个势力至少 ${跨势力账目下限} 条跨势力账目、${核心卡司下限}+ 跨层级 NPC 核心卡司、${伏笔数量下限}+ 伏笔台账、${宏观分幕下限} 幕大纲，严禁只写 1~2 条示例敷衍！）。`
                        : `请在保留既有合理核心设定的基础上，补全并输出完整的 \`<导演圣经>\` JSON（必须真正写出 ${势力数量下限}+ 势力暗账且每个势力至少 ${跨势力账目下限} 条跨势力账目、${核心卡司下限}+ 跨层级 NPC 核心卡司、${伏笔数量下限}+ 伏笔台账、${宏观分幕下限} 幕大纲）。`,
                '',
                '可延续的核心设定草稿如下（请扩展写全，不要缩水）：',
                JSON.stringify(res.directorBible)
            ].join('\n');
            const repairedRaw = await 请求模型文本(
                apiConfig,
                规范化文本补全消息链([
                    { role: 'system', content: systemPrompt },
                    ...(repairOnlyBible ? [] : [{ role: 'user' as const, content: userPrompt }]),
                    { role: 'user', content: repairPrompt }
                ], { 保留System: true, 合并同角色: false }),
                {
                    temperature: 0.55,
                    signal,
                    streamOptions: stream
                        ? {
                            stream: true,
                            onDelta: (delta, acc) => onDelta?.(delta, acc)
                        }
                        : undefined
                }
            );
            const repBaseBlock = 清理代码块(提取首个标签内容(repairedRaw, '世界基底', { 兼容错误闭合: true }) || '');
            const repBaseObj = repBaseBlock ? parseJsonWithRepair<any>(repBaseBlock).value : null;
            const repMapLayers = 规范化地图节点数组(repBaseObj?.地图层级 || repBaseObj?.mapLayers || []);

            const repairedBibleBlock = 清理代码块(提取首个标签内容(repairedRaw, '导演圣经', { 兼容错误闭合: true }) || repairedRaw);
            const repairedBibleObj = parseJsonWithRepair<any>(repairedBibleBlock).value;

            const repWorldPrompt = 清理代码块(提取首个标签内容(repairedRaw, '世界观', { 兼容错误闭合: true }) || '');
            const mergedWorldPrompt = repWorldPrompt.length > res.worldPrompt.length ? repWorldPrompt : res.worldPrompt;
            const repSummary = typeof repairedBibleObj?.世界观表层摘要 === 'string' ? repairedBibleObj.世界观表层摘要.trim() : '';
            const mergedBible = repairedBibleObj
                ? 确保核心结构兜底(
                    规范化导演圣经({
                        ...repairedBibleObj,
                        世界观表层摘要: repSummary || mergedWorldPrompt.slice(0, 500)
                    }),
                    {
                        charData,
                        openingConfig,
                        worldPrompt: mergedWorldPrompt
                    }
                )
                : res.directorBible;

            const mergedCandidate: WorldBibleGenerationResult = {
                worldPrompt: mergedWorldPrompt,
                mapLayers: repMapLayers.length > res.mapLayers.length ? repMapLayers : res.mapLayers,
                directorBible: mergedBible,
                rawText: `${res.rawText}\n\n<!-- REPAIRED_BIBLE_${repairAttempt} -->\n${repairedRaw}`
            };
            const nextIssues = countIssues(mergedCandidate);
            if (nextIssues.length <= issues.length) {
                res = mergedCandidate;
                issues = nextIssues;
            }
        } catch (err: any) {
            if (err?.name === 'AbortError' || signal?.aborted) {
                throw err;
            }
            lastRepairError = err;
        }
    }

    if (issues.length > 0) {
        const repairDetail = lastRepairError instanceof Error ? `；修补请求异常：${lastRepairError.message}` : '';
        throw new Error(`2.0 世界观与导演圣经未通过完整性校验：${issues.join('；')}${repairDetail}`);
    }

    // Ensure faction cross-ledger bidirectionally links existing factions cleanly if any still missing
    if (res.directorBible.势力暗账.length >= 2) {
        const allNames = res.directorBible.势力暗账.map((f) => f.名称);
        res.directorBible.势力暗账.forEach((f, idx) => {
            if (!f.领袖) {
                f.领袖 = f.核心人物[0] || `${f.名称}执掌者`;
            }
            if (!f.跨势力账目 || f.跨势力账目.length === 0) {
                const peer = allNames[(idx + 1) % allNames.length];
                if (peer && peer !== f.名称) {
                    f.跨势力账目 = [{ 对方势力: peer, 关系: '暗中制衡', 具体渊源: f.真实诉求与暗中图谋 || '争夺核心灵脉与门路' }];
                }
            }
        });
    }

    return res;
};

export const 从圣经初始化世界势力与社交 = (
    bible: DirectorWorldBible,
    mapLayers: 地图层级结构[],
    openingConfig: OpeningConfig,
    charData: 角色数据结构,
    gameConfig?: Pick<游戏设置结构, '启用修炼体系'>
) => {
    const factions = 将势力暗账投影为世界势力(bible.势力暗账, mapLayers);
    const enabledPartners = 读取伙伴列表(openingConfig);
    const partnerNameSet = new Set(enabledPartners.map((item) => item.name));
    const cultivationEnabled = gameConfig?.启用修炼体系 !== false;
    const isXianxia = 题材是否仙侠(openingConfig?.题材模式);
    const resolveRealmByTier = (tier: number): string => {
        if (!cultivationEnabled) return '';
        if (isXianxia) return tier >= 3 ? '金丹期' : (tier === 2 ? '筑基期' : '炼气期');
        return tier >= 3 ? '宗师境' : (tier === 2 ? '一流高手' : '初入江湖');
    };
    const castAsSocial = bible.核心卡司
        .filter((c) => c.是否已登场 || partnerNameSet.has(c.姓名))
        .map((c) => ({
            id: c.id,
            姓名: c.姓名,
            性别: c.性别,
            身份: c.身份与势力,
            境界: resolveRealmByTier(Number(c.所处层级) || 1),
            简介: `${c.生平与过往执念}。日常表现：${c.表层伪装}。`,
            核心性格特征: c.表层伪装,
            关系: c.人际渊源.find((t) => t.对象 === charData.姓名)?.真实关系与心思 || '同行/交集之人',
            好感度: partnerNameSet.has(c.姓名) ? 60 : 35,
            是否在场: partnerNameSet.has(c.姓名),
            记忆: []
        }));

    return { factions, initialSocial: castAsSocial };
};
