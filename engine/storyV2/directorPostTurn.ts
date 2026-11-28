import {
    将导演圣经投影为剧情规划视图,
    净化玩家可见圣经文案,
    type DirectorCharacterProfile,
    type DirectorWorldBible,
    type ForeshadowingStatus,
    type TurnDirectorBrief
} from '../../models/directorBible';
import { 构建即时记忆条目, 构建短期记忆条目, 写入四段记忆, 规范化记忆配置 } from '../../hooks/useGame/memoryUtils';
import { 规范化环境信息, 规范化社交列表 } from '../../hooks/useGame/stateTransforms';
import { 构建环境位置路径, 同步在场NPC当前位置 } from '../../hooks/useGame/responseCommandProcessor';
import { 标准时间串转结构化, 环境时间转标准串, 结构化时间转标准串 } from '../../hooks/useGame/timeUtils';
import { 规范化文本补全消息链, 请求模型文本, type 通用消息 } from '../../services/ai/chatCompletionClient';
import { 提取首个标签内容 } from '../../services/ai/storyResponseParser';
import type { GameResponse, OpeningConfig, 世界进行中事件结构 } from '../../types';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { 变更角色货币BaseAmount } from '../../utils/currencyDisplay';
import { 推断单位仙侠 } from '../../utils/realmDisplay';
import { parseJsonWithRepair } from '../../utils/jsonRepair';
import type { StoryV2EngineState } from './types';
import { 首次登记NPC交易资产 } from '../plugins/tradePlugin';
import { 获取交易币制 } from '../plugins/tradeCurrency';

export interface DirectorPostTurnResult {
    nextState: StoryV2EngineState;
    plantedForeshadows: string[];
    fermentedForeshadows: string[];
    paidOffForeshadows: string[];
    offscreenSpillovers: string[];
    replanned: boolean;
    replanReason?: string;
    directorMs: number;
    contextChars: number;
    rawText: string;
}

const 推进标准时间分钟 = (canonical: string, addMinutes: number): string => {
    const t = 标准时间串转结构化(canonical);
    if (!t || !Number.isFinite(addMinutes) || addMinutes <= 0) return canonical;
    let totalMin = t.分 + Math.round(addMinutes);
    let totalHour = t.时 + Math.floor(totalMin / 60);
    totalMin = ((totalMin % 60) + 60) % 60;
    let day = t.日 + Math.floor(totalHour / 24);
    totalHour = ((totalHour % 24) + 24) % 24;
    let month = t.月;
    let year = t.年;
    while (day > 30) {
        day -= 30;
        month += 1;
    }
    while (month > 12) {
        month -= 12;
        year += 1;
    }
    return 结构化时间转标准串({ 年: year, 月: month, 日: day, 时: totalHour, 分: totalMin }) || canonical;
};

const 提取响应正文文本 = (resp: GameResponse): string => (
    Array.isArray(resp?.logs)
        ? resp.logs.map((l) => `${l?.sender || '旁白'}：${l?.text || ''}`.trim()).filter(Boolean).join('\n')
        : ''
);

