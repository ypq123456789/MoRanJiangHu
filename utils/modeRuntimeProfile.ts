import type { CurrencySystem, CurrencyUnit, ModeRuntimeProfile, 题材模式类型, 性别比例配置, 开局生成性别类型 } from '../models/system';
import { 获取题材模式配置, 规范化题材模式 } from '../data/workshopThemes/topicModeThemeData';
import { 获取世界观货币层级配置 } from './currencyDisplay';

const 默认开局生成性别列表: 开局生成性别类型[] = ['男', '女', '男娘', '扶她'];

const 文本 = (value: unknown, fallback = ''): string => (
    typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const 规范化性别比例 = (value: unknown, fallback: string | 性别比例配置): string | 性别比例配置 => {
    if (!value || typeof value !== 'object') return 文本(value as any, typeof fallback === 'string' ? fallback : '');
    if (typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        if (typeof obj.男 === 'number' && typeof obj.女 === 'number') {
            return {
                男: obj.男,
                女: obj.女,
                男娘: typeof obj.男娘 === 'number' ? obj.男娘 : 0,
                扶她: typeof obj.扶她 === 'number' ? obj.扶她 : 0,
            } as 性别比例配置;
        }
    }
    return typeof fallback === 'string' ? fallback : '1:1';
};

const 布尔 = (value: unknown, fallback = false): boolean => (
    typeof value === 'boolean' ? value : fallback
);

const 规范化开局生成性别列表 = (value: unknown, fallback: 开局生成性别类型[] = 默认开局生成性别列表): 开局生成性别类型[] => {
    const source = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(/[\r\n,，、;；\s]+/u)
            : [];
    const allowed = new Set<开局生成性别类型>(默认开局生成性别列表);
    const seen = new Set<开局生成性别类型>();
    const result: 开局生成性别类型[] = [];
    source.forEach((item) => {
        const next = 文本(item) as 开局生成性别类型;
        if (!allowed.has(next) || seen.has(next)) return;
        seen.add(next);
        result.push(next);
    });
    return result.length > 0 ? result : [...fallback];
};

const 读取正整数 = (value: unknown, fallback: number): number => {
    const numeric = Math.floor(Number(value));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const 读取非空字符串 = (value: unknown): string => (
    typeof value === 'string' ? value.trim() : ''
);

export const 校验CurrencySystem草稿 = (value: unknown): { currencySystem?: CurrencySystem; errors: string[] } => {
    const errors: string[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { errors: ['currencySystem 必须是对象。'] };
    }
    const raw = value as Record<string, unknown>;
    const id = 读取非空字符串(raw.id);
    const name = 读取非空字符串(raw.name);
    const baseUnitId = 读取非空字符串(raw.baseUnitId);
    if (!id) errors.push('id 必填。');
    if (!name) errors.push('name 必填。');
    if (!baseUnitId) errors.push('baseUnitId 必填。');
    if (raw.formatStyle !== undefined && raw.formatStyle !== 'single' && raw.formatStyle !== 'compound') {
        errors.push('formatStyle 只能是 single 或 compound。');
    }
    if (!Array.isArray(raw.units) || raw.units.length <= 0) {
        errors.push('units 必须是非空数组。');
    }

    const seenIds = new Set<string>();
    const units: CurrencyUnit[] = [];
    const rawUnits = Array.isArray(raw.units) ? raw.units : [];
    rawUnits.forEach((item, index) => {
        const prefix = `units[${index}]`;
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            errors.push(`${prefix} 必须是对象。`);
            return;
        }
        const unitRaw = item as Record<string, unknown>;
        const unitId = 读取非空字符串(unitRaw.id);
        const unitName = 读取非空字符串(unitRaw.name);
        if (!unitId) errors.push(`${prefix}.id 必填。`);
        if (!unitName) errors.push(`${prefix}.name 必填。`);
        if (unitId && seenIds.has(unitId)) errors.push(`unit.id 不可重复：${unitId}。`);
        const baseRate = Number(unitRaw.baseRate);
        const order = Number(unitRaw.order);
        if (!Number.isInteger(baseRate) || baseRate <= 0) errors.push(`${prefix}.baseRate 必须是正整数。`);
        if (!Number.isFinite(order)) errors.push(`${prefix}.order 必须是有限数字。`);
        if (unitRaw.aliases !== undefined && (!Array.isArray(unitRaw.aliases) || !unitRaw.aliases.every((alias) => typeof alias === 'string'))) {
            errors.push(`${prefix}.aliases 必须是字符串数组。`);
        }
        const symbol = 读取非空字符串(unitRaw.symbol);
        const aliases = Array.isArray(unitRaw.aliases)
            ? unitRaw.aliases.map((alias) => alias.trim()).filter(Boolean)
            : [];
        if (unitId) seenIds.add(unitId);
        if (unitId && unitName && Number.isInteger(baseRate) && baseRate > 0 && Number.isFinite(order)) {
            units.push({
                id: unitId,
                name: unitName,
                ...(symbol ? { symbol } : {}),
                baseRate,
                order,
                ...(aliases.length > 0 ? { aliases: Array.from(new Set(aliases)) } : {})
            });
        }
    });

    const baseUnit = units.find((unit) => unit.id === baseUnitId);
    if (baseUnitId && !baseUnit) errors.push('baseUnitId 必须命中某个 unit.id。');
    if (baseUnit && baseUnit.baseRate !== 1) errors.push('base unit 的 baseRate 必须为 1。');
    if (errors.length > 0) return { errors };
    return {
        currencySystem: {
            id,
            name,
            baseUnitId,
            units,
            ...(raw.formatStyle === 'single' || raw.formatStyle === 'compound' ? { formatStyle: raw.formatStyle } : {})
        },
        errors: []
    };
};

export const 规范化显式CurrencySystem = (value: unknown): CurrencySystem | undefined => {
    return 校验CurrencySystem草稿(value).currencySystem;
};

export const 拆分模式配置短语 = (value: unknown): string[] => {
    const source = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(/[，,、\n;；]+/u)
            : [];
    const seen = new Set<string>();
    const result: string[] = [];
    source.forEach((item) => {
        const next = 文本(item);
        if (!next || seen.has(next)) return;
        seen.add(next);
        result.push(next);
    });
    return result;
};

const 判断现代 = (mode: 题材模式类型): boolean => {
    const group = 获取题材模式配置(mode).group;
    return group === 'urban_xianxia' || group === 'modern' || group === 'apocalypse' || group === 'infinite';
};

const 判断修炼 = (mode: 题材模式类型): boolean => {
    const group = 获取题材模式配置(mode).group;
    return group === 'xianxia' || group === 'urban_xianxia';
};

const 取记账单位 = (currencyDisplayMode: ModeRuntimeProfile['economy']['currencyDisplayMode']): string => {
    if (currencyDisplayMode === 'infinite') return '奖励点';
    if (currencyDisplayMode === 'apocalypse') return '营地信用点';
    if (currencyDisplayMode === 'xianxia') return '下品灵石';
    if (currencyDisplayMode === 'fantasy') return '铜币';
    if (currencyDisplayMode === 'urban' || currencyDisplayMode === 'modern') return '信用点';
    return '铜钱';
};

const 构建默认货币层级 = (currencyDisplayMode: ModeRuntimeProfile['economy']['currencyDisplayMode']) => {
    const [upper, middle, lower] = 获取世界观货币层级配置(undefined, currencyDisplayMode);
    return {
        upperName: upper.label,
        middleName: middle.label,
        lowerName: lower.label,
        upperToMiddleRate: Math.max(1, Math.floor(upper.multiplier / Math.max(1, middle.multiplier))),
        middleToLowerRate: Math.max(1, middle.multiplier)
    };
};

type 货币层级配置 = ModeRuntimeProfile['economy']['currencyTiers'];

const 去重非空文本 = (items: string[]): string[] => (
    Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
);

export const 从CurrencyTiers生成CurrencySystem = (
    currencyTiers: 货币层级配置,
    currencyDisplayMode: ModeRuntimeProfile['economy']['currencyDisplayMode']
): CurrencySystem => {
    const upperRate = Math.max(1, Math.floor(currencyTiers.upperToMiddleRate)) * Math.max(1, Math.floor(currencyTiers.middleToLowerRate));
    const middleRate = Math.max(1, Math.floor(currencyTiers.middleToLowerRate));
    return {
        id: `${currencyDisplayMode}-default-currency-system`,
        name: `${currencyTiers.upperName}/${currencyTiers.middleName}/${currencyTiers.lowerName}货币体系`,
        baseUnitId: 'lower',
        formatStyle: 'compound',
        units: [
            {
                id: 'upper',
                name: currencyTiers.upperName,
                baseRate: upperRate,
                order: 3,
                aliases: 去重非空文本([currencyTiers.upperName, '上层货币', '金元宝', '元宝'])
            },
            {
                id: 'middle',
                name: currencyTiers.middleName,
                baseRate: middleRate,
                order: 2,
                aliases: 去重非空文本([currencyTiers.middleName, '中层货币', '银子', '银两'])
            },
            {
                id: 'lower',
                name: currencyTiers.lowerName,
                baseRate: 1,
                order: 1,
                aliases: 去重非空文本([currencyTiers.lowerName, '底层货币', '铜钱'])
            }
        ]
    };
};

export type CurrencySystem预设模板ID =
    | 'topic-default'
    | 'single'
    | 'modern-yuan'
    | 'credit'
    | 'wuxia'
    | 'xianxia'
    | 'fantasy'
    | 'apocalypse'
    | 'infinite';

export const 获取CurrencySystem预设模板列表 = (): Array<{ id: CurrencySystem预设模板ID; label: string }> => [
    { id: 'topic-default', label: '题材默认' },
    { id: 'single', label: '单一货币' },
    { id: 'modern-yuan', label: '现代人民币' },
    { id: 'credit', label: '信用点' },
    { id: 'wuxia', label: '武侠金银铜' },
    { id: 'xianxia', label: '修仙灵石' },
    { id: 'fantasy', label: '西幻金币银币铜币' },
    { id: 'apocalypse', label: '末日物资券/瓶盖' },
    { id: 'infinite', label: '无限流奖励点/支线剧情' }
];

const 克隆CurrencySystem = (currencySystem: CurrencySystem): CurrencySystem => JSON.parse(JSON.stringify(currencySystem));

const 构建单币种CurrencySystem = (id: string, name: string, unitName: string, symbol = '', aliases: string[] = []): CurrencySystem => ({
    id,
    name,
    baseUnitId: 'base',
    formatStyle: 'single',
    units: [
        {
            id: 'base',
            name: unitName,
            ...(symbol ? { symbol } : {}),
            baseRate: 1,
            order: 1,
            aliases: 去重非空文本([unitName, ...aliases])
        }
    ]
});

export const 构建CurrencySystem模板 = (
    templateId: CurrencySystem预设模板ID,
    profile?: ModeRuntimeProfile
): CurrencySystem => {
    if (templateId === 'topic-default') {
        if (profile?.economy.currencySystem) return 克隆CurrencySystem(profile.economy.currencySystem);
        if (profile?.economy.currencyTiers) {
            return 从CurrencyTiers生成CurrencySystem(profile.economy.currencyTiers, profile.economy.currencyDisplayMode);
        }
        return 从CurrencyTiers生成CurrencySystem(构建默认货币层级('wuxia'), 'wuxia');
    }
    if (templateId === 'single') return 构建单币种CurrencySystem('single-currency', '单一货币体系', '货币', '', ['基础货币']);
    if (templateId === 'modern-yuan') return 构建单币种CurrencySystem('modern-yuan', '人民币体系', '元', '¥', ['人民币', '现金', '电子支付']);
    if (templateId === 'credit') return 构建单币种CurrencySystem('credit-point', '信用点体系', '信用点', '点', ['信用', '点数']);
    if (templateId === 'wuxia') {
        return {
            id: 'wuxia-gold-silver-copper',
            name: '武侠金银铜',
            baseUnitId: 'copper',
            formatStyle: 'compound',
            units: [
                { id: 'gold', name: '金', baseRate: 100000, order: 3, aliases: ['金元宝', '元宝', '上层货币'] },
                { id: 'silver', name: '银', baseRate: 1000, order: 2, aliases: ['银子', '银两', '中层货币'] },
                { id: 'copper', name: '铜', baseRate: 1, order: 1, aliases: ['铜钱', '底层货币'] }
            ]
        };
    }
    if (templateId === 'xianxia') {
        return {
            id: 'xianxia-spirit-stones',
            name: '修仙灵石体系',
            baseUnitId: 'low',
            formatStyle: 'compound',
            units: [
                { id: 'supreme', name: '极品灵石', baseRate: 100000000, order: 4, aliases: ['极品'] },
                { id: 'high', name: '上品灵石', baseRate: 100000, order: 3, aliases: ['上品', '上层货币'] },
                { id: 'middle', name: '中品灵石', baseRate: 1000, order: 2, aliases: ['中品', '中层货币'] },
                { id: 'low', name: '下品灵石', baseRate: 1, order: 1, aliases: ['下品', '底层货币'] }
            ]
        };
    }
    if (templateId === 'fantasy') {
        return {
            id: 'fantasy-coins',
            name: '西幻金币银币铜币',
            baseUnitId: 'copper',
            formatStyle: 'compound',
            units: [
                { id: 'gold', name: '金币', baseRate: 10000, order: 3, aliases: ['金', '上层货币'] },
                { id: 'silver', name: '银币', baseRate: 100, order: 2, aliases: ['银', '中层货币'] },
                { id: 'copper', name: '铜币', baseRate: 1, order: 1, aliases: ['铜', '底层货币'] }
            ]
        };
    }
    if (templateId === 'apocalypse') {
        return {
            id: 'apocalypse-supplies',
            name: '末日物资券/瓶盖体系',
            baseUnitId: 'camp-credit',
            formatStyle: 'compound',
            units: [
                { id: 'supply-ticket', name: '物资券', baseRate: 1000, order: 3, aliases: ['物资票', '补给券', '上层货币'] },
                { id: 'bottle-cap', name: '瓶盖', baseRate: 10, order: 2, aliases: ['瓶盖币', '中层货币'] },
                { id: 'camp-credit', name: '营地信用点', baseRate: 1, order: 1, aliases: ['信用点', '营地信用', '底层货币'] }
            ]
        };
    }
    return {
        id: 'infinite-rewards',
        name: '无限流奖励点/支线剧情',
        baseUnitId: 'reward-point',
        formatStyle: 'compound',
        units: [
            { id: 'c-plot', name: 'C级支线剧情', baseRate: 100000, order: 3, aliases: ['C支线', 'C级', '上层货币'] },
            { id: 'd-plot', name: 'D级支线剧情', baseRate: 1000, order: 2, aliases: ['D支线', 'D级', '中层货币'] },
            { id: 'reward-point', name: '奖励点', baseRate: 1, order: 1, aliases: ['点数', '底层货币'] }
        ]
    };
};

const 东方古法时间词 = ['时辰', '子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时', '一炷香', '半炷香', '一盏茶', '半盏茶', '刻钟', '三刻'];

const 时间默认值 = (mode: 题材模式类型): ModeRuntimeProfile['time'] => {
    const profile = 获取题材模式配置(mode);
    if (profile.group === 'western_fantasy') {
        return {
            displayFormat: 'western',
            calendarName: '王国历',
            narrativeStyle: '正文使用西方奇幻口吻表达时间：清晨、正午、黄昏、深夜、钟声、第几小时、王国历/月日等；可以写“教堂钟声敲过八下”，不得使用东方时辰、炷香、盏茶等古法词。',
            dayPeriodNames: ['黎明', '清晨', '上午', '正午', '午后', '黄昏', '入夜', '深夜'],
            allowedTimeTerms: ['黎明', '清晨', '上午', '正午', '午后', '黄昏', '入夜', '深夜', '钟声', '第几小时', '王国历', '月日'],
            bannedTimeTerms: 东方古法时间词,
            progressionPrompt: '时间推进以小时、分钟、昼夜段、钟声或王国历日期表达；环境.时间仍按 YYYY:MM:DD:HH:MM 写入。'
        };
    }
    if (profile.group === 'modern') {
        return {
            displayFormat: 'modern',
            calendarName: '公历',
            narrativeStyle: '正文使用现代时间表达：数字钟点、上午、下午、晚上、工作日/周末、日期；不得写时辰、炷香、盏茶等古法词。',
            dayPeriodNames: ['凌晨', '清晨', '上午', '中午', '下午', '傍晚', '晚上', '深夜'],
            allowedTimeTerms: ['凌晨', '清晨', '上午', '中午', '下午', '傍晚', '晚上', '深夜', '分钟', '小时', '点', '公历', '周末', '工作日'],
            bannedTimeTerms: 东方古法时间词,
            progressionPrompt: '时间推进以分钟、小时、数字钟点、日程或日期表达；环境.时间仍按 YYYY:MM:DD:HH:MM 写入。'
        };
    }
    if (profile.group === 'apocalypse') {
        return {
            displayFormat: 'apocalypse',
            calendarName: '灾变纪年',
            narrativeStyle: '正文使用末日生存时间表达：数字钟点、天亮前、黄昏后、倒计时、值守班次、灾变第几天；不得写时辰、炷香、盏茶等古法词。',
            dayPeriodNames: ['凌晨', '天亮前', '上午', '正午', '午后', '黄昏后', '夜间', '深夜'],
            allowedTimeTerms: ['凌晨', '天亮前', '上午', '正午', '午后', '黄昏后', '夜间', '深夜', '分钟', '小时', '倒计时', '值守班次', '灾变第几天'],
            bannedTimeTerms: 东方古法时间词,
            progressionPrompt: '时间推进以分钟、小时、数字钟点、倒计时、班次或灾变天数表达；环境.时间仍按 YYYY:MM:DD:HH:MM 写入。'
        };
    }
    if (profile.group === 'infinite') {
        return {
            displayFormat: 'infinite',
            calendarName: '任务计时',
            narrativeStyle: '正文使用无限流/任务世界时间表达：数字钟点、任务倒计时、回归倒计时、电影世界时间线；不得写时辰、炷香、盏茶等古法词。',
            dayPeriodNames: ['凌晨', '清晨', '上午', '正午', '下午', '黄昏', '夜间', '深夜'],
            allowedTimeTerms: ['凌晨', '清晨', '上午', '正午', '下午', '黄昏', '夜间', '深夜', '分钟', '小时', '倒计时', '任务时限', '回归倒计时', '电影时间线'],
            bannedTimeTerms: 东方古法时间词,
            progressionPrompt: '时间推进以分钟、小时、数字钟点、任务倒计时或剧情世界时间线表达；环境.时间仍按 YYYY:MM:DD:HH:MM 写入。'
        };
    }
    if (profile.group === 'urban_xianxia') {
        return {
            displayFormat: 'modern',
            calendarName: '公历/灵气复苏纪年',
            narrativeStyle: '正文以现代钟点为主，可少量保留修行语境；都市场景不得默认写时辰、炷香、盏茶，除非当前场景明确是古法宗门或秘境仪式。',
            dayPeriodNames: ['凌晨', '清晨', '上午', '中午', '下午', '傍晚', '晚上', '深夜'],
            allowedTimeTerms: ['凌晨', '清晨', '上午', '中午', '下午', '傍晚', '晚上', '深夜', '分钟', '小时', '点', '公历', '纪年'],
            bannedTimeTerms: ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时', '一炷香', '一盏茶'],
            progressionPrompt: '时间推进以现代分钟/小时和数字钟点为主；只有明确古法场景才可把古法词作为氛围补充，环境.时间仍按 YYYY:MM:DD:HH:MM 写入。'
        };
    }
    return {
        displayFormat: 'traditional',
        calendarName: profile.group === 'xianxia' ? '仙历' : '江湖历',
        narrativeStyle: '正文可使用清晨、午后、黄昏、夜半、时辰、刻、盏茶、炷香等传统时间表达；变量仍必须落到标准时间真值。',
        dayPeriodNames: ['黎明', '清晨', '上午', '正午', '午后', '黄昏', '入夜', '深夜'],
        allowedTimeTerms: ['黎明', '清晨', '上午', '正午', '午后', '黄昏', '入夜', '深夜', '时辰', '刻', '盏茶', '炷香'],
        bannedTimeTerms: [],
        progressionPrompt: '时间推进可用古法词辅助叙事，但最终必须换算为 YYYY:MM:DD:HH:MM 写入环境.时间。'
    };
};

const 组织默认值 = (mode: 题材模式类型) => {
    const profile = 获取题材模式配置(mode);
    if (profile.group === 'apocalypse') {
        return {
            organizationName: '营地',
            memberName: '幸存者',
            contributionName: '营地信用',
            rankNames: ['临时成员', '营地成员', '巡逻队员', '骨干成员', '区域负责人'],
            organizationAliases: ['避难所', '安全区', '车队', '哨站', '幸存者小队'],
            memberAliases: ['队友', '营地成员', '幸存者', '巡逻员', '后勤人员']
        };
    }
    if (profile.group === 'infinite') {
        return {
            organizationName: '轮回小队',
            memberName: '轮回者',
            contributionName: '队伍信用',
            rankNames: ['新人', '正式队员', '资深者', '队长候补', '队长'],
            organizationAliases: ['轮回小队', '主神小队', '队伍房间', '临时同盟', '团战小队'],
            memberAliases: ['轮回者', '新人', '资深者', '队友', '精神力者', '火力手', '医疗位']
        };
    }
    if (profile.group === 'modern') {
        return {
            organizationName: '组织',
            memberName: '成员',
            contributionName: '信用',
            rankNames: ['临时协作者', '正式成员', '项目骨干', '负责人', '合伙人'],
            organizationAliases: ['公司', '学校', '社区', '项目组', '门店', '合作团队'],
            memberAliases: ['同事', '联系人', '合作对象', '亲友', '邻里']
        };
    }
    if (profile.group === 'urban_xianxia') {
        const isRecovery = mode === '灵气复苏';
        return {
            organizationName: isRecovery ? '机构' : '隐门',
            memberName: isRecovery ? '协作者' : '同道',
            contributionName: isRecovery ? '研究额度' : '圈内信用',
            rankNames: isRecovery
                ? ['观察对象', '协作者', '调查员', '稳定者', '负责人']
                : ['外缘同道', '入门同道', '家族/隐门成员', '核心同道', '主事人'],
            organizationAliases: isRecovery
                ? ['研究小组', '管控机构', '觉醒者互助点', '异常处理小队']
                : ['隐秘家族', '暗线组织', '同道据点', '都市隐门', '异闻暗市'],
            memberAliases: isRecovery
                ? ['研究员', '调查员', '觉醒者', '互助者', '协作者']
                : ['同道', '师承联系人', '家族成员', '暗线伙伴']
        };
    }
    if (profile.group === 'xianxia') {
        return {
            organizationName: '宗门',
            memberName: '同道',
            contributionName: '宗门贡献',
            rankNames: ['杂役弟子', '外门弟子', '内门弟子', '真传弟子', '执事', '长老'],
            organizationAliases: ['仙宗', '道院', '灵门', '玄府', '坊市'],
            memberAliases: ['师长', '同门', '道友', '宗门外缘人物']
        };
    }
    if (profile.group === 'western_fantasy') {
        return {
            organizationName: '公会',
            memberName: '冒险者',
            contributionName: '公会声望',
            rankNames: ['见习冒险者', '正式冒险者', '资深冒险者', '银章成员', '金章成员', '传奇顾问'],
            organizationAliases: ['冒险者公会', '骑士团', '魔法学院', '教会', '佣兵团', '商会'],
            memberAliases: ['冒险者', '骑士', '法师学徒', '牧师', '佣兵', '斥候']
        };
    }
    return {
        organizationName: '门派',
        memberName: '同门',
        contributionName: '门派贡献',
        rankNames: ['杂役弟子', '外门弟子', '内门弟子', '真传弟子', '执事', '长老'],
        organizationAliases: ['门派', '帮会', '镖局', '武馆', '堂口'],
        memberAliases: ['师长', '同门', '帮众', '门人', '江湖联系人']
    };
};

const 能力默认值 = (mode: 题材模式类型) => {
    const profile = 获取题材模式配置(mode);
    if (mode === '末日丧尸') {
        return {
            primaryAxis: '生存能力、物资管理、感染风险控制与团队信任',
            progressionNames: ['普通幸存者', '熟练搜寻者', '营地骨干', '感染适应者', '区域领袖'],
            attributePointRules: '属性点代表体能、反应、抗压、求生经验和团队协作提升；不得写成修仙突破。',
            skillGrowthVerb: '提升熟练度',
            combatResolution: '战斗必须计算噪音、距离、弹药、伤病、防护、感染暴露和撤离路线。'
        };
    }
    if (mode === '无限流') {
        return {
            primaryAxis: '奖励点规划、支线剧情、兑换强化、基因锁、恐怖片情报与团队分工',
            progressionNames: ['新人', '正式轮回者', '资深者', '解开一阶基因锁', '队长级轮回者'],
            attributePointRules: '属性点代表身体素质、精神韧性、兑换适配、战斗经验和基因锁承受力提升；高阶强化必须消耗奖励点和支线剧情。',
            skillGrowthVerb: '提升掌握度',
            combatResolution: '战斗必须计算任务规则、恐惧压力、弹药/道具消耗、队友配合、支线触发、基因锁风险和回归条件。'
        };
    }
    if (mode === '现代都市') {
        return {
            primaryAxis: '职业技能、人脉信用、资产管理、心理韧性和社会资源',
            progressionNames: ['普通人', '熟练从业者', '圈层骨干', '资源整合者', '城市影响者'],
            attributePointRules: '属性点代表现实能力与资源整合提升；不要常态化超凡力量。',
            skillGrowthVerb: '提升熟练度',
            combatResolution: '冲突以现实后果、法律风险、人际成本、资金与信息差结算。'
        };
    }
    if (mode === '灵气复苏') {
        return {
            primaryAxis: '觉醒稳定度、现代资源、研究认知和异常风险控制',
            progressionNames: ['未觉醒', '灵感初启', '觉醒者', '稳定者', '领域雏形'],
            attributePointRules: '属性点可表现为觉醒适应、现代技能和风险承受力提升。',
            skillGrowthVerb: '提升掌控度',
            combatResolution: '冲突必须兼顾现代环境、封控、科研认知、副作用和普通社会后果。'
        };
    }
    if (mode === '都市修仙') {
        return {
            primaryAxis: '修行境界、现代身份、资源渠道和人脉风险',
            progressionNames: ['炼体', '引气', '凝神', '筑基', '金丹'],
            attributePointRules: '属性点同时影响现实能力和修行根基，但日常身份仍受现代社会约束。',
            skillGrowthVerb: '提升熟练度',
            combatResolution: '战斗必须兼顾修行差距、现代场景暴露、人脉风险和法律/舆论后果。'
        };
    }
    if (mode === '仙侠') {
        return {
            primaryAxis: '灵根、灵力、神识、法宝、术法和道心',
            progressionNames: ['练气', '筑基', '金丹', '元婴', '化神'],
            attributePointRules: '属性点代表根基、体魄、悟性、神识、灵力运转与机缘承载提升。',
            skillGrowthVerb: '提升熟练度',
            combatResolution: '战斗必须考虑境界压制、法宝品阶、灵力消耗、神识、阵法与因果代价。'
        };
    }
    if (mode === '西方奇幻') {
        return {
            primaryAxis: '职业等级、剑盾弓弩、魔法/神术、炼金、契约、装备和公会声望',
            progressionNames: ['见习', '初阶', '中阶', '高阶', '大师', '传奇'],
            attributePointRules: '属性点代表职业训练、体能、魔力掌控、战技熟练、装备适配和冒险经验提升；不得写成修仙突破。',
            skillGrowthVerb: '提升熟练度',
            combatResolution: '战斗必须考虑职业克制、站位、护甲、法力/神术消耗、材料、魔物特性、队伍配合和撤退路线。'
        };
    }
    return {
        primaryAxis: '内力、招式、身法、兵器、医毒、机关与江湖经验',
        progressionNames: ['不入流', '三流', '二流', '一流', '后天', '先天'],
        attributePointRules: '属性点代表体魄、根骨、悟性、福源、江湖经验和武学根基提升。',
        skillGrowthVerb: '提升熟练度',
        combatResolution: '战斗必须考虑体力、伤势、距离、兵器、身法、内力和江湖规矩。'
    };
};

const 物品默认值 = (mode: 题材模式类型) => {
    if (mode === '末日丧尸') {
        return {
            initialItemPool: ['急救包', '罐头', '净水片', '电池', '燃油', '手电', '弩机'],
            rewardItemPool: ['净水', '抗生素', '弹药', '燃油', '电池', '维修工具', '营地信用'],
            bannedItemKeywords: ['破境丹', '回气丹', '凝元丹', '辟谷丹', '灵石', '法宝', '飞剑'],
            exclusiveItemTypes: ['食物', '饮水', '药品', '弹药', '工具', '燃油', '情报'],
            resourceToggles: { food: true, water: true, ammo: true, medicine: true, fuel: true, batteries: true, spiritStones: false },
            activeResources: ['饱腹', '口渴']
        };
    }
    if (mode === '无限流') {
        return {
            initialItemPool: ['智能手机', '急救包', '防护服', '净水片', '护身符', '基础剑法残卷', '下品灵石', '手摇电筒'],
            rewardItemPool: ['奖励点', 'D级支线剧情', '急救包', '弹药', '防护服', '血统强化权限', '恐怖片情报'],
            bannedItemKeywords: ['银子', '铜钱', '金元宝', '门派贡献', '营地信用', '普通工资', '人民币结算'],
            exclusiveItemTypes: ['科技装备', '魔法物品', '血统强化', '技能卷轴', '补给', '情报', '支线凭证'],
            resourceToggles: { food: true, water: true, ammo: true, medicine: true, fuel: true, batteries: true, spiritStones: true },
            activeResources: ['饱腹', '口渴', '灵石']
        };
    }
    if (mode === '现代都市') {
        return {
            initialItemPool: ['手机', '笔记本电脑', '银行卡', '合同', '录音笔', '急救包'],
            rewardItemPool: ['现金', '转账', '合同资源', '客户线索', '技能培训', '人情债'],
            bannedItemKeywords: ['破境丹', '回气丹', '凝元丹', '辟谷丹', '灵石', '宗门法宝'],
            exclusiveItemTypes: ['电子设备', '证件', '合同', '工具', '药品', '生活用品'],
            resourceToggles: { food: false, water: false, ammo: false, medicine: true, fuel: false, batteries: true, spiritStones: false },
            activeResources: []
        };
    }
    if (mode === '西方奇幻') {
        return {
            initialItemPool: ['长剑', '皮甲', '治疗药水', '魔晶', '羊皮地图', '火把', '短弓', '法术卷轴'],
            rewardItemPool: ['金币', '魔晶', '治疗药水', '法术卷轴', '附魔材料', '公会声望'],
            bannedItemKeywords: ['破境丹', '回气丹', '凝元丹', '辟谷丹', '灵石', '宗门法宝', '飞剑', '现代手机', '银行卡'],
            exclusiveItemTypes: ['武器', '防具', '药水', '卷轴', '魔晶', '附魔材料', '任务道具'],
            resourceToggles: { food: false, water: false, ammo: false, medicine: true, fuel: false, batteries: false, spiritStones: false },
            activeResources: []
        };
    }
    const profile = 获取题材模式配置(mode);
    return {
        initialItemPool: profile.presetItemKeywords,
        rewardItemPool: profile.presetItemKeywords,
        bannedItemKeywords: profile.group === 'wuxia'
            ? ['灵石', '飞剑', '法宝', '现代手机', '银行卡']
            : profile.group === 'xianxia'
                ? ['现代手机', '银行卡', '手枪', '燃油票']
                : ['古代银票', '门派腰牌', '宗门山门'],
        exclusiveItemTypes: profile.group === 'xianxia' || profile.group === 'urban_xianxia'
            ? ['丹药', '符箓', '法器', '灵材', '功法', '现代物资']
            : ['兵器', '药品', '秘籍', '护具', '信物'],
        resourceToggles: {
            food: false,
            water: false,
            ammo: false,
            medicine: true,
            fuel: profile.group === 'urban_xianxia',
            batteries: profile.group === 'urban_xianxia',
            spiritStones: profile.group === 'xianxia' || profile.group === 'urban_xianxia'
        },
        activeResources: profile.group === 'xianxia' || profile.group === 'urban_xianxia' ? ['灵石'] : []
    };
};

export const 构建官方模式运行时配置 = (
    mode?: unknown,
    overrides?: Partial<ModeRuntimeProfile>
): ModeRuntimeProfile => {
    const baseMode = 规范化题材模式(mode);
    const profile = 获取题材模式配置(baseMode);
    const organization = 组织默认值(baseMode);
    const ability = 能力默认值(baseMode);
    const items = 物品默认值(baseMode);
    const time = 时间默认值(baseMode);
    const isModern = 判断现代(baseMode);
    const isApocalypse = profile.group === 'apocalypse';
    const isInfinite = profile.group === 'infinite';
    const currencyTiers = 构建默认货币层级(profile.currencyDisplayMode);
    const runtime: ModeRuntimeProfile = {
        identity: {
            modeId: profile.value,
            displayName: profile.label,
            baseMode,
            isModern,
            usesCultivation: 判断修炼(baseMode),
            isApocalypse,
            isSurvival: isApocalypse || isInfinite,
            isFandomIp: false
        },
        economy: {
            currencyDisplayMode: profile.currencyDisplayMode,
            primaryCurrency: profile.currencyPrompt,
            accountingUnit: 取记账单位(profile.currencyDisplayMode),
            exchangeRules: profile.currencyExchangePrompt,
            currencyTiers,
            currencySystem: 从CurrencyTiers生成CurrencySystem(currencyTiers, profile.currencyDisplayMode),
            marketName: profile.auctionName,
            marketVerb: profile.marketVerb,
            allowedItemTypes: items.exclusiveItemTypes,
            bannedKeywords: items.bannedItemKeywords
        },
        time,
        organization,
        ability: {
            ...ability,
            skillPool: profile.skillNames
        },
        items,
        map: {
            layerNames: ['寰宇', '大地点', '中地点', '小地点', '区地点', '子地点'],
            locationTypes: profile.mapPrompt.split(/[、，,]/u).map((item) => item.replace(/世界版图应按|组织。|等/u, '').trim()).filter(Boolean),
            poiTypes: profile.group === 'infinite'
                ? ['主神空间', '队伍房间', '训练场', '主神广场', '任务世界', '剧情地点', '安全屋', '补给点', '隐藏支线地点', '回归通道']
                : profile.group === 'apocalypse'
                ? ['感染区', '医院', '商超', '仓库', '避难所', '公路', '封锁线', '营地', '市场', '资源点']
                : profile.group === 'modern'
                    ? ['社区', '商圈', '写字楼', '学校', '医院', '交通站点', '灰色渠道']
                    : profile.group === 'xianxia'
                        ? ['宗门', '坊市', '秘境入口', '洞府', '禁地', '凡俗城镇']
                        : profile.group === 'western_fantasy'
                            ? ['王国', '城堡', '教会', '魔法学院', '冒险者公会', '港口', '地下城', '遗迹', '魔物巢穴']
                            : ['城镇', '门派', '山道', '关隘', '渡口', '市场', '野外险地'],
            bannedLocationKeywords: profile.group === 'infinite'
                ? ['宗门山门', '王朝朝堂', '营地信用市场', '现实工资结算']
                : profile.group === 'apocalypse'
                ? ['宗门', '山门', '藏经阁', '洞府', '仙坊']
                : profile.group === 'modern'
                    ? ['宗门', '山门', '藏经阁', '仙坊', '坊市']
                    : profile.group === 'western_fantasy'
                        ? ['宗门', '山门', '藏经阁', '仙坊', '坊市', '写字楼', '地铁站']
                        : [],
            mapPrompt: profile.mapPrompt
        },
        task: {
            mainQuestStyle: isInfinite ? '围绕主神任务、恐怖片生存、支线触发、队伍协作和回归结算推进主线。' : isApocalypse ? '围绕求生、营地、感染风险和物资路线推进主线。' : `围绕${profile.label}的身份、组织、资源与长期目标推进主线。`,
            sideQuestDedupeKeys: ['目标地点', '发放者', '奖励类型', '核心行动', '关联NPC'],
            rewardDistributor: organization.organizationName,
            rewardVisualizationTemplate: isInfinite ? '正文中用【任务奖励】展示主神结算、奖励点、支线剧情、兑换权限、技能提升、属性点或队伍信用。' : '正文中用【任务奖励】展示发放者、到账物品、技能提升、贡献/信用、属性点或境界变化。'
        },
        npc: {
            defaultIdentityPool: organization.memberAliases,
            relationTemplates: profile.group === 'infinite'
                ? ['队友', '资深者带新人', '利益同盟', '团战敌对', '临时合作']
                : profile.group === 'apocalypse'
                ? ['互助', '物资合作', '冲突', '临时同行']
                : profile.group === 'western_fantasy'
                    ? ['契约', '同伴', '委托', '阵营', '旧怨']
                    : ['师门', '友情', '利益', '旧怨'],
            requiredMainCharacterFields: ['姓名', '性别', '年龄', '外貌', '性格', '身份', '位置', '关系', '性癖', '敏感点'],
            sexualityFallback: '按角色性格与经历生成明确偏好，不得写未知。',
            sensitivityFallback: '按角色身体/心理特征生成明确敏感点，不得写未知。',
            autoImageStyle: isInfinite
                ? '现代轮回者服饰、任务世界装备、主神空间冷白光和兑换道具清晰可见。'
                : isModern
                ? '现代服饰、现实材质、题材道具清晰可见。'
                : profile.group === 'western_fantasy'
                    ? '中世纪西方奇幻服饰、职业装备、公会/城堡/地下城环境和魔法道具清晰可见。'
                    : '符合题材时代与身份的服饰、武器和环境。',
            genderRatio: isInfinite ? '1:5' : isApocalypse ? '1:3' : profile.group === 'xianxia' ? '1:3' : profile.group === 'western_fantasy' ? '1:2' : '1:3'
        },
        image: {
            characterClothingEra: isInfinite ? '现代轮回者与任务世界混合装备' : isApocalypse ? '现代末日生存服饰' : isModern ? '当代城市服饰' : profile.group === 'xianxia' ? '古典修真服饰' : profile.group === 'western_fantasy' ? '中世纪西方奇幻服饰' : '武侠江湖服饰',
            sceneMaterials: isInfinite ? '主神空间冷白光、金属地面、队伍房间、训练场、电影任务世界道具、现代战术装备' : isApocalypse ? '现代废墟、混凝土、铁皮、塑料布、车辆、临时照明' : isModern ? '城市街区、玻璃、混凝土、电子设备、办公室、商场' : profile.group === 'western_fantasy' ? '石砌城堡、木梁酒馆、羊皮卷、皮革、锁甲、彩绘玻璃、森林、矿洞、地下城、遗迹' : '木石、布帛、山水、院落、兵器、古道',
            itemRealismPrompt: '物品必须按真实用途、材质、尺寸和磨损状态绘制，不要把普通物资画成法宝或装饰概念图。',
            negativePrompt: isInfinite ? '禁止把主神商城或团队商城画成古代拍卖行、宗门坊市、普通超市或金银钱庄。' : isModern ? '禁止古装、仙侠长袍、山门、丹炉、飞剑、宗门弟子。' : profile.group === 'western_fantasy' ? '禁止东方仙侠长袍、宗门山门、丹炉、飞剑、古代江湖侠客服、现代城市通勤装。' : '',
            visualStyle: isInfinite ? '写实电影感，主神空间、任务世界和兑换道具边界明确' : isApocalypse ? '写实、压抑、物资细节明确' : isModern ? '写实、当代、职业和城市细节明确' : profile.group === 'western_fantasy' ? '写实西方奇幻，职业装备、材质和冒险氛围明确' : '写实国风，服饰和物件符合题材'
        },
        opening: {
            defaultBackgrounds: profile.backgroundSuggestions,
            defaultTalents: profile.talentSuggestions,
            companionTemplate: `${organization.memberName}或同行者，能承接${profile.label}的第一幕冲突。`,
            cutInTemplates: ['日常低压', '在途起手', '家宅起手', '门派起手', '风波前夜'],
            initialQuestTemplates: isInfinite ? ['读懂主神任务', '确认队伍分工', '寻找第一条支线线索'] : isApocalypse ? ['确认安全点', '获取饮水与药品', '建立营地联系'] : ['确认身份牵引', '接触初始组织', '取得第一条主线线索'],
            allowedGeneratedGenders: [...默认开局生成性别列表],
            lockGeneratedGenders: false
        },
        validation: {
            bannedWords: items.bannedItemKeywords,
            conflictChecks: ['货币口径冲突', '组织称呼冲突', '物品题材冲突', '地图地点冲突', '生图服饰时代冲突'],
            migrationCleanupRules: items.bannedItemKeywords.map((keyword) => `清理或替换不合题材关键词：${keyword}`)
        }
    };
    return 规范化模式运行时配置({ ...runtime, ...overrides }, baseMode);
};

export const 规范化模式运行时配置 = (raw?: any, fallbackMode?: unknown): ModeRuntimeProfile => {
    const fallback = 构建官方模式运行时配置基础(fallbackMode);
    const baseMode = 规范化题材模式(raw?.identity?.baseMode || fallback.identity.baseMode);
    const official = 构建官方模式运行时配置基础(baseMode);
    const resource = raw?.items?.resourceToggles || {};
    const currencySystem = 规范化显式CurrencySystem(raw?.economy?.currencySystem);
    const 旧资源转列表 = (r: Record<string, boolean>): string[] => {
        const list: string[] = [];
        if (r.food) list.push('饱腹');
        if (r.water) list.push('口渴');
        if (r.spiritStones) list.push('灵石');
        return list;
    };
    return {
        identity: {
            modeId: 文本(raw?.identity?.modeId, official.identity.modeId),
            displayName: 文本(raw?.identity?.displayName, official.identity.displayName),
            baseMode,
            isModern: 布尔(raw?.identity?.isModern, official.identity.isModern),
            usesCultivation: 布尔(raw?.identity?.usesCultivation, official.identity.usesCultivation),
            isApocalypse: 布尔(raw?.identity?.isApocalypse, official.identity.isApocalypse),
            isSurvival: 布尔(raw?.identity?.isSurvival, official.identity.isSurvival),
            isFandomIp: 布尔(raw?.identity?.isFandomIp, official.identity.isFandomIp)
        },
        economy: {
            currencyDisplayMode: ['wuxia', 'xianxia', 'fantasy', 'urban', 'modern', 'apocalypse', 'infinite'].includes(raw?.economy?.currencyDisplayMode)
                ? raw.economy.currencyDisplayMode
                : official.economy.currencyDisplayMode,
            primaryCurrency: 文本(raw?.economy?.primaryCurrency, official.economy.primaryCurrency),
            accountingUnit: 文本(raw?.economy?.accountingUnit, official.economy.accountingUnit),
            exchangeRules: 文本(raw?.economy?.exchangeRules, official.economy.exchangeRules),
            currencyTiers: {
                upperName: 文本(raw?.economy?.currencyTiers?.upperName, official.economy.currencyTiers.upperName),
                middleName: 文本(raw?.economy?.currencyTiers?.middleName, official.economy.currencyTiers.middleName),
                lowerName: 文本(raw?.economy?.currencyTiers?.lowerName, official.economy.currencyTiers.lowerName),
                upperToMiddleRate: 读取正整数(raw?.economy?.currencyTiers?.upperToMiddleRate, official.economy.currencyTiers.upperToMiddleRate),
                middleToLowerRate: 读取正整数(raw?.economy?.currencyTiers?.middleToLowerRate, official.economy.currencyTiers.middleToLowerRate)
            },
            ...(currencySystem ? { currencySystem } : {}),
            marketName: 文本(raw?.economy?.marketName, official.economy.marketName),
            marketVerb: 文本(raw?.economy?.marketVerb, official.economy.marketVerb),
            allowedItemTypes: 拆分模式配置短语(raw?.economy?.allowedItemTypes).length ? 拆分模式配置短语(raw.economy.allowedItemTypes) : official.economy.allowedItemTypes,
            bannedKeywords: 拆分模式配置短语(raw?.economy?.bannedKeywords).length ? 拆分模式配置短语(raw.economy.bannedKeywords) : official.economy.bannedKeywords
        },
        time: {
            displayFormat: ['traditional', 'numeric', 'western', 'modern', 'apocalypse', 'infinite'].includes(raw?.time?.displayFormat)
                ? raw.time.displayFormat
                : official.time.displayFormat,
            calendarName: 文本(raw?.time?.calendarName, official.time.calendarName),
            narrativeStyle: 文本(raw?.time?.narrativeStyle, official.time.narrativeStyle),
            dayPeriodNames: 拆分模式配置短语(raw?.time?.dayPeriodNames).length ? 拆分模式配置短语(raw.time.dayPeriodNames) : official.time.dayPeriodNames,
            allowedTimeTerms: 拆分模式配置短语(raw?.time?.allowedTimeTerms).length ? 拆分模式配置短语(raw.time.allowedTimeTerms) : official.time.allowedTimeTerms,
            bannedTimeTerms: 拆分模式配置短语(raw?.time?.bannedTimeTerms).length ? 拆分模式配置短语(raw.time.bannedTimeTerms) : official.time.bannedTimeTerms,
            progressionPrompt: 文本(raw?.time?.progressionPrompt, official.time.progressionPrompt)
        },
        organization: {
            organizationName: 文本(raw?.organization?.organizationName, official.organization.organizationName),
            memberName: 文本(raw?.organization?.memberName, official.organization.memberName),
            contributionName: 文本(raw?.organization?.contributionName, official.organization.contributionName),
            rankNames: 拆分模式配置短语(raw?.organization?.rankNames).length ? 拆分模式配置短语(raw.organization.rankNames) : official.organization.rankNames,
            organizationAliases: 拆分模式配置短语(raw?.organization?.organizationAliases).length ? 拆分模式配置短语(raw.organization.organizationAliases) : official.organization.organizationAliases,
            memberAliases: 拆分模式配置短语(raw?.organization?.memberAliases).length ? 拆分模式配置短语(raw.organization.memberAliases) : official.organization.memberAliases
        },
        ability: {
            primaryAxis: 文本(raw?.ability?.primaryAxis, official.ability.primaryAxis),
            progressionNames: 拆分模式配置短语(raw?.ability?.progressionNames).length ? 拆分模式配置短语(raw.ability.progressionNames) : official.ability.progressionNames,
            attributePointRules: 文本(raw?.ability?.attributePointRules, official.ability.attributePointRules),
            skillPool: 拆分模式配置短语(raw?.ability?.skillPool).length ? 拆分模式配置短语(raw.ability.skillPool) : official.ability.skillPool,
            skillGrowthVerb: 文本(raw?.ability?.skillGrowthVerb, official.ability.skillGrowthVerb),
            combatResolution: 文本(raw?.ability?.combatResolution, official.ability.combatResolution)
        },
        items: {
            initialItemPool: 拆分模式配置短语(raw?.items?.initialItemPool).length ? 拆分模式配置短语(raw.items.initialItemPool) : official.items.initialItemPool,
            rewardItemPool: 拆分模式配置短语(raw?.items?.rewardItemPool).length ? 拆分模式配置短语(raw.items.rewardItemPool) : official.items.rewardItemPool,
            bannedItemKeywords: 拆分模式配置短语(raw?.items?.bannedItemKeywords).length ? 拆分模式配置短语(raw.items.bannedItemKeywords) : official.items.bannedItemKeywords,
            exclusiveItemTypes: 拆分模式配置短语(raw?.items?.exclusiveItemTypes).length ? 拆分模式配置短语(raw.items.exclusiveItemTypes) : official.items.exclusiveItemTypes,
            resourceToggles: {
                food: 布尔(resource.food, official.items.resourceToggles.food),
                water: 布尔(resource.water, official.items.resourceToggles.water),
                ammo: 布尔(resource.ammo, official.items.resourceToggles.ammo),
                medicine: 布尔(resource.medicine, official.items.resourceToggles.medicine),
                fuel: 布尔(resource.fuel, official.items.resourceToggles.fuel),
                batteries: 布尔(resource.batteries, official.items.resourceToggles.batteries),
                spiritStones: 布尔(resource.spiritStones, official.items.resourceToggles.spiritStones)
            },
            activeResources: 拆分模式配置短语(raw?.items?.activeResources).length
                ? 拆分模式配置短语(raw.items.activeResources)
                : raw?.items?.resourceToggles
                    ? 旧资源转列表(raw.items.resourceToggles)
                    : official.items.activeResources
        },
        map: {
            layerNames: 拆分模式配置短语(raw?.map?.layerNames).length ? 拆分模式配置短语(raw.map.layerNames) : official.map.layerNames,
            locationTypes: 拆分模式配置短语(raw?.map?.locationTypes).length ? 拆分模式配置短语(raw.map.locationTypes) : official.map.locationTypes,
            poiTypes: 拆分模式配置短语(raw?.map?.poiTypes).length ? 拆分模式配置短语(raw.map.poiTypes) : official.map.poiTypes,
            bannedLocationKeywords: 拆分模式配置短语(raw?.map?.bannedLocationKeywords).length ? 拆分模式配置短语(raw.map.bannedLocationKeywords) : official.map.bannedLocationKeywords,
            mapPrompt: 文本(raw?.map?.mapPrompt, official.map.mapPrompt)
        },
        task: {
            mainQuestStyle: 文本(raw?.task?.mainQuestStyle, official.task.mainQuestStyle),
            sideQuestDedupeKeys: 拆分模式配置短语(raw?.task?.sideQuestDedupeKeys).length ? 拆分模式配置短语(raw.task.sideQuestDedupeKeys) : official.task.sideQuestDedupeKeys,
            rewardDistributor: 文本(raw?.task?.rewardDistributor, official.task.rewardDistributor),
            rewardVisualizationTemplate: 文本(raw?.task?.rewardVisualizationTemplate, official.task.rewardVisualizationTemplate)
        },
        npc: {
            defaultIdentityPool: 拆分模式配置短语(raw?.npc?.defaultIdentityPool).length ? 拆分模式配置短语(raw.npc.defaultIdentityPool) : official.npc.defaultIdentityPool,
            relationTemplates: 拆分模式配置短语(raw?.npc?.relationTemplates).length ? 拆分模式配置短语(raw.npc.relationTemplates) : official.npc.relationTemplates,
            requiredMainCharacterFields: 拆分模式配置短语(raw?.npc?.requiredMainCharacterFields).length ? 拆分模式配置短语(raw.npc.requiredMainCharacterFields) : official.npc.requiredMainCharacterFields,
            sexualityFallback: 文本(raw?.npc?.sexualityFallback, official.npc.sexualityFallback),
            sensitivityFallback: 文本(raw?.npc?.sensitivityFallback, official.npc.sensitivityFallback),
            autoImageStyle: 文本(raw?.npc?.autoImageStyle, official.npc.autoImageStyle),
            genderRatio: 规范化性别比例(raw?.npc?.genderRatio, official.npc.genderRatio)
        },
        image: {
            characterClothingEra: 文本(raw?.image?.characterClothingEra, official.image.characterClothingEra),
            sceneMaterials: 文本(raw?.image?.sceneMaterials, official.image.sceneMaterials),
            itemRealismPrompt: 文本(raw?.image?.itemRealismPrompt, official.image.itemRealismPrompt),
            negativePrompt: 文本(raw?.image?.negativePrompt, official.image.negativePrompt),
            visualStyle: 文本(raw?.image?.visualStyle, official.image.visualStyle)
        },
        opening: {
            defaultBackgrounds: 拆分模式配置短语(raw?.opening?.defaultBackgrounds).length ? 拆分模式配置短语(raw.opening.defaultBackgrounds) : official.opening.defaultBackgrounds,
            defaultTalents: 拆分模式配置短语(raw?.opening?.defaultTalents).length ? 拆分模式配置短语(raw.opening.defaultTalents) : official.opening.defaultTalents,
            companionTemplate: 文本(raw?.opening?.companionTemplate, official.opening.companionTemplate),
            cutInTemplates: 拆分模式配置短语(raw?.opening?.cutInTemplates).length ? 拆分模式配置短语(raw.opening.cutInTemplates) : official.opening.cutInTemplates,
            initialQuestTemplates: 拆分模式配置短语(raw?.opening?.initialQuestTemplates).length ? 拆分模式配置短语(raw.opening.initialQuestTemplates) : official.opening.initialQuestTemplates,
            allowedGeneratedGenders: 规范化开局生成性别列表(raw?.opening?.allowedGeneratedGenders, official.opening.allowedGeneratedGenders),
            lockGeneratedGenders: 布尔(raw?.opening?.lockGeneratedGenders, official.opening.lockGeneratedGenders),
            defaultEquipment: raw?.opening?.defaultEquipment ?? official.opening.defaultEquipment,
            defaultCurrency: raw?.opening?.defaultCurrency ?? official.opening.defaultCurrency
        },
        validation: {
            bannedWords: 拆分模式配置短语(raw?.validation?.bannedWords).length ? 拆分模式配置短语(raw.validation.bannedWords) : official.validation.bannedWords,
            conflictChecks: 拆分模式配置短语(raw?.validation?.conflictChecks).length ? 拆分模式配置短语(raw.validation.conflictChecks) : official.validation.conflictChecks,
            migrationCleanupRules: 拆分模式配置短语(raw?.validation?.migrationCleanupRules).length ? 拆分模式配置短语(raw.validation.migrationCleanupRules) : official.validation.migrationCleanupRules
        }
    };
};

const 构建官方模式运行时配置基础 = (mode?: unknown): ModeRuntimeProfile => {
    const baseMode = 规范化题材模式(mode);
    const profile = 获取题材模式配置(baseMode);
    const organization = 组织默认值(baseMode);
    const ability = 能力默认值(baseMode);
    const items = 物品默认值(baseMode);
    const time = 时间默认值(baseMode);
    const isModern = 判断现代(baseMode);
    const isApocalypse = profile.group === 'apocalypse';
    const isInfinite = profile.group === 'infinite';
    const currencyTiers = 构建默认货币层级(profile.currencyDisplayMode);
    return {
        identity: {
            modeId: profile.value,
            displayName: profile.label,
            baseMode,
            isModern,
            usesCultivation: 判断修炼(baseMode),
            isApocalypse,
            isSurvival: isApocalypse || isInfinite,
            isFandomIp: false
        },
        economy: {
            currencyDisplayMode: profile.currencyDisplayMode,
            primaryCurrency: profile.currencyPrompt,
            accountingUnit: 取记账单位(profile.currencyDisplayMode),
            exchangeRules: profile.currencyExchangePrompt,
            currencyTiers,
            currencySystem: 从CurrencyTiers生成CurrencySystem(currencyTiers, profile.currencyDisplayMode),
            marketName: profile.auctionName,
            marketVerb: profile.marketVerb,
            allowedItemTypes: items.exclusiveItemTypes,
            bannedKeywords: items.bannedItemKeywords
        },
        time,
        organization,
        ability: { ...ability, skillPool: profile.skillNames },
        items,
        map: {
            layerNames: ['寰宇', '大地点', '中地点', '小地点', '区地点', '子地点'],
            locationTypes: profile.mapPrompt.split(/[、，,]/u).map((item) => item.replace(/世界版图应按|组织。|等/u, '').trim()).filter(Boolean),
            poiTypes: profile.group === 'infinite'
                ? ['主神空间', '队伍房间', '训练场', '主神广场', '任务世界', '剧情地点', '安全屋', '补给点', '隐藏支线地点', '回归通道']
                : profile.group === 'apocalypse'
                ? ['感染区', '医院', '商超', '仓库', '避难所', '公路', '封锁线', '营地', '市场', '资源点']
                : profile.group === 'modern'
                    ? ['社区', '商圈', '写字楼', '学校', '医院', '交通站点', '灰色渠道']
                    : profile.group === 'xianxia'
                        ? ['宗门', '坊市', '秘境入口', '洞府', '禁地', '凡俗城镇']
                        : profile.group === 'western_fantasy'
                            ? ['王国', '城堡', '教会', '魔法学院', '冒险者公会', '港口', '地下城', '遗迹', '魔物巢穴']
                            : ['城镇', '门派', '山道', '关隘', '渡口', '市场', '野外险地'],
            bannedLocationKeywords: profile.group === 'infinite'
                ? ['宗门山门', '王朝朝堂', '营地信用市场', '现实工资结算']
                : profile.group === 'apocalypse'
                ? ['宗门', '山门', '藏经阁', '洞府', '仙坊']
                : profile.group === 'modern'
                    ? ['宗门', '山门', '藏经阁', '仙坊', '坊市']
                    : profile.group === 'western_fantasy'
                        ? ['宗门', '山门', '藏经阁', '仙坊', '坊市', '写字楼', '地铁站']
                        : [],
            mapPrompt: profile.mapPrompt
        },
        task: {
            mainQuestStyle: isInfinite ? '围绕主神任务、恐怖片生存、支线触发、队伍协作和回归结算推进主线。' : isApocalypse ? '围绕求生、营地、感染风险和物资路线推进主线。' : `围绕${profile.label}的身份、组织、资源与长期目标推进主线。`,
            sideQuestDedupeKeys: ['目标地点', '发放者', '奖励类型', '核心行动', '关联NPC'],
            rewardDistributor: organization.organizationName,
            rewardVisualizationTemplate: isInfinite ? '正文中用【任务奖励】展示主神结算、奖励点、支线剧情、兑换权限、技能提升、属性点或队伍信用。' : '正文中用【任务奖励】展示发放者、到账物品、技能提升、贡献/信用、属性点或境界变化。'
        },
        npc: {
            defaultIdentityPool: organization.memberAliases,
            relationTemplates: profile.group === 'infinite'
                ? ['队友', '资深者带新人', '利益同盟', '团战敌对', '临时合作']
                : profile.group === 'apocalypse'
                ? ['互助', '物资合作', '冲突', '临时同行']
                : profile.group === 'western_fantasy'
                    ? ['契约', '同伴', '委托', '阵营', '旧怨']
                    : ['师门', '友情', '利益', '旧怨'],
            requiredMainCharacterFields: ['姓名', '性别', '年龄', '外貌', '性格', '身份', '位置', '关系', '性癖', '敏感点'],
            sexualityFallback: '按角色性格与经历生成明确偏好，不得写未知。',
            sensitivityFallback: '按角色身体/心理特征生成明确敏感点，不得写未知。',
            autoImageStyle: isInfinite
                ? '现代轮回者服饰、任务世界装备、主神空间冷白光和兑换道具清晰可见。'
                : isModern
                ? '现代服饰、现实材质、题材道具清晰可见。'
                : profile.group === 'western_fantasy'
                    ? '中世纪西方奇幻服饰、职业装备、公会/城堡/地下城环境和魔法道具清晰可见。'
                    : '符合题材时代与身份的服饰、武器和环境。',
            genderRatio: isInfinite ? '1:5' : isApocalypse ? '1:3' : profile.group === 'xianxia' ? '1:3' : profile.group === 'western_fantasy' ? '1:2' : '1:3'
        },
        image: {
            characterClothingEra: isInfinite ? '现代轮回者与任务世界混合装备' : isApocalypse ? '现代末日生存服饰' : isModern ? '当代城市服饰' : profile.group === 'xianxia' ? '古典修真服饰' : profile.group === 'western_fantasy' ? '中世纪西方奇幻服饰' : '武侠江湖服饰',
            sceneMaterials: isInfinite ? '主神空间冷白光、金属地面、队伍房间、训练场、电影任务世界道具、现代战术装备' : isApocalypse ? '现代废墟、混凝土、铁皮、塑料布、车辆、临时照明' : isModern ? '城市街区、玻璃、混凝土、电子设备、办公室、商场' : profile.group === 'western_fantasy' ? '石砌城堡、木梁酒馆、羊皮卷、皮革、锁甲、彩绘玻璃、森林、矿洞、地下城、遗迹' : '木石、布帛、山水、院落、兵器、古道',
            itemRealismPrompt: '物品必须按真实用途、材质、尺寸和磨损状态绘制，不要把普通物资画成法宝或装饰概念图。',
            negativePrompt: isInfinite ? '禁止把主神商城或团队商城画成古代拍卖行、宗门坊市、普通超市或金银钱庄。' : isModern ? '禁止古装、仙侠长袍、山门、丹炉、飞剑、宗门弟子。' : profile.group === 'western_fantasy' ? '禁止东方仙侠长袍、宗门山门、丹炉、飞剑、古代江湖侠客服、现代城市通勤装。' : '',
            visualStyle: isInfinite ? '写实电影感，主神空间、任务世界和兑换道具边界明确' : isApocalypse ? '写实、压抑、物资细节明确' : isModern ? '写实、当代、职业和城市细节明确' : profile.group === 'western_fantasy' ? '写实西方奇幻，职业装备、材质和冒险氛围明确' : '写实国风，服饰和物件符合题材'
        },
        opening: {
            defaultBackgrounds: profile.backgroundSuggestions,
            defaultTalents: profile.talentSuggestions,
            companionTemplate: `${organization.memberName}或同行者，能承接${profile.label}的第一幕冲突。`,
            cutInTemplates: ['日常低压', '在途起手', '家宅起手', '门派起手', '风波前夜'],
            initialQuestTemplates: isInfinite ? ['读懂主神任务', '确认队伍分工', '寻找第一条支线线索'] : isApocalypse ? ['确认安全点', '获取饮水与药品', '建立营地联系'] : ['确认身份牵引', '接触初始组织', '取得第一条主线线索'],
            allowedGeneratedGenders: [...默认开局生成性别列表],
            lockGeneratedGenders: false
        },
        validation: {
            bannedWords: items.bannedItemKeywords,
            conflictChecks: ['货币口径冲突', '组织称呼冲突', '物品题材冲突', '地图地点冲突', '生图服饰时代冲突'],
            migrationCleanupRules: items.bannedItemKeywords.map((keyword) => `清理或替换不合题材关键词：${keyword}`)
        }
    };
};

const 渲染动态货币体系摘要 = (currencySystem?: CurrencySystem): string => {
    if (!currencySystem) return '';
    const units = currencySystem.units
        .map((unit) => {
            const symbol = unit.symbol ? `；符号=${unit.symbol}` : '';
            const aliases = unit.aliases?.length ? `；别名=${unit.aliases.join('、')}` : '';
            return `${unit.name}${symbol}；baseRate=${unit.baseRate}${aliases}`;
        })
        .join(' | ');
    return `动态货币体系：${currencySystem.name}；baseUnitId=${currencySystem.baseUnitId}；单位=${units}`;
};

export const 渲染模式运行时配置世界书内容 = (profile: ModeRuntimeProfile): string => ([
    `题材身份：${profile.identity.displayName}（继承 ${profile.identity.baseMode}；现代=${profile.identity.isModern ? '是' : '否'}；修炼=${profile.identity.usesCultivation ? '是' : '否'}；生存=${profile.identity.isSurvival ? '是' : '否'}；同人/IP=${profile.identity.isFandomIp ? '是' : '否'}）`,
    `经济系统：市场=${profile.economy.marketName}；行为=${profile.economy.marketVerb}；上层=${profile.economy.currencyTiers.upperName}；中层=${profile.economy.currencyTiers.middleName}；底层=${profile.economy.currencyTiers.lowerName}；汇率=${profile.economy.currencyTiers.upperToMiddleRate}/${profile.economy.currencyTiers.middleToLowerRate}`,
    渲染动态货币体系摘要(profile.economy.currencySystem),
    `时间系统：显示=${profile.time.displayFormat}；历法=${profile.time.calendarName}；叙事=${profile.time.narrativeStyle}；时段=${profile.time.dayPeriodNames.join('、')}；允许=${profile.time.allowedTimeTerms.join('、') || '无'}；禁用=${profile.time.bannedTimeTerms.join('、') || '无'}；推进=${profile.time.progressionPrompt}`,
    `组织系统：组织=${profile.organization.organizationName}；成员=${profile.organization.memberName}；贡献=${profile.organization.contributionName}；等级=${profile.organization.rankNames.join('、')}`,
    `能力系统：主轴=${profile.ability.primaryAxis}；阶段=${profile.ability.progressionNames.join('、')}；技艺=${profile.ability.skillPool.join('、')}；结算=${profile.ability.combatResolution}`,
    `物品系统：初始池=${profile.items.initialItemPool.join('、')}；奖励池=${profile.items.rewardItemPool.join('、')}；禁用=${profile.items.bannedItemKeywords.join('、')}；资源计数器=${profile.items.activeResources.join('、') || '无'}`,
    `地图系统：地点=${profile.map.locationTypes.join('、')}；POI=${profile.map.poiTypes.join('、')}；禁用地点=${profile.map.bannedLocationKeywords.join('、')}`,
    `任务系统：主线=${profile.task.mainQuestStyle}；去重=${profile.task.sideQuestDedupeKeys.join('、')}；奖励发放=${profile.task.rewardDistributor}；可视化=${profile.task.rewardVisualizationTemplate}`,
    `NPC系统：身份池=${profile.npc.defaultIdentityPool.join('、')}；关系=${profile.npc.relationTemplates.join('、')}；主要角色必填=${profile.npc.requiredMainCharacterFields.join('、')}；男女比例=${typeof profile.npc.genderRatio === 'string' ? profile.npc.genderRatio : `男${profile.npc.genderRatio.男}%:女${profile.npc.genderRatio.女}%:男娘${profile.npc.genderRatio.男娘}%:扶她${profile.npc.genderRatio.扶她}%`}；生图=${profile.npc.autoImageStyle}`,
    `生图系统：服饰=${profile.image.characterClothingEra}；场景=${profile.image.sceneMaterials}；物品=${profile.image.itemRealismPrompt}；负面=${profile.image.negativePrompt}`,
    `开局系统：背景=${profile.opening.defaultBackgrounds.join('、')}；天赋=${profile.opening.defaultTalents.join('、')}；切入=${profile.opening.cutInTemplates.join('、')}；初始任务=${profile.opening.initialQuestTemplates.join('、')}；允许生成性别=${profile.opening.allowedGeneratedGenders.join('、')}；性别锁定=${profile.opening.lockGeneratedGenders ? '是' : '否'}`,
    `校验系统：禁词=${profile.validation.bannedWords.join('、')}；冲突检测=${profile.validation.conflictChecks.join('、')}；迁移清理=${profile.validation.migrationCleanupRules.join('、')}`
]).filter(Boolean).join('\n');

export const 获取题材顶部时间显示格式 = (
    runtimeProfile?: ModeRuntimeProfile | null,
    fallbackMode?: unknown
): '传统' | '数字' => {
    const profile = 规范化模式运行时配置(runtimeProfile, fallbackMode);
    return profile.time.displayFormat === 'traditional' ? '传统' : '数字';
};
