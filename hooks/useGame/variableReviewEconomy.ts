import type { OpeningConfig } from '../../types';
import { normalizeNpcNameKey } from '../../utils/npcName';
import { 获取角色金钱BaseAmount, 计算角色货币底层总值, 获取世界观货币层级配置, 获取货币显示模式, 题材货币字段别名 } from '../../utils/currencyDisplay';
import { 从物品列表汇总角色货币 } from './stateTransforms';
import { stableVariableReviewJson } from './variableReviewSnapshot';

// 与生产规范化共用实体货币汇总；钱包、baseAmount和实体数量不是三笔财富。
export const extractReviewEconomicSnapshot = (state: any, openingConfig?: OpeningConfig) => {
    const role = state?.角色 || {};
    const items: any[] = Array.isArray(role.物品列表) ? role.物品列表 : [];
    const mode = 获取货币显示模式(openingConfig, role);
    const tiers = 获取世界观货币层级配置(openingConfig?.modeRuntimeProfile, mode);
    const wallet = 从物品列表汇总角色货币(items, role.金钱 || {});
    const known = new Set(['baseAmount', ...tiers.flatMap(t => [t.key, t.label, ...题材货币字段别名[t.key]])]);
    const unknownWallet = Object.fromEntries(Object.entries(wallet).filter(([key, value]) => !known.has(key) && typeof value === 'number'));
    const inventory: Record<string, { name: string; count: number }> = {};
    const currencyInventory: Record<string, number> = {};
    for (const item of items) {
        const name = String(item?.名称 || '').trim();
        const type = String(item?.类型 || '');
        if (/^货币(?:[:：]|$)/u.test(type) || tiers.some(t => t.label === name) || Object.hasOwn(role.金钱 || {}, name)) {
            const key = normalizeNpcNameKey(name);
            currencyInventory[key] = (currencyInventory[key] || 0) + Math.max(1, Math.trunc(Number(item?.堆叠数量 ?? item?.数量) || 1));
            continue;
        }
        const id = String(item?.ID || item?.id || '');
        const identity = id ? `id:${id}` : `name:${normalizeNpcNameKey(name)}`;
        if (!name) continue;
        const count = Math.max(1, Math.trunc(Number(item?.堆叠数量 ?? item?.数量) || 1));
        inventory[identity] = { name, count: (inventory[identity]?.count || 0) + count };
    }
    const total = 获取角色金钱BaseAmount(wallet, openingConfig?.modeRuntimeProfile, mode);
    const tierTotal = 计算角色货币底层总值(wallet, openingConfig?.modeRuntimeProfile, mode);
    return { total, tierTotal, unknownWallet, inventory, currencyInventory };
};
export interface ReviewEconomicIssue { code: 'insufficientEvidence' | 'alreadySettled' | 'ineffective'; reason: string }
const insufficient = (reason: string): ReviewEconomicIssue => ({ code: 'insufficientEvidence', reason });
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const verbs = '获得|得到|收入|赚得|拾得|支付|花费|失去|扣除|消耗|使用|吃掉|卖出';
const loss = /支付|花费|失去|扣除|消耗|使用|吃掉|卖出/;
// 只认旁白中的主角既成事实；备注、对白、AI说明不参与推算。
const signedFact = (body: string, target: string, player: string, numberPattern = '\\d+(?:\\.\\d+)?'): number | null => {
    const matches = Array.from(body.matchAll(new RegExp(`(${verbs})\\s*(${numberPattern})\\s*(?:枚|个|件|把|本|颗|粒|份|瓶)?\\s*(?:${target})(?![\\p{L}\\p{N}])`, 'gu')));
    if (matches.length !== 1) return null;
    const fact = matches[0];
    const prefix = body.slice(0, fact.index);
    const clause = prefix.split(/[。！？\n；，,]/u).pop() || '';
    if (/(?:没有|尚未|未曾|不曾|不会|如果|假如|可能|打算|准备|将要|待|预计)/u.test(clause)) return null;
    const subject = normalizeNpcNameKey(clause);
    if (!new RegExp(`^(?:${escape(normalizeNpcNameKey(player)) || '(?!)'}|你|我|主角)(?:终于|刚刚|又|已经|额外|总共|成功|实际|确实)?$`, 'u').test(subject)) return null;
    const small: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const amount = small[fact[2]] ?? Number(fact[2]);
    return Number.isFinite(amount) ? (loss.test(fact[1]) ? -amount : amount) : null;
};
export const reviewNarratorFacts = (logs: Array<{ sender: string; text: string }>): string => logs.filter(log => log.sender === '旁白')
    .map(log => log.text.replace(/[“"「『][\s\S]*?[”"」』]/g, '')).join('\n');
