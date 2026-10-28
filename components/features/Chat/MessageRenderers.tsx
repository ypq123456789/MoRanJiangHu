import React, { useMemo, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { JudgmentThoughtBlock, NPC结构, 视觉设置结构 } from '../../../types';
import type { 酒馆沙箱动作 } from '../../../models/system';
import { use图片资源回源预取 } from '../../../hooks/useImageAssetPrefetch';
import { 构建区域文字样式 } from '../../../utils/visualSettings';
import { 获取图片展示地址, 获取图片资源文本地址 } from '../../../utils/imageAssets';
import { 根据差额校正判定结果 } from '../../../utils/judgmentFormat';
import { 获取物品已选图标地址 } from '../../../utils/itemImage';
import { getRarityNameClass, getRarityStyles } from '../../ui/rarityStyles';
import { IconHeart, IconEye, IconBattery, IconShield, IconCompass, IconExplosion, IconDice, IconCoins } from '../../ui/Icons';

// 懒加载沙箱 iframe 组件（非酒馆模式零开销）
const SandboxedCard = lazy(() => import('./SandboxedCard'));

type JudgmentModifier = {
    key: string;
    label: string;
    value: number | null;
    raw: string;
    description?: string;
};

type JudgmentBreakdownItem = {
    label: string;
    value: number | null;
    valueText: string;
    raw: string;
    description?: string;
};

type JudgmentBreakdownKind = 'score' | 'difficulty';

type JudgmentBreakdownSections = Record<JudgmentBreakdownKind, JudgmentBreakdownItem[]>;

type ParsedJudgment = {
    category: string;
    eventName: string;
    result: string;
    target: string;
    score: number;
    difficulty: number;
    winner?: string;
    loser?: string;
    delta?: number;
    damage?: number;
    cost?: string;
    remaining?: string;
    consequence?: string;
    discovery?: string;
    modifiers: JudgmentModifier[];
    /** 判定块内未被识别为结构化字段的自由叙事正文（如战斗描写、过程描述），需单独渲染，避免被吞掉 */
    narrative?: string[];
};

const createEmptyJudgment = (): ParsedJudgment => ({
    category: '判定',
    eventName: '判定事件',
    result: '未知',
    target: '自身',
    score: 0,
    difficulty: 0,
    modifiers: [],
    narrative: []
});

const MODIFIER_LABELS: Record<string, string> = {
    基础: '基础',
    境界: '境界',
    环境: '环境',
    状态: '状态',
    幸运: '幸运',
    装备: '装备'
};

const parseModifier = (part: string): JudgmentModifier | null => {
    const modifierMatch = part.match(/^(基础|境界|环境|状态|幸运|装备)\s*(.*)$/);
    if (!modifierMatch) return null;
    const [, key, restRaw] = modifierMatch;
    const rest = (restRaw || '').trim();
    if (!rest) return null;
    const valueMatch = rest.match(/[+\-]?\d+(?:\.\d+)?/);
    const bracketMatch = rest.match(/[(（]\s*(.*?)[)）]/);
    const bracketContent = bracketMatch?.[1]?.trim() || '';
    const desc = bracketContent
        ? bracketContent.replace(/^[+\-]?\d+(?:\.\d+)?\s*[,，、]?\s*/, '').trim()
        : undefined;
    return {
        key,
        label: MODIFIER_LABELS[key] || key,
        value: valueMatch ? Number(valueMatch[0]) : null,
        raw: valueMatch ? part : rest,
        description: desc || undefined
    };
};

const parseNumericValue = (value: string): number | null => {
    const match = value.match(/[+\-]?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
};

const parseBreakdownItem = (line: string): JudgmentBreakdownItem | null => {
    const normalized = line.trim().replace(/^[\-•·]\s*/, '').trim();
    const match = normalized.match(/^([^：:]+)[：:]\s*([+\-]?\d+(?:\.\d+)?)(?:\s*[(（](.*?)[)）])?/);
    if (!match) return null;
    const [, rawLabel, rawValue, rawDescription] = match;
    return {
        label: rawLabel.trim(),
        value: Number(rawValue),
        valueText: rawValue.trim(),
        raw: normalized,
        description: rawDescription?.trim() || undefined
    };
};

const parseJudgmentBreakdownSections = (lines: string[]): JudgmentBreakdownSections => {
    const sections: JudgmentBreakdownSections = { score: [], difficulty: [] };
    let activeSection: JudgmentBreakdownKind | null = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (/判定值拆解/.test(line)) {
            activeSection = 'score';
            continue;
        }
        if (/难度拆解/.test(line)) {
            activeSection = 'difficulty';
            continue;
        }
        if (/^(合计判定值|合计难度|结果|代价)[：:]/.test(line)) {
            activeSection = null;
            continue;
        }
        if (!activeSection) continue;

        const item = parseBreakdownItem(line);
        if (item) sections[activeSection].push(item);
    }

    return sections;
};

const modifierToBreakdownItem = (modifier: JudgmentModifier): JudgmentBreakdownItem => ({
    label: modifier.label,
    value: modifier.value,
    valueText: typeof modifier.value === 'number' ? `${modifier.value >= 0 ? '+' : ''}${modifier.value}` : modifier.raw,
    raw: modifier.raw,
    description: modifier.description
});

const formatBreakdownValue = (item: JudgmentBreakdownItem, kind: JudgmentBreakdownKind): string => {
    if (typeof item.value !== 'number' || !Number.isFinite(item.value)) return item.valueText || item.raw;
    if (/^[+\-]/.test(item.valueText)) return item.valueText;
    if (kind === 'score' && item.label !== '基础' && item.value > 0) return `+${item.value}`;
    return `${item.value}`;
};

const JUDGMENT_RESULT_PATTERN = /^(?:结果=)?(成功|失败|大成功|大失败|极成功|极失败|胜利|落败|锁定|偏离|致残|重创|肢残|骨折|破防|截脉|格挡|僵持)$/;
const JUDGMENT_FIELD_NAMES = new Set(['触发对象', '对象', '判定值', '难度', '胜方', '败方', '差值', '伤害值', '消耗', '剩余', '后果', '发现度']);

const 剥离串入正文 = (text: string): string => {
    const source = String(text || '');
    const senderMarkerRegex = /(^|[\n｜\s])(?:【\s*)?([^\s【】｜\n:：]{1,16})(?:\s*】)?[:：]/g;
    let match: RegExpExecArray | null = null;
    while ((match = senderMarkerRegex.exec(source)) !== null) {
        const sender = (match[2] || '').trim();
        if (!sender || JUDGMENT_FIELD_NAMES.has(sender)) continue;
        const before = source.slice(0, match.index).trim();
        if (/(?:触发对象|判定角色|对象)\s*$/.test(before)) continue;
        if (!before || !/(成功|失败|大成功|大失败|极成功|极失败|胜利|落败|锁定|偏离|致残|重创|肢残|骨折|破防|截脉|格挡|僵持)/.test(before)) continue;
        return before;
    }
    return source;
};

export const parseJudgmentText = (text: string): ParsedJudgment => {
    const parts = 剥离串入正文(text).split('｜').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return createEmptyJudgment();

    const rawEventName = parts[0] || '判定事件';
    const prefixMatch = rawEventName.match(/^【([^】]+)】\s*(.*)$/);
    const bracketTypeMatch = (prefixMatch?.[2] || rawEventName).match(/^\[([^\]]+)\]\s*(.*)$/);
    const category = bracketTypeMatch?.[1]?.trim() || prefixMatch?.[1]?.trim() || '判定';
    const cleanEventName = (bracketTypeMatch?.[2] || prefixMatch?.[2] || rawEventName).trim();

    const parsed: ParsedJudgment = {
        ...createEmptyJudgment(),
        category,
        modifiers: [],
        eventName: cleanEventName || '判定事件'
    };

    const isResultToken = (token: string) => JUDGMENT_RESULT_PATTERN.test(token);
    
    for (const part of parts) {
        if (part.startsWith('结果=')) {
            parsed.result = part.replace(/^结果=/, '').trim();
        } else if (isResultToken(part)) {
            parsed.result = part;
        }
    }

    if (parsed.result === '未知' && parts.length > 1) {
        const fallbackResult = parts[1];
        const isFieldToken = /^(?:触发对象|对象|判定值|难度|胜方|败方|差值|伤害值|消耗|剩余|后果|发现度)[:：\s]/.test(fallbackResult)
            || /^(基础|境界|环境|状态|幸运|装备)\s*[+\-]?\d/.test(fallbackResult) || fallbackResult.startsWith('结果=');
        if (!isFieldToken) {
            parsed.result = fallbackResult;
        }
    }

    const narrative: string[] = [];

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        let matched = false;
        if (part.startsWith('结果=')) {
            // 已在首轮解析中消费的「结果=」字段，主循环须显式标记为 matched，
            // 否则会被误判为自由叙事而写进 narrative 渲染出来（如「比试｜结果=成功｜基础+3」）。
            parsed.result = part.replace(/^结果=/, '').trim();
            matched = true;
        } else if (isResultToken(part)) {
            parsed.result = part;
            matched = true;
        }

        const targetMatch = part.match(/^(?:触发对象\s+|触发对象[:：]\s*|判定角色\s+|判定角色[:：]\s*|对象[:：]\s*)(.+)$/);
        if (targetMatch) {
            parsed.target = targetMatch[1].trim() || parsed.target;
            matched = true;
            continue;
        }
        const scoreDiffMatch = part.match(/^判定值\s*([+\-]?\d+(?:\.\d+)?)\s*\/\s*难度\s*([+\-]?\d+(?:\.\d+)?)$/);
        if (scoreDiffMatch) {
            parsed.score = Number(scoreDiffMatch[1]);
            parsed.difficulty = Number(scoreDiffMatch[2]);
            matched = true;
            continue;
        }
        const winnerMatch = part.match(/^胜方[:：]\s*(.+)$/);
        if (winnerMatch) {
            parsed.winner = winnerMatch[1].trim();
            matched = true;
            continue;
        }
        const loserMatch = part.match(/^败方[:：]\s*(.+)$/);
        if (loserMatch) {
            parsed.loser = loserMatch[1].trim();
            matched = true;
            continue;
        }
        const deltaMatch = part.match(/^差值\s*([+\-]?\d+(?:\.\d+)?)$/);
        if (deltaMatch) {
            parsed.delta = Number(deltaMatch[1]);
            matched = true;
            continue;
        }
        const damageMatch = part.match(/^伤害值\s*([+\-]?\d+(?:\.\d+)?)$/);
        if (damageMatch) {
            parsed.damage = Number(damageMatch[1]);
            matched = true;
            continue;
        }
        const costMatch = part.match(/^消耗[:：]\s*(.+)$/);
        if (costMatch) {
            parsed.cost = costMatch[1].trim();
            matched = true;
            continue;
        }
        const remainingMatch = part.match(/^剩余[:：]\s*(.+)$/);
        if (remainingMatch) {
            parsed.remaining = remainingMatch[1].trim();
            matched = true;
            continue;
        }
        const consequenceMatch = part.match(/^后果[:：]\s*(.+)$/);
        if (consequenceMatch) {
            parsed.consequence = consequenceMatch[1].trim();
            matched = true;
            continue;
        }
        const discoveryMatch = part.match(/^发现度[:：]\s*(.+)$/);
        if (discoveryMatch) {
            parsed.discovery = discoveryMatch[1].trim();
            matched = true;
            continue;
        }
        const modifier = parseModifier(part);
        if (modifier) {
            parsed.modifiers.push(modifier);
            matched = true;
            continue;
        }
        if (part.startsWith('基础') || part.startsWith('境界') || part.startsWith('环境') || part.startsWith('状态') || part.startsWith('幸运') || part.startsWith('装备')) {
            const key = part.slice(0, 2);
            const valueMatch = part.match(/[+\-]?\d+(?:\.\d+)?/);
            const descMatch = part.match(/[(（](.*?)[)）]/);
            parsed.modifiers.push({
                key,
                label: MODIFIER_LABELS[key] || key,
                value: valueMatch ? Number(valueMatch[0]) : null,
                raw: part,
                description: descMatch ? descMatch[1].trim() : undefined
            });
            matched = true;
        }

        // 未被识别为任何结构化字段的行，视为自由叙事正文，单独保留渲染，避免被吞掉
        if (!matched) narrative.push(part);
    }

    parsed.narrative = narrative.filter(Boolean);

    return parsed;
};