const 构建导演后处理提示词 = (params: {
    state: StoryV2EngineState;
    turnIndex: number;
    playerInput: string;
    storyBody: string;
    shortTerm: string;
    tradeUnit: string;
}): string => {
    const { state, turnIndex, playerInput, storyBody, shortTerm } = params;
    const bible = state.directorBible;
    const activeAct = bible.宏观分幕大纲.find((a) => a.幕次 === bible.当前幕次) || bible.宏观分幕大纲[0];

    const compactCast = bible.核心卡司
        .filter((c) => c.姓名 !== state.角色?.姓名)
        .map((c) => ({
            id: c.id,
            姓名: c.姓名,
            势力与层级: `${c.身份与势力}(L${c.所处层级})`,
            核心诉求: c.真实诉求与利益底线,
            隐藏秘密: c.隐藏秘密,
            当前日程: c.幕后当前日程,
            已登场: c.是否已登场
        }));

    const compactForeshadows = bible.伏笔台账.map((f) => ({
        id: f.id,
        类型: f.类型,
        状态: f.状态,
        表面载体: f.表面载体,
        底层真相: f.底层真相,
        建议回收阶段: f.建议回收阶段,
        触发或回收条件: f.触发或回收条件,
        埋设落点描述: f.埋设落点描述
    }));

    return [
        `现在刚结束第 ${turnIndex} 回合演化，请执行【2.0 统一剧情导演 + 幕后因果推演 + 状态同步】任务。`,
        '',
        '【当前主角与环境快照】',
        `- 主角：${state.角色?.姓名} | 境界：${state.角色?.境界 || '凡胎境'} | 当前时间：${环境时间转标准串(state.环境)} | 当前地点：${state.环境?.大地点}/${state.环境?.中地点}/${state.环境?.小地点}/${state.环境?.具体地点}`,
        `- 已入档社交人物：${(state.社交 || []).map((n) => `${n.姓名}(关系:${n.关系 || '未知'},好感:${n.好感度 ?? 0},在场:${n.是否在场 !== false})`).join('；') || '暂无'}`,
        '',
        '【2.0 导演圣经核心状态】',
        `- 顶层隐秘秩序：${bible.顶层隐秘秩序}`,
        `- 主角核心困局：${JSON.stringify(bible.主角核心困局)}`,
        `- 当前第 ${bible.当前幕次} 幕：${JSON.stringify(activeAct || {})}`,
        `- 宏观分幕概览：${JSON.stringify(bible.宏观分幕大纲.map((a) => ({ 幕次: a.幕次, 标题: a.标题, 状态: a.当前状态, 跃迁条件: a.跃迁至下一幕条件 })))}`,
        `- 势力暗账摘要：${JSON.stringify(bible.势力暗账.map((f) => ({ id: f.id, 名称: f.名称, 领袖: f.领袖, 裂痕: f.内部裂痕, 暗中图谋: f.真实诉求与暗中图谋 })))}`,
        `- 核心卡司与幕后日程：${JSON.stringify(compactCast)}`,
        `- 伏笔台账：${JSON.stringify(compactForeshadows)}`,
        `- 近期因果轨迹：${JSON.stringify(bible.动态轨迹记录.slice(-5))}`,
        '',
        '【本回合实际发生内容】',
        `- 玩家输入：${playerInput || '(开局初始化)'}`,
        `- 短期记忆：${shortTerm}`,
        '- 完整正文：',
        storyBody,
        '',
        '【你的核心导演职责（与老版不同，严格遵守！）】',
        '1. **事实与逻辑审计**：根据正文提取时间推移分钟数、地点迁移、新登场人物、已有社交人物好感与认知更新、主角得失关键物件或伤势代价（不写战斗数值/拍卖行）。若某件物品在正文中刚拿到但未拆封验证，社交认知里也只写“拿到未拆封信物”，严禁替主角或反派补全未亲眼验证的真相。',
        '2. **伏笔单调进阶审计**：对比正文细节，判断台账里哪些 `FS-xxx` 本回合在正文中**真正出现了**表面载体/线索（`未埋设 -> 已埋设 -> 发酵中 -> 已回收`；状态只能向前推进，不可从“发酵中”倒退回“已埋设”）。严禁虚报未写进正文的伏笔，也严禁在无充分因果的前提下擅自把台账原本锚定在甲处的物件载体（如当铺角落）临时瞬移改写成乙处（如旁人腰间）；若某人已在台前会合主角，勿重复其入场前的旧日程。',
        '3. **核心卡司幕后日程推演（尤其第 2~4 层远端棋手！）**：每回合至少推进 2~3 名**尚未到场**的核心卡司（尤其是 L3~L4 远端掌权派/幕后棋手，确保全盘皆活），将他们的 `行动倒计时回合` 推进 `-1` 并填写 `新目标`/`新推进步骤`。**凡倒计时降为 0 的日程，必须产出 1 条具体可感知的【外溢波及】（追查收网/火并余波/密使抵近/坊市动荡）**；若角色已经到场，请在 `新目标`/`新推进步骤` 中把其日程改写为符合当前场面的新诉求，不要一直卡在过时旧日程上！',
        '4. **积极触发动态重规划（Dynamic Re-planning）**：只要玩家本回合采取了改变预设战术或局面前提的行动（例如：原本定调“潜入救人”，玩家却反客为主持信当面喝退/敲诈强敌、或提前识破埋伏、或抢先改换阵营、或当前据点围困已打破需要转场进入黑市/下一区域），**必须将 `动态重规划.需要重规划` 设为 `true`**，写清 `重规划原因` 并立刻更新 `修订当前幕核心矛盾` 与 `修订当前幕破局路径`；若第 1 幕的初始局部危局已解决或转折到位，请将 `推进到幕次` 推进到 `2`！',
        '5. **签发下回合导演简报 (`下回合导演简报`)**：为主剧情渲染层指定下一回合精准的舞台焦点、必守悬念、下一枚应顺手埋设或发酵的 `伏笔ID` 及其**只演表象不剧透真相的演出方式**，以及在场人物此时真实的心思与绝不能说漏嘴的保密底线。',
        '',
        '可选「交易资产初见」：仅当正文明确盘点该人物自己的全部现款或展示真实随身物品，才提供 { "依据": "逐字引用正文", "余额Base": 整数, "背包": [{"名称":"正文中的物品","数量":1}] }。余额以' + params.tradeUnit + '计。未提及余额就省略，不能把某件商品的价格、要价、预算或付掉的一笔钱当余额；不能按身份或境界编造资产。已经在情境交易面板成交的货币、物件和好感不可再次结算。',
        '请只输出 `<thinking>`（可选）与一个合法 `<导演更新JSON>...</导演更新JSON>`（严禁输出额外闲聊）：',
        '{',
        '  "环境变更": { "推进分钟数": 30, "大地点": "", "中地点": "", "小地点": "", "具体地点": "精确到最底层的房间/子地点名称（若在室内切勿只填外层建筑名）", "时间叙述": "" },',
        '  "主角变化": { "境界": "", "金钱变化BaseAmount": 0, "获得物品": [{ "名称": "...", "数量": 1 }], "失去物品": [{ "名称": "...", "数量": 1 }], "状态或伤势变化": "" },',
        '  "社交人物更新": [',
        '    { "姓名": "...", "性别": "女|男", "身份": "...", "关系": "...", "好感度变化": 5, "是否在场": true, "当前位置": "精确到所在房间或具体地点（同处一室可与环境具体地点一致）", "核心性格特征": "...", "新增记忆": "一句话客观记录她眼中本回合发生的事（严禁写入幕后剧透）" }',
        '  ],',
        '  "伏笔迁移": [',
        '    { "id": "FS-001", "nextStatus": "已埋设|发酵中|已回收|已改线", "落点描述": "具体在正文中靠什么细节落地" }',
        '  ],',
        '  "新增伏笔": [',
        '    { "类型": "物件|流言|人物怪癖|前史旧案|地理异象|身份暗桩", "表面载体": "...", "底层真相": "...", "知情人": ["..."], "盲区人物": ["..."], "建议回收阶段": "...", "触发或回收条件": "..." }',
        '  ],',
        '  "幕后人物推进": [',
        '    { "id": "CAST-002", "行动倒计时变化": -1, "新目标": "可选：若角色已转换阶段或到场则更新其新目标，否则留空", "新推进步骤": "...", "触发外溢波及": "仅当倒计时归零或触发阈值时填一条真实可感知的波及结果，否则留空字符串" }',
        '  ],',
        '  "动态重规划": {',
        '    "需要重规划": false,',
        '    "重规划原因": "",',
        '    "推进到幕次": null,',
        '    "修订当前幕核心矛盾": "仅当玩家破局重塑主轴时填写（须保持玩家视角可读，严禁写入未回收伏笔底层真相）",',
        '    "修订当前幕破局路径": "",',
        '    "因果偏移摘要": "一句话总结本回合对全局走势的推力或偏转"',
        '  },',
        '  "下回合导演简报": {',
        '    "本回合舞台焦点": "...",',
        '    "必须守住的悬念或冲突": "...",',
        '    "待埋或推进伏笔ID": "FS-002",',
        '    "待埋伏笔演出方式": "怎么不动声色地露出表面载体，绝不点破真相",',
        '    "即将落地的外溢世界波及": ["..."],',
        '    "在场人物私密动向提示": [',
        '      { "姓名": "...", "内心真实算计": "...", "本回合绝不能透露": "..." }',
        '    ],',
        '    "下一拍预计走向": "..."',
        '  }',
        '}'
    ].join('\n');
};

