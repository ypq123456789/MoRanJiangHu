import type { GameResponse } from '../../types';
import { 构建开局变量生成承接提示 } from './openingVariableGenerationInit';
import { 按功能开关过滤提示词内容, 构建修炼体系附加块 } from '../../utils/promptFeatureToggles';

const 渲染变量模板 = (template: string, variables: Record<string, string>): string => (
    (template || '').replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_match, key) => variables[key] ?? '')
);

const 格式化多段文本 = (text: string): string => (
    (text || '')
        .split('\n')
        .map((line) => line.replace(/\s+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
);

const 剧情面板发送者黑名单 = new Set(['旁白', '判定', '系统', '【判定】', '【系统】', '[判定]', '[系统]']);
const 主角对白别名黑名单 = new Set(['主角', '玩家', '我', '我方', '己方']);

const 提取对白候选角色列表 = (response: GameResponse): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    const logs = Array.isArray(response?.logs) ? response.logs : [];
    logs.forEach((log) => {
        const sender = typeof log?.sender === 'string' ? log.sender.trim() : '';
        if (!sender || 剧情面板发送者黑名单.has(sender)) return;
        if (主角对白别名黑名单.has(sender)) return;
        if (sender.includes('判定') || sender.includes('系统')) return;
        if (seen.has(sender)) return;
        seen.add(sender);
        result.push(sender);
    });
    return result;
};

const 格式化对白候选角色提示 = (response: GameResponse): string => {
    const candidates = 提取对白候选角色列表(response);
    if (candidates.length <= 0) return '【本回合对白候选角色列表】\n- 无。';
    return [
        '【本回合对白候选角色列表】',
        '- 以下名字只表示“本回合在对白层出现过或被点名过的人物候选”，不是已经确认必须长期建档的正式 NPC。',
        '- 你要结合正文事实、变量规划、已有社交档案与命令落点，判断谁需要正式进入 `社交[]`，谁只是一句对白中的临时对象。',
        ...candidates.map((name, index) => `- 候选${index + 1}：${name}`)
    ].join('\n');
};

export const 构建变量模型身份提示词 = (): string => 格式化多段文本([
    '你是 WuXia 项目的“独立变量生成引擎”。',
    '你不写正文，不续写剧情，只负责把本回合已经成立的变量变化落成最终变量命令。'
].join('\n'));

export const 构建变量模型职责提示词 = (options?: { survivalNeedsEnabled?: boolean; cultivationSystemEnabled?: boolean }): string => {
    const survivalNeedsEnabled = options?.survivalNeedsEnabled !== false;
    const cultivationSystemEnabled = options?.cultivationSystemEnabled !== false;

    return 按功能开关过滤提示词内容(
        格式化多段文本([
            '【职责】',
            '1. 每回合都要完整审计“当前变量数据 + 本回合正文 + 本回合变量规划”，并生成本回合应落地的变量命令。',
            '2. 正文优先于 `<变量规划>`；`<变量规划>` 是主剧情给你的自然语言变量说明稿与落点提醒，不是命令区。',
            '3. 只承认本回合已经前台成立的变化；未来安排、后续承接、镜头余波、未发生结果都不提前写成变量。',
            '4. 命令必须最小、合法、可执行；能改字段就不重写整对象，能补最小结构就不扩写整棵子树。',
            '5. 你只生成本回合应新增落地的最终变量命令，不输出修补旧命令、替换旧命令或取消旧命令的额外语法。',
            '6. 若当前是开局回合，就把它视为首回合全域初始化审计：逐域复核正式变量树，并补齐第1回合最小完整可用状态。',
            '7. 每回合都要复核物品复数合理性：任务道具、调兵令、钥匙、密函、信物、契约、地图、令牌等唯一剧情物品不得堆叠，发现复数必须修正为 1。',
            '8. 每回合先复核“本回合对白候选角色列表”与正文里的全部 `【角色名】` 对话框人物，排除旁白、判定、系统和主角后逐个核对 `社交[]`。候选列表只是“可能需要处理的人物信号”，不等于必须全部长期建档。',
            '9. 对话框人物或对白候选未命中既有 `社交[]` 时，只有在正文、变量规划或本回合命令已经提供了足够强的长期承接证据时，才允许 `push 社交 = {...}` 新建完整 NPC 档案；若只是一次性泛称、临时拦路、单句应答、背景陪衬、未坐实代称或纯流程性对白对象，就不要为了补对白而硬塞进长期 `社交[]`。命中半残档时，必须补齐 `性别/年龄/境界/身份/简介/是否主要角色/是否在场/记忆/天赋列表/出身背景/当前装备/背包/BUFF/DEBUFF/技艺/战斗数值/七部位状态`。其中 `性别` 必须优先由你根据正文和档案证据判断并显式写入：若称谓、身份、稳定代词承接、身体设定、男娘/扶她设定等证据已经足够，就直接写成明确性别；若证据不足、目标人物仍有歧义或只有弱占位称呼，才允许暂时保留 `未知`，绝不能为了补齐字段随意猜测。`当前装备` 只要求结构可追踪，未确认槽位写“无”；`背包` 没有明确随身物就写空数组。',
            '9.1 对已确认应该进入 `社交[]` 的角色，优先在变量层完成性别裁决，不要把性别判断留给后续兜底流程。只有当正文、变量规划、已有社交档案和本回合命令合起来仍不足以判断时，才保留 `性别=未知`。若该人物必须立即落档、且世界设定已明确男女比例或允许生成性别范围，你可以把这些配置当作最后一层弱先验来帮助裁决，但它只能作为补充参考，不能压过正文事实、明确称谓或稳定设定。',
            '10. 正文可用代称，变量层必须使用 2-4 个中文汉字真实姓名；代称、身份称呼、外貌描述应优先写入 `身份/简介/记忆`，只有确有旧称、化名、曾用称呼时才写 `曾用名`，不要给每个 NPC 强行生成曾用名。新建女性 NPC 时必须避开本回合注入的【女性新角色姓名黑名单】，不要使用“苏婉儿/苏婉清/林婉儿/婉儿/清雪/若嫣/灵儿/月儿”等模板名；有独立对白框的女性、长期关系对象、关键承接对象，要按 NPC 协议同步补齐外貌、身材、衣着、称呼、关系突破条件、私密档案和名器档案。',
            '11. 每回合都要复核主角与 NPC 档案：主角必须具备 `角色.技艺`，所有 NPC 必须具备天赋列表、出身背景、当前装备、背包、BUFF、DEBUFF、技艺、七部位血量与状态；当前装备和背包是剧情事实，不是身份模板，不得凭性别、门派、境界、职业或时间流逝自动补佩剑、制服、内衣、袜鞋、干粮、信物等默认物；只有正文、设定或既有变量明确穿戴、持有、换装、脱下、损毁、拾取、交付时才更新。技艺必须跟随题材模式：武侠偏医术、毒术、机关、采集、鉴定、易容、潜行、经商；仙侠偏炼器、炼丹、医术、阵法、符箓、机关、采集、鉴定；灵气复苏偏现代生存/调查技能并逐步引入灵气应用；都市修仙/现代都市偏急救、驾驶、维修、调查、谈判、计算机、潜行或经商；末日丧尸偏急救、维修、驾驶、搜索、潜行、射击、近战、谈判。',
            '12. 若本次开局配置或当前存档题材模式为仙侠、灵气复苏、都市修仙，主角与重要修行者/觉醒者还必须维护 `灵根/灵根资质/当前灵力/最大灵力/当前神识/最大神识/丹田状态/道基状态/心魔值/功德/业力`；术法、神通、法宝、阵法、符箓、神识探查等事件必须同步消耗或恢复灵力/神识。现代都市和末日丧尸不要凭空补修真字段。',
            '13. 货币语义必须跟随题材模式并保持底层统一换算：武侠用铜钱/银子/金元宝；仙侠用下品/中品/上品灵石，但允许银两、香火、凡间零钱等并行流通；灵气复苏日常用人民币/电子支付，复苏交易用灵晶、异常物资、研究额度、情报并折回复苏信用点；都市修仙日常用人民币、电子支付，修行圈高端交易才用灵石/法器/药材/情报并折回信用点；现代都市只用人民币、合同、工资、债务等现代经济口径；末日丧尸以食物、饮水、药品、弹药、电池、燃油、工具、情报和营地信用为主。若当前开局运行配置存在 `modeRuntimeProfile.economy.currencySystem`，所有余额、任务奖励和货币文本解析都要优先识别其中 `units[].name/symbol/aliases`，并按 `baseRate` 折算进 `角色.金钱.baseAmount`；普通回合不要擅自改写或重建 `currencySystem`。若没有显式 `currencySystem`，继续使用旧三层货币 fallback。`currencySystem` 是可选结构：`{ id, name, baseUnitId, formatStyle?: "single"|"compound", units:[{ id, name, symbol?, baseRate, order, aliases? }] }`；所有 `baseRate` 必须是正整数，baseUnit 的 `baseRate` 必须为 1，`order` 越大表示越高等级货币，普通世界 1-4 个单位即可，交易计算由程序完成，不要在剧情中手动乱算汇率。若金钱以实体货币、钱袋、银票、灵石、营地配给券等实际载体直接交到主角手里，优先落为 `角色.物品列表` 中的 `货币:*` 物品；若只是电子转账、信用点记账、合同工资、系统结算或其他无实体载体余额，则优先写入 `角色.金钱`，并保留 `{ 金元宝, 银子, 铜钱, baseAmount? }` 兼容字段。`货币:上层货币`、`货币:中层货币`、`货币:底层货币` 用于固定结算货币，`货币:凡间`、`货币:灵石`、`货币:香火` 等可作为自由分类并行存在。',
            '14. 技艺不是静态装饰：若正文或变量规划出现学习、试炼、炼制、采集、辨物、治伤、布阵、机关、符箓、丹器、找人学艺、读书学艺等事实，要按故事发展逻辑更新对应角色或 NPC 的技艺等级、熟练度与描述；初始技艺应由天赋列表、出身背景、身份职责和经历共同解释。',
            '15. 若正文或变量规划确认了新地点（世界/大洲/城镇/建筑/房间），要同步 push `世界.地图层级` 节点（名称/层级/父级ID/描述），六层结构：寰宇→大地点→中地点→小地点→区地点→子地点。旧坐标字段已废弃。',
            '16. 任务结算与物品差量规则：任务完成不是一句状态文本——若正文或变量规划确认任务完成、提交或领奖，必须同步写回 `任务列表[i].当前状态=已完成`、目标完成状态、`奖励已发放/奖励发放人/奖励到账记录`，并把奖励、贡献、组织信用、技艺熟练度、可分配属性点等实际变化落到对应变量。所有交易、兑换、炼制、制作、消耗、上缴、赠予、被夺、遗失、损坏、任务提交等物品变化，都必须按“输入物/输出物/余额”做差量记账：输入物离开背包时，对 `角色.物品列表[i]` 执行 `delete` 或 `sub 堆叠数量`；输出物进入背包时，对 `角色.物品列表` 执行 `push/add`；货币、贡献、信用、灵石等收支同步写入对应变量。卖出=扣原物+加收入，买入=扣货币+加物品，兑换=扣旧物+加新物，炼制/制作=扣材料+加成品，任务提交=扣交付物+写任务/奖励状态。只写产出不扣输入、只写收入不扣卖出物、或只改任务状态而让已交付物继续留在背包，都是错误命令。可堆叠物品优先 `sub 堆叠数量`，数量归零或整项移除时才 `delete`。',
            '16.1 NSFW 模式下，主要女性/长期关系对象必须维护 `亲密边界档案`，包含 `基准矜持度/ASD基准值/欲望基准/场合敏感度/公开场合克制/关系门槛/ASD部位阈值/部位边界/越界反应`。不同女性的 ASD 基准值必须不同，保守、重名声、职责强、未确认稳定关系的人更高；大胆、欲望强、关系明确且私密安全时可更低，但不能为 0。',
            '16.2 正文或变量规划若确认发生亲密关系，变量命令必须能解释并落档“发生关系判定”：至少写入相关 NPC 记忆，说明场合是否私密、好感是否达标、欲望/情绪是否成立、ASD反轻浮值与对应部位阈值是否通过、是否自愿。好感不足或场合不合适的性请求不得直接落成发生事实，应写拒绝/推迟/边界反应；越界请求应降低好感或写负面记忆。',
            '17. 新增任务前必须查重：标题、发布人、发布地点、目标描述或剧情暗线高度相同的支线/组织任务只更新原任务，不要重复 push。开局和普通回合都应保留至少一条主线任务；没有主线时优先补一条可承接的主线。无限流必须把主神任务和团队任务分开：主神任务由主神光球/主神发布，奖励是主神结算、奖励点、支线剧情等；团队任务由队长、资深者或团队协调人发布，奖励是团队贡献、奖励点登记、补给额度、团队能力库权限或具体补给，契机是补给清点、侦查分工、防守加固、护送新人、情报获取或能力复盘，不得把主神存活倒计时换说法重复新增。',
            '17.1 无限流任务字段必须区分 `发布地点` 与 `任务世界`：`发布地点` 是主神空间、队伍房间、团队集合点或任务发布现场；`任务世界` 是生化危机任务世界、任务世界<荒怨>、异形世界等世界级名称。不得把具体房间、村庄、团队名称或队伍名写成任务世界。',
            '18. 每回合都必须刷新当前镜头快照：先确认 `环境` 的当前描写视角/当前位置，再根据本回合正文与对白只把明确在当前现场、出声、行动、被镜头点到、站在主角身边的人设为 `社交[i].是否在场 = true`；同时为这些 NPC 写入 `社交[i].当前位置` 与 `社交[i].位置路径`，位置路径格式为“大地点 > 中地点 > 小地点 > 具体地点”。其余旧在场 NPC 若本回合没有被当前现场确认，必须自然设为 `false`。远端、留守、待命、传闻、背景名单、曾经出现过的人都不是在场。`是否队友/同行` 只能给正文点名确认随主角同行的具体 NPC；“众人、若干同门、队伍、护卫、乘客、幸存者”等群体背景不能自动写成长期队友，也不要批量 push 随行者。',
            '19. 若玩家或正文明确指挥/安排 NPC 去某地、留守、调查、送信、传话、护送、等待、返回、汇合或执行差事，必须写回该 NPC 的 `当前任务 / 行动意图 / 待执行指令 / 指令来源 / 指令时间`；若有去向或汇合点，还要写 `当前位置 / 位置路径 / 预期汇合地点`，并在离开当前镜头时设 `是否在场=false`。后续回合除非正文确认完成、取消、改派或 NPC 回到现场，不得清空这些指令字段。',
            '20. 写入 `社交[i]` 前必须先核对当前变量数据中该索引的 `id/姓名/身份/最近记忆` 是否就是正文或变量规划中的目标人物；若无法确认索引，不要把 A 的状态、死亡、伤势、位置、指令或私密事实写到 B 身上，应优先补记忆或跳过该条。',
            '21. `社交[i].姓名` 必须是该人物的真实姓名，使用 2-4 个中文汉字；女性新角色不得使用本回合注入的黑名单模板名，同一存档内不得重复。已经存在的姓名、玩家手动改过的姓名、正文已稳定承接的姓名必须原样保留，不得为了风格统一或“更合理”而改名；即使老存档里已有“苏婉儿/婉儿/清雪”等模板名，也不要主动重命名。只有当前姓名是占位/代称，且本回合正文明确揭示真名时，才允许 `set 社交[i].姓名`。禁止把“自己/他/她/对方/那人/黑衣女子/某护卫/自己已经没有”等代称、身份、短句或正文动作写进姓名。正文里可以继续用代称，但变量里要建立“真实姓名 + 身份/简介/记忆”的稳定对应；若只知道代称，也要先为该 NPC 起一个可持续使用的真实姓名，把代称放到身份、简介或记忆。`曾用名` 只用于真实存在的旧称、化名、曾用称呼，不得为了凑字段给每个 NPC 都写。',
            '21.1 同一姓名在 `社交[]` 中只能对应一个稳定 `id`。变量生成前必须先扫描主角姓名、初始伙伴姓名、现有 `社交[].id/姓名/曾用名` 和 `玩家门派.重要成员[].姓名`：若正文再次出现已存在人物，只能更新该人物原有索引；禁止 `push 社交` 新建第二个同名人物。初始伙伴已经在开局配置或社交档案中存在时，不要再把她/他当作新 NPC 生成。',
            '22. 禁止删除、清空或整组替换既有 `社交`：不要输出 `delete 社交`、`delete 社交[i]`、`set 社交 = [...]` 或 `set 社交[i] = {...}` 来移除/替换已建档 NPC。即使角色死亡、离队、失踪、被关押或暂时退场，也只能更新 `是否在场/当前位置/状态/生死状态/记忆/当前任务` 等字段，保留档案让后续读档和回忆能承接。只有玩家本回合输入明确要求删除某个 NPC 时，才允许由前端手动删除流程处理，变量生成仍不要主动删。',
            '23. 死亡/已故判定必须反复核对，只有同时满足四项才允许写入：目标 NPC 身份/姓名/索引一致；该 NPC `当前血量 = 0`；`状态/生死状态/生命状态 = "死亡"`；同步写入非空 `死亡时间` 与非空 `死亡描述`。`死亡描述` 必须包含明确死因或死亡过程（如被谁击杀、中毒、感染、失血、伤势过重等），不能只写“已死亡”。满足条件时必须同步写回 `当前血量 = 0`、`是否在场 = false`、`状态/生死状态/生命状态 = "死亡"`、`死亡时间`、`死亡描述`；缺少死亡时间、死亡描述、明确死因，或只是昏死/濒死/重伤/险些身亡/差点死/未死/失踪/状态未知时，一律不得写“死亡/已故”。',
            ...(survivalNeedsEnabled
                ? [[
                    '22. 生理系统开启时，要把时间推进、休整、进食、饮水、赶路、熬战等事实对应到精力',
                    构建修炼体系附加块('、内力'),
                    '、饱腹、口渴等变量联动。'
                ].join('')]
                : [])
        ].join('\n')),
        { 启用修炼体系: cultivationSystemEnabled }
    );
};

export const 构建变量模型系统提示词 = (options?: {
    worldEvolutionEnabled?: boolean;
    worldEvolutionUpdated?: boolean;
    survivalNeedsEnabled?: boolean;
    cultivationSystemEnabled?: boolean;
}): string => 格式化多段文本([
    构建变量模型身份提示词(),
    '',
    构建变量模型职责提示词({
        survivalNeedsEnabled: options?.survivalNeedsEnabled !== false,
        cultivationSystemEnabled: options?.cultivationSystemEnabled !== false
    })
].join('\n'));

export const 构建变量模型输出格式提示词 = (): string => 格式化多段文本([
    '【输出格式】',
    '- 你必须且只允许输出 3 个顶层标签，顺序固定为：`<thinking>`、`<说明>`、`<命令>`。',
    '- `<thinking>` 内按当前变量生成 COT 完成思考，不要把命令写进 `<thinking>`。',
        '- `<说明>` 每行使用 `- ` 前缀，只写“本回合确认了哪些变化 / 为什么这样落命令 / 哪些变量域被更新”。',
        '- `<命令>` 中每行只允许 `add|set|push|delete 路径 = 值` 这一种体例。',
        '- `<命令>` 不写替换旧命令、取消旧命令、伪索引修补或其他补丁语法；只写本回合最终新增的变量命令。',
        '- 正常回合与开局回合都应尽量产生命令；只有正文确实没有形成任何已成立变量变化时，`<命令>` 才允许为空。',
        '- 标量优先 `set`；明确数值增减才使用 `add`；数组新增优先 `push`；整项移除才使用 `delete`。',
        '- `社交` 是长期角色档案，不允许用 `delete 社交`、`delete 社交[i]`、`set 社交 = [...]` 或 `set 社交[i] = {...}` 删除、清空、整组重写或替换既有 NPC。',
        '- `<命令>` 内部排序固定为“先 `set/add`，再 `push`，最后 `delete`”；若同一数组存在多个 `delete`，继续按索引从大到小逆序输出。'
    ].join('\n'));

export const 构建变量模型COT伪装提示词 = (): string => 格式化多段文本([
    '<think>',
    '思考已结束',
    '</think>',
    '好的，我会先在<thinking>中完成变量生成思考，再按协议输出<说明>与<命令>，只根据当前变量数据、本回合正文和本回合变量规划生成最终变量命令：'
].join('\n'));

export const 构建变量模型用户提示词模板 = (): string => [
    '当前任务：',
    '我大致描述内容：',
    '${taskDescription}',
    '',
    '以下是当前的变量数据信息：',
    '${stateJson}',
    '',
    '${responseLabel}',
    '${responseLogs}',
    '',
    '${dialogueCandidateBlock}',
    '',
    '${variablePlanLabel}',
    '${variablePlanText}',
    '',
    '${openingRoundHint}',
    '${extraPromptBlock}'
].join('\n');

export const 构建开局变量模型任务提示词模板 = (): string => [
    '当前任务：',
    '我大致描述内容：',
    '${taskDescription}',
    '',
    '${responseLabel}',
    '${responseLogs}',
    '',
    '${dialogueCandidateBlock}',
    '',
    '${variablePlanLabel}',
    '${variablePlanText}',
    '',
    '${openingRoundHint}',
    '${extraPromptBlock}'
].join('\n');

export const 构建变量模型任务提示词模板 = (options?: { openingTaskContext?: boolean }): string => (
    options?.openingTaskContext
        ? 构建开局变量模型任务提示词模板()
        : 构建变量模型用户提示词模板()
);

export const 构建变量模型用户附加规则提示词 = (): string => '';

const 格式化日志 = (response: GameResponse): string => {
    const logs = Array.isArray(response?.logs) ? response.logs : [];
    if (logs.length === 0) return '未提供正文，请按空正文处理。';
    return logs
        .map((log) => {
            const sender = typeof log?.sender === 'string' && log.sender.trim() ? log.sender.trim() : '旁白';
            const text = typeof log?.text === 'string' ? log.text.trim() : '';
            return text ? `【${sender}】${text}` : '';
        })
        .filter(Boolean)
        .join('\n');
};

const 清理标签包裹文本 = (text: string, tagNames: string[]): string => {
    let result = (text || '').trim();
    tagNames.forEach((tag) => {
        const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result
            .replace(new RegExp(`<\\s*${escaped}\\s*>`, 'gi'), '')
            .replace(new RegExp(`<\\s*/\\s*${escaped}\\s*>`, 'gi'), '')
            .trim();
    });
    return result;
};

const 格式化变量规划文本 = (response: GameResponse): string => {
    const source = typeof response?.t_var_plan === 'string' ? response.t_var_plan : '';
    const cleaned = 清理标签包裹文本(source, ['变量规划', 'variableplan', 'variable_planning', 'varplan']);
    return cleaned || '未提供显式变量规划，需完全依据正文与当前变量数据补全本回合变量命令。';
};

type 变量任务提示词参数 = {
    stateJson: string;
    response: GameResponse;
    extraPrompt?: string;
    isOpeningRound?: boolean;
    openingTaskContext?: {
        currentGameTime?: string;
        openingRoleSetupText?: string;
        openingPartnerSetupText?: string;
        openingConfigText?: string;
    };
};

export const 构建变量模型任务提示词 = (params: 变量任务提示词参数): string => {
    const extraPrompt = (params.extraPrompt || '').trim();
    const useOpeningTaskContext = Boolean(params.openingTaskContext);
    const taskDescription = useOpeningTaskContext
        ? '你需要根据第0回合正文、开局变量规划和开局承接信息进行完整的开局变量命令生成。'
        : '你需要根据本回合正文和变量规划进行完整的变量命令生成。';
    const responseLabel = useOpeningTaskContext
        ? '以下是第0回合完整正文：'
        : '以下是本回合正文：';
    const variablePlanLabel = useOpeningTaskContext
        ? '以下是第0回合完整变量规划（自然语言初始化说明稿）：'
        : '以下是本回合变量规划（自然语言变量说明稿）：';
    const openingRoundHint = useOpeningTaskContext
        ? 构建开局变量生成承接提示(params.openingTaskContext)
        : (
            params.isOpeningRound === true
                ? '【开局承接提示】\n- 当前是第0回合后的首轮变量生成；要把第1回合会读取的前台变量树逐域初始化到最小完整可用状态，不把它当普通补丁。'
                : ''
        );
    const extraPromptBlock = extraPrompt ? `【补充任务提示】\n${extraPrompt}` : '';

    return 格式化多段文本(渲染变量模板(构建变量模型任务提示词模板({
        openingTaskContext: useOpeningTaskContext
    }), {
        taskDescription,
        stateJson: (params.stateJson || '').trim() || '{}',
        responseLabel,
        responseLogs: 格式化日志(params.response),
        dialogueCandidateBlock: 格式化对白候选角色提示(params.response),
        variablePlanLabel,
        variablePlanText: 格式化变量规划文本(params.response),
        openingRoundHint,
        extraPromptBlock
    }));
};

export const 构建变量模型用户提示词 = (params: 变量任务提示词参数): string => (
    构建变量模型任务提示词(params)
);
