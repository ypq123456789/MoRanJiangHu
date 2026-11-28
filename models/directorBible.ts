import type { 女主剧情规划结构 } from './heroinePlan';
import type { 剧情系统结构 } from './story';
import type { 剧情规划结构 } from './storyPlan';
import type { 世界进行中事件结构, 势力关系标签, 势力类型, 势力结构, 地图层级结构 } from './world';

export interface WorldTierStep {
    层级序号: number;
    层级名称: string;
    典型区域: string[];
    准入壁垒: string;
    核心资源与垄断者: string;
    主要压迫冲突: string;
}

export interface FactionCrossLedger {
    对方势力: string;
    关系: string;
    具体渊源: string;
}

export interface FactionLedger {
    id: string;
    名称: string;
    类型: string;
    实力等级: number;
    层级: number;
    领袖: string;
    核心人物: string[];
    内部裂痕: string;
    对外公开立场: string;
    真实诉求与暗中图谋: string;
    致命弱点或忌讳: string;
    跨势力账目: FactionCrossLedger[];
    地盘: string[];
}

export interface CharacterKnowledgeBoundary {
    已知事实: string[];
    盲区: string[];
}

export interface CharacterTie {
    对象: string;
    真实关系与心思: string;
}

export interface OffscreenAgendaState {
    当前目标: string;
    正在推进的步骤: string;
    行动倒计时回合: number;
    已触发影响: string[];
}

export interface DirectorCharacterProfile {
    id: string;
    姓名: string;
    性别: '男' | '女' | '男娘' | '扶她';
    身份与势力: string;
    所处层级: number;
    生平与过往执念: string;
    表层伪装: string;
    真实诉求与利益底线: string;
    隐藏秘密: string;
    初始认知边界: CharacterKnowledgeBoundary;
    人际渊源: CharacterTie[];
    幕后当前日程: OffscreenAgendaState;
    是否已登场: boolean;
}

export type ForeshadowingType =
    | '物件'
    | '流言'
    | '人物怪癖'
    | '前史旧案'
    | '地理异象'
    | '身份暗桩';

export type ForeshadowingStatus =
    | '未埋设'
    | '已埋设'
    | '发酵中'
    | '已回收'
    | '已改线';

export interface ForeshadowingItem {
    id: string;
    类型: ForeshadowingType;
    表面载体: string;
    底层真相: string;
    知情人: string[];
    盲区人物: string[];
    建议埋设阶段: string;
    建议回收阶段: string;
    触发或回收条件: string;
    状态: ForeshadowingStatus;
    埋设回合?: number;
    埋设落点描述?: string;
    回收回合?: number;
    回收落点描述?: string;
}

export interface PreOpeningIncident {
    事件名: string;
    发生时间: string;
    真实经过: string;
    表层流言版本: string;
    卷入各方: string[];
    留下的烫手筹码或危机: string;
}

export interface ProtagonistDilemma {
    开局处境: string;
    最大威胁源: string;
    手中唯一筹码或信息差: string;
    短中期推进动力: string;
}

export interface MacroActNode {
    幕次: number;
    标题: string;
    核心矛盾: string;
    主角目标与破局路径: string;
    关键势力与人物: string[];
    跃迁至下一幕条件: string;
    当前状态: '未开始' | '推进中' | '已完成' | '已重规划';
}

export interface DirectorCastHint {
    姓名: string;
    内心真实算计: string;
    本回合绝不能透露: string;
}

export interface TurnDirectorBrief {
    生成于回合: number;
    本回合舞台焦点: string;
    必须守住的悬念或冲突: string;
    待埋或推进伏笔ID?: string;
    待埋伏笔演出方式?: string;
    即将落地的外溢世界波及: string[];
    在场人物私密动向提示: DirectorCastHint[];
    下一拍预计走向: string;
}

export interface DynamicTrajectoryRecord {
    回合: number;
    决策摘要: string;
    因果偏移: string;
}

export interface DirectorWorldBible {
    version: 2;
    世界观表层摘要: string;
    顶层隐秘秩序: string;
    核心历史原罪: string;
    终局方向与逆推因果: string;
    空间阶梯: WorldTierStep[];
    前史导火索: PreOpeningIncident[];
    主角核心困局: ProtagonistDilemma;
    宏观分幕大纲: MacroActNode[];
    当前幕次: number;
    势力暗账: FactionLedger[];
    核心卡司: DirectorCharacterProfile[];
    伏笔台账: ForeshadowingItem[];
    动态轨迹记录: DynamicTrajectoryRecord[];
    下回合导演简报?: TurnDirectorBrief;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback);