const 提取判定前缀名称 = (prefix?: string): string => {
    const normalized = (prefix || '').trim();
    const match = normalized.match(/^(?:【([^】]+)】|\[([^\]]+)\])$/);
    if (match?.[1] || match?.[2]) return (match[1] || match[2]).trim();
    return match?.[1]?.trim() || normalized;
};

// [修复] 旁白展示不再按句号/问号强行拆成一句一行：
// 换行结构完全交给 AI 自己输出的正文行决定（每个【旁白】/【角色名】行即一个展示段落），
// 代码只做空白规整，不再对正文做句子级重排，避免整段对白/旁白被拆成零散短句行。
const 规整旁白换行 = (value: string): string => (
    String(value || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
);

const 规范化物品引用文本 = (value: unknown): string => (
    typeof value === 'string'
        ? value.trim().replace(/[《》【】\[\]「」『』“”"']/g, '').replace(/\s+/g, '')
        : ''
);

const 查找正文引用物品 = (name: string, inventoryItems?: any[]): any | null => {
    const target = 规范化物品引用文本(name);
    if (!target) return null;
    const items = Array.isArray(inventoryItems) ? inventoryItems : [];
    return items.find((item) => {
        const itemName = 规范化物品引用文本(item?.名称);
        const itemId = 规范化物品引用文本(item?.ID);
        return itemName === target || itemId === target;
    }) || null;
};

type 档案引用目标 =
    | { kind: 'item'; item: any }
    | { kind: 'character_trait'; npc: NPC结构; entry: any; entryKind: 'talent' | 'background' };

const 取NPC稳定ID = (npc: any): string => (
    String(npc?.id || npc?.ID || npc?.姓名 || '').trim()
);

const 查找正文引用角色特质 = (
    name: string,
    socialList?: NPC结构[],
    playerProfile?: 玩家资料
): Extract<档案引用目标, { kind: 'character_trait' }> | null => {
    const target = 规范化物品引用文本(name);
    if (!target) return null;
    // 先搜索玩家自己的天赋/出身
    if (playerProfile) {
        const playerTalents = Array.isArray(playerProfile.天赋列表) ? playerProfile.天赋列表 : [];
        const playerTalent = playerTalents.find((item: any) => 规范化物品引用文本(item?.名称) === target);
        if (playerTalent) return { kind: 'character_trait', npc: playerProfile as any, entry: playerTalent, entryKind: 'talent' };
        const playerBg = playerProfile.出身背景 && typeof playerProfile.出身背景 === 'object' ? playerProfile.出身背景 : null;
        if (playerBg && 规范化物品引用文本(playerBg?.名称) === target) {
            return { kind: 'character_trait', npc: playerProfile as any, entry: playerBg, entryKind: 'background' };
        }
    }
    // 再搜索社交NPC列表
    const list = Array.isArray(socialList) ? socialList : [];
    for (const npc of list) {
        const talents = Array.isArray((npc as any)?.天赋列表) ? (npc as any).天赋列表 : [];
        const talent = talents.find((item: any) => 规范化物品引用文本(item?.名称) === target);
        if (talent) return { kind: 'character_trait', npc, entry: talent, entryKind: 'talent' };
        const background = (npc as any)?.出身背景 && typeof (npc as any).出身背景 === 'object' ? (npc as any).出身背景 : null;
        if (background && 规范化物品引用文本(background?.名称) === target) {
            return { kind: 'character_trait', npc, entry: background, entryKind: 'background' };
        }
    }
    return null;
};

const ItemReferenceButton: React.FC<{
    name: string;
    item: any;
    onOpenInventoryItem?: (itemRef: string) => void;
}> = ({ name, item, onOpenInventoryItem }) => {
    const itemName = typeof item?.名称 === 'string' && item.名称.trim() ? item.名称.trim() : name;
    const itemRef = (typeof item?.ID === 'string' && item.ID.trim()) || itemName;
    const iconUrl = 获取物品已选图标地址(item);
    const quality = typeof item?.品质 === 'string' ? item.品质.trim() : '';
    const type = typeof item?.类型 === 'string' ? item.类型.trim() : '';
    const count = Number(item?.堆叠数量);
    const styles = getRarityStyles(quality);
    const handleClick = () => {
        onOpenInventoryItem?.(itemRef);
    };

    return (
        <span className="group/item-ref relative inline-flex align-baseline">
            <button
                type="button"
                onClick={handleClick}
                className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 align-baseline text-[0.95em] font-bold leading-none shadow-sm transition ${styles.border} ${styles.bg} ${getRarityNameClass(quality)} hover:-translate-y-px hover:shadow-[0_0_12px_rgba(212,175,55,0.24)]`}
                title={`打开背包查看 ${itemName}`}
            >
                <span className="opacity-75">《</span>
                <span className="truncate">{itemName}</span>
                <span className="opacity-75">》</span>
            </button>
            <span className="pointer-events-none absolute left-1/2 bottom-[calc(100%+8px)] z-[9999] hidden w-64 max-w-[72vw] -translate-x-1/2 rounded-lg border border-wuxia-gold/35 bg-[#11100d]/95 p-3 text-left text-xs leading-5 text-amber-50 shadow-2xl backdrop-blur group-hover/item-ref:block group-focus-within/item-ref:block">
                <span className="mb-2 flex items-center gap-3">
                    <span className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${styles.border} ${styles.bg}`}>
                        {iconUrl ? (
                            <img src={iconUrl} alt={itemName} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                            <span className={`text-lg font-black ${styles.text}`}>{itemName.slice(0, 1) || '物'}</span>
                        )}
                    </span>
                    <span className="min-w-0">
                        <span className={`block truncate text-sm font-black ${getRarityNameClass(quality)}`}>{itemName}</span>
                        <span className="mt-1 block text-[11px] text-gray-300">
                            {[type || '未知类型', quality || '未知品质', Number.isFinite(count) && count > 1 ? `x${count}` : ''].filter(Boolean).join(' · ')}
                        </span>
                    </span>
                </span>
                <span className="line-clamp-3 text-gray-200">{typeof item?.描述 === 'string' && item.描述.trim() ? item.描述.trim() : '暂无描述。'}</span>
            </span>
        </span>
    );
};

const CharacterTraitReferenceButton: React.FC<{
    name: string;
    npc: NPC结构 | 玩家资料;
    entry: any;
    entryKind: 'talent' | 'background';
    onOpenNpcDetail?: (npcId: string) => void;
    isPlayer?: boolean;
}> = ({ name, npc, entry, entryKind, onOpenNpcDetail, isPlayer }) => {
    const entryName = typeof entry?.名称 === 'string' && entry.名称.trim() ? entry.名称.trim() : name;
    const npcName = typeof npc?.姓名 === 'string' && npc.姓名.trim() ? npc.姓名.trim() : '未知角色';
    const npcRef = isPlayer ? '__player__' : (取NPC稳定ID(npc) || npcName);
    const label = entryKind === 'talent' ? '天赋' : '出身';
    const displayLabel = isPlayer ? '主角' : npcName;
    const handleClick = () => {
        onOpenNpcDetail?.(npcRef);
    };

    return (
        <span className="group/trait-ref relative inline-flex align-baseline">
            <button
                type="button"
                onClick={handleClick}
                className="inline-flex max-w-full items-center gap-1 rounded border border-violet-400/35 bg-violet-500/10 px-1.5 py-0.5 align-baseline text-[0.95em] font-bold leading-none text-violet-100 shadow-sm transition hover:-translate-y-px hover:border-violet-300/70 hover:bg-violet-500/18 hover:shadow-[0_0_12px_rgba(167,139,250,0.24)]"
                title={`打开 ${displayLabel} 的${label}档案`}
            >
                <span className="opacity-75">《</span>
                <span className="truncate">{entryName}</span>
                <span className="opacity-75">》</span>
            </button>
            <span className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-[9999] hidden w-64 max-w-[72vw] -translate-x-1/2 rounded-lg border border-violet-400/35 bg-[#111020]/95 p-3 text-left text-xs leading-5 text-violet-50 shadow-2xl backdrop-blur group-hover/trait-ref:block group-focus-within/trait-ref:block">
                <span className="mb-2 block">
                    <span className="block truncate text-sm font-black text-violet-100">{entryName}</span>
                    <span className="mt-1 block text-[11px] text-gray-300">{npcName} · {label}</span>
                </span>
                <span className="block text-gray-200">{typeof entry?.效果 === 'string' && entry.效果.trim() ? entry.效果.trim() : (typeof entry?.描述 === 'string' && entry.描述.trim() ? entry.描述.trim() : '暂无效果描述。')}</span>
            </span>
        </span>
    );
};

const 渲染含档案引用文本 = (
    text: string,
    inventoryItems?: any[],
    onOpenInventoryItem?: (itemRef: string) => void,
    socialList?: NPC结构[],
    onOpenNpcDetail?: (npcId: string) => void,
    playerProfile?: 玩家资料
): React.ReactNode[] => {
    const source = String(text || '');
    const parts: React.ReactNode[] = [];
    const regex = /([《【])([^《》【】\n]{1,32})([》】])/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(source)) !== null) {
        const [full, open, rawName, close] = match;
        const isPaired = (open === '《' && close === '》') || (open === '【' && close === '】');
        const item = isPaired ? 查找正文引用物品(rawName, inventoryItems) : null;
        const trait = item ? null : (isPaired ? 查找正文引用角色特质(rawName, socialList, playerProfile) : null);
        if (!item && !trait) continue;
        if (match.index > lastIndex) parts.push(source.slice(lastIndex, match.index));
        if (item) {
            parts.push(
                <ItemReferenceButton
                    key={`item-ref-${match.index}-${rawName}`}
                    name={rawName}
                    item={item}
                    onOpenInventoryItem={onOpenInventoryItem}
                />
            );
        } else if (trait) {
            const isPlayerTrait = playerProfile && trait.npc === playerProfile;
            parts.push(
                <CharacterTraitReferenceButton
                    key={`trait-ref-${match.index}-${rawName}`}
                    name={rawName}
                    npc={trait.npc}
                    entry={trait.entry}
                    entryKind={trait.entryKind}
                    onOpenNpcDetail={onOpenNpcDetail}
                    isPlayer={isPlayerTrait}
                />
            );
        }
        lastIndex = match.index + full.length;
    }
    if (lastIndex < source.length) parts.push(source.slice(lastIndex));
    return parts.length > 0 ? parts : [source];
};

const RawResponseDebugButton: React.FC<{
    onOpen?: () => void;
    className?: string;
}> = ({ onOpen, className = '' }) => {
    if (!onOpen) return null;
    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                onOpen();
            }}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#b58a55] bg-[#fff7e8] text-[#6f3b13] shadow-[0_5px_14px_rgba(111,59,19,0.18)] transition hover:scale-105 hover:border-[#8a5726] hover:bg-[#fff0d2] focus:outline-none focus:ring-2 focus:ring-wuxia-gold/55 ${className}`}
            title="查看本段 AI 原始回复"
            aria-label="查看本段 AI 原始回复"
            data-raw-response-button="true"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
        </button>
    );
};

