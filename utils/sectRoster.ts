import type { FactionLedger } from '../models/directorBible';
import type { 门派成员简报, 详细门派结构 } from '../models/sect';
import type { NPC结构 } from '../models/social';
import type { 世界数据结构 } from '../models/world';
import { normalizeNpcNameKey } from './npcName';
import { 取NPC叙事名 } from './npcNarrativeName';

type 成员 = Partial<Omit<门派成员简报, '性别'>> & {
    id: string;
    姓名: string;
    性别?: string;
    是否玩家本人?: boolean;
    有社交档案?: boolean;
};

export interface 同门资料来源 {
    socialList?: Array<Partial<NPC结构> & { ID?: string; 所属门派ID?: string; 所属门派?: string; 所属势力?: string; 所属组织?: string }>;
    world?: Pick<世界数据结构, '势力列表' | '活跃NPC列表'>;
    factionLedgers?: FactionLedger[];
}

export const 是主角成员 = (member: 成员): boolean =>
    member.是否玩家本人 === true || String(member.id || '').startsWith('sect_member_player_');

const 职务描述 = /^(?:的)?[·：:／/\s-]*(?:掌门|掌教|宗主|宫主|长老|执事|掌院|堂主|护法|弟子|门人|成员|队员|领袖|帮主|师兄|师姐|(?:杂役|外门|内门|亲传|真传|记名|普通|核心|首席|驻守|守山)(?:弟子|长老|执事|成员))(?=$|[、，,（(／/：:\s]|兼)/u;

export const 读取同门名录 = (sect: 详细门派结构, { socialList, world, factionLedgers }: 同门资料来源): 成员[] => {
    const known: 成员[] = Array.isArray(sect.重要成员) ? sect.重要成员 : [];
    const player = known.find(是主角成员);
    const result: 成员[] = [];
    const names = new Set<string>();
    const ids = new Set<string>();
    const add = (m: 成员, realName = m.姓名) => {
        const key = normalizeNpcNameKey(realName);
        if (!key || names.has(key) || (m.id && ids.has(m.id))) return;
        result.push(m);
        names.add(key);
        if (m.id) ids.add(m.id);
    };
    if (player) add(player);
    known.forEach(m => add(m));

    const orgKeys = new Set([sect.ID, sect.名称].map(normalizeNpcNameKey).filter(Boolean));
    if (!orgKeys.size || orgKeys.has('none')) return result;
    const matchesOrg = (key: unknown) => orgKeys.has(normalizeNpcNameKey(key));
    const factions = (world?.势力列表 || []).filter(f => matchesOrg(f.ID) || matchesOrg(f.名称));
    factions.forEach(f => { orgKeys.add(normalizeNpcNameKey(f.ID)); orgKeys.add(normalizeNpcNameKey(f.名称)); });
    const ledgers = (factionLedgers || []).filter(f => matchesOrg(f.id) || matchesOrg(f.名称));
    ledgers.forEach(f => { orgKeys.add(normalizeNpcNameKey(f.id)); orgKeys.add(normalizeNpcNameKey(f.名称)); });
    orgKeys.delete('');
    const named = new Map<string, { name: string; role: string }>();
    const note = (name: string, role: string) => {
        const key = normalizeNpcNameKey(name);
        if (key && !/^(?:无|暂无|未知|不详|待定)$/u.test(key) && key !== normalizeNpcNameKey(sect.名称 + '执掌者') && !named.has(key)) named.set(key, { name: name.trim(), role });
    };
    ledgers.forEach(f => {
        note(f.领袖, '领袖');
        (f.核心人物 || []).forEach(name => note(name, '核心成员'));
    });
    // 旧档有时只保留世界势力投影，按投影器写出的明确名录字段恢复。
    if (!ledgers.length) {
        for (const faction of factions) {
            const leader = /^领袖[：:]([^；;\n]+)(?:[；;]|$)/u.exec(faction.描述 || '')?.[1];
            if (leader) note(leader, '领袖');
            const core = /^核心成员[：:]([^；;\n]+)$/u.exec(faction.代表性物品风格 || '')?.[1];
            core?.split('、').forEach(name => note(name, '核心成员'));
        }
    }
    (world?.活跃NPC列表 || []).filter(n => matchesOrg(n.所属势力)).forEach(n => note(n.姓名, '成员'));

    for (const npc of socialList || []) {
        if (!npc?.姓名) continue;
        const key = normalizeNpcNameKey(npc.姓名);
        const affiliations = [npc.所属门派ID, npc.所属门派, npc.所属势力, npc.所属组织].filter(Boolean);
        const identity = String(npc.身份 || '').trim();
        const identityKey = normalizeNpcNameKey(identity);
        const role = (named.get(key) || named.get(normalizeNpcNameKey(npc.id)))?.role;
        const inOrg = affiliations.length
            ? affiliations.some(matchesOrg)
            : [...orgKeys].some(org => identityKey.startsWith(org) && 职务描述.test(identityKey.slice(org.length)));
        if (inOrg || role) add({
            id: npc.id || npc.ID || key, 姓名: 取NPC叙事名(npc), 性别: npc.性别, 年龄: npc.年龄,
            境界: npc.境界, 身份: identity || role || '成员', 简介: npc.简介, 有社交档案: true
        }, npc.姓名);
    }
    for (const { name, role } of named.values()) {
        if (!/^(?:npc|cast|fct)[-_]?\d+$/i.test(name)) add({ id: name, 姓名: name, 身份: role, 有社交档案: false });
    }
    return result;
};
