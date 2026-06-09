import type { GameResponse } from '../types';
import type { ModeRuntimeProfile } from '../models/system';
import {
    toBaseAmount,
    底层总值转角色金钱,
    获取角色金钱BaseAmount,
    获取货币层级倍率,
    规范化CurrencySystem,
    规范化角色金钱
} from './currencyDisplay';

type RewardState = {
    角色: any;
    环境?: any;
    玩家门派?: any;
    任务列表: any[];
};

type RewardResult = {
    state: RewardState;
    changed: boolean;
    rewardLogs: string[];
};

const 取文本 = (value: unknown, fallback = ''): string => (
    typeof value === 'string' ? value.trim() : fallback
);

const 取数字 = (value: unknown, fallback = 0): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

const 深拷贝 = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const 转义正则文本 = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const 旧货币奖励映射: Array<{ label: string; key: '上层货币' | '中层货币' | '底层货币' }> = [
    { label: '上层货币', key: '上层货币' },
    { label: '金元宝', key: '上层货币' },
    { label: '元宝', key: '上层货币' },
    { label: 'C级支线剧情', key: '上层货币' },
    { label: '中层货币', key: '中层货币' },
    { label: '银子', key: '中层货币' },
    { label: '银两', key: '中层货币' },
    { label: 'D级支线剧情', key: '中层货币' },
    { label: '底层货币', key: '底层货币' },
    { label: '铜钱', key: '底层货币' },
    { label: '奖励点', key: '底层货币' }
];

const 获取运行时配置 = (params: {
    state: RewardState;
    runtimeProfile?: ModeRuntimeProfile | null;
    modeRuntimeProfile?: ModeRuntimeProfile | null;
    roleNormalizeOptions?: Record<string, unknown>;
}): ModeRuntimeProfile | null => (
    params.runtimeProfile
    || params.modeRuntimeProfile
    || (params.roleNormalizeOptions?.runtimeProfile as ModeRuntimeProfile | null | undefined)
    || (params.roleNormalizeOptions?.modeRuntimeProfile as ModeRuntimeProfile | null | undefined)
    || (params.state as any)?.openingConfig?.modeRuntimeProfile
    || (params.state as any)?.modeRuntimeProfile
    || null
);

const 匹配单位奖励 = (part: string, unitLabel: string): number | null => {
    const unit = 转义正则文本(unitLabel);
    const unitFirst = new RegExp(`(?:^|[\\s【】「」"'“”])${unit}\\s*[+＋]\\s*(\\d+)(?:$|[\\s。！!，,、；;])`, 'u');
    const unitFirstMatch = part.match(unitFirst);
    if (unitFirstMatch) return Math.max(0, Math.trunc(Number(unitFirstMatch[1])));

    const amountFirst = new RegExp(`(?:获得|奖励|到账|收入|得到|取得|发放)?\\s*(\\d+)\\s*${unit}(?:$|[\\s。！!，,、；;])`, 'u');
    const amountFirstMatch = part.match(amountFirst);
    if (amountFirstMatch) return Math.max(0, Math.trunc(Number(amountFirstMatch[1])));

    return null;
};

const 解析旧货币奖励 = (part: string): { label: string; key: '上层货币' | '中层货币' | '底层货币'; amount: number } | null => {
    const matched = [...旧货币奖励映射]
        .sort((a, b) => b.label.length - a.label.length)
        .map((entry) => ({ ...entry, amount: 匹配单位奖励(part, entry.label) }))
        .find((entry) => entry.amount !== null && entry.amount > 0);
    return matched && matched.amount !== null
        ? { label: matched.label, key: matched.key, amount: matched.amount }
        : null;
};

const 解析动态货币奖励 = (
    part: string,
    runtimeProfile?: ModeRuntimeProfile | null
): { label: string; amount: number; baseAmount: number } | null => {
    const systemSource = runtimeProfile?.economy?.currencySystem;
    if (!systemSource) return null;
    const system = 规范化CurrencySystem(systemSource);
    const candidates = system.units.flatMap((unit) => [
        unit.name,
        unit.symbol || '',
        unit.id,
        ...(Array.isArray(unit.aliases) ? unit.aliases : [])
    ].filter(Boolean).map((label) => ({ label, unitId: unit.id })));
    const uniqueCandidates = Array.from(
        new Map(candidates.map((item) => [item.label, item])).values()
    ).sort((a, b) => b.label.length - a.label.length);
    const matched = uniqueCandidates
        .map((entry) => ({ ...entry, amount: 匹配单位奖励(part, entry.label) }))
        .find((entry) => entry.amount !== null && entry.amount > 0);
    if (!matched || matched.amount === null) return null;
    return {
        label: matched.label,
        amount: matched.amount,
        baseAmount: toBaseAmount(matched.amount, matched.unitId, system)
    };
};

