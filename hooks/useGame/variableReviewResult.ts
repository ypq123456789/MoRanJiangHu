import type { TavernCommand } from '../../types';
import type { VariableReviewChange, VariableReviewRejectedCommand } from './variableReviewWorkflow';
import { normalizeStateCommandKey } from '../../utils/stateHelpers';
import { readVariableCommandValue } from './variableCommandValidation';
import { textMentionsNpcName, normalizeNpcNameKey } from '../../utils/npcName';
import { stableVariableReviewJson } from './variableReviewSnapshot';

export type ReviewChangeCategory = 'supplement' | 'correction' | 'cleanup';
export interface ReviewDisplayChange extends VariableReviewChange {
    category: ReviewChangeCategory;
    label: string;
    reason?: string;
    sourcePaths: string[];
    count: number;
}
export interface ReviewUnresolvedIssue { path?: string; description: string; code?: string }
export interface ReconciledVariableReviewResult {
    changes: ReviewDisplayChange[];
    issues: ReviewUnresolvedIssue[];
    counts: { supplement: number; correction: number; cleanup: number; unresolved: number };
    summary: string;
}
const pathKey = (key: string) => normalizeStateCommandKey(key).replace(/^gameState\./, '');
const under = (path: string, root: string) => path === root || path.startsWith(`${root}.`) || path.startsWith(`${root}[`);
const same = (a: any, b: any) => stableVariableReviewJson(a) === stableVariableReviewJson(b);
const empty = (value: any): boolean => value == null || value === '' || /^(?:未知|不详|待补充|未记录|暂无|无)$/u.test(String(value))
    || Array.isArray(value) && !value.length || value && typeof value === 'object' && !Object.keys(value).length;
