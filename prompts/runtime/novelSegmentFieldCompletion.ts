import type {
    小说拆分角色档案结构,
    小说拆分势力档案结构,
    小说拆分地图地点档案结构,
    小说拆分物品档案结构,
} from '../../models/novelDecomposition';

/** 分段字段 AI 补全结果的 JSON 结构 */
export interface 分段字段AI补全结果 {
    角色档案?: 小说拆分角色档案结构[];
    势力档案?: 小说拆分势力档案结构[];
    地图地点档案?: 小说拆分地图地点档案结构[];
    物品档案?: 小说拆分物品档案结构[];
    世界观规则?: string[];
    世界边界规则?: string[];
    人物关系?: string[];
    势力关系?: string[];
    伏笔线索?: string[];
    回收点?: string[];
    章节节奏?: string[];
}

export const 分段字段补全系统提示词 = `
你是 WuXia 项目的小说分解字段补全器。任务是阅读当前分段的原文，从中提取结构化档案信息，输出一段可被系统直接解析的 JSON。

【任务说明】
用户已经用小说分解工作台把一部小说拆解成了分段数据集。每个分段的概括、事实、事件等文本字段已由主管线处理，但分段的档案类字段（角色档案、势力档案、地点档案、物品档案）和规则类字段（世界观规则、世界边界规则、人物关系、势力关系、伏笔线索、回收点、章节节奏）可能不完整或留空。

你的任务是仔细阅读该分段原文，从中补全这些结构化字段。你已经有了从之前 AI 解析中提取的字段作为参考，你的目标是用重新阅读原文后的判断来修正和补全它们。

【输出要求（必须）】
1. 只输出一个 JSON 对象，不要包含 Markdown 代码块标记、注释、额外解释或非 JSON 文本。
2. JSON 顶层键名必须与系统结构化字段一一对应，只填写你有把握根据原文内容推断的字段。
3. 不需要填写所有字段；缺失字段系统会保留当前值不变。
4. 如果某个字段的原文信息不足以推断，不要编造，直接省略该字段。

【需要补全的字段说明】
{
  "角色档案": [
    {
      "名称": "角色完整姓名，不可缩写或用单字简称",
      "身份": "角色在故事中的身份，如'掌门'、'弟子'、'商贩'",
      "所属势力": "角色隶属的组织名，无则写'无'",
      "初始立场": "角色在本分段的立场倾向，如'中正'、'正派'、'反派'、'中立'",
      "关系摘要": ["与他人的关键关系，如'师徒李四'、'与王五有血仇'"],
      "状态摘要": ["角色当前关键状态，如'闭关中'、'重伤'、'下落不明'"],
      "首次出现": "首次出场位置描述",
      "重要性": "核心/重要/一般"
    }
  ],
  "势力档案": [
    {
      "名称": "势力完整名称",
      "类型": "如'门派'、'家族'、'朝廷'、'帮会'",
      "地盘": "势力控制区域",
      "代表人物": ["势力核心人物名"],
      "立场目标": "势力的主要目标和立场",
      "当前状态": "势力当前状况",
      "关系摘要": ["与其他势力的关键关系"],
      "首次出现": "首次被提及的位置"
    }
  ],
  "地图地点档案": [
    {
      "名称": "地点名称",
      "层级": "只能写'寰宇/大地点/中地点/小地点/区地点/子地点/未知'之一",
      "上级地点": "上级地点名称",
      "所属势力": "控制该地点的势力，无则写'无'",
      "地貌功能": "地貌和功能描述",
      "关键设施": ["关键设施列表"],
      "首次出现": "首次被提及的位置"
    }
  ],
  "物品档案": [
    {
      "名称": "物品名称",
      "类型": "如'武器'、'丹药'、'秘籍'、'信物'",
      "用途": "物品用途",
      "所属人物": "持有者名",
      "所属势力": "持有势力名",
      "首次出现": "首次出现的场景"
    }
  ],
  "世界观规则": ["明确出现的规则，如'修真需灵根'、'凡人不可飞行'"],
  "世界边界规则": ["不可越过的限制，如'凡人不可踏足仙界'"],
  "人物关系": ["明确成立的关系变化，如'张三→师徒→李四'"],
  "势力关系": ["明确成立的势力关系，如'天山派↔敌对↔魔教'"],
  "伏笔线索": ["已埋下但未兑现的线索，如'神秘老者身份未明'"],
  "回收点": ["本组已兑现的前文伏笔"],
  "章节节奏": ["本组节奏标签，如'铺垫'、'爆发'、'转折'、'缓冲'、'收束'、'悬念'"]
}

【硬约束】
1. 角色档案中的"名称"必须使用原文完整姓名或稳定全称，禁止缩写。
2. 角色档案的"重要性"只能填"核心/重要/一般"三者之一。
3. 地点档案的"层级"只能填"寰宇/大地点/中地点/小地点/区地点/子地点/未知"之一。
4. 不要编造原文未出现的信息；模糊或推断性的内容不要写入。
5. 如果原文中完全没有某类档案信息，省略该顶层键，不要输出空数组。
6. 字符串值使用中文，不要混入英文占位符。
`.trim();