const 增加角色BaseAmount = (
    role: any,
    amount: number,
    runtimeProfile?: ModeRuntimeProfile | null
) => {
    const nextBaseAmount = 获取角色金钱BaseAmount(
        role.金钱,
        runtimeProfile,
        runtimeProfile?.economy?.currencyDisplayMode as any
    ) + Math.max(0, Math.trunc(amount));
    role.金钱 = 底层总值转角色金钱(
        nextBaseAmount,
        runtimeProfile,
        runtimeProfile?.economy?.currencyDisplayMode as any
    );
};

const 增加旧货币奖励 = (
    role: any,
    key: '上层货币' | '中层货币' | '底层货币',
    amount: number,
    runtimeProfile?: ModeRuntimeProfile | null
) => {
    const currentBaseAmount = 获取角色金钱BaseAmount(
        role.金钱,
        runtimeProfile,
        runtimeProfile?.economy?.currencyDisplayMode as any
    );
    role.金钱[key] = Math.max(0, 取数字(role.金钱[key])) + amount;
    role.金钱.baseAmount = currentBaseAmount + amount * 获取货币层级倍率(
        key,
        runtimeProfile,
        runtimeProfile?.economy?.currencyDisplayMode as any
    );
    role.金钱 = 规范化角色金钱(role.金钱);
};

const 技艺等级由熟练度 = (value: number): string => {
    if (value <= 0) return '未入门';
    if (value < 25) return '入门';
    if (value < 45) return '初窥';
    if (value < 65) return '小成';
    if (value < 85) return '大成';
    return '登堂';
};

const 解析奖励片段 = (raw: string): string[] => (
    raw
        .split(/[，,、；;]/)
        .map((item) => item.trim())
        .filter(Boolean)
);

const 奖励日志已存在 = (response: GameResponse, taskTitle: string): boolean => {
    const logs = Array.isArray(response.logs) ? response.logs : [];
    return logs.some((log: any) => {
        const text = 取文本(log?.text);
        return log?.sender === '奖励' && text.includes(`「${taskTitle}」`) && text.includes('奖励到账');
    });
};

