import type { 小说拆分数据集结构, 小说拆分分段结构 } from '../../models/novelDecomposition';
import type { ModeRuntimeProfile, 题材模式类型 } from '../../models/system';

export const 小说模式包补全系统提示词 = `
你是《墨色江湖 2.0》项目的小说分解模式包补全器。任务是只输出一段可被系统直接解析的 JSON 配置补丁。

【任务说明】
用户已经用小说分解工作台把一部小说拆解成了结构化数据集（角色、势力、世界观、地点、物品、时间线等）。系统用这套数据生成了同人模式包的世界书内容，但模式包的运行时配置（货币、能力体系、开局背景/天赋、组织称呼、地图提示词等）仍然沿用官方题材预设，与小说内容不匹配。

你的任务是阅读小说分解数据集摘要，为该小说定制运行时配置补丁，使模式包能更好地承接原著的世界观细节。

【输出要求（必须）】
1. 只输出一个 JSON 对象，不要包含 Markdown 代码块标记、注释、额外解释或非 JSON 文本。
2. JSON 顶层键名必须与系统运行时配置的字段名一一对应，只填写你有把握根据小说内容推断的字段。
3. 不需要填写所有字段；缺失字段系统会继续使用官方预设兜底；至少输出 1 个你有把握的配置分区。
4. 字符串值使用中文，不要混入英文占位符。
5. 数组字段每项不超过 20 个字符。

【需要补全的字段说明】
{
  "economy": {
    "primaryCurrency": "原著中常见的货币或价值衡量单位名称，如灵石、信用点、金币",
    "accountingUnit": "记账单位名称，如灵石、银两、赏金",
    "exchangeRules": "货币兑换规则的一句话描述",
    "currencyTiers": {
      "upperName": "高级货币名，如上品灵石、金元宝",
      "middleName": "中级货币名，如中品灵石、银两",
      "lowerName": "低级货币名，如碎灵石、铜板"
    },
    "marketName": "原著/题材中的交易场所名称，如坊市、拍卖行、集市、商会",
    "marketVerb": "交易动词，如采购、兑换、拍卖"
  },
  "ability": {
    "primaryAxis": "力量体系主轴名称，如修真境界、武功层级、异能等级",
    "progressionNames": ["成长阶段名称列表，3-9个，从低到高，如：练气、筑基、金丹、元婴、化神、合体、大乘、渡劫"],
    "skillPool": ["常见技能/功法名称列表，6-12个，取自原著或贴合题材"],
    "combatResolution": "战斗判定规则的一句话描述",
    "kungfuTypes": ["武学/能力类型分类，3-6个，如剑法、拳法、暗器、身法"]
  },
  "opening": {
    "defaultBackgrounds": ["开局背景建议，3-8个短描述，如寒门子弟、世家旁支、流落江湖、山中隐修"],
    "defaultTalents": ["开局天赋建议，3-8个短描述，如天生神力、过目不忘、灵根优异、医毒双修"]
  },
  "organization": {
    "organizationName": "原著/题材中常见的组织类型名，如宗门、公会、势力、门派",
    "memberName": "组织成员称呼，如弟子、成员、部下",
    "contributionName": "组织贡献体系称呼，如宗门贡献、公会声望",
    "rankNames": ["组织阶层名称列表，3-6个，从低到高，如外门弟子、内门弟子、长老、掌门"]
  },
  "map": {
    "locationTypes": ["地点类型列表，4-8个，取自原著常见场所，如宗门、坊市、秘境、洞府、城镇"],
    "poiTypes": ["兴趣点类型列表，4-8个，如宗门山门、天材地宝、任务发布处"],
    "mapPrompt": "地图生成引导提示词，一句话描述该题材世界版图应包含的地貌和组织方式"
  },
  "npc": {
    "defaultIdentityPool": ["常见NPC身份列表，4-8个，如散修、商贩、巡山弟子、客栈掌柜"],
    "relationTemplates": ["NPC关系模板，3-6个，如同门、师徒、交易伙伴、旧怨"]
  },
  "image": {
    "characterClothingEra": "角色服饰风格描述，如古典修真服饰、武侠江湖服饰、现代城市服饰",
    "sceneMaterials": "场景材质描述，如木石、布帛、山水、院落、兵器",
    "visualStyle": "视觉风格，如写实国风、写实西方奇幻、写实末日风"
  },
  "time": {
    "calendarName": "日历/纪年名称，如天元历、修真纪元",
    "narrativeStyle": "时间叙述风格的一句话补充说明"
  }
}

【硬约束】
1. primaryCurrency、progressionNames、defaultBackgrounds、defaultTalents、organizationName 是优先补全字段；如果原著信息不足以推断，允许省略，系统会兜底。
2. 如果填写 progressionNames，至少3个、至多9个，必须从低到高排列。
3. 不要输出与小说内容无关的通用回答；所有值必须来自或贴合小说数据集摘要中的信息。
4. 如果原著信息不足以推断某个字段的值，不要编造，直接省略该字段。
5. 只有数据集明确正向出现“无限流、主神空间、轮回者、任务世界、奖励点、支线剧情”等证据时，才允许输出主神/无限流相关词；否则不得照抄字段说明里的题材示例。
6. 只有数据集明确正向出现“末日丧尸、感染者、尸潮、避难所、幸存者营地、感染区、封锁线、物资券、瓶盖”等证据时，才允许输出末日/丧尸相关词；如果摘要是在否定或禁止这类题材，不得把它当成题材证据。
`.trim();