const 限长 = (value: unknown, max: number): string =>
    typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * 单段「AI 补全本分段字段」可送入模型的原文最大字符数。
 *
 * 与模式包逐段完善保持同一口径（24000），避免同一个分段在两个功能里
 * 一个是「读了全文」、一个是「只读了前 1/3」，导致结论互相矛盾。
 *
 * 注意：实际截断在 `services/novelSegmentFieldCompletionContext.ts` 完成，
 * 因为那里还要在原文之后拼接输出硬约束——若在提示词层再截一次，
 * 会把硬约束一起切掉，模型就丢掉「必须返回合法 JSON」这类要求。
 */
export const 分段字段补全单段原文最大字符数 = 24_000;

export const 构建分段字段补全用户提示词 = (params: {
    segmentOriginalText: string;
    segmentTitle: string;
    existing角色档案?: 小说拆分角色档案结构[];
    existing势力档案?: 小说拆分势力档案结构[];
    existing地图地点档案?: 小说拆分地图地点档案结构[];
    existing物品档案?: 小说拆分物品档案结构[];
    existing世界观规则?: string[];
    existing世界边界规则?: string[];
    existing人物关系?: string[];
    existing势力关系?: string[];
    existing伏笔线索?: string[];
    existing回收点?: string[];
    existing章节节奏?: string[];
}): string => {
    const segments: string[] = [];

    segments.push(`【当前分段标题】${限长(params.segmentTitle, 100)}`);
    segments.push('');

    // 原文长度上限由 `构建小说分段字段补全原文输入` 统一控制并记录统计信息，
    // 这里不再二次截断：该字段后面还拼着输出硬约束，二次截断会把约束切掉。
    const rawText = params.segmentOriginalText || '';
    segments.push(`【当前分段原文】`);
    segments.push(rawText);
    segments.push('');

    // 已有字段作为参考（让 AI 知道哪些已有、哪些需要补全）
    const existing: string[] = [];
    if (params.existing角色档案 && params.existing角色档案.length > 0) {
        existing.push(`已有角色档案(${params.existing角色档案.length}条): ${params.existing角色档案.slice(0, 8).map(c => c.名称).join('、')}`);
    }
    if (params.existing势力档案 && params.existing势力档案.length > 0) {
        existing.push(`已有势力档案(${params.existing势力档案.length}条): ${params.existing势力档案.slice(0, 6).map(f => f.名称).join('、')}`);
    }
    if (params.existing地图地点档案 && params.existing地图地点档案.length > 0) {
        existing.push(`已有地点档案(${params.existing地图地点档案.length}条): ${params.existing地图地点档案.slice(0, 8).map(l => l.名称).join('、')}`);
    }
    if (params.existing物品档案 && params.existing物品档案.length > 0) {
        existing.push(`已有物品档案(${params.existing物品档案.length}条): ${params.existing物品档案.slice(0, 6).map(i => i.名称).join('、')}`);
    }
    if (params.existing世界观规则 && params.existing世界观规则.length > 0) {
        existing.push(`已有世界观规则(${params.existing世界观规则.length}条): ${params.existing世界观规则.slice(0, 6).join('；')}`);
    }
    if (params.existing世界边界规则 && params.existing世界边界规则.length > 0) {
        existing.push(`已有世界边界规则(${params.existing世界边界规则.length}条)`);
    }
    if (params.existing人物关系 && params.existing人物关系.length > 0) {
        existing.push(`已有人物关系(${params.existing人物关系.length}条)`);
    }
    if (params.existing势力关系 && params.existing势力关系.length > 0) {
        existing.push(`已有势力关系(${params.existing势力关系.length}条)`);
    }
    if (params.existing伏笔线索 && params.existing伏笔线索.length > 0) {
        existing.push(`已有伏笔线索(${params.existing伏笔线索.length}条)`);
    }
    if (params.existing回收点 && params.existing回收点.length > 0) {
        existing.push(`已有回收点(${params.existing回收点.length}条)`);
    }
    if (params.existing章节节奏 && params.existing章节节奏.length > 0) {
        existing.push(`已有章节节奏: ${params.existing章节节奏.join('、')}`);
    }

    if (existing.length > 0) {
        segments.push('【现有字段参考（用于增量补全）】');
        segments.push(existing.join('\n'));
        segments.push('');
        segments.push('请根据原文重新识别，补全或修正以上字段。有把握的填上，没把握的省略。');
    } else {
        segments.push('请从原文中提取结构化档案信息，有把握的填上，没把握的省略。');
    }

    segments.push('');
    segments.push('只输出 JSON，不要包含代码块标记或其他文字。');

    return segments.join('\n');
};