export const NarratorRenderer: React.FC<{
    text: string;
    visualConfig?: 视觉设置结构;
    inventoryItems?: any[];
    onOpenInventoryItem?: (itemRef: string) => void;
    socialList?: NPC结构[];
    playerProfile?: 玩家资料;
    onOpenNpcDetail?: (npcId: string) => void;
    onOpenRawResponse?: () => void;
}> = ({ text, visualConfig, inventoryItems, onOpenInventoryItem, socialList, playerProfile, onOpenNpcDetail, onOpenRawResponse }) => {
    const style = 构建区域文字样式(visualConfig, '旁白');
    const displayText = useMemo(() => 规整旁白换行(text), [text]);
    return (
        <div className="narrator-renderer w-full my-1 px-8 py-2 pr-12 bg-white/5 backdrop-blur-sm border-x-4 border-wuxia-gold/55 leading-relaxed relative overflow-hidden rounded-md shadow-lg transition-all duration-300" style={style}>
            <RawResponseDebugButton onOpen={onOpenRawResponse} className="absolute right-2 top-2 z-20" />
            <p className="relative z-10 whitespace-pre-wrap break-normal [word-break:normal] [overflow-wrap:break-word] [line-break:strict] tracking-wide" style={{ fontSize: 'inherit', lineHeight: 'inherit' }}>
                {渲染含档案引用文本(displayText, inventoryItems, onOpenInventoryItem, socialList, onOpenNpcDetail, playerProfile)}
            </p>
        </div>
    );
};