export const 结算已完成任务奖励 = (
    params: {
        response: GameResponse;
        state: RewardState;
        runtimeProfile?: ModeRuntimeProfile | null;
        modeRuntimeProfile?: ModeRuntimeProfile | null;
        normalizeRole?: (raw?: any, options?: any) => any;
        roleNormalizeOptions?: Record<string, unknown>;
    }
): RewardResult => {
    const response = params.response;
    const state: RewardState = {
        ...params.state,
        角色: 深拷贝(params.state.角色 || {}),
        玩家门派: 深拷贝(params.state.玩家门派 || {}),
        任务列表: Array.isArray(params.state.任务列表) ? 深拷贝(params.state.任务列表) : []
    };
    const role = state.角色 || {};
    const sect = state.玩家门派 || {};
    const runtimeProfile = 获取运行时配置(params);
    role.金钱 = 规范化角色金钱(role.金钱);
    role.物品列表 = Array.isArray(role.物品列表) ? role.物品列表 : [];
    role.技艺 = Array.isArray(role.技艺) ? role.技艺 : [];

    let changed = false;
    const visibleRewardLogs: string[] = [];
    const responseLogs = Array.isArray(response.logs) ? response.logs : [];
    response.logs = responseLogs;

    state.任务列表 = state.任务列表.map((task: any, taskIndex: number) => {
        if (!task || typeof task !== 'object') return task;
        if (task.当前状态 !== '已完成' || task.奖励已发放 === true) return task;

        const taskTitle = 取文本(task.标题, `任务${taskIndex + 1}`);
        const issuer = 取文本(task.奖励发放人)
            || 取文本(task.发布人)
            || 取文本(sect.名称)
            || '任务发布人';
        const rewardDescriptions = Array.isArray(task.奖励描述)
            ? task.奖励描述.map((item: any) => 取文本(item)).filter(Boolean)
            : [];
        const rewardRecords: string[] = [];

        rewardDescriptions.flatMap(解析奖励片段).forEach((part) => {
            const contributionMatch = part.match(/(?:门派贡献|营地贡献|组织信用|队伍信用|贡献点|资源额度|信用额度)\s*[+＋]\s*(\d+)/u);
            if (contributionMatch) {
                const amount = Math.max(0, Math.trunc(Number(contributionMatch[1])));
                if (amount > 0) {
                    const previousCurrentContribution = Math.max(0, 取数字(sect.玩家贡献));
                    const previousTotalContribution = Math.max(0, 取数字(sect.累计贡献), previousCurrentContribution);
                    sect.玩家贡献 = previousCurrentContribution + amount;
                    sect.累计贡献 = previousTotalContribution + amount;
                    role.门派贡献 = Math.max(0, 取数字(role.门派贡献)) + amount;
                    rewardRecords.push(`${contributionMatch[0].replace(/\s+/g, ' ')}`);
                    changed = true;
                }
                return;
            }

            const legacyMoney = 解析旧货币奖励(part);
            if (legacyMoney) {
                const key = legacyMoney.key;
                const amount = legacyMoney.amount;
                if (amount > 0) {
                    增加旧货币奖励(role, key, amount, runtimeProfile);
                    rewardRecords.push(`${legacyMoney.label} +${amount}`);
                    changed = true;
                }
                return;
            }

            const dynamicMoney = 解析动态货币奖励(part, runtimeProfile);
            if (dynamicMoney) {
                增加角色BaseAmount(role, dynamicMoney.baseAmount, runtimeProfile);
                rewardRecords.push(`${dynamicMoney.label} +${dynamicMoney.amount}`);
                changed = true;
                return;
            }

            const attrMatch = part.match(/(?:可分配属性点|属性点)\s*[+＋]\s*(\d+)/u);
            if (attrMatch) {
                const amount = Math.max(0, Math.trunc(Number(attrMatch[1])));
                if (amount > 0) {
                    role.可分配属性点 = Math.max(0, 取数字(role.可分配属性点)) + amount;
                    rewardRecords.push(`可分配属性点 +${amount}`);
                    changed = true;
                }
                return;
            }

            const skillMatch = part.match(/^([\u4e00-\u9fa5A-Za-z0-9_·]{1,12})(?:技能|技艺)?熟练度\s*[+＋]\s*(\d+)$/u)
                || part.match(/^([\u4e00-\u9fa5A-Za-z0-9_·]{1,12})(?:技能|技艺)\s*[+＋]\s*(\d+)$/u);
            if (skillMatch && !/贡献|信用|额度|属性点|铜钱|银子|元宝/.test(skillMatch[1])) {
                const skillName = skillMatch[1].trim();
                const amount = Math.max(0, Math.trunc(Number(skillMatch[2])));
                if (skillName && amount > 0) {
                    const current = role.技艺.find((item: any) => 取文本(item?.名称) === skillName);
                    if (current) {
                        current.熟练度 = Math.min(100, Math.max(0, 取数字(current.熟练度)) + amount);
                        current.等级 = 技艺等级由熟练度(current.熟练度);
                    } else {
                        const proficiency = Math.min(100, amount);
                        role.技艺.push({
                            名称: skillName,
                            等级: 技艺等级由熟练度(proficiency),
                            熟练度: proficiency,
                            描述: '任务奖励带来的实践积累。'
                        });
                    }
                    rewardRecords.push(`${skillName}熟练度 +${amount}`);
                    changed = true;
                }
                return;
            }

            const itemMatch = part.match(/^(.+?)\s*(?:x|×|\*)\s*(\d+)$/iu);
            if (itemMatch) {
                const itemName = itemMatch[1].trim();
                const count = Math.max(1, Math.trunc(Number(itemMatch[2])));
                if (itemName) {
                    rewardRecords.push(`${itemName} x${count}`);
                }
            }
        });

        const finalRecords = rewardRecords.length > 0 ? rewardRecords : ['奖励说明已确认'];
        if (!奖励日志已存在(response, taskTitle)) {
            const completionText = `【任务完成】「${taskTitle}」已由${issuer}确认完成。`;
            const rewardText = `【奖励到账】「${taskTitle}」由${issuer}发放：${finalRecords.join('、')}。贡献、货币、技艺和属性点已同步更新；物品奖励仅记录到账，背包物品必须由AI变量命令写入。`;
            response.logs.push({ sender: '奖励', text: completionText });
            response.logs.push({ sender: '奖励', text: rewardText });
            visibleRewardLogs.push(completionText, rewardText);
        }

        changed = true;
        return {
            ...task,
            奖励已发放: true,
            奖励发放时间: 取文本(state.环境?.时间) || new Date().toISOString(),
            奖励发放人: issuer,
            奖励到账记录: [
                ...(Array.isArray(task.奖励到账记录) ? task.奖励到账记录 : []),
                ...finalRecords
            ]
        };
    });

    if (changed && params.normalizeRole) {
        state.角色 = params.normalizeRole(role, {
            当前时间: state.环境,
            事件文本: visibleRewardLogs.join('\n'),
            ...params.roleNormalizeOptions
        });
    } else {
        state.角色 = role;
    }
    state.玩家门派 = sect;
    return { state, changed, rewardLogs: visibleRewardLogs };
};
