import type { NPC结构 } from '../../types';
import type { 获取交易币制 } from './tradeCurrency';

// 只接受具名人物本人的陈述。截取引文也必须从完整分句开始，以免把“假如某人有钱”截成事实。
export const 本人资产陈述 = (npc: NPC结构, evidence: string, story: string): string[] => {
    const names = [npc.姓名, npc.叙事名称].filter((name): name is string => Boolean(name?.trim()));
    const clauses: string[] = [];
    for (const sentence of story.split(/[。！？；\n]/u)) {
        // 导演输入按「旁白：正文」拼接日志，逐字引文只包含正文。
        const quote = sentence.trim().replace(/^旁白[：:]\s*/u, '').replace(/^[“「『]+|[”」』]+$/gu, '');
        if (!quote || !evidence.includes(quote)) continue;
        const name = names.find((value) => quote.startsWith(value));
        if (name) clauses.push(quote.slice(name.length).trim());
    }
    return clauses;
};

const 中文量级 = [['亿', 100000000], ['万', 10000], ['千', 1000], ['百', 100], ['十', 10]] as const;
const 解析数量 = (raw: string): number => {
    const value = raw.normalize('NFKC').trim().replace(/两/gu, '二').replace(/[〇○]/gu, '零');
    if (/^\d+$/u.test(value)) return Number(value);
    if (!/^[零一二三四五六七八九十百千万亿]+$/u.test(value)) return NaN;
    for (const [label, scale] of 中文量级) {
        if (!value.includes(label)) continue;
        const [high, low, extra] = value.split(label);
        if (extra !== undefined || (!high && label !== '十')) return NaN;
        return (high ? 解析数量(high) : 1) * scale + (low ? 解析数量(low) : 0);
    }
    return Number(Array.from(value, (digit) => '零一二三四五六七八九'.indexOf(digit)).join(''));
};

const 物品持有谓词 = /^(?:从(?:自己的?)?(?:背包|行囊|怀中|袖中)(?:里|中)?(?:取出|拿出|掏出)|拿出|取出|掏出|随身(?:携带|带着|带了)|的?(?:背包|行囊)(?:中|里)(?:有|装着))\s*/u;
export const 引文确认持有物品 = (clauses: string[], name: string, quantity: number): boolean => clauses.some((clause) => {
    const match = clause.match(物品持有谓词);
    if (!match) return false;
    return clause.slice(match[0].length).split(/[、和及]/u).some((item) => {
        if (!item.endsWith(name)) return false;
        const count = item.slice(0, -name.length).trim().replace(/[个件本柄把枚颗粒瓶包株份张块只条锭卷袋副]$/u, '');
        return (count ? 解析数量(count) : 1) === quantity;
    });
});

const 本人钱袋谓词 = /^(?:(?:点(?:过|清|完)|数(?:过|清|完)|清点|盘点|打开|解开)(?:了)?(?:自己的?)?(?:钱袋|钱包)|(?:将|把)(?:自己的?)?(?:钱袋|钱包)(?:摊开|打开|倒空|倒了出来)|(?:的)?(?:钱袋|钱包|账户|身上|现款|余额)(?:中|里)?)\s*[，,：:]?\s*(?:袋中|袋里|里面)?(?:一共|总共|合计|总计|共计)?(?:只有|仅有|只剩下?|仅剩|还剩|剩下|共有|尚有|有|为|是|共)?\s*/u;
export const 引文确认钱包余额 = (clauses: string[], amount: number, currency: ReturnType<typeof 获取交易币制>): boolean => {
    const units = currency.bucket
        ? [{ labels: [currency.bucket.displayName, currency.bucket.unitId, ...(currency.bucket.aliases || [])], rate: 1 }]
        : currency.system.units.map((unit) => ({ labels: [unit.name, unit.symbol, ...(unit.aliases || [])], rate: unit.baseRate }));
    const denominations = units.flatMap(({ labels, rate }) => labels.filter((label): label is string => Boolean(label))
        .map((label) => ({ label, rate }))).sort((a, b) => b.label.length - a.label.length);
    return clauses.some((clause) => {
        if (amount === 0 && /^(?:已|已经)?(?:身无分文|分文不剩|一文不名)$/u.test(clause)) return true;
        const predicate = clause.match(本人钱袋谓词);
        if (!predicate) return false;
        const cash = clause.slice(predicate[0].length).trim();
        if (/^(?:空空如也|空无一物|分文不剩|一文不剩)$/u.test(cash)) return amount === 0;
        const total = cash.split(/[、和及]/u).reduce((sum, piece) => {
            const text = piece.trim();
            const unit = denominations.find(({ label }) => text.endsWith(label));
            if (!unit) return NaN;
            const count = text.slice(0, -unit.label.length).trim().replace(/[枚块颗张个锭]$/u, '');
            return sum + 解析数量(count) * unit.rate;
        }, 0);
        return Number.isSafeInteger(total) && total === amount;
    });
};