const 解析奖励正文 = (text: string): {
    taskTitle: string;
    issuer: string;
    completionLine: string;
    rewardLine: string;
    rewards: string[];
} => {
    const lines = String(text || '')
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean);
    const completionLine = lines.find(line => line.includes('【任务完成】')) || '';
    const rewardLine = lines.find(line => line.includes('【奖励到账】')) || '';
    const taskTitle = (
        rewardLine.match(/「([^」]+)」/)?.[1]
        || completionLine.match(/「([^」]+)」/)?.[1]
        || '任务'
    ).trim();
    const issuer = (
        rewardLine.match(/由(.+?)发放/)?.[1]
        || completionLine.match(/已由(.+?)确认完成/)?.[1]
        || '任务发布人'
    ).trim();
    const rewardBody = (
        rewardLine.match(/发放[：:]\s*([\s\S]*?)(?:。|$)/)?.[1]
        || ''
    ).trim();
    const rewards = rewardBody
        .split(/[、，,；;]/)
        .map(item => item.trim())
        .filter(Boolean)
        .filter(item => !/背包|贡献|技艺和属性点已同步/.test(item));
    return { taskTitle, issuer, completionLine, rewardLine, rewards };
};

const 奖励标签样式 = (reward: string): string => {
    if (/物品|x\d+|×\d+|\*\d+/i.test(reward)) return 'border-emerald-500/35 bg-emerald-500/12 text-emerald-950';
    if (/贡献|信用|额度/.test(reward)) return 'border-amber-500/45 bg-amber-400/18 text-amber-950';
    if (/技艺|技能|熟练度/.test(reward)) return 'border-sky-500/35 bg-sky-500/12 text-sky-950';
    if (/属性点|境界/.test(reward)) return 'border-violet-500/35 bg-violet-500/12 text-violet-950';
    if (/铜钱|银子|银两|元宝|金元宝/.test(reward)) return 'border-yellow-600/35 bg-yellow-400/16 text-yellow-950';
    return 'border-stone-400/45 bg-stone-200/65 text-stone-950';
};