const uncertainty = /证据不足|依据不足|冲突|无法(?:确认|确定|判断|安全)|不能(?:确认|确定|安全)|不确定|多种解释|需要.*(?:额外事实|确认|核实)|缺少.*(?:证据|依据)|尚不能/u;
const cleanupEvidence = /消耗|吃掉|喝掉|丢失|遗失|丢弃|出售|卖出|赠送|转移|损毁|不再持有|过期|失效|结束|恢复|取消|替代|替换|重复|污染|错误解析/u;
const stateRoots = /^(?:角色|环境|世界|社交|战斗|玩家门派|任务列表|约定列表)(?:[.\[]|$)/u;
const removedItems = (before: any[], after: any[]): any[] => {
    const counts = new Map<string, number>();
    after.forEach(item => { const key = stableVariableReviewJson(item); counts.set(key, (counts.get(key) || 0) + 1); });
    const unmatched = before.filter(item => { const key = stableVariableReviewJson(item), n = counts.get(key) || 0; if (!n) return true; counts.set(key, n - 1); return false; });
    const identity = (item: any) => item?.id || item?.ID ? `id:${item.id || item.ID}` : item?.名称 || item?.姓名 || item?.名字 ? `name:${normalizeNpcNameKey(item.名称 || item.姓名 || item.名字)}` : '';
    const remaining = new Map<string, number>();
    after.forEach(item => { const fingerprint = stableVariableReviewJson(item), n = counts.get(fingerprint) || 0; if (n > 0) { const key = identity(item); if (key) remaining.set(key, (remaining.get(key) || 0) + 1); counts.set(fingerprint, n - 1); } });
    const oldCounts = new Map<string, number>(); unmatched.forEach(item => { const key = identity(item); if (key) oldCounts.set(key, (oldCounts.get(key) || 0) + 1); });
    return unmatched.filter(item => {
        const key = identity(item), n = remaining.get(key) || 0;
        if (!key || !n) return true;
        // 同一稳定实体只是更新字段，不宣称其被删除；身份歧义只展示父数组真实值。
        if (oldCounts.get(key) === 1) remaining.set(key, n - 1);
        return false;
    });
};

export const reconcileVariableReviewResult = (params: {
    changes: VariableReviewChange[];
    acceptedCommands: TavernCommand[];
    rejectedCommands: VariableReviewRejectedCommand[];
    reports: string[];
    before: any;
    after: any;
    body: string;
}): ReconciledVariableReviewResult => {
    const { before, after } = params;
    const read = (state: any, path: string) => readVariableCommandValue(state, path);
    const label = (path: string) => {
        const npc = path.match(/^社交\[(\d+)\](?:\.(.*))?$/u);
        if (npc) return `${before.社交?.[Number(npc[1])]?.姓名 || after.社交?.[Number(npc[1])]?.姓名 || '人物'}${npc[2] ? ` · ${npc[2]}` : ''}`;
        return path.replace(/^角色\./u, '玩家 · ').replace(/^环境\./u, '环境 · ');
    };
    const evidenceFor = (path: string, value: any) => {
        const name = value?.名称 || value?.姓名 || value?.名字 || '';
        return params.body.split(/[。！？\n]/u).map(text => text.trim()).find(text => cleanupEvidence.test(text) && (name ? textMentionsNpcName(text, name) : text.includes(path.split('.').pop()!.replace(/\[.*$/, ''))));
    };
    const category = (change: VariableReviewChange): ReviewChangeCategory => {
        if (!empty(change.before) && (change.after === undefined || change.after === null || change.after === '')) return 'cleanup';
        if (/(?:BUFF|DEBUFF|临时|任务|约定|事件)/u.test(change.path) && /^(?:已完成|已失败|已取消|已作废|已履行|已违约|已结束|过期|失效)$/u.test(String(change.after))) return 'cleanup';
        if (/物品列表.*(?:堆叠数量|数量)$/u.test(change.path) && typeof change.before === 'number' && typeof change.after === 'number' && change.after < change.before) return 'cleanup';
        if (typeof change.before === 'string' && /<[a-z_][\s\S]*>/iu.test(change.before) && typeof change.after === 'string' && !/<[a-z_][\s\S]*>/iu.test(change.after) && /污染|标签|错误解析/u.test(params.body)) return 'cleanup';
        return empty(change.before) && !empty(change.after) ? 'supplement' : 'correction';
    };
    const display: ReviewDisplayChange[] = [];
    const consumed = new Set<string>();
    // 删除数组项会让后续索引移动：汇总真实父数组diff，避免把移动误展示成一串字段修正。
    for (const command of params.acceptedCommands) {
        const key = pathKey(command.key);
        const parent = command.action === 'delete' && /\[\d+\]$/u.test(key) ? key.replace(/\[\d+\]$/u, '') : key;
        const a = read(before, parent), b = read(after, parent);
        if (!Array.isArray(a) || !Array.isArray(b) || b.length >= a.length || display.some(change => change.path === parent)) continue;
        const sources = params.changes.filter(change => under(change.path, parent));
        if (!sources.length) continue;
        const removed = removedItems(a, b);
        const names = removed.map(item => item?.名称 || item?.姓名 || item?.名字).filter(Boolean);
        const reason = removed.map(item => evidenceFor(parent, item)).filter(Boolean).join('；');
        display.push({ path: parent, before: a, after: b, category: 'cleanup', label: label(parent), sourcePaths: sources.map(change => change.path),
            count: a.length - b.length, reason: `${names.length ? `移除：${[...new Set(names)].join('、')}。` : ''}${reason ? `正文依据：${reason}` : '模拟执行确认条目数量减少；其它条目变化见下方实际值。'}` });
        sources.forEach(change => consumed.add(change.path));
    }
    for (const change of params.changes) {
        if (consumed.has(change.path)) continue;
        let path = change.path;
        // 新对象由多条叶子diff组成，按一个实际新增实体展示，不按AI自报分类。
        const ancestors = path.match(/^[^.\[]+(?:\[\d+\]|\.[^.\[]+)*/u)?.[0].match(/^[^.\[]+|\[\d+\]|\.[^.\[]+/gu) || [];
        let prefix = '';
        for (const part of ancestors) {
            prefix += part;
            const a = read(before, prefix), b = read(after, prefix);
            if ((a === undefined && b && typeof b === 'object') || (b === undefined && a && typeof a === 'object')) { path = prefix; break; }
        }
        const grouped = path === change.path ? [change] : params.changes.filter(item => under(item.path, path) && !consumed.has(item.path));
        if (!grouped.length) continue;
        grouped.forEach(item => consumed.add(item.path));
        const actual = { path, before: read(before, path), after: read(after, path) };
        display.push({ ...actual, category: category(actual), label: label(path), count: 1, sourcePaths: grouped.map(item => item.path), reason: category(actual) === 'cleanup' ? evidenceFor(path, actual.before) : undefined });
    }
    const acceptedFor = (path: string) => params.acceptedCommands.some(command => under(path, pathKey(command.key)) || under(pathKey(command.key), path));
    const resolved = (path: string, expected?: unknown, hasExpected = false) => {
        if (!acceptedFor(path)) return false;
        for (const command of params.acceptedCommands) {
            const key = pathKey(command.key);
            if (command.action !== 'delete' || !under(path, key) || !/\[\d+\]$/u.test(key)) continue;
            const parent = key.replace(/\[\d+\]$/u, ''), a = read(before, parent), b = read(after, parent), target = read(before, key);
            if (Array.isArray(a) && Array.isArray(b) && b.length < a.length && a.filter(item => same(item, target)).length > b.filter(item => same(item, target)).length
                && params.changes.some(change => under(change.path, parent))) return !hasExpected || expected == null;
        }
        return params.changes.some(change => under(path, change.path)) && (!hasExpected || same(read(after, path), expected));
    };
    const inferPath = (text: string): string | undefined => {
        const explicit = text.match(/(?:gameState\.)?(?:角色|环境|世界|社交|战斗|玩家门派|任务列表|约定列表)(?:\[\d+\]|\.[\p{L}\p{N}_]+)+/u)?.[0];
        if (explicit) return pathKey(explicit);
        for (const [i, npc] of (before.社交 || []).entries()) {
            if (!textMentionsNpcName(text, npc.姓名 || '')) continue;
            for (const field of ['当前位置', '位置路径', '衣着风格', '外貌描写', '关系状态', '记忆', '身份']) if (text.includes(field) || field === '当前位置' && /位置|地点/u.test(text)) return `社交[${i}].${field}`;
        }
        for (const field of ['时间', '天气', '具体地点']) if (text.includes(field)) return `环境.${field}`;
        if (/金钱|价格|金额|收入|支出/u.test(text)) return '角色.金钱';
        if (/重复.*(?:记录|条目)|重复记录/u.test(text) && (before.社交 || []).some((item: any, i: number, all: any[]) => all.slice(0, i).some(old => same(old, item)))) return '社交';
        return undefined;
    };
    const issues: ReviewUnresolvedIssue[] = [];
    const addIssue = (path: string, description: string, code?: string) => {
        const text = description.replace(/本次(?:未修改|未处理)[。；]?$/u, '').trim();
        if (!text || issues.some(issue => issue.path === path)) return;
        issues.push({ path, description: `${text.replace(/[。；]$/u, '')}。本次未修改。`, code });
    };
    for (const report of params.reports) {
        const line = report.replace(/^\s*[-*]\s*/u, '').trim();
        if (!line || /^状态[：:]/u.test(line)) continue;
        const structured = line.match(/^(修复|疑点)[：:]\s*(\{[\s\S]*\})$/u);
        let finding: any;
        if (structured) { try { finding = JSON.parse(structured[2]); } catch { continue; } }
        const description = finding ? String(finding.description || '') : line.replace(/^疑点[：:]\s*/u, '');
        const path = finding?.path ? pathKey(String(finding.path)) : inferPath(description);
        if (!path || !stateRoots.test(path) || /__proto__|constructor|prototype/u.test(path)) continue;
        const known = read(before, path) !== undefined || read(after, path) !== undefined;
        const hasEvidence = typeof finding?.evidence === 'string' && finding.evidence.trim() && params.body.includes(finding.evidence.trim());
        if (!known && !hasEvidence) continue;
        const hasExpected = finding && Object.hasOwn(finding, 'expected');
        if (resolved(path, finding?.expected, hasExpected)) {
            const target = display.find(change => change.sourcePaths.some(source => under(path, source)));
            if (hasEvidence && target && !target.reason) target.reason = `正文依据：${finding.evidence.trim()}`;
            continue;
        }
        if (structured?.[1] === '修复') {
            if (known && hasEvidence && hasExpected && acceptedFor(path) && !same(read(after, path), finding.expected))
                addIssue(path, `${label(path)}：建议未形成预期的有效变量变化，需要进一步核对`, 'ineffective');
            continue;
        }
        if (!uncertainty.test(description + (finding?.reason || ''))) continue;
        const stateEvidence = known && typeof finding?.evidence === 'string' && finding.evidence === JSON.stringify(read(before, path));
        const npcIndex = path.match(/^社交\[(\d+)\]/u)?.[1];
        const relatedBody = npcIndex !== undefined ? textMentionsNpcName(params.body, before.社交?.[Number(npcIndex)]?.姓名 || '')
            : path === '角色.金钱' ? /购买|买|支付|价格|金币|金钱|收入|支出/u.test(params.body)
                : params.body.includes(path.split('.').pop() || '');
        if (!hasEvidence && !stateEvidence && !relatedBody) continue;
        addIssue(path, `${label(path)}：${description}`, 'unresolved');
    }
    for (const rejection of params.rejectedCommands) {
        const path = pathKey(rejection.command.key);
        if (rejection.code === 'alreadySettled' || resolved(path) || !stateRoots.test(path)) continue;
        const current = read(before, path);
        if (rejection.code === 'ineffective' && same(current, rejection.command.value)) continue;
        // 无真实目标的胡乱命令留在技术详情，不能包装成玩家必须修复的问题。
        if (current === undefined) continue;
        const descriptions: Record<string, string> = {
            insufficientEvidence: '变更缺少可核实的事实或可信基准，仍需确认',
            npcRename: '姓名修正未能通过身份保护，需要核实人物身份',
            npcDeletion: '档案清理未能通过删除保护，原人物档案继续保留',
            ineffective: '建议未产生有效变量变化，需要进一步核对',
            templateName: '人物写入未通过模板姓名保护，需要核实角色来源',
            protagonist: '人物写入涉及主角身份保护，需要核实对象',
            safety: '建议未能安全应用，需要进一步核实',
            typeError: '建议值与现有字段结构不一致，需要进一步核实'
        };
        if (descriptions[rejection.code]) addIssue(path, `${label(path)}：${descriptions[rejection.code]}`, rejection.code);
    }
    const counts = { supplement: 0, correction: 0, cleanup: 0, unresolved: issues.length };
    display.forEach(change => { counts[change.category] += change.count; });
    const summary = display.length ? `预览已确认：补齐 ${counts.supplement} 项、修正 ${counts.correction} 项、清理 ${counts.cleanup} 项；仍需确认 ${counts.unresolved} 项。确认应用后才会写入变量。`
        : issues.length ? '存在仍需确认的问题，本次没有可应用的变量修改。' : '当前审查范围内未发现需要修改的内容。';
    return { changes: display, issues, counts, summary };
};