const strArr = (v: unknown): string[] => (
    Array.isArray(v)
        ? v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
        : []
);
const num = (v: unknown, fallback = 0): number => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
    if (typeof v === 'string') {
        const trimmed = v.trim();
        if (!trimmed) return fallback;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
};

export const 创建空白导演圣经 = (): DirectorWorldBible => ({
    version: 2,
    世界观表层摘要: '',
    顶层隐秘秩序: '',
    核心历史原罪: '',
    终局方向与逆推因果: '',
    空间阶梯: [],
    前史导火索: [],
    主角核心困局: {
        开局处境: '',
        最大威胁源: '',
        手中唯一筹码或信息差: '',
        短中期推进动力: ''
    },
    宏观分幕大纲: [],
    当前幕次: 1,
    势力暗账: [],
    核心卡司: [],
    伏笔台账: [],
    动态轨迹记录: []
});

const 合法性别 = (v: unknown): '男' | '女' | '男娘' | '扶她' => {
    if (v === '女' || v === '男娘' || v === '扶她') return v;
    return '男';
};

const 合法伏笔类型 = (v: unknown): ForeshadowingType => {
    const allowed: ForeshadowingType[] = ['物件', '流言', '人物怪癖', '前史旧案', '地理异象', '身份暗桩'];
    return allowed.includes(v as ForeshadowingType) ? (v as ForeshadowingType) : '物件';
};

const 合法伏笔状态 = (v: unknown): ForeshadowingStatus => {
    const allowed: ForeshadowingStatus[] = ['未埋设', '已埋设', '发酵中', '已回收', '已改线'];
    return allowed.includes(v as ForeshadowingStatus) ? (v as ForeshadowingStatus) : '未埋设';
};

const 合法幕状态 = (v: unknown): MacroActNode['当前状态'] => {
    const allowed: MacroActNode['当前状态'][] = ['未开始', '推进中', '已完成', '已重规划'];
    return allowed.includes(v as MacroActNode['当前状态']) ? (v as MacroActNode['当前状态']) : '未开始';
};