const 限长 = (value: unknown, max: number): string =>
    typeof value === 'string' ? value.trim().slice(0, max) : '';

const 限长列表 = (items: unknown[], maxPerItem: number, maxCount: number): string[] =>
    Array.isArray(items)
        ? items.map((item) => 限长(item, maxPerItem)).filter(Boolean).slice(0, maxCount)
        : [];

export const 构建小说模式包补全用户提示词 = (dataset: 小说拆分数据集结构): string => {
    const workName = dataset.作品名 || dataset.标题 || '未命名小说';
    const segments: string[] = [];

    segments.push(`【来源作品】${workName}`);
    segments.push(`【章节概要】总章节=${dataset.总章节数 || 0}，分段数=${dataset.分段列表?.length || 0}`);

    if (dataset.当前阶段概括) {
        segments.push(`【当前阶段概括】${限长(dataset.当前阶段概括, 300)}`);
    }

    const 核心角色 = 限长列表([...(dataset.核心角色 || []), ...(dataset.核心角色摘要 || [])], 20, 16);
    if (核心角色.length > 0) {
        segments.push(`【核心角色】${核心角色.join('、')}`);
    }

    if (Array.isArray(dataset.角色档案) && dataset.角色档案.length > 0) {
        const 档案摘要 = dataset.角色档案.slice(0, 12).map((item) => {
            const parts = [item.名称];
            if (item.身份) parts.push(`身份=${item.身份}`);
            if (item.所属势力) parts.push(`势力=${item.所属势力}`);
            if (item.初始立场) parts.push(`立场=${item.初始立场}`);
            return parts.join('；');
        });
        segments.push(`【角色档案摘要】${档案摘要.join('；')}`);
    }

    const 势力 = 限长列表(dataset.势力档案?.map((item: any) => {
        const parts = [item.名称 || item.势力名];
        if (item.类型) parts.push(`类型=${item.类型}`);
        return parts.join('：');
    }) || [], 30, 8);
    if (势力.length > 0) {
        segments.push(`【势力档案】${势力.join('；')}`);
    }

    const 世界观 = 限长列表(dataset.世界观规则 || [], 50, 8);
    if (世界观.length > 0) {
        segments.push(`【世界观规则】${世界观.join('；')}`);
    }

    const 边界 = 限长列表(dataset.世界边界规则 || [], 50, 6);
    if (边界.length > 0) {
        segments.push(`【世界边界】${边界.join('；')}`);
    }

    const 地点 = 限长列表(dataset.地图地点档案?.map((item: any) => item.名称 || item.地点名) || [], 20, 12);
    if (地点.length > 0) {
        segments.push(`【主要地点】${地点.join('、')}`);
    }

    const 物品 = 限长列表(dataset.物品档案?.map((item: any) => item.名称 || item.物品名) || [], 20, 12);
    if (物品.length > 0) {
        segments.push(`【物品参考】${物品.join('、')}`);
    }

    const 关系 = 限长列表(dataset.人物关系 || [], 40, 6);
    if (关系.length > 0) {
        segments.push(`【人物关系】${关系.join('；')}`);
    }

    const 势力关系 = 限长列表(dataset.势力关系 || [], 40, 6);
    if (势力关系.length > 0) {
        segments.push(`【势力关系】${势力关系.join('；')}`);
    }

    const 伏笔 = 限长列表(dataset.伏笔线索 || [], 40, 6);
    if (伏笔.length > 0) {
        segments.push(`【伏笔线索】${伏笔.join('；')}`);
    }

    segments.push('');
    segments.push('请根据以上小说分解数据集摘要，输出运行时配置补丁 JSON。只输出 JSON，不要包含代码块标记或其他文字。');

    return segments.join('\n');
};

