import { WorldGenConfig, 角色数据结构, OpeningConfig } from '../../types';
import { 构建修炼体系附加块 } from '../../utils/promptFeatureToggles';
import { 构建题材模式提示词, 是否仙侠开局模式 } from './openingConfig';
import { 解析生效题材配置 } from '../../utils/effectiveTopicProfile';

const 世界锚点难度说明表 = {
    relaxed: {
        label: '轻松',
        起始属性点: 38,
        天赋重Roll次数: 12,
        判定修正: 3,
        资源压力: '经验、掉落与恢复更宽松',
        失败代价: '多为轻伤、少量损耗或可补救后果'
    },
    easy: {
        label: '简单',
        起始属性点: 34,
        天赋重Roll次数: 8,
        判定修正: 1,
        资源压力: '收益略高，物价略低，恢复较稳定',
        失败代价: '会受伤或损失资源，但大多能补救'
    },
    normal: {
        label: '正常',
        起始属性点: 30,
        天赋重Roll次数: 5,
        判定修正: 0,
        资源压力: '收益与消耗按标准江湖压力结算',
        失败代价: '失败会带来伤势、关系或剧情门控损失'
    },
    hard: {
        label: '困难',
        起始属性点: 26,
        天赋重Roll次数: 3,
        判定修正: -1,
        资源压力: '收益减少，物价偏高，恢复更慢',
        失败代价: '更容易留下长期后遗症或丢失关键机会'
    },
    extreme: {
        label: '极限',
        起始属性点: 22,
        天赋重Roll次数: 1,
        判定修正: -3,
        资源压力: '收益稀缺，消耗和物价压力最高',
        失败代价: '可能触发重伤、残废、清算或主线断裂'
    }
} as const;

export const 获取世界锚点难度说明 = (difficulty?: string) => (
    世界锚点难度说明表[(difficulty || 'normal') as keyof typeof 世界锚点难度说明表] || 世界锚点难度说明表.normal
);

export const 构建世界观锚点提示词 = (worldConfig: WorldGenConfig, charData: 角色数据结构, openingConfig?: OpeningConfig | null): string => {
    const 难度设定 = 获取世界锚点难度说明(worldConfig.difficulty);
    const 判定修正 = 难度设定.判定修正 > 0 ? `+${难度设定.判定修正}` : String(难度设定.判定修正);
    const 题材配置 = 解析生效题材配置(openingConfig?.题材模式, openingConfig?.modeRuntimeProfile);
    return `
【当前存档世界锚点（World Bible Anchor）】
- 世界名称: ${worldConfig.worldName}
- ${题材配置.worldSizeLabel}: ${worldConfig.worldSize}
- ${题材配置.dynastyLabel}: ${worldConfig.dynastySetting}
- ${题材配置.densityPromptLabel}: ${worldConfig.sectDensity}
- ${题材配置.tianjiaoLabel}: ${worldConfig.tianjiaoSetting}
- 游戏难度: ${难度设定.label}（${worldConfig.difficulty || 'normal'}）
- 难度参数: 起始属性点${难度设定.起始属性点}；天赋重 roll ${难度设定.天赋重Roll次数}次；玩家判定修正${判定修正}；${难度设定.资源压力}；${难度设定.失败代价}
- 玩家世界观草稿与细化要求: ${worldConfig.worldExtraRequirement?.trim() || '无'}

【世界母本硬边界】
- 本存档世界观必须兼容${题材配置.label}成长主轴。
- 世界应是长期母本，不是开场剧情、任务提纲或玩家专属设定。
- 高手、秘籍、名器、传承、危险区域必须有合理稀缺度与风险代价。
- 世界保持风险与回报匹配，不写成低风险高回报的福利场。
${构建题材模式提示词(openingConfig)}
${构建修炼体系附加块(`- 本存档世界观必须兼容“累计境界值”的${是否仙侠开局模式(openingConfig) ? '仙侠修真' : 题材配置.label}成长主轴，并保持高境界强者的合理稀缺度与风险代价。`)}

【主角建档锚点（仅用于避冲突，不反向定制世界）】
- 姓名/性别/年龄: ${charData.姓名}/${charData.性别}/${charData.年龄}
- 出生日期: ${charData.出生日期}
- 外貌: ${charData.外貌 || '未描述'}
- 性格: ${charData.性格 || '未描述'}
- 性格使用约束: 仅把主角性格作为行为风格、情绪阈值与关系边界参考；NPC 对主角的态度仍建立在自身动机与证据上
${构建修炼体系附加块(`- 初始境界: ${charData.境界}`)}
- 六维: 力量${charData.力量} 敏捷${charData.敏捷} 体质${charData.体质} 根骨${charData.根骨} 悟性${charData.悟性} 福源${charData.福源}
- 天赋: ${charData.天赋列表.map(t => t.名称).join('、') || '无'}
- 背景: ${charData.出身背景?.名称 || '未知'}（${charData.出身背景?.描述 || '无描述'}）
- 仅用于避免世界观与建档发生硬冲突，不据此生成玩家专属世界结构、玩家专属势力保护、玩家专属天命安排。
`.trim();
};