export const 规范化导演圣经 = (raw: unknown): DirectorWorldBible => {
    const base = 创建空白导演圣经();
    if (!raw || typeof raw !== 'object') return base;
    const src = raw as Record<string, any>;

    const 空间阶梯: WorldTierStep[] = Array.isArray(src.空间阶梯)
        ? src.空间阶梯
            .filter((x: any) => x && typeof x === 'object')
            .map((x: any, idx: number) => ({
                层级序号: Math.max(1, Math.min(6, Math.round(num(x.层级序号, idx + 1)))),
                层级名称: str(x.层级名称, `第${idx + 1}层`),
                典型区域: strArr(x.典型区域),
                准入壁垒: str(x.准入壁垒),
                核心资源与垄断者: str(x.核心资源与垄断者),
                主要压迫冲突: str(x.主要压迫冲突)
            }))
        : [];

    const 势力暗账: FactionLedger[] = Array.isArray(src.势力暗账)
        ? src.势力暗账
            .filter((x: any) => x && typeof x === 'object' && str(x.名称))
            .map((x: any, idx: number) => ({
                id: str(x.id, `FCT-${String(idx + 1).padStart(3, '0')}`),
                名称: str(x.名称),
                类型: str(x.类型, '宗门'),
                实力等级: Math.max(1, Math.min(10, Math.round(num(x.实力等级, 5)))),
                层级: Math.max(1, Math.min(4, Math.round(num(x.层级, 1)))),
                领袖: str(x.领袖),
                核心人物: strArr(x.核心人物),
                内部裂痕: str(x.内部裂痕),
                对外公开立场: str(x.对外公开立场),
                真实诉求与暗中图谋: str(x.真实诉求与暗中图谋),
                致命弱点或忌讳: str(x.致命弱点或忌讳),
                跨势力账目: Array.isArray(x.跨势力账目)
                    ? x.跨势力账目
                        .filter((r: any) => r && typeof r === 'object' && str(r.对方势力))
                        .map((r: any) => ({
                            对方势力: str(r.对方势力),
                            关系: str(r.关系, '暗中制衡'),
                            具体渊源: str(r.具体渊源)
                        }))
                    : [],
                地盘: strArr(x.地盘)
            }))
        : [];

    const 核心卡司: DirectorCharacterProfile[] = Array.isArray(src.核心卡司)
        ? src.核心卡司
            .filter((x: any) => x && typeof x === 'object' && str(x.姓名))
            .map((x: any, idx: number) => {
                const agenda = x.幕后当前日程 && typeof x.幕后当前日程 === 'object' ? x.幕后当前日程 : {};
                const boundary = x.初始认知边界 && typeof x.初始认知边界 === 'object' ? x.初始认知边界 : {};
                return {
                    id: str(x.id, `CAST-${String(idx + 1).padStart(3, '0')}`),
                    姓名: str(x.姓名),
                    性别: 合法性别(x.性别),
                    身份与势力: str(x.身份与势力),
                    所处层级: Math.max(1, Math.min(4, Math.round(num(x.所处层级, 1)))),
                    生平与过往执念: str(x.生平与过往执念),
                    表层伪装: str(x.表层伪装),
                    真实诉求与利益底线: str(x.真实诉求与利益底线),
                    隐藏秘密: str(x.隐藏秘密),
                    初始认知边界: {
                        已知事实: strArr(boundary.已知事实),
                        盲区: strArr(boundary.盲区)
                    },
                    人际渊源: Array.isArray(x.人际渊源)
                        ? x.人际渊源
                            .filter((t: any) => t && typeof t === 'object' && str(t.对象))
                            .map((t: any) => ({
                                对象: str(t.对象),
                                真实关系与心思: str(t.真实关系与心思)
                            }))
                        : [],
                    幕后当前日程: {
                        当前目标: str(agenda.当前目标),
                        正在推进的步骤: str(agenda.正在推进的步骤),
                        行动倒计时回合: Math.max(0, Math.round(num(agenda.行动倒计时回合, 3))),
                        已触发影响: strArr(agenda.已触发影响)
                    },
                    是否已登场: x.是否已登场 === true
                };
            })
        : [];

    const reservedForeshadowIds = new Set<string>(Array.isArray(src.伏笔台账) ? src.伏笔台账.filter((x: any) => str(x?.表面载体)).map((x: any) => str(x.id)).filter(Boolean) : []);
    const usedForeshadowIds = new Set<string>();
    const allocateForeshadowId = (rawId: unknown): string => {
        const preferred = str(rawId);
        if (preferred && !usedForeshadowIds.has(preferred)) {
            usedForeshadowIds.add(preferred);
            return preferred;
        }
        let seq = 1;
        while (usedForeshadowIds.has(`FS-${String(seq).padStart(3, '0')}`) || reservedForeshadowIds.has(`FS-${String(seq).padStart(3, '0')}`)) {
            seq += 1;
        }
        const generated = `FS-${String(seq).padStart(3, '0')}`;
        usedForeshadowIds.add(generated);
        return generated;
    };

    const 伏笔台账: ForeshadowingItem[] = Array.isArray(src.伏笔台账)
        ? src.伏笔台账
            .filter((x: any) => x && typeof x === 'object' && str(x.表面载体))
            .map((x: any) => ({
                id: allocateForeshadowId(x.id),
                类型: 合法伏笔类型(x.类型),
                表面载体: str(x.表面载体),
                底层真相: str(x.底层真相),
                知情人: strArr(x.知情人),
                盲区人物: strArr(x.盲区人物),
                建议埋设阶段: str(x.建议埋设阶段, '第一幕'),
                建议回收阶段: str(x.建议回收阶段, '后续幕次'),
                触发或回收条件: str(x.触发或回收条件),
                状态: 合法伏笔状态(x.状态),
                ...(Number.isFinite(Number(x.埋设回合)) ? { 埋设回合: Number(x.埋设回合) } : {}),
                ...(str(x.埋设落点描述) ? { 埋设落点描述: str(x.埋设落点描述) } : {}),
                ...(Number.isFinite(Number(x.回收回合)) ? { 回收回合: Number(x.回收回合) } : {}),
                ...(str(x.回收落点描述) ? { 回收落点描述: str(x.回收落点描述) } : {})
            }))
        : [];

    const 前史导火索: PreOpeningIncident[] = Array.isArray(src.前史导火索)
        ? src.前史导火索
            .filter((x: any) => x && typeof x === 'object' && str(x.事件名))
            .map((x: any) => ({
                事件名: str(x.事件名),
                发生时间: str(x.发生时间, '数日前'),
                真实经过: str(x.真实经过),
                表层流言版本: str(x.表层流言版本),
                卷入各方: strArr(x.卷入各方),
                留下的烫手筹码或危机: str(x.留下的烫手筹码或危机)
            }))
        : [];

    const 宏观分幕大纲: MacroActNode[] = Array.isArray(src.宏观分幕大纲)
        ? src.宏观分幕大纲
            .filter((x: any) => x && typeof x === 'object' && str(x.标题))
            .map((x: any, idx: number) => ({
                幕次: Math.max(1, Math.round(num(x.幕次, idx + 1))),
                标题: str(x.标题),
                核心矛盾: str(x.核心矛盾),
                主角目标与破局路径: str(x.主角目标与破局路径),
                关键势力与人物: strArr(x.关键势力与人物),
                跃迁至下一幕条件: str(x.跃迁至下一幕条件),
                当前状态: 合法幕状态(x.当前状态)
            }))
        : [];

    const dilemma = src.主角核心困局 && typeof src.主角核心困局 === 'object' ? src.主角核心困局 : {};
    const briefRaw = src.下回合导演简报 && typeof src.下回合导演简报 === 'object' ? src.下回合导演简报 : null;

    return {
        version: 2,
        世界观表层摘要: str(src.世界观表层摘要),
        顶层隐秘秩序: str(src.顶层隐秘秩序),
        核心历史原罪: str(src.核心历史原罪),
        终局方向与逆推因果: str(src.终局方向与逆推因果),
        空间阶梯,
        前史导火索,
        主角核心困局: {
            开局处境: str(dilemma.开局处境),
            最大威胁源: str(dilemma.最大威胁源),
            手中唯一筹码或信息差: str(dilemma.手中唯一筹码或信息差),
            短中期推进动力: str(dilemma.短中期推进动力)
        },
        宏观分幕大纲,
        当前幕次: Math.max(1, Math.round(num(src.当前幕次, 1))),
        势力暗账,
        核心卡司,
        伏笔台账,
        动态轨迹记录: Array.isArray(src.动态轨迹记录)
            ? src.动态轨迹记录
                .filter((x: any) => x && typeof x === 'object')
                .map((x: any) => ({
                    回合: Math.max(0, Math.round(num(x.回合, 0))),
                    决策摘要: str(x.决策摘要),
                    因果偏移: str(x.因果偏移)
                }))
            : [],
        ...(briefRaw ? {
            下回合导演简报: {
                生成于回合: Math.max(0, Math.round(num(briefRaw.生成于回合, 0))),
                本回合舞台焦点: str(briefRaw.本回合舞台焦点),
                必须守住的悬念或冲突: str(briefRaw.必须守住的悬念或冲突),
                ...(str(briefRaw.待埋或推进伏笔ID) ? { 待埋或推进伏笔ID: str(briefRaw.待埋或推进伏笔ID) } : {}),
                ...(str(briefRaw.待埋伏笔演出方式) ? { 待埋伏笔演出方式: str(briefRaw.待埋伏笔演出方式) } : {}),
                即将落地的外溢世界波及: strArr(briefRaw.即将落地的外溢世界波及),
                在场人物私密动向提示: Array.isArray(briefRaw.在场人物私密动向提示)
                    ? briefRaw.在场人物私密动向提示
                        .filter((h: any) => h && typeof h === 'object' && str(h.姓名))
                        .map((h: any) => ({
                            姓名: str(h.姓名),
                            内心真实算计: str(h.内心真实算计),
                            本回合绝不能透露: str(h.本回合绝不能透露)
                        }))
                    : [],
                下一拍预计走向: str(briefRaw.下一拍预计走向)
            }
        } : {})
    };
};