export const 模式包单段原文最大字符数 = 24_000;

export interface 小说模式包分段完善提示词参数 {
    workName: string;
    baseMode: 题材模式类型;
    segmentIndex: number;
    totalSegments: number;
    segment: 小说拆分分段结构;
    currentDraft: Partial<ModeRuntimeProfile>;
    confirmedFieldPaths: string[];
}

export interface 小说模式包分段完善提示词结果 {
    prompt: string;
    inputStats: {
        原文总字符数: number;
        实际输入字符数: number;
        是否完整输入: boolean;
    };
}

const 构建当前分段证据 = (segment: 小说拆分分段结构) => ({
    标题: segment.标题,
    章节范围: segment.章节范围,
    原文内容: (segment.原文内容 || '').slice(0, 模式包单段原文最大字符数),
    原文摘要: segment.原文摘要,
    本组概括: segment.本组概括,
    角色档案: segment.角色档案,
    势力档案: segment.势力档案,
    地图地点档案: segment.地图地点档案,
    物品档案: segment.物品档案,
    世界观规则: segment.世界观规则,
    世界边界规则: segment.世界边界规则,
    人物关系: segment.人物关系,
    势力关系: segment.势力关系,
    时间线: segment.时间线
});

export const 构建小说模式包分段完善用户提示词 = (
    params: 小说模式包分段完善提示词参数
): 小说模式包分段完善提示词结果 => {
    const 原文总字符数 = params.segment.原文内容?.length || 0;
    const 实际输入字符数 = Math.min(原文总字符数, 模式包单段原文最大字符数);
    const stageInstruction = params.segmentIndex === 0
        ? '这是第一部分，请依据本段证据建立模式包骨架。信息不足的字段保持缺失。'
        : '这是后续部分，请基于上一版完整草稿补充、纠错，并删除已被本段证据推翻的内容。';
    const confirmed = params.confirmedFieldPaths.length > 0
        ? params.confirmedFieldPaths.join('\n- ')
        : '无';
    return {
        prompt: [
            `【来源作品】${params.workName}`,
            `【基础题材】${params.baseMode}`,
            `【当前进度】第 ${params.segmentIndex + 1} / ${params.totalSegments} 分段`,
            stageInstruction,
            '【上一版完整模式包草稿】',
            JSON.stringify(params.currentDraft),
            '【用户确认字段不得覆盖】',
            confirmed,
            '【当前分段证据】',
            JSON.stringify(构建当前分段证据(params.segment)),
            '输出严格 JSON：{"completion":{更新后的完整模式包草稿},"conflictHints":["供最终整理使用的冲突提示"]}。',
            '必须输出更新后的完整模式包草稿，而不是局部补丁；没有冲突时 conflictHints 输出空数组。'
        ].join('\n'),
        inputStats: {
            原文总字符数,
            实际输入字符数,
            是否完整输入: 实际输入字符数 === 原文总字符数
        }
    };
};

export const 构建小说模式包最终整理用户提示词 = (params: {
    workName: string;
    baseMode: 题材模式类型;
    currentDraft: Partial<ModeRuntimeProfile>;
    conflictHints: string[];
    confirmedFieldPaths: string[];
}): string => [
    `【来源作品】${params.workName}`,
    `【基础题材】${params.baseMode}`,
    '全部小说分段均已处理。现在只做最终一致性整理，不再读取原文。',
    '可以统一命名、消除重复、按冲突提示选择后文已确认的设定；不得新增没有证据的设定。',
    '【当前完整草稿】',
    JSON.stringify(params.currentDraft),
    '【累计冲突提示】',
    JSON.stringify(params.conflictHints),
    '【用户确认字段不得覆盖】',
    JSON.stringify(params.confirmedFieldPaths),
    '只输出严格 JSON：{"completion":{整理后的完整模式包草稿},"conflictHints":[]}。'
].join('\n');