export const 构建世界观种子提示词 = (worldConfig: WorldGenConfig, charData: 角色数据结构, openingConfig?: OpeningConfig | null): string => {
    const anchor = 构建世界观锚点提示词(worldConfig, charData, openingConfig);
    const 题材配置 = 解析生效题材配置(openingConfig?.题材模式, openingConfig?.modeRuntimeProfile);
    return `
【世界观设定（存档绑定）】
此字段是当前存档唯一世界观母本，必须长期一致；后续叙事、判定、事件演化均以此为依据。

1. 世界一致性
   - 势力、资源稀缺度、社会秩序必须与本母本一致。
${构建修炼体系附加块('   - 境界边界必须与本母本一致。')}
   - 同一存档内的世界底层法则保持因果一致。
   - 世界观必须能长期支撑主剧情、战斗、掉落、世界演化，而非只服务一次开场。
${构建修炼体系附加块('   - 世界观必须能长期支撑修炼系统，而非只服务一次开场。')}

2. 成长体系一致性
   - 本存档世界必须兼容当前项目的${题材配置.label}成长体系。
   - 高手应稀缺，高阶传承应稀缺，高收益应对应高风险、高代价或高势力门槛。
   - 设定与现有数值哲学保持一致，例如低风险地区不泛滥神功神装、宗师密度受控、越境碾压伴随代价。
${构建修炼体系附加块([
`   - 本存档世界必须兼容当前项目“累计境界值”${是否仙侠开局模式(openingConfig) ? '仙侠修真' : 题材配置.label}成长体系。`,
'   - 境界部分只需交代整体境界分配与不同年龄段的大致境界划分，不展开详细境界设定。',
'   - 世界母本中的境界内容只保留概述级信息，不写完整境界母板、逐层映射、阶段推进表或大境突破表。',
'   - 高境界强者应稀缺。'
].join('\n'))}

3. 主角一致性
   - 主角身份、出身、六维、初始处境必须与建档锚点一致。
   - 前期物资、关系网符合“初出江湖”的因果，不空降神装。
   - 世界观只能避开与主角硬冲突，不能反过来围绕主角量身定做。
${构建修炼体系附加块('- 前期功法同样符合“初出江湖”的因果，不空降神功。')}

4. 叙事边界
   - 世界观用于约束，不直接替玩家决策。
   - 重大世界事件需通过 \`世界\` 与 \`剧情\` 可追溯落地。
   - 此阶段保持在世界母本层，不输出玩家专属任务线、玩家初始关系网、玩家专属机缘。

5. 时间与地点
   - 时间推进与地点变化需与 \`环境\` 同步。
   - 同时空冲突（同角色同刻多地）视为非法叙事。
   - 世界中的地理、势力、风险分布要支持长期移动、探索、遭遇与世界事件生成。

6. 势力格局
   - 世界必须包含至少 5 个且不超过 15 个势力组织；组织名称和类型必须贴合当前题材，可是门派、宗门、家族、商会、公司、学校、营地、军方残部、掠夺团、黑市、社区组织等。
   - 势力类型分布合理：至少包含 3 类不同组织，不强行在现代或末日题材里生成古代门派。
   - 每个势力有明确的实力等级（1-10）、地盘归属、与其他势力的关系（友好/中立/敌对/从属/联盟）。
   - 每个势力有代表性的物品风格描述；物品池必须贴合${题材配置.label}，参考：${题材配置.presetItemKeywords.join('、')}。
   - 势力之间的关系网是世界演化和${题材配置.auctionName}物品流通的基础。
   - 势力数据在开局变量初始化时写入 \`世界.势力列表\`。

${anchor}
    `.trim();
};

export const 构建世界生成任务上下文提示词 = (
    worldPromptSeed: string,
    difficulty: string,
    enabledDifficultyPrompts: string,
    worldExtraRequirement: string = '',
    openingConfig?: OpeningConfig | null
): string => `
${worldPromptSeed}

【世界生成配置】
- 模式: 新建世界
- 难度: ${difficulty}
- 生成目标: 仅生成 world_prompt（世界观提示词文本）
- 当前阶段定位: 世界母本生成，不是开场初始化，不是剧情正文生成，不是变量落地阶段
${构建题材模式提示词(openingConfig)}

【启用难度规则】
${enabledDifficultyPrompts || '未提供'}
- 难度规则在此阶段只用于约束“世界风险生态、资源稀缺度、社会压力、成长难度背景”。
- 不要在此阶段直接输出数值变量、命令或初始化结果。

【玩家世界观草稿与细化要求（优先约束 world_prompt）】
${worldExtraRequirement.trim() || '无'}
- 若玩家提供了草稿、片段、规则、地名、势力、时代、禁忌或风格方向，必须优先保留这些已写明内容，并在其基础上细化。
- AI 只能补全缺口、整理因果、扩展可长期运行的世界结构；不得推翻、绕开、同义改写掉玩家草稿中的关键事实。
- 若玩家草稿与题材模式或系统硬规则冲突，优先做兼容化解释；只有无法兼容时才最小幅度调整，并保留玩家原意。
- 这些内容只影响世界母本风格与边界，不把结果改写成玩家专属设定或一次性剧情脚本。
`.trim();