const 映射势力类型 = (rawType: string): 势力类型 => {
    const knownTypes: 势力类型[] = ['门派', '家族', '商会', '镖局', '官府', '帮派', '散修联盟', '其他'];
    const exactType = knownTypes.find(type => type === rawType.trim());
    if (exactType) return exactType;
    if (/宗|门|教|派|道/.test(rawType)) return '门派';
    if (/世家|家族|氏/.test(rawType)) return '家族';
    if (/商|楼|阁|行/.test(rawType)) return '商会';
    if (/皇|朝|府|廷|官|司/.test(rawType)) return '官府';
    if (/镖/.test(rawType)) return '镖局';
    if (/帮|会/.test(rawType)) return '帮派';
    if (/盟/.test(rawType)) return '散修联盟';
    return '其他';
};

const 映射势力关系标签 = (rawRel: string): 势力关系标签 => {
    if (/联盟|结盟|盟友/.test(rawRel)) return '联盟';
    if (/从属|附庸|傀儡|下属/.test(rawRel)) return '从属';
    if (/敌|仇|杀|攻|渗/.test(rawRel)) return '敌对';
    if (/友|善|互惠/.test(rawRel)) return '友好';
    return '中立';
};

export const 将势力暗账投影为世界势力 = (
    ledgers: FactionLedger[],
    mapLayers: 地图层级结构[]
): 势力结构[] => {
    const layerNameById = new Map<string, string>();
    for (const node of mapLayers || []) {
        if (node?.ID && node?.名称) layerNameById.set(node.ID.trim(), node.名称.trim());
    }
    const factionIdByName = new Map<string, string>();
    for (const ledger of ledgers || []) {
        if (ledger?.名称 && ledger?.id) {
            factionIdByName.set(ledger.名称.trim(), ledger.id);
            factionIdByName.set(ledger.id, ledger.id);
        }
    }

    return (ledgers || []).map((ledger) => {
        const 关系网: Record<string, 势力关系标签> = {};
        for (const rel of ledger.跨势力账目 || []) {
            if (!rel.对方势力) continue;
            const targetKey = factionIdByName.get(rel.对方势力.trim());
            if (!targetKey || targetKey === ledger.id) continue;
            关系网[targetKey] = 映射势力关系标签(rel.关系 || '');
        }
        const rawPlace = (ledger.地盘 || [])[0]?.trim() || '';
        const 地盘归属 = layerNameById.get(rawPlace) || rawPlace || '江湖域';

        return {
            ID: ledger.id,
            名称: ledger.名称,
            类型: 映射势力类型(ledger.类型 || ''),
            实力等级: ledger.实力等级,
            地盘归属,
            描述: [
                ledger.领袖 ? `领袖：${ledger.领袖}` : '',
                ledger.对外公开立场,
                ledger.内部裂痕 ? `暗藏裂痕：${ledger.内部裂痕}` : ''
            ].filter(Boolean).join('；'),
            代表性物品风格: ledger.核心人物?.length
                ? `核心成员：${ledger.核心人物.join('、')}`
                : '门庭森严，各有所长',
            关系网,
            库藏物品池: [],
            当前状态: ledger.内部裂痕 ? '表面平稳，暗流涌动' : '蓄势待发'
        };
    });
};