export const 执行导演后处理V2 = async (params: {
    state: StoryV2EngineState;
    apiConfig: 当前可用接口结构;
    storyResponse: GameResponse;
    playerInput: string;
    openingConfig?: OpeningConfig;
    signal?: AbortSignal;
    stream?: boolean;
    onDelta?: (delta: string, accumulated: string) => void;
}): Promise<DirectorPostTurnResult> => {
    const t0 = Date.now();
    const { state, apiConfig, storyResponse, playerInput, openingConfig, signal, onDelta } = params;
    const storyBody = 提取响应正文文本(storyResponse);
    const shortTerm = (storyResponse.shortTerm || '').trim() || storyBody.slice(0, 140);

    const prompt = 构建导演后处理提示词({
        tradeUnit: 获取交易币制(openingConfig, state.角色).label,
        state,
        turnIndex: state.turnIndex,
        playerInput,
        storyBody,
        shortTerm
    });

    const messages: 通用消息[] = 规范化文本补全消息链([
        {
            role: 'system',
            content: '你是《墨色江湖 2.0》的中央剧情导演兼因果演化引擎。你掌握全局隐秘圣经与人物认知隔离表，负责在每回合正文之后审计伏笔、推进跨层级人物幕后行动、动态重规划剧情脉络并生成下回合演化简报。只输出合法 JSON（包裹在 <导演更新JSON> 标签内）。'
        },
        { role: 'user', content: prompt }
    ], { 保留System: true, 合并同角色: false });

    const contextChars = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
    const rawText = await 请求模型文本(apiConfig, messages, {
        temperature: 0.35,
        signal,
        streamOptions: { stream: params.stream !== false, onDelta }
    });

    const safeRawText = typeof rawText === 'string'
        ? rawText
        : (typeof (rawText as any)?.text === 'string' ? (rawText as any).text : '');
    const extractedJsonTag = 提取首个标签内容(safeRawText, '导演更新JSON', { 兼容错误闭合: true });
    const jsonBlock = (extractedJsonTag || safeRawText)
        .replace(/^```(?:json|JSON)?\s*/g, '')
        .replace(/\s*```$/g, '')
        .trim();
    const parseResult = parseJsonWithRepair<Record<string, any>>(jsonBlock);
    if (!parseResult.value || typeof parseResult.value !== 'object' || Array.isArray(parseResult.value)) {
        throw new Error(`2.0 导演后处理 JSON 解析失败：${parseResult.error || '返回内容无法解析为合法对象'}`);
    }
    const parsed = parseResult.value;

    // Clone mutable buffers
    const nextBible: DirectorWorldBible = JSON.parse(JSON.stringify(state.directorBible));
    const nextEnv = 规范化环境信息(JSON.parse(JSON.stringify(state.环境)));
    let nextRole = JSON.parse(JSON.stringify(state.角色));
    let nextSocial: any[] = JSON.parse(JSON.stringify(state.社交 || []));
    const nextWorld = JSON.parse(JSON.stringify(state.世界));
    const nextWorldEvents = [...(state.世界大事 || [])];

    // 1. Environment & Time (support full location hierarchy while keeping unchanged layers)
    const envPatch = parsed.环境变更 || {};
    const prevSpecificPlace = (nextEnv.具体地点 || '').trim();
    const curCanon = 环境时间转标准串(nextEnv) || state.gameInitialTime || '1:01:01:06:00';
    const rawMins = Number(envPatch.推进分钟数);
    const addMins = Number.isFinite(rawMins) && rawMins >= 0 ? rawMins : 20;
    const nextCanon = 推进标准时间分钟(curCanon, addMins);
    nextEnv.时间 = nextCanon;
    if (typeof envPatch.大地点 === 'string' && envPatch.大地点.trim()) nextEnv.大地点 = envPatch.大地点.trim();
    if (typeof envPatch.中地点 === 'string' && envPatch.中地点.trim()) nextEnv.中地点 = envPatch.中地点.trim();
    if (typeof envPatch.小地点 === 'string' && envPatch.小地点.trim()) nextEnv.小地点 = envPatch.小地点.trim();
    if (typeof envPatch.具体地点 === 'string' && envPatch.具体地点.trim()) nextEnv.具体地点 = envPatch.具体地点.trim();
    const specificPlaceMoved = Boolean(nextEnv.具体地点 && nextEnv.具体地点 !== prevSpecificPlace);
    const fullLocationPath = 构建环境位置路径(nextEnv);

    // 2. Protagonist factual updates (currency delta + stackable items)
    const rolePatch = parsed.主角变化 || {};
    if (typeof rolePatch.境界 === 'string' && rolePatch.境界.trim()) {
        nextRole.境界 = rolePatch.境界.trim();
    }
    if (typeof rolePatch.状态或伤势变化 === 'string' && rolePatch.状态或伤势变化.trim()) {
        nextRole.当前状况 = rolePatch.状态或伤势变化.trim();
    }
    const moneyDelta = Number(rolePatch.金钱变化BaseAmount ?? rolePatch.金钱变化);
    if (Number.isFinite(moneyDelta) && moneyDelta !== 0) {
        nextRole = 变更角色货币BaseAmount(nextRole, Math.trunc(moneyDelta), {
            runtimeProfile: openingConfig?.modeRuntimeProfile,
            仙侠模式: 推断单位仙侠(nextRole) || /仙侠|玄幻/.test(String(openingConfig?.题材模式 || ''))
        });
    }
    const 解析物品变更项 = (rawItem: unknown): { name: string; count: number; type?: string; desc?: string } | null => {
        if (typeof rawItem === 'string') {
            const name = rawItem.trim();
            return name ? { name, count: 1 } : null;
        }
        if (rawItem && typeof rawItem === 'object') {
            const name = typeof (rawItem as any).名称 === 'string' ? (rawItem as any).名称.trim() : '';
            if (!name) return null;
            const count = Math.floor(Number((rawItem as any).数量 ?? 1));
            if (!Number.isSafeInteger(count) || count < 1) return null;
            const type = typeof (rawItem as any).类型 === 'string' ? (rawItem as any).类型.trim() : undefined;
            const desc = typeof (rawItem as any).描述 === 'string' ? (rawItem as any).描述.trim() : undefined;
            return { name, count, type, desc };
        }
        return null;
    };
    if (Array.isArray(rolePatch.获得物品)) {
        nextRole.物品列表 = Array.isArray(nextRole.物品列表) ? nextRole.物品列表 : [];
        for (const rawEntry of rolePatch.获得物品) {
            const item = 解析物品变更项(rawEntry);
            if (!item) continue;
            const existing = nextRole.物品列表.find((x: any) => (x?.名称 || x) === item.name);
            if (existing && typeof existing === 'object') {
                const curCount = Math.max(1, Number(existing.堆叠数量 ?? existing.数量) || 1);
                existing.数量 = curCount + item.count;
                if ('堆叠数量' in existing) existing.堆叠数量 = curCount + item.count;
            } else {
                nextRole.物品列表.push({
                    名称: item.name,
                    类型: item.type || '剧情物品',
                    数量: item.count,
                    堆叠数量: item.count,
                    描述: item.desc || '剧情获取'
                });
            }
        }
    }
    if (Array.isArray(rolePatch.失去物品) && Array.isArray(nextRole.物品列表)) {
        for (const rawEntry of rolePatch.失去物品) {
            const item = 解析物品变更项(rawEntry);
            if (!item) continue;
            const idx = nextRole.物品列表.findIndex((x: any) => (x?.名称 || x) === item.name);
            if (idx < 0) continue;
            const target = nextRole.物品列表[idx];
            if (target && typeof target === 'object') {
                const curCount = Math.max(1, Number(target.堆叠数量 ?? target.数量) || 1);
                const left = curCount - item.count;
                if (left > 0) {
                    target.数量 = left;
                    if ('堆叠数量' in target) target.堆叠数量 = left;
                } else {
                    nextRole.物品列表.splice(idx, 1);
                }
            } else {
                nextRole.物品列表.splice(idx, 1);
            }
        }
    }

    // 3. Social updates (strictly public/grounded fields, NO leaking 隐藏秘密)
    const castNamesSet = new Set(nextBible.核心卡司.map((c) => c.姓名));
    if (Array.isArray(parsed.社交人物更新)) {
        for (const upd of parsed.社交人物更新) {
            const name = typeof upd?.姓名 === 'string' ? upd.姓名.trim() : '';
            if (!name || name === nextRole.姓名) continue;
            const idx = nextSocial.findIndex((n) => n?.姓名 === name);
            const deltaFav = Number.isFinite(Number(upd.好感度变化)) ? Number(upd.好感度变化) : 0;
            const newMem = typeof upd.新增记忆 === 'string' && upd.新增记忆.trim() ? upd.新增记忆.trim() : '';
            const updPos = typeof upd.当前位置 === 'string' && upd.当前位置.trim() ? upd.当前位置.trim() : '';
            if (idx >= 0) {
                const cur = nextSocial[idx];
                if (typeof upd.身份 === 'string' && upd.身份.trim()) cur.身份 = upd.身份.trim();
                if (typeof upd.关系 === 'string' && upd.关系.trim()) cur.关系 = upd.关系.trim();
                if (typeof upd.是否在场 === 'boolean') cur.是否在场 = upd.是否在场;
                if (typeof upd.核心性格特征 === 'string' && upd.核心性格特征.trim()) cur.核心性格特征 = upd.核心性格特征.trim();
                if (updPos) {
                    cur.当前位置 = updPos;
                    cur.当前地点 = updPos;
                    cur.位置路径 = cur.是否在场 === true && updPos === nextEnv.具体地点 ? fullLocationPath : updPos;
                } else if (cur.是否在场 === true && specificPlaceMoved && nextEnv.具体地点) {
                    cur.当前位置 = nextEnv.具体地点;
                    cur.当前地点 = nextEnv.具体地点;
                    if (fullLocationPath) cur.位置路径 = fullLocationPath;
                }
                cur.好感度 = Math.max(-100, Math.min(100, (Number(cur.好感度) || 0) + deltaFav));
                if (newMem) {
                    cur.记忆 = Array.isArray(cur.记忆) ? cur.记忆 : [];
                    cur.记忆.push(`【${nextCanon}】${newMem}`);
                    if (cur.记忆.length > 20) cur.记忆 = cur.记忆.slice(-20);
                }
            } else {
                const initPos = updPos || (upd.是否在场 !== false ? nextEnv.具体地点 : '');
                nextSocial.push({
                    id: `NPC-${String(nextSocial.length + 1).padStart(3, '0')}`,
                    姓名: name,
                    性别: upd.性别 || '女',
                    身份: upd.身份 || '未知人物',
                    关系: upd.关系 || '初识',
                    好感度: Math.max(-100, Math.min(100, 30 + deltaFav)),
                    是否在场: upd.是否在场 !== false,
                    ...(initPos ? {
                        当前位置: initPos,
                        当前地点: initPos,
                        位置路径: upd.是否在场 !== false && initPos === nextEnv.具体地点 ? fullLocationPath : initPos
                    } : {}),
                    核心性格特征: upd.核心性格特征 || '深浅莫测',
                    简介: upd.核心性格特征 || upd.身份 || '',
                    记忆: newMem ? [`【${nextCanon}】${newMem}`] : []
                });
            }
            if (upd.交易资产初见) {
                const targetIdx = idx >= 0 ? idx : nextSocial.length - 1;
                nextSocial[targetIdx] = 首次登记NPC交易资产(nextSocial[targetIdx], upd.交易资产初见, storyBody, openingConfig, nextRole);
            }
            if (castNamesSet.has(name)) {
                const castObj = nextBible.核心卡司.find((c) => c.姓名 === name);
                if (castObj) castObj.是否已登场 = true;
            }
        }
    }
    nextSocial = 同步在场NPC当前位置(规范化社交列表(nextSocial, { 合并同名: false }), nextEnv);

    // 4. Foreshadowing Ledger Updates (monotonic progression: 未埋设(0) < 已埋设(1) < 发酵中(2) < 已回收/已改线(3))
    const 伏笔状态阶位: Record<ForeshadowingStatus, number> = {
        '未埋设': 0,
        '已埋设': 1,
        '发酵中': 2,
        '已回收': 3,
        '已改线': 3
    };
    const plantedForeshadows: string[] = [];
    const fermentedForeshadows: string[] = [];
    const paidOffForeshadows: string[] = [];
    if (Array.isArray(parsed.伏笔迁移)) {
        for (const item of parsed.伏笔迁移) {
            const id = typeof item?.id === 'string' ? item.id.trim() : '';
            const fsItem = nextBible.伏笔台账.find((f) => f.id === id);
            if (!fsItem) continue;
            const nextStatus = item.nextStatus as ForeshadowingStatus;
            const curRank = 伏笔状态阶位[fsItem.状态] ?? 0;
            const targetRank = 伏笔状态阶位[nextStatus] ?? 0;
            const desc = typeof item.落点描述 === 'string' ? item.落点描述.trim() : '';
            if (targetRank < curRank) {
                // Never downgrade e.g. 发酵中 back to 已埋设; just append evidence if non-empty
                if (desc) fsItem.埋设落点描述 = [fsItem.埋设落点描述, desc].filter(Boolean).join('；');
                if (curRank === 2) fermentedForeshadows.push(`${fsItem.id}:${fsItem.表面载体}`);
                continue;
            }
            if (nextStatus === '已埋设') {
                if (curRank === 0) {
                    fsItem.状态 = '已埋设';
                    fsItem.埋设回合 = state.turnIndex;
                    if (desc) fsItem.埋设落点描述 = desc;
                    plantedForeshadows.push(`${fsItem.id}:${fsItem.表面载体}`);
                } else if (desc && !fsItem.埋设落点描述?.includes(desc)) {
                    fsItem.埋设落点描述 = [fsItem.埋设落点描述, desc].filter(Boolean).join('；');
                }
            } else if (nextStatus === '发酵中') {
                fsItem.状态 = '发酵中';
                if (fsItem.埋设回合 === undefined) fsItem.埋设回合 = state.turnIndex;
                if (desc) fsItem.埋设落点描述 = [fsItem.埋设落点描述, desc].filter(Boolean).join('；');
                fermentedForeshadows.push(`${fsItem.id}:${fsItem.表面载体}`);
            } else if (nextStatus === '已回收' && fsItem.状态 !== '已回收') {
                fsItem.状态 = '已回收';
                fsItem.回收回合 = state.turnIndex;
                if (desc) fsItem.回收落点描述 = desc;
                paidOffForeshadows.push(`${fsItem.id}:${fsItem.表面载体}`);
            } else if (nextStatus === '已改线' && fsItem.状态 !== '已回收') {
                fsItem.状态 = '已改线';
                if (desc) fsItem.触发或回收条件 = desc;
            }
        }
    }
    if (Array.isArray(parsed.新增伏笔)) {
        for (const nf of parsed.新增伏笔.slice(0, 1)) {
            if (typeof nf?.表面载体 === 'string' && nf.表面载体.trim() && typeof nf?.底层真相 === 'string' && nf.底层真相.trim()) {
                const existingIds = new Set(nextBible.伏笔台账.map(entry => entry.id));
                let seq = nextBible.伏笔台账.length + 1;
                while (existingIds.has(`FS-${String(seq).padStart(3, '0')}`)) seq++;
                const newId = `FS-${String(seq).padStart(3, '0')}`;
                nextBible.伏笔台账.push({
                    id: newId,
                    类型: nf.类型 || '物件',
                    表面载体: nf.表面载体.trim(),
                    底层真相: nf.底层真相.trim(),
                    知情人: Array.isArray(nf.知情人) ? nf.知情人 : [],
                    盲区人物: Array.isArray(nf.盲区人物) ? nf.盲区人物 : [nextRole.姓名],
                    建议埋设阶段: `第${state.turnIndex}回合顺水埋设`,
                    建议回收阶段: nf.建议回收阶段 || '后续幕次',
                    触发或回收条件: nf.触发或回收条件 || '等待发酵碰撞',
                    状态: '已埋设',
                    埋设回合: state.turnIndex
                });
                plantedForeshadows.push(`${newId}:${nf.表面载体.trim()}`);
            }
        }
    }

    // 5. Offscreen Cast Agenda Stepping & Causal Spillover
    const offscreenSpillovers: string[] = [];
    const newOngoingEvents: 世界进行中事件结构[] = Array.isArray(nextWorld.进行中事件) ? [...nextWorld.进行中事件] : [];
    if (Array.isArray(parsed.幕后人物推进)) {
        for (const tick of parsed.幕后人物推进) {
            const cast: DirectorCharacterProfile | undefined = nextBible.核心卡司.find(
                (c) => c.id === tick?.id || c.姓名 === tick?.姓名
            );
            if (!cast) continue;
            const delta = Number.isFinite(Number(tick.行动倒计时变化)) ? Number(tick.行动倒计时变化) : -1;
            cast.幕后当前日程.行动倒计时回合 = Math.max(0, (cast.幕后当前日程.行动倒计时回合 || 0) + delta);
            if (typeof tick.新目标 === 'string' && tick.新目标.trim()) {
                cast.幕后当前日程.当前目标 = tick.新目标.trim();
            }
            if (typeof tick.新推进步骤 === 'string' && tick.新推进步骤.trim()) {
                cast.幕后当前日程.正在推进的步骤 = tick.新推进步骤.trim();
            }
            const spillover = typeof tick.触发外溢波及 === 'string' ? tick.触发外溢波及.trim() : '';
            if (spillover) {
                cast.幕后当前日程.已触发影响.push(spillover);
                offscreenSpillovers.push(`【${cast.姓名}/${cast.身份与势力}】${spillover}`);
                nextWorldEvents.push(`[${nextCanon}] ${cast.姓名}行动外溢：${spillover}`);
                newOngoingEvents.push({
                    事件名: `${cast.姓名}引发的变局`,
                    类型: '势力博弈外溢',
                    事件说明: spillover,
                    开始时间: nextCanon,
                    预计结束时间: 推进标准时间分钟(nextCanon, 360),
                    当前进展: cast.幕后当前日程.正在推进的步骤,
                    已产生影响: [spillover],
                    关联人物: [cast.姓名],
                    关联势力: cast.身份与势力 ? [cast.身份与势力] : [],
                    关联地点: [],
                    当前状态: '正在发酵'
                } as any);
                // Reset next countdown phase cleanly
                if (cast.幕后当前日程.行动倒计时回合 <= 0) {
                    cast.幕后当前日程.行动倒计时回合 = 2;
                }
            }
        }
    }
    nextWorld.进行中事件 = newOngoingEvents.slice(-8);
    nextWorld.拍卖行待投放物品 = [];

    // 6. Dynamic Re-planning & Trajectory
    const replanPatch = parsed.动态重规划 || {};
    const replanned = replanPatch.需要重规划 === true;
    const replanReason = typeof replanPatch.重规划原因 === 'string' ? replanPatch.重规划原因.trim() : '';
    const nextActNum = Number(replanPatch.推进到幕次);
    const targetAct = Number.isInteger(nextActNum) && nextActNum > nextBible.当前幕次
        ? nextBible.宏观分幕大纲.find((a) => a.幕次 === nextActNum)
        : undefined;
    if (targetAct) {
        const oldAct = nextBible.宏观分幕大纲.find((a) => a.幕次 === nextBible.当前幕次);
        if (oldAct) oldAct.当前状态 = '已完成';
        nextBible.当前幕次 = nextActNum;
        targetAct.当前状态 = '推进中';
    }
    const curAct = nextBible.宏观分幕大纲.find((a) => a.幕次 === nextBible.当前幕次);
    if (curAct) {
        if (typeof replanPatch.修订当前幕核心矛盾 === 'string' && replanPatch.修订当前幕核心矛盾.trim()) {
            curAct.核心矛盾 = 净化玩家可见圣经文案(replanPatch.修订当前幕核心矛盾.trim(), nextBible);
            if (replanned) curAct.当前状态 = '已重规划';
        }
        if (typeof replanPatch.修订当前幕破局路径 === 'string' && replanPatch.修订当前幕破局路径.trim()) {
            curAct.主角目标与破局路径 = 净化玩家可见圣经文案(replanPatch.修订当前幕破局路径.trim(), nextBible);
        }
    }
    nextBible.动态轨迹记录.push({
        回合: state.turnIndex,
        决策摘要: shortTerm.slice(0, 120),
        因果偏移: typeof replanPatch.因果偏移摘要 === 'string' && replanPatch.因果偏移摘要.trim()
            ? replanPatch.因果偏移摘要.trim()
            : '按当前张力推进'
    });
    if (nextBible.动态轨迹记录.length > 20) nextBible.动态轨迹记录 = nextBible.动态轨迹记录.slice(-20);

    // 7. Next Turn Director Brief
    const rawBrief = parsed.下回合导演简报 || {};
    const nextBrief: TurnDirectorBrief = {
        生成于回合: state.turnIndex,
        本回合舞台焦点: typeof rawBrief.本回合舞台焦点 === 'string' ? rawBrief.本回合舞台焦点.trim() : '承接当前危局推进博弈',
        必须守住的悬念或冲突: typeof rawBrief.必须守住的悬念或冲突 === 'string' ? rawBrief.必须守住的悬念或冲突.trim() : (nextBible.主角核心困局.最大威胁源 || '危机尚未解除'),
        ...(typeof rawBrief.待埋或推进伏笔ID === 'string' && rawBrief.待埋或推进伏笔ID.trim() ? { 待埋或推进伏笔ID: rawBrief.待埋或推进伏笔ID.trim() } : {}),
        ...(typeof rawBrief.待埋伏笔演出方式 === 'string' && rawBrief.待埋伏笔演出方式.trim() ? { 待埋伏笔演出方式: rawBrief.待埋伏笔演出方式.trim() } : {}),
        即将落地的外溢世界波及: [
            ...(Array.isArray(rawBrief.即将落地的外溢世界波及) ? rawBrief.即将落地的外溢世界波及.filter((x: unknown) => typeof x === 'string' && x.trim()) : []),
            ...offscreenSpillovers
        ].slice(0, 5),
        在场人物私密动向提示: Array.isArray(rawBrief.在场人物私密动向提示)
            ? rawBrief.在场人物私密动向提示
                .filter((h: any) => h && typeof h === 'object' && typeof h.姓名 === 'string' && h.姓名.trim())
                .map((h: any) => ({
                    姓名: h.姓名.trim(),
                    内心真实算计: String(h.内心真实算计 || '').trim(),
                    本回合绝不能透露: String(h.本回合绝不能透露 || '').trim()
                }))
            : [],
        下一拍预计走向: typeof rawBrief.下一拍预计走向 === 'string' ? rawBrief.下一拍预计走向.trim() : ''
    };
    nextBible.下回合导演简报 = nextBrief;

    // 8. Project back onto standard Story & StoryPlan & Memory
    const projected = 将导演圣经投影为剧情规划视图(
        nextBible,
        state.剧情,
        state.剧情规划,
        state.女主剧情规划,
        nextWorld.进行中事件,
        [],
        nextCanon
    );

    const memCfg = 规范化记忆配置();
    const immEntry = 构建即时记忆条目(
        nextCanon,
        state.turnIndex === 0 ? '' : playerInput,
        storyResponse,
        state.turnIndex === 0 ? { 省略玩家输入: true } : undefined
    );
    const shortEntry = 构建短期记忆条目(nextCanon, storyResponse);
    const nextMemory = 写入四段记忆(state.记忆系统, immEntry, shortEntry, {
        immediateLimit: memCfg.即时消息上传条数N,
        shortLimit: memCfg.短期记忆阈值,
        midLimit: memCfg.中期记忆阈值,
        recordTime: nextCanon,
        timestamp: nextCanon
    });

    const nextHistory = [
        ...state.历史记录,
        ...(state.turnIndex > 0 ? [{ role: 'user' as const, content: playerInput, gameTime: 环境时间转标准串(state.环境) || nextCanon, timestamp: Date.now() }] : []),
        {
            role: 'assistant' as const,
            content: storyBody,
            structuredResponse: storyResponse,
            gameTime: nextCanon,
            timestamp: Date.now()
        }
    ];

    const nextState: StoryV2EngineState = {
        ...state,
        turnIndex: state.turnIndex + 1,
        directorBible: nextBible,
        角色: nextRole,
        环境: nextEnv,
        社交: nextSocial,
        世界: nextWorld,
        剧情: projected.story,
        剧情规划: projected.storyPlan,
        女主剧情规划: projected.heroinePlan,
        记忆系统: nextMemory,
        历史记录: nextHistory,
        世界大事: nextWorldEvents.slice(-30)
    };

    return {
        nextState,
        plantedForeshadows,
        fermentedForeshadows,
        paidOffForeshadows,
        offscreenSpillovers,
        replanned,
        replanReason: replanReason || undefined,
        directorMs: Date.now() - t0,
        contextChars,
        rawText
    };
};
