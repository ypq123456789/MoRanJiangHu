import type { DirectorWorldBible } from '../models/directorBible';
import { 姓名含已知中文姓氏, 取已知中文姓氏 } from './chineseName';
import { 是否含姓名叙事污染, 是否特殊正文发送者 } from './dialogueSpeakerGuard';
import { 生成NPC稳定ID, isNpcNameFormatValid, normalizeNpcNameKey, textMentionsNpcName, 是代称式NPC称呼, NPC代称身份词列表 } from './npcName';

type PublicLog = { sender?: string; text?: string };
type Mention = { 姓名?: string; 依据?: string; 身份?: string };

const 传闻或设想 = /听说|听闻|据说|传言|传闻|据传|传说|谣传|谣言|猜测|可能|或许|也许|疑似|如果|假如|倘若|rumou?r|allegedly|maybe/iu;
const 持续牵涉 = /追[查捕踪杀债]|通缉|逼债|讨债|催债|收账|受雇|雇佣|下令|指使|指派|授命|派[人兵]|受命|威胁|交易|利益|想借|勒索|种下|劫持|绑架|庇护|掌控|谋划|封锁|勒令|担保|背叛|合谋|追缴|仇人|同谋|债主|掌事|首领|头目|堂兄|堂姐|胞兄|胞妹/u;
const 匿名群体 = /^(?:[数几若干众群全两俩\d]|[一二三四五六七八九十百]+[位名个])|(?:众人|人群|一行人|等人|弟子们|帮众们)$/u;
const 纯历史线索 = /(?:生前|遗物|遗愿|遗像|遗嘱|遗书|遗产|故去|已故|亡故|留下的(?:东西|遗物|遗产))/u;
const 主语行动 = /(?:^|[，,：:“「『、])\s*(?:那位|这位|那|这)?([\p{Script=Han}]{2,5}?)(?=(?:已经|正在|一直|已|正)?(?:想借|受雇|下令|指使|指派|授命|派人|逼债|追查|追缴|通缉|勒索|绑架|庇护))/gu;
const 遗留作用施加者 = /(?:^|[，,：:“「『]|被|由)\s*([\p{Script=Han}]{2,5}?)(?=(?:先前|早前|此前|当初|曾经|曾)?(?:留在|留下|种下|施下|施加|埋下))/gu;
const 作用仍存 = /仍|依旧|不断|还在|至今|未愈|尚未消退/u;
const 有形后果 = /气息|真气|劲力|禁制|咒印|旧伤|伤势|毒素|蛊毒|诅咒|封印/u;
const 在场动作 = /^(?:正|正在|忽然|缓缓|随即|抬手|亲手|上前)?(?:当面|就在眼前|在场|站在|坐在|走进|走到|走上前|伸手|推开|开口|端着|捧着|递给|递过|接过|扶住|拦住)/u;
const 否定牵涉 = /(?:没(?:有)?|未(?:曾)?|并非|不(?:曾|会|再|是|肯|愿)?|拒绝|否认)(?:曾经|已经|亲自|直接|继续|再|打算|参与)*(?=派|追|通缉|逼债|讨债|催债|收账|下令|指使|交易|雇佣|想借|种下|留下|勒索|绑架|庇护|债主|仇人|同谋)/u;

export const 旁白有现场行动 = (line: string, name: string): boolean =>
    line.split(name).slice(1).some(tail => 在场动作.test(tail));

const 有公开证据 = (line: string, name: string, quote?: string): boolean => {
    if (quote && (quote.length <= name.length + 2 || !line.includes(quote) || !textMentionsNpcName(quote, name))) return false;
    const fragments = quote?.split(/[，,]/u).filter(fragment => textMentionsNpcName(fragment, name));
    return line.split(/[，,]/u).some(clause => {
        if (!textMentionsNpcName(clause, name)) return false;
        if (fragments && !fragments.some(fragment => clause.includes(fragment))) return false;
        const at = normalizeNpcNameKey(clause).indexOf(normalizeNpcNameKey(name));
        if (at < 0 || /(?:已故|亡故|过世|已逝|已死|先父|先母)(?:的)?$/u.test(clause.slice(0, at))
            || 纯历史线索.test(clause.slice(at, at + name.length + 12)) || 否定牵涉.test(clause)) return false;
        return !!quote || 持续牵涉.test(clause);
    });
};

const 是具名施动者 = (name: string): boolean => {
    if (/(?:并非|并未|并不|没有|不曾|从未|似乎|好像|不|没|未|又|也|才)$/u.test(name)) return false;
    const surname = 取已知中文姓氏(name);
    if (!surname) return false;
    if (name.length <= surname.length + 2 && 姓名含已知中文姓氏(name)) return true;
    return NPC代称身份词列表.includes(name.slice(surname.length));
};

const 人物称呼 = (npc: any): string[] => [npc?.姓名, npc?.叙事名称, ...(Array.isArray(npc?.曾用名) ? npc.曾用名 : [])]
    .map(normalizeNpcNameKey).filter(Boolean);