export const 净化玩家可见圣经文案 = (text: string, bible?: DirectorWorldBible | null): string => {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed || !bible) return trimmed;
    const unrecoveredSecrets = (bible.伏笔台账 || [])
        .filter((f) => f && f.状态 !== '已回收' && typeof f.底层真相 === 'string' && f.底层真相.trim().length > 0)
        .map((f) => f.底层真相.trim());
    let result = trimmed;
    for (const secret of unrecoveredSecrets) {
        if (result.includes(secret)) {
            result = result.split(secret).join('（局势暗流尚待查明）');
        }
    }
    return result;
};

export const 将导演圣经投影为剧情规划视图 = (
    bible: DirectorWorldBible,
    existingStory: 剧情系统结构,
    existingPlan: 剧情规划结构,
    existingHeroinePlan: 女主剧情规划结构 | undefined,
    activeOngoingEvents: 世界进行中事件结构[],
    worldLog: string[],
    currentGameTime: string
): {
    story: 剧情系统结构;
    storyPlan: 剧情规划结构;
    heroinePlan?: 女主剧情规划结构;
    worldOngoingEvents: 世界进行中事件结构[];
    worldEvents: string[];
} => {
    const activeAct = bible.宏观分幕大纲.find((a) => a.幕次 === bible.当前幕次)
        || bible.宏观分幕大纲.find((a) => a.当前状态 === '推进中')
        || bible.宏观分幕大纲[0];
    const nextAct = activeAct
        ? bible.宏观分幕大纲.find((a) => a.幕次 === activeAct.幕次 + 1)
        : undefined;

    const activeForeshadowing = bible.伏笔台账
        .filter((f) => f.状态 === '已埋设' || f.状态 === '发酵中')
        .map((f) => `[${f.id}|${f.状态}] ${f.表面载体}`);

    const brief = bible.下回合导演简报;
    const safeActTitle = activeAct ? 净化玩家可见圣经文案(activeAct.标题, bible) : '';
    const safeActConflict = activeAct ? 净化玩家可见圣经文案(activeAct.核心矛盾, bible) : '';
    const safeActGoal = activeAct ? 净化玩家可见圣经文案(activeAct.主角目标与破局路径, bible) : '';

    const story: 剧情系统结构 = {
        ...existingStory,
        当前章节: {
            ...existingStory.当前章节,
            标题: safeActTitle ? `第${activeAct!.幕次}幕：${safeActTitle}` : (existingStory.当前章节?.标题 || '第一幕'),
            当前分解组: activeAct?.幕次 || bible.当前幕次 || 1,
            原著推进状态: '推进中',
            已完成摘要: bible.动态轨迹记录.slice(-6).map((r) => `R${r.回合}: ${r.决策摘要}`),
            当前待解问题: [
                ...(brief?.必须守住的悬念或冲突 ? [净化玩家可见圣经文案(brief.必须守住的悬念或冲突, bible)] : []),
                ...activeForeshadowing.slice(0, 4)
            ],
            原著换章条件: activeAct?.跃迁至下一幕条件 ? [净化玩家可见圣经文案(activeAct.跃迁至下一幕条件, bible)] : []
        },
        下一章预告: nextAct
            ? {
                标题: `第${nextAct.幕次}幕：${净化玩家可见圣经文案(nextAct.标题, bible)}`,
                大纲: [
                    净化玩家可见圣经文案(nextAct.核心矛盾, bible),
                    净化玩家可见圣经文案(nextAct.主角目标与破局路径, bible)
                ].filter(Boolean),
                进入条件: activeAct?.跃迁至下一幕条件 ? [净化玩家可见圣经文案(activeAct.跃迁至下一幕条件, bible)] : [],
                风险提示: nextAct.关键势力与人物
            }
            : { 标题: '', 大纲: [], 进入条件: [], 风险提示: [] }
    };

    const castAgendasAsEvents = bible.核心卡司
        .filter((c) => c.幕后当前日程?.当前目标)
        .slice(0, 5)
        .map((c) => ({
            事件名: `${c.姓名}的隐线动作：${c.幕后当前日程.当前目标}`,
            事件说明: c.幕后当前日程.正在推进的步骤 || c.幕后当前日程.当前目标,
            计划触发时间: c.幕后当前日程.行动倒计时回合 <= 0 ? currentGameTime : '',
            最早触发时间: '',
            最晚触发时间: '',
            前置条件: [],
            触发条件: [`倒计时剩余 ${c.幕后当前日程.行动倒计时回合} 回合`],
            阻断条件: [],
            成功结果: c.幕后当前日程.已触发影响,
            失败结果: [],
            关联任务: [],
            关联人物: [c.姓名],
            关联地点: [],
            关联势力: c.身份与势力 ? [c.身份与势力] : [],
            当前状态: c.幕后当前日程.行动倒计时回合 <= 1 ? '即将落地' : '幕后推演中'
        }));

    const storyPlan: 剧情规划结构 = {
        ...existingPlan,
        当前章目标: [
            ...(activeAct ? [safeActConflict, safeActGoal] : []),
            ...(brief?.本回合舞台焦点 ? [净化玩家可见圣经文案(brief.本回合舞台焦点, bible)] : [])
        ].filter(Boolean),
        跨章延续事项: bible.伏笔台账
            .filter((f) => f.状态 !== '已回收')
            .slice(0, 6)
            .map((f) => ({
                标题: `${f.id} ${f.表面载体}`,
                延续原因: [f.类型, f.建议回收阶段],
                当前状态: [f.状态],
                延续到何时: f.建议回收阶段,
                后续接续条件: (() => {
                    if (f.状态 === '未埋设') return [];
                    const cond = 净化玩家可见圣经文案(f.触发或回收条件 || '', bible);
                    return cond && !cond.includes('局势暗流尚待查明')
                        ? [cond]
                        : [`留心与「${f.表面载体}」相关的异常细节`];
                })(),
                终止条件: ['伏笔回收完毕']
            })),
        待触发事件: castAgendasAsEvents.length > 0 ? castAgendasAsEvents : existingPlan.待触发事件
    };

    return {
        story,
        storyPlan,
        heroinePlan: existingHeroinePlan,
        worldOngoingEvents: activeOngoingEvents,
        worldEvents: worldLog
    };
};