export const expectedReviewWealth = (current: any, before: any, body: string, openingConfig?: OpeningConfig): { expected?: number; issue?: ReviewEconomicIssue } => {
    if (!before) return { issue: insufficient('金额缺少可信真实回合前基准，不能根据正文猜测补发') };
    const now = extractReviewEconomicSnapshot(current, openingConfig);
    const prior = extractReviewEconomicSnapshot(before, openingConfig);
    if (now.total !== now.tierTotal || prior.total !== prior.tierTotal) return { issue: insufficient('钱包与baseAmount基准不一致，无法核实实际财富') };
    const mode = 获取货币显示模式(openingConfig, current.角色);
    const tiers = 获取世界观货币层级配置(openingConfig?.modeRuntimeProfile, mode);
    const facts = tiers.map(tier => ({ delta: signedFact(body, [tier.label, ...题材货币字段别名[tier.key]].filter(n => !/层货币/.test(n)).map(escape).join('|'), current.角色?.姓名 || ''), multiplier: tier.multiplier })).filter(fact => fact.delta !== null);
    const units = tiers.flatMap(t => [t.label, ...题材货币字段别名[t.key]]).filter(n => !/层货币/.test(n)).map(escape).join('|');
    const mentions = Array.from(body.matchAll(new RegExp(`(${verbs})\\s*\\d+(?:\\.\\d+)?\\s*(?:枚|个)?\\s*(?:${units})(?![\\p{L}\\p{N}])`, 'gu')));
    if (mentions.length !== 1 || facts.length !== 1) return { issue: insufficient('正文缺少唯一明确、已发生且主体属于主角的币种收支事实；仅报告疑点') };
    const expected = prior.total + facts[0].delta! * facts[0].multiplier;
    if (now.total === expected) return { issue: { code: 'alreadySettled', reason: '正文收支已正确结算，不得重复执行' } };
    if (now.total !== prior.total || expected < 0) return { issue: insufficient('实际财富、回合前基准与正文不构成可核实的漏结算修复') };
    return { expected };
};
export const compareReviewEconomicChange = (current: any, simulated: any, before: any, logs: Array<{ sender: string; text: string }>, openingConfig?: OpeningConfig): ReviewEconomicIssue | null => {
    const now = extractReviewEconomicSnapshot(current, openingConfig);
    const next = extractReviewEconomicSnapshot(simulated, openingConfig);
    const body = reviewNarratorFacts(logs);
    if (stableVariableReviewJson(now.unknownWallet) !== stableVariableReviewJson(next.unknownWallet)) return insufficient('未知币种实际余额变化无法可靠核实，未应用财富修复');
    if (now.total === next.total && stableVariableReviewJson(now.currencyInventory) !== stableVariableReviewJson(next.currencyInventory)) {
        // 删除最后一笔实体货币时，原规范化可能沿用旧钱包。库存diff不能冒充收支已经修复。
        return { code: 'ineffective', reason: '实体货币数量改变，但执行并规范化后未产生有效业务财富变化；不能作为收支修复' };
    }
    if (now.total !== next.total || now.tierTotal !== next.tierTotal) {
        const check = expectedReviewWealth(current, before, body, openingConfig);
        if (check.issue) return check.issue;
        if (next.total !== next.tierTotal || next.total !== check.expected) return insufficient('命令执行并规范化后的实际财富不等于正文支持的漏结算金额');
    }
    const prior = before ? extractReviewEconomicSnapshot(before, openingConfig) : undefined;
    for (const key of new Set([...Object.keys(now.inventory), ...Object.keys(next.inventory)])) {
        const count = now.inventory[key]?.count || 0;
        const nextCount = next.inventory[key]?.count || 0;
        if (count === nextCount) continue;
        if (!prior) return insufficient('库存数量变化缺少可信真实回合前基准；仅报告疑点');
        const item = now.inventory[key] || next.inventory[key];
        const oldItem = prior.inventory[key];
        if ([next.inventory[key], oldItem].some(other => other && normalizeNpcNameKey(other.name) !== normalizeNpcNameKey(item.name))) return insufficient('库存稳定身份与名称不一致，无法核实数量变化');
        const delta = signedFact(body, escape(item.name), current.角色?.姓名 || '', '\\d+|[一两二三四五六七八九十]');
        if (delta === null) return insufficient(`库存「${item.name}」缺少唯一明确的主角获得/消耗数量事实`);
        const beforeCount = oldItem?.count || 0;
        const expected = beforeCount + delta;
        if (count === expected) return { code: 'alreadySettled', reason: `库存「${item.name}」已正确结算，不重复修改数量` };
        if (count !== beforeCount || nextCount !== expected || expected < 0) return insufficient(`库存「${item.name}」实际数量变化与可信基准、正文不符`);
    }
    return null;
};
