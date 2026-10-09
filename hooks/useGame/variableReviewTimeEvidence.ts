// 审查只纠正已发生的最终时间，不推算模型认为「应该经过」的时长。
// 相对日期/时长必须以可信真实回合前时间为锚，不能在当前已结算时间上重复叠加。
const number = (text: string): number => {
    if (/^\d+$/.test(text)) return Number(text);
    const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (text.includes('十')) { const [a, b] = text.split('十'); return (a ? digits[a] : 1) * 10 + (b ? digits[b] : 0); }
    return digits[text] ?? NaN;
};
const parse = (value: unknown): number[] | undefined => {
    if (typeof value !== 'string' || !/^\d{1,6}:\d{1,2}:\d{1,2}:\d{1,2}:\d{1,2}$/.test(value)) return;
    const p = value.split(':').map(Number);
    if (p[0] < 1 || p[1] < 1 || p[1] > 12 || p[2] < 1 || p[2] > 31 || p[3] > 23 || p[4] > 59) return;
    return p;
};
// 与生产时间比较的12月、每月31日标准串保持一致；不使用本机日期或时区。
const minutes = (p: number[]) => (((p[0] * 12 + p[1] - 1) * 31 + p[2] - 1) * 24 + p[3]) * 60 + p[4];
const numeric = '[0-9零〇一二两三四五六七八九十]{1,3}';
export const reviewNarratorTimeFacts = (logs: Array<{ sender: string; text: string }>): string =>
    logs.filter(log => log.sender === '旁白').map(log => log.text).join('\n');

export const hasExplicitReviewTimeEvidence = (value: unknown, body: string, beforeTime?: unknown): boolean => {
    const target = parse(value), before = parse(beforeTime);
    if (!target) return false;
    const candidates: number[] = [];
    for (const clause of body.split(/[。！？\n；]/u).map(text => text.trim()).filter(Boolean)) {
        // 对话、假设、计划、推测、否定和回忆均不作为当前时间事实。
        if (/[“”"「」『』?？]|如果|假如|可能|也许|大概|预计|打算|准备|计划|将|会|约定|提议|希望|应当|应该|建议|明天|不要|没有|尚未|未到|还没|曾经|回忆|想起|昨天|此前|前一天/u.test(clause)) continue;
        const fullDates = Array.from(clause.matchAll(/(\d{1,6}):(\d{1,2}):(\d{1,2}):(\d{1,2}):(\d{1,2})/g));
        if (fullDates.length) { for (const match of fullDates) { const p = parse(match[0]); if (p) candidates.push(minutes(p)); } continue; }
        const durations = Array.from(clause.matchAll(new RegExp(`(${numeric})\\s*(小时|分钟)后`, 'gu')));
        if (durations.length) {
            if (!before || durations.length !== 1 || !/^\s*(?:又过了?|经过了?|时间来到|转眼)?\s*[0-9零〇一二两三四五六七八九十]/u.test(clause)) return false;
            const delta = number(durations[0][1]) * (durations[0][2] === '小时' ? 60 : 1);
            if (Number.isFinite(delta) && delta > 0) candidates.push(minutes(before) + delta);
            continue;
        }
        const clocks = Array.from(clause.matchAll(new RegExp(`(?:(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜晚|深夜)\\s*)?(${numeric})(?:点|时)(?:(半)|(${numeric})分)?|(?<![\\d:])(\\d{1,2}):(\\d{2})(?![\\d:])`, 'gu')));
        for (const clock of clocks) {
            let hour = number(clock[2] || clock[5]), minute = clock[3] ? 30 : clock[4] ? number(clock[4]) : Number(clock[6] || 0);
            const period = clock[1];
            if (/下午|傍晚|晚上|夜晚|深夜/u.test(period || '') && hour < 12) hour += 12;
            if (/凌晨/u.test(period || '') && hour === 12) hour = 0;
            if (hour > 23 || minute > 59 || !Number.isFinite(hour + minute) || (!period && !clock[5] && hour < 13)) continue;
            const date = clause.match(/(\d{1,6})年(\d{1,2})月(\d{1,2})日/u);
            if (date) {
                const p = parse(`${date[1]}:${date[2]}:${date[3]}:${hour}:${minute}`); if (p) candidates.push(minutes(p));
            } else if (before) {
                const dayOffset = /第二天|次日|翌日/u.test(clause) ? 1440 : 0;
                candidates.push(minutes([before[0], before[1], before[2], hour, minute]) + dayOffset);
            }
        }
    }
    if (!candidates.length || candidates.at(-1) !== minutes(target)) return false;
    if (candidates.every(candidate => candidate === minutes(target))) return true;
    // 正文明说「随后/次日」且时刻按顺序前进时，最后一个才是最终值。
    // 无明确时序词或出现逆序/相互冲突的时刻，继续保守拦截。
    return /随后|之后|然后|第二天|次日|翌日/u.test(body) && candidates.every((candidate, i) => !i || candidate >= candidates[i - 1]);
};