export function 补录公开局外人物(params: {
    social: any[]; logs: PublicLog[]; playerName?: string; directorBible?: DirectorWorldBible;
    tasks?: Array<{ 类型?: string; 描述?: string; 标题?: string; 发布人?: string; 目标列表?: { 描述?: string }[] }>;
    updates?: Mention[];
    previousSocial?: any[];
}): any[] {
    const { social, logs, playerName, directorBible, tasks = [], updates = [] } = params;
    if (!Array.isArray(logs) || !logs.length) return social;
    const participants = new Set([playerName, ...logs.map(log => log?.sender)].map(normalizeNpcNameKey));
    const existing = new Set(social.flatMap(人物称呼));
    const newProfiles = new Map<string, number>();
    if (params.previousSocial) {
        const previous = new Set(params.previousSocial.flatMap(人物称呼));
        const previousIds = new Set(params.previousSocial.map(npc => npc?.id).filter(Boolean));
        social.forEach((npc, index) => {
            const names = 人物称呼(npc);
            if (previousIds.has(npc?.id) || names.some(name => previous.has(name) || participants.has(name))) return;
            names.forEach(name => newProfiles.set(name, index));
        });
    }
    const sources = logs.flatMap(log => {
        if (!log || typeof log.text !== 'string' || (log.sender && log.sender !== '旁白' && 是否特殊正文发送者(log.sender))) return [];
        return (log.text.match(/[^。！？!?；;\n]+[。！？!?；;]?/gu) || [])
            .filter(line => !传闻或设想.test(line)).map(line => ({ line: line.trim(), sender: log.sender || '旁白' }));
    });
    if (!sources.length) return social;

    const cast = new Map((directorBible?.核心卡司 || []).map(person => [person.姓名, person.id]));
    const candidates = new Map<string, Mention>();
    const add = (name?: string) => { if (typeof name === 'string' && !candidates.has(name)) candidates.set(name, { 姓名: name }); };
    cast.forEach((_id, name) => add(name));
    for (const faction of directorBible?.势力暗账 || []) { add(faction.领袖); faction.核心人物?.forEach(add); }
    for (const npc of social) if (Array.isArray(npc?.关系网变量)) npc.关系网变量.forEach((edge: any) => add(edge?.对象姓名));
    const taskFacts = (Array.isArray(tasks) ? tasks : []).filter(task => task?.类型 !== '传闻').flatMap(task => {
        add(task?.发布人);
        return [task?.描述, task?.标题, ...(Array.isArray(task?.目标列表) ? task.目标列表.map(goal => goal?.描述) : [])].filter(Boolean);
    }).join('\n');
    // 没有任务、卡司和旧人际关系的首回合也可能提供完整证据。第三人的陈述及旁白坐实的持续后果可独立成立。
    for (const { line, sender } of sources) {
        for (const match of line.matchAll(主语行动)) {
            const name = match[1];
            if (是具名施动者(name) && (sender !== '旁白' || textMentionsNpcName(taskFacts, name))) candidates.set(name, { 姓名: name, 依据: line });
        }
        if (作用仍存.test(line) && 有形后果.test(line)) for (const match of line.matchAll(遗留作用施加者)) {
            if (是具名施动者(match[1])) candidates.set(match[1], { 姓名: match[1], 依据: line });
        }
    }
    for (const update of updates) {
        if (typeof update?.姓名 !== 'string') continue;
        const name = update.姓名.trim();
        const quote = typeof update.依据 === 'string' ? update.依据.trim() : '';
        if (quote) {
            if (sources.some(({ line }) => 有公开证据(line, name, quote))) candidates.set(name, update);
        } else add(name);
    }
    let result = social;
    for (const [name, update] of candidates) {
        const key = normalizeNpcNameKey(name);
        const newIndex = newProfiles.get(key);
        if (!key || participants.has(key) || (existing.has(key) && newIndex === undefined) || !isNpcNameFormatValid(name) || 是否含姓名叙事污染(name) || 是代称式NPC称呼(name) || 匿名群体.test(name)) continue;
        if (sources.some(({ line, sender }) => sender === '旁白' && 旁白有现场行动(line, name))) continue;
        const proof = sources.find(({ line }) => 有公开证据(line, name, update.依据?.trim()));
        if (!proof) continue;
        existing.add(key);
        const identity = typeof update.身份 === 'string' && proof.line.includes(update.身份)
            ? update.身份.trim() : NPC代称身份词列表.find(title => name.endsWith(title));
        const profile = {
            id: 生成NPC稳定ID(name, result, (newIndex === undefined ? undefined : social[newIndex]?.id) || cast.get(name)), 姓名: name, 来源: '正文提及', 是否在场: false, 是否队友: false,
            身份: identity || '已知人物', 关系: '已闻其名', 关系状态: '已闻其名', 好感度: 0, 性别: '未知',
            简介: proof.sender === '旁白' ? proof.line : proof.sender + '提到：' + proof.line.replace(/^[“「『]+|[”」』]+$/gu, '')
        };
        if (result === social) result = [...social];
        if (newIndex === undefined) result.push(profile);
        else result[newIndex] = profile;
    }
    return result;
}