export const RewardRenderer: React.FC<{ text: string; visualConfig?: 视觉设置结构; onOpenRawResponse?: () => void }> = ({ text, visualConfig, onOpenRawResponse }) => {
    const style = 构建区域文字样式(visualConfig, '旁白');
    const parsed = 解析奖励正文(text);
    return (
        <div className="reward-renderer w-full my-4 sm:my-5 px-1.5 sm:px-4 flex justify-center" data-reward-card="true" style={style}>
            <div className="relative w-full sm:w-11/12 md:w-5/6 lg:w-3/4 overflow-hidden rounded-xl border-2 border-amber-500/45 bg-[#fff8e6] text-[#24170a] shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
                <RawResponseDebugButton onOpen={onOpenRawResponse} className="absolute right-2 top-2 z-20" />
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-emerald-500 to-sky-500" />
                <div className="flex flex-col gap-3 px-4 py-4 pr-12 sm:px-5 sm:py-5 sm:pr-14">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-600/35 bg-amber-500/18 text-amber-800 shadow-sm">
                                <IconCoins size={22} />
                            </span>
                            <div className="min-w-0">
                                <div className="text-[11px] font-black tracking-[0.18em] text-amber-800/80">任务完成</div>
                                <div className="truncate text-base font-black text-stone-950 sm:text-lg">{parsed.taskTitle}</div>
                            </div>
                        </div>
                        <div className="max-w-full rounded-lg border border-stone-300 bg-white/70 px-3 py-1.5 text-[12px] font-bold text-stone-800 shadow-sm">
                            {parsed.issuer} 确认并发放
                        </div>
                    </div>

                    {parsed.rewards.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {parsed.rewards.map((reward, index) => (
                                <span
                                    key={`${reward}-${index}`}
                                    className={`max-w-full rounded-lg border px-2.5 py-1.5 text-[12px] font-black leading-relaxed shadow-sm ${奖励标签样式(reward)}`}
                                    title={reward}
                                >
                                    {reward}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-lg border border-stone-300 bg-white/70 px-3 py-2 text-[13px] font-semibold text-stone-700">
                            奖励说明已确认，相关变量已同步。
                        </div>
                    )}

                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] font-semibold leading-relaxed text-emerald-950">
                        背包、贡献、技艺、属性点等成长项已同步写入当前存档。
                    </div>
                </div>
            </div>
        </div>
    );
};

const 规范化称呼 = (value: string): string => value.trim().replace(/^[【\[\(（「『]+/, '').replace(/[】\]\)）」』]+$/, '').trim();

const 获取NPC头像地址 = (sender: string, socialList?: NPC结构[]): string => {
    const normalizedSender = 规范化称呼(sender || '');
    if (!normalizedSender) return '';
    const candidates = (Array.isArray(socialList) ? socialList : []).filter((npc) => {
        const name = typeof npc?.姓名 === 'string' ? 规范化称呼(npc.姓名) : '';
        return name === normalizedSender;
    });
    for (const npc of candidates) {
        const history = Array.isArray(npc?.图片档案?.生图历史) ? npc.图片档案.生图历史 : [];
        const selectedAvatarImageId = typeof npc?.图片档案?.已选头像图片ID === 'string'
            ? npc.图片档案.已选头像图片ID.trim()
            : '';
        const selectedAvatarRecord = selectedAvatarImageId
            ? history.find((item) => item?.id === selectedAvatarImageId && item?.状态 === 'success' && 获取图片展示地址(item))
            : undefined;
        if (获取图片展示地址(selectedAvatarRecord)) {
            return 获取图片展示地址(selectedAvatarRecord);
        }
        const avatarRecord = history.find((item) => item?.状态 === 'success' && item?.构图 === '头像' && 获取图片展示地址(item));
        if (获取图片展示地址(avatarRecord)) {
            return 获取图片展示地址(avatarRecord);
        }
        const selectedPortraitImageId = typeof npc?.图片档案?.已选立绘图片ID === 'string'
            ? npc.图片档案.已选立绘图片ID.trim()
            : '';
        const selectedPortraitRecord = selectedPortraitImageId
            ? history.find((item) => item?.id === selectedPortraitImageId && item?.状态 === 'success' && 获取图片展示地址(item))
            : undefined;
        if (获取图片展示地址(selectedPortraitRecord)) {
            return 获取图片展示地址(selectedPortraitRecord);
        }
        const portraitRecord = history.find((item) => item?.状态 === 'success' && (item?.构图 === '半身' || item?.构图 === '立绘') && item?.图片用途 !== '背景' && 获取图片展示地址(item));
        if (获取图片展示地址(portraitRecord)) {
            return 获取图片展示地址(portraitRecord);
        }
        const profileUrl = 获取图片资源文本地址((npc as any)?.头像图片URL || (npc as any)?.立绘图片URL);
        if (profileUrl) {
            return profileUrl;
        }
    }
    return '';
};

const 是否主角称呼 = (sender: string, playerName?: string): boolean => {
    const normalized = 规范化称呼(sender);
    if (!normalized) return false;
    if (normalized === '你' || normalized === '我' || normalized === '主角') return true;
    if (playerName && normalized === playerName.trim()) return true;
    return false;
};

const 获取对白显示名称 = (sender: string, playerName?: string): string => {
    const fallback = (sender || '').trim() || '旁白';
    if (是否主角称呼(sender, playerName)) {
        return (playerName || '').trim() || fallback;
    }
    return fallback;
};

type 玩家资料 = {
    姓名?: string;
    头像图片URL?: string;
    天赋列表?: any[];
    出身背景?: any;
};

const 获取匹配NPC = (sender: string, socialList?: NPC结构[]): NPC结构 | null => {
    const normalizedSender = 规范化称呼(sender || '');
    if (!normalizedSender) return null;
    const list = Array.isArray(socialList) ? socialList : [];
    return list.find((npc) => {
        const name = typeof npc?.姓名 === 'string' ? 规范化称呼(npc.姓名) : '';
        return name === normalizedSender;
    }) || null;
};

export const CharacterRenderer: React.FC<{
    sender: string;
    text: string;
    visualConfig?: 视觉设置结构;
    socialList?: NPC结构[];
    playerProfile?: 玩家资料;
    onOpenNpcDetail?: (npcId: string) => void;
    inventoryItems?: any[];
    onOpenInventoryItem?: (itemRef: string) => void;
    onOpenRawResponse?: () => void;
}> = ({ sender, text, visualConfig, socialList, playerProfile, onOpenNpcDetail, inventoryItems, onOpenInventoryItem, onOpenRawResponse }) => {
    use图片资源回源预取(playerProfile?.头像图片URL, socialList);
    const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
    const displayText = (text || '').replace(/\s*\n+\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
    const displaySender = 获取对白显示名称(sender, playerProfile?.姓名);
    const colors = ['bg-red-900', 'bg-blue-900', 'bg-emerald-900', 'bg-violet-900', 'bg-amber-900'];
    const colorIdx = displaySender.charCodeAt(0) % colors.length;
    const bgClass = colors[colorIdx];
    const style = 构建区域文字样式(visualConfig, '角色对话');
    const usePlayerAvatar = 是否主角称呼(sender, playerProfile?.姓名);
    const matchedNpc = usePlayerAvatar ? null : 获取匹配NPC(sender, socialList);
    const avatarUrl = usePlayerAvatar ? 获取图片资源文本地址(playerProfile?.头像图片URL) : 获取NPC头像地址(sender, socialList);
    const handleAvatarClick = () => {
        if (matchedNpc?.id && onOpenNpcDetail) {
            onOpenNpcDetail(matchedNpc.id);
            return;
        }
        if (avatarUrl) {
            setAvatarPreviewOpen(true);
        }
    };
    const roleNameStyle: React.CSSProperties = {
        ...style,
        color: '#f3f4f6',
        fontSize: `clamp(10px, calc(${style.fontSize || '16px'} * 0.75), 14px)`,
        lineHeight: 1.2,
        fontWeight: 'bold'
    };

    return (
        <div className="flex w-full my-3 items-start group pl-1 min-w-0">
            <div className="flex flex-col items-center mr-2.5 sm:mr-5 relative z-20 shrink-0">
                <div className={`chat-character-avatar-tile w-11 h-11 sm:w-16 sm:h-16 ${avatarUrl ? 'bg-black/25' : bgClass} rounded-xl sm:rounded-2xl flex items-center justify-center text-white/90 font-black text-lg sm:text-2xl shadow-[0_6px_14px_rgba(0,0,0,0.24)] border border-white/10 sm:border-2 ring-1 ring-wuxia-gold/20 relative overflow-hidden transition-all group-hover:scale-105 group-hover:ring-wuxia-gold/40 duration-500`}>
                    <div className="chat-character-avatar-noise absolute inset-0 bg-noise opacity-20 mix-blend-overlay"></div>
                    {avatarUrl ? (
                        <button
                            type="button"
                            onClick={handleAvatarClick}
                            className="relative z-10 h-full w-full"
                            aria-label={matchedNpc?.id ? `打开 ${displaySender} 人物详情` : `放大查看 ${displaySender} 头像`}
                        >
                            <img src={avatarUrl} alt={`${displaySender} 头像`} className="w-full h-full object-cover" />
                        </button>
                    ) : (
                        <span className="relative z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{displaySender[0]}</span>
                    )}
                    <div className="absolute inset-0 border border-inset border-white/5 pointer-events-none"></div>
                </div>
                <div className="chat-character-nameplate mt-1.5 sm:mt-2 bg-black/70 border border-wuxia-gold/30 px-2 sm:px-3 py-0.5 rounded shadow-[0_3px_8px_rgba(0,0,0,0.22)] z-20 max-w-[64px] sm:max-w-[90px] text-center backdrop-blur-sm relative">
                    <div className="chat-character-nameplate-dot absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-wuxia-gold/40 rounded-full"></div>
                    <span className="chat-character-name tracking-wider truncate block" style={roleNameStyle}>{displaySender}</span>
                </div>
            </div>
            <div className="relative flex-1 mt-0.5 sm:mt-1 min-w-0">
                <div className="mobile-chat-dialogue-bubble relative bg-[#fcfaf7] px-3.5 sm:px-6 py-3 pr-12 sm:py-4 sm:pr-14 rounded-xl sm:rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.15)] border border-black/10 z-10 min-h-[52px] sm:min-h-[64px] flex items-center group-hover:border-wuxia-gold/40 transition-colors duration-500" data-mobile-chat-bubble="true">
                    <RawResponseDebugButton onOpen={onOpenRawResponse} className="absolute right-2 top-2 z-20" />
                    <div className="absolute top-3.5 sm:top-4 -left-1.5 w-3 h-3 sm:w-4 sm:h-4 bg-[#fcfaf7] rotate-45 border-l border-b border-black/10 -z-10"></div>
                    <p className="font-medium relative z-10 tracking-wide whitespace-normal break-words leading-relaxed text-[#1a1a1a]" style={style}>
                        {渲染含档案引用文本(displayText, inventoryItems, onOpenInventoryItem, socialList, onOpenNpcDetail, playerProfile)}
                    </p>
                </div>
            </div>
            {avatarUrl && avatarPreviewOpen && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[1002] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                    onClick={() => setAvatarPreviewOpen(false)}
                >
                    <div
                        className="relative max-h-[88vh] max-w-[88vw]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setAvatarPreviewOpen(false)}
                            className="absolute top-2 right-2 z-10 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-xs text-white/90 transition hover:bg-black/75"
                        >
                            关闭
                        </button>
                        <img
                            src={avatarUrl}
                            alt={`${sender} 头像`}
                            className="max-h-[88vh] max-w-[88vw] rounded-2xl border border-white/10 object-contain shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
                        />
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export const JudgmentRenderer: React.FC<{ text: string; thoughtBlock?: JudgmentThoughtBlock; isNsfw?: boolean; visualConfig?: 视觉设置结构; prefix?: string; onOpenRawResponse?: () => void }> = ({ text, thoughtBlock, isNsfw, visualConfig, prefix, onOpenRawResponse }) => {
    const parsed = parseJudgmentText(text);
    const [isExpanded, setIsExpanded] = useState(true);
    const [showThought, setShowThought] = useState(true);
    const thoughtLines = useMemo(() => (thoughtBlock?.text || thoughtBlock?.raw || '')
        .replace(/^【\s*(?:NSFW)?判定\s*】.*$/gmi, '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean), [thoughtBlock?.raw, thoughtBlock?.text]);
    const thoughtBreakdowns = useMemo(() => parseJudgmentBreakdownSections(thoughtLines), [thoughtLines]);
    
    const scoreValue = parsed.score;
    const difficultyValue = parsed.difficulty;
    const hasScorePair = Number.isFinite(scoreValue) && Number.isFinite(difficultyValue) && (scoreValue !== 0 || difficultyValue !== 0);
    const scoreDelta = hasScorePair ? scoreValue - difficultyValue : null;
    const result = 根据差额校正判定结果(parsed.result, scoreDelta);
    const style = 构建区域文字样式(visualConfig, '判定');
    const displayCategory = parsed.category !== '判定'
        ? parsed.category
        : (提取判定前缀名称(prefix) || parsed.category);
    const scoreBreakdownItems = thoughtBreakdowns.score.length > 0
        ? thoughtBreakdowns.score
        : parsed.modifiers.map(modifierToBreakdownItem);
    const difficultyBreakdownItems = thoughtBreakdowns.difficulty;
    const summaryItems = [
        parsed.winner ? `胜方：${parsed.winner}` : '',
        parsed.loser ? `败方：${parsed.loser}` : '',
        parsed.discovery ? `发现度：${parsed.discovery}` : '',
        parsed.consequence ? `后果：${parsed.consequence}` : ''
    ].filter(Boolean);

    const isSuccess = /(成功|大成功|极成功|胜方|锁定)/.test(result) && !/(失败|大失败|极失败|败方|偏离)/.test(result);
    const isCrit = /(大成功|极成功|大失败|极失败|致残|重创)/.test(result);

    const getTheme = () => {
        if (isNsfw) return {
            border: 'border-pink-500/50',
            bg: 'bg-gradient-to-br from-pink-950/90 to-purple-900/90',
            accent: 'text-pink-400',
            successColor: isSuccess ? 'text-pink-300' : 'text-pink-500/70',
            bar: 'bg-pink-500',
            icon: <IconHeart size={22} />,
            glow: 'shadow-[0_0_15px_rgba(236,72,153,0.3)]'
        };

        const categoryKey = `${prefix || ''} ${displayCategory}`.trim();
        if (categoryKey.includes('洞察') || categoryKey.includes('瞄准') || categoryKey.includes('识破')) return {
            border: 'border-amber-500/50',
            bg: 'bg-gradient-to-br from-[#1a1500]/95 to-black/95',
            accent: 'text-amber-400',
            successColor: isSuccess ? 'text-amber-200' : 'text-amber-600',
            bar: 'bg-amber-500',
            icon: <IconEye size={22} />,
            glow: 'shadow-[0_0_15px_rgba(245,158,11,0.3)]'
        };
        if (categoryKey.includes('反馈') || categoryKey.includes('消耗') || categoryKey.includes('衰退')) return {
            border: 'border-emerald-500/50',
            bg: 'bg-gradient-to-br from-[#001a0a]/95 to-black/95',
            accent: 'text-emerald-400',
            successColor: isSuccess ? 'text-emerald-200' : 'text-emerald-600',
            bar: 'bg-emerald-500',
            icon: <IconBattery size={22} />,
            glow: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]'
        };
        if (categoryKey.includes('先机') || categoryKey.includes('防御') || categoryKey.includes('化解') || categoryKey.includes('闪避') || categoryKey.includes('对策')) return {
            border: 'border-cyan-500/50',
            bg: 'bg-gradient-to-br from-[#001a1a]/95 to-black/95',
            accent: 'text-cyan-400',
            successColor: isSuccess ? 'text-cyan-200' : 'text-cyan-600',
            bar: 'bg-cyan-500',
            icon: <IconShield size={22} />,
            glow: 'shadow-[0_0_15px_rgba(6,182,212,0.3)]'
        };
        if (categoryKey.includes('态势')) return {
            border: 'border-violet-500/50',
            bg: 'bg-gradient-to-br from-[#12001a]/95 to-black/95',
            accent: 'text-violet-300',
            successColor: isSuccess ? 'text-violet-200' : 'text-violet-500',
            bar: 'bg-violet-500',
            icon: <IconCompass size={22} />,
            glow: 'shadow-[0_0_15px_rgba(139,92,246,0.28)]'
        };
        if (categoryKey.includes('接战') || categoryKey.includes('对撞') || categoryKey.includes('对抗') || categoryKey.includes('伤害') || categoryKey.includes('反击')) return {
            border: 'border-orange-500/50',
            bg: 'bg-gradient-to-br from-[#1a0f00]/95 to-black/95',
            accent: 'text-orange-400',
            successColor: isSuccess ? 'text-orange-200' : 'text-orange-600',
            bar: 'bg-orange-500',
            icon: <IconExplosion size={22} />,
            glow: 'shadow-[0_0_15px_rgba(249,115,22,0.3)]'
        };

        return {
            border: isSuccess ? 'border-wuxia-gold/50' : 'border-gray-600/50',
            bg: isSuccess ? 'bg-gradient-to-br from-[#1a1500]/90 to-black/90' : 'bg-gradient-to-br from-gray-900/90 to-black/90',
            accent: isSuccess ? 'text-wuxia-gold' : 'text-gray-400',
            successColor: isSuccess ? 'text-yellow-200' : 'text-gray-300',
            bar: isSuccess ? 'bg-wuxia-gold' : 'bg-gray-500',
            icon: <IconDice size={22} />,
            glow: isSuccess ? 'shadow-[0_0_15px_rgba(212,175,55,0.2)]' : ''
        };
    };

    const theme = getTheme();
    const renderBreakdownSection = (
        title: string,
        items: JudgmentBreakdownItem[],
        kind: JudgmentBreakdownKind,
        value: number,
        fallback: string
    ) => (
        <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[12px] sm:text-[13px] font-black tracking-[0.16em] text-wuxia-gold/95">{title}</span>
                <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-base sm:text-lg font-black text-gray-100">{value}</span>
            </div>
            {items.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {items.map((item, index) => {
                        const isPositive = typeof item.value === 'number' && item.value > 0;
                        const isNegative = typeof item.value === 'number' && item.value < 0;
                        const titleText = `${item.label}：${formatBreakdownValue(item, kind)}${item.description ? `（${item.description}）` : ''}`;
                        return (
                            <div
                                key={`${kind}-${item.label}-${index}`}
                                title={titleText}
                                className={`min-w-0 max-w-full rounded-lg border px-2.5 sm:px-3 py-1.5 text-[12px] sm:text-[13px] leading-relaxed transition-colors ${
                                    isPositive ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100' :
                                    isNegative ? 'border-rose-500/40 bg-rose-500/10 text-rose-100' :
                                    'border-white/10 bg-white/5 text-gray-100'
                                }`}
                            >
                                <span className="mr-1.5 font-bold text-gray-200">{item.label}</span>
                                <span className="mr-1.5 font-mono font-black">{formatBreakdownValue(item, kind)}</span>
                                {item.description && (
                                    <span className="text-gray-300">{item.description}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] sm:text-[13px] font-semibold text-gray-300">
                    {fallback}
                </div>
            )}
        </div>
    );

    return (
        <div className="judgment-renderer mx-auto w-full max-w-4xl my-4 sm:my-6 px-1.5 sm:px-3 relative group transition-all duration-500 transform hover:scale-[1.01] flex justify-center" data-judgment-card="true" style={style}>
            {/* 动态背景发光 */}
            <div className={`absolute inset-0 w-full mx-auto rounded-xl ${theme.glow} opacity-40 blur-xl -z-10 transition-opacity group-hover:opacity-70`}></div>
            
            <div className={`relative z-10 w-full border-2 ${theme.border} rounded-xl shadow-2xl overflow-hidden ${theme.bg} backdrop-blur-md`} style={{ isolation: 'isolate', backgroundColor: 'rgba(5,5,5,0.96)' }}>
                <RawResponseDebugButton onOpen={onOpenRawResponse} className="absolute right-2 top-2 z-30" />
                {/* 顶部标题栏 */}
                <button
                    type="button"
                    className="relative w-full flex items-center justify-between gap-1 sm:gap-4 px-2 pr-12 sm:px-4 sm:pr-14 py-2 sm:py-3 border-b border-white/10 bg-black/40 text-left transition-colors duration-300 hover:bg-black/50"
                    onClick={() => setIsExpanded(prev => !prev)}
                >
                    <div className="flex items-center gap-1 sm:gap-2 min-w-0 pr-1 sm:pr-4 flex-1">
                        <span className="shrink-0 filter drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">{theme.icon}</span>
                        <span className="text-[11px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-200 shrink-0">{displayCategory}</span>
                        <span className={`font-black text-sm sm:text-lg tracking-[0.08em] sm:tracking-[0.16em] ${theme.accent} truncate`} style={{ fontFamily: style.fontFamily, fontStyle: style.fontStyle }}>{parsed.eventName}</span>
                    </div>

                    {!isExpanded && (
                        <div className={`text-base sm:text-xl font-black italic tracking-widest sm:tracking-[0.16em] ${theme.successColor} drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] shrink-0 px-1 sm:px-2`} style={{ fontFamily: style.fontFamily }}>
                            {result}
                        </div>
                    )}
                    
                    <div className="flex items-center gap-1 sm:gap-3 shrink-0 ml-auto">
                        {isExpanded && (
                            <div className="hidden sm:flex text-[10px] bg-white/5 px-2.5 py-1 rounded-full text-gray-400 border border-white/10 backdrop-blur-sm">
                                <span className="opacity-40 mr-1.5 font-sans tracking-tighter">判定角色</span>
                                <span className="text-gray-200 font-bold max-w-[80px] truncate">{parsed.target}</span>
                            </div>
                        )}
                        <span className="text-[9px] font-mono opacity-50 text-gray-300 border border-white/10 px-1 py-0.5 rounded">{isExpanded ? '收起' : '展开'}</span>
                    </div>
                </button>

                {isExpanded && (
                <div className="p-4 sm:p-6 flex flex-col items-center relative">
                    {/* 暴击/大成功时的背景扫光 */}
                    {isCrit && (
                        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-12 bg-gradient-to-r from-transparent via-white to-transparent rotate-[35deg] animate-sweep"></div>
                        </div>
                    )}

                    {hasScorePair && (
                        <div className="w-full max-w-4xl mb-4 sm:mb-6 relative mt-1 sm:mt-2 font-sans">
                            <div className="rounded-2xl border border-white/12 bg-black/35 p-3 sm:p-4 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
                                {renderBreakdownSection('判定值拆解细节', scoreBreakdownItems, 'score', scoreValue, '暂无判定值拆解，使用最终判定值。')}

                                <div className="my-3 sm:my-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
                                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-right">
                                        <div className="text-[10px] sm:text-[11px] font-black tracking-[0.18em] text-gray-400">判定值</div>
                                        <div className={`font-mono text-2xl sm:text-3xl font-black ${theme.successColor}`}>{scoreValue}</div>
                                    </div>
                                    <div className={`rounded-2xl border-2 px-4 sm:px-6 py-3 text-center shadow-[0_12px_28px_rgba(0,0,0,0.42)] ${isSuccess ? 'border-wuxia-gold/60 bg-wuxia-gold/12 text-wuxia-gold' : 'border-gray-500/50 bg-black/65 text-gray-100'}`}>
                                        <div className="text-[10px] sm:text-[11px] font-black tracking-[0.2em] opacity-80">差额</div>
                                        <div className="font-mono text-3xl sm:text-4xl font-black leading-tight">
                                            {scoreDelta !== null && scoreDelta > 0 ? '+' : ''}{scoreDelta}
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left">
                                        <div className="text-[10px] sm:text-[11px] font-black tracking-[0.18em] text-gray-400">难度值</div>
                                        <div className="font-mono text-2xl sm:text-3xl font-black text-gray-100">{difficultyValue}</div>
                                    </div>
                                </div>

                                {renderBreakdownSection('难度拆解细节', difficultyBreakdownItems, 'difficulty', difficultyValue, '暂无难度拆解，使用最终难度值。')}
                            </div>
                        </div>
                    )}

                    <div className="w-full flex flex-col items-center text-center">
                        <div className={`text-2xl sm:text-3xl font-black italic tracking-[0.2em] sm:tracking-[0.25em] mb-3 sm:mb-5 ${theme.successColor} drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] filter`} style={{ fontFamily: style.fontFamily }}>{result}</div>

                        {parsed.narrative && parsed.narrative.length > 0 && (
                            <div className="w-full max-w-4xl mb-4 px-4 py-3 rounded-xl border border-white/10 bg-black/40 text-left text-sm sm:text-[15px] leading-7 text-gray-200 whitespace-pre-wrap break-words font-sans">
                                {parsed.narrative.join('\n')}
                            </div>
                        )}

                        {/* 战斗核心数值区域 */}
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center max-w-full px-2 mb-4 sm:mb-5">
                            {parsed.target !== '自身' && (
                                <div className="flex items-center text-[10px] sm:text-[11px] bg-black/50 border border-white/10 rounded-lg overflow-hidden shrink-0">
                                    <span className="px-2 py-1 text-gray-500 bg-white/5">判定角色</span>
                                    <span className="px-2 py-1 text-gray-200 font-bold max-w-[100px] truncate">{parsed.target}</span>
                                </div>
                            )}

                            {typeof parsed.damage === 'number' && (
                                <div className="flex items-center text-[11px] sm:text-[13px] bg-rose-950/40 border border-rose-500/50 rounded-lg overflow-hidden shrink-0 shadow-[0_0_10px_rgba(244,63,94,0.3)] animate-pulse">
                                    <span className="px-2 py-1 bg-rose-500/20 text-rose-300 font-bold tracking-widest">伤害</span>
                                    <span className="px-2.5 py-1 text-rose-100 font-black font-mono">-{parsed.damage}</span>
                                </div>
                            )}

                            {parsed.cost && (
                                <div className="flex items-center text-[10px] sm:text-[11px] bg-cyan-950/40 border border-cyan-500/30 rounded-lg overflow-hidden shrink-0">
                                    <span className="px-2 py-1 bg-cyan-500/10 text-cyan-400">消耗</span>
                                    <span className="px-2 py-1 text-cyan-200 font-bold">{parsed.cost}</span>
                                </div>
                            )}
                            
                            {parsed.remaining && (
                                <div className="flex items-center text-[10px] sm:text-[11px] bg-emerald-950/40 border border-emerald-500/30 rounded-lg overflow-hidden shrink-0">
                                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400">剩余</span>
                                    <span className="px-2 py-1 text-emerald-200 font-bold">{parsed.remaining}</span>
                                </div>
                            )}
                            
                            {!hasScorePair && (typeof parsed.delta === 'number' || typeof scoreDelta === 'number') && (
                                <div className="flex items-center text-[10px] sm:text-[11px] bg-amber-950/40 border border-amber-500/30 rounded-lg overflow-hidden shrink-0 hover:bg-amber-900/40 transition-colors">
                                    <span className="px-2 py-1 bg-amber-500/10 text-amber-500">差额</span>
                                    <span className={`px-2 py-1 font-bold font-mono ${(typeof parsed.delta === 'number' ? parsed.delta : scoreDelta!) >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                                        {(typeof parsed.delta === 'number' ? parsed.delta : scoreDelta!) > 0 ? '+' : ''}{(typeof parsed.delta === 'number' ? parsed.delta : scoreDelta!)}
                                    </span>
                                </div>
                            )}
                        </div>

                        {summaryItems.length > 0 && (
                            <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center max-w-[95%] mb-4">
                                {summaryItems.map((item, i) => (
                                    <div key={`${item}-${i}`} className="text-[9px] sm:text-[10px] px-2.5 sm:px-3 py-1 rounded border border-white/5 bg-black/40 text-gray-300 whitespace-nowrap">
                                        {item}
                                    </div>
                                ))}
                            </div>
                        )}

                        {!hasScorePair && (
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center max-w-full px-2">
                            {parsed.modifiers.map((detail, i) => {
                                const isPositive = typeof detail.value === 'number' && detail.value > 0;
                                const isNegative = typeof detail.value === 'number' && detail.value < 0;
                                
                                return (
                                    <div 
                                        key={`${detail.key}-${i}`} 
                                        className={`text-[10px] sm:text-[11px] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded border backdrop-blur-md transition-all hover:translate-y-[-2px] flex items-center gap-1.5 ${
                                            isPositive ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 shadow-[0_2px_8px_rgba(16,185,129,0.2)]' : 
                                            isNegative ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 shadow-[0_2px_8px_rgba(244,63,94,0.2)]' : 
                                            'border-white/10 bg-white/5 text-gray-400'
                                        } whitespace-nowrap`}
                                    >
                                        <span className="opacity-60 font-sans tracking-tight uppercase">{detail.label}</span>
                                        <span className="font-black font-mono text-[11px] sm:text-xs">
                                            {detail.value === null ? detail.raw : `${detail.value >= 0 ? `+${detail.value}` : detail.value}`}
                                        </span>
                                        {detail.description && (
                                            <span className="ml-0.5 opacity-90 text-[9px] sm:text-[10px] bg-gradient-to-b from-white/10 to-transparent px-1.5 py-0.5 rounded-sm border border-white/10 italic text-white shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{detail.description}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        )}
                        
                        {/* 判定思考展开 */}
                        {thoughtLines.length > 0 && (
                            <div className="w-full mt-6 pt-4 border-t border-white/5 text-left">
                                <button
                                    type="button"
                                    className={`w-full flex items-center justify-between gap-3 px-4 py-2 rounded-xl border transition-all duration-300 ${showThought ? 'bg-white/10 border-white/20 text-white' : 'bg-black/40 border-white/5 text-gray-400 hover:text-white hover:border-white/10'}`}
                                    onClick={() => setShowThought(prev => !prev)}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`w-1.5 h-1.5 rounded-full ${theme.bar} ${showThought ? 'animate-pulse' : ''}`}></div>
                                        <span className="text-[12px] font-bold tracking-[0.16em] opacity-90">判定思考</span>
                                    </div>
                                    <span className="text-[9px] font-mono opacity-50">{showThought ? '收起' : '展开'}</span>
                                </button>
                                {showThought && (
                                    <div className="mt-3 rounded-xl border border-white/10 bg-black/70 p-4 text-sm sm:text-[15px] leading-7 sm:leading-8 text-gray-200 whitespace-pre-wrap break-words font-sans animate-in fade-in slide-in-from-top-2">
                                        {thoughtLines.join('\n')}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                )}
            </div>
            {isCrit && <div className={`absolute inset-0 w-full sm:w-11/12 md:w-5/6 lg:w-3/4 mx-auto rounded-xl bg-gradient-to-r ${isNsfw ? 'from-pink-500/20' : 'from-wuxia-gold/20'} to-transparent blur-md -z-10`}></div>}
        </div>
    );
};

// ─── 酒馆预设 HTML 渲染器 ───

/** 沙箱 iframe 加载中的占位 UI */
const SandboxedCardSkeleton: React.FC = () => (
    <div className="w-full my-1 px-4 py-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg animate-pulse">
        <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
        <div className="h-4 bg-white/10 rounded w-1/2" />
    </div>
);

/**
 * 酒馆预设 HTML 内容渲染器
 *
 * 根据 htmlRenderMode 选择渲染方式：
 * - 'sandbox': 含 <script> 的 JS 交互产出 → 沙箱 iframe
 * - 'purify': 仅 HTML 美化产出 → DOMPurify 清洗后 dangerouslySetInnerHTML
 */
export const TavernHtmlRenderer: React.FC<{
    /** DOMPurify 清洗后的安全 HTML */
    htmlContent: string;
    /** 渲染模式 */
    htmlRenderMode: 'sandbox' | 'purify';
    /** 沙箱桥接动作回调 */
    onTavernAction?: (action: 酒馆沙箱动作) => void;
    /** 额外 CSS 类名 */
    className?: string;
}> = ({ htmlContent, htmlRenderMode, onTavernAction, className = '' }) => {
    // 沙箱 iframe 模式（含 JS 交互）
    if (htmlRenderMode === 'sandbox' && onTavernAction) {
        return (
            <Suspense fallback={<SandboxedCardSkeleton />}>
                <SandboxedCard
                    htmlContent={htmlContent}
                    onAction={onTavernAction}
                    className={className}
                />
            </Suspense>
        );
    }

    // DOMPurify 清洗后的安全 HTML 渲染
    if (htmlRenderMode === 'purify') {
        return (
            <div
                className={`tavern-html-content w-full my-1 px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg prose prose-invert prose-sm max-w-none ${className}`}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
        );
    }

    // fallback: 沙箱模式但没有 onTavernAction，降级为文本显示
    if (htmlRenderMode === 'sandbox') {
        return (
            <div className="tavern-html-fallback w-full my-1 px-4 py-2 bg-white/5 backdrop-blur-sm border border-amber-500/30 rounded-lg">
                <p className="text-[11px] text-amber-400/80 mb-1">🔗 酒馆 JS 交互卡片（桥接未连接）</p>
                <pre className="text-xs text-gray-300/60 whitespace-pre-wrap max-h-32 overflow-auto">{htmlContent}</pre>
            </div>
        );
    }

    return null;
};
