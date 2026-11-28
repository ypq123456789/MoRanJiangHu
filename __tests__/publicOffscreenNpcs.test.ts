import { describe, expect, it } from 'vitest';
import { 补录公开局外人物 } from '../utils/publicOffscreenNpcs';
import { 规范化社交列表 } from '../hooks/useGame/stateTransforms';

const logs = [
    { sender: '杨培强', text: '那沈天彪不是为了债，是为了杨老泉留下的东西。' },
    { sender: '旁白', text: '却无法阻止她体内那股被俞凌风种下的气息在不断折磨她的心神。' },
    { sender: '俞月荷', text: '那钱掌柜想借沈天彪的刀，沈天彪想借钱掌柜的势。' },
    { sender: '旁白', text: '巷口那三名铁骨帮的弟子正蹲在避风处吸着劣质的旱烟。' },
    { sender: '俞月荷', text: '听说吴巡使正在追查渡口，还不能确信。' }
];
const initial = [{ id: 'lover', 姓名: '俞月荷', 是否在场: true, 关系网变量: [{ 对象姓名: '俞凌风', 关系: '堂兄' }] }];
const directorBible = { 核心卡司: [
    { id: 'cast-relative', 姓名: '俞凌风', 隐藏秘密: '不应公开', 身份与势力: '幕后真正主人' },
    { id: 'unused', 姓名: '未揭晓人' }, { id: 'past', 姓名: '杨老泉' }, { id: 'rumour', 姓名: '吴巡使' }
] } as any;
const tasks = [{ 类型: '主线', 描述: '查清沈天彪逼债和钱掌柜之间的利益关系。' }];

describe('公开局外人物建档', () => {
    it('不把真实进入现场的人改成离场简档', () => {
        const present = { id: 'qian', 姓名: '钱掌柜', 是否在场: true, 身份: '掌柜', 年龄: 48 };
        const result = 补录公开局外人物({ social: [present], previousSocial: [], logs: [
            { sender: '旁白', text: '钱掌柜端着茶盘走进屋内。' },
            { sender: '沈青', text: '钱掌柜想借沈天彪的势。' }
        ] });
        expect(result).toEqual([present]);
    });

    it('人际网或模型给出的候选仍须排除否定证据，不能用错误引文覆盖公开证据', () => {
        const social = [{ 姓名: '李青', 关系网变量: [{ 对象姓名: '王长风' }] }];
        const updates = [{ 姓名: '王长风', 依据: '王长风受命办差。' }];
        expect(补录公开局外人物({ social, updates, logs: [{ sender: '李青', text: '王长风并没有派人收账。' }] })).toBe(social);
        const yes = 补录公开局外人物({ social, updates, logs: [{ sender: '李青', text: '王长风已派人收账。' }] });
        expect(yes[1]).toMatchObject({ 姓名: '王长风', 简介: '李青提到：王长风已派人收账。' });
    });

    it('原文引号和空格不改变死亡证据的定位，引文仍须与原文一致', () => {
        const line = '旧账写着，  已故的王长风曾指派人收账。';
        const run = (text: string, quote: string) => 补录公开局外人物({
            social: [], logs: [{ sender: '旁白', text }], updates: [{ 姓名: '王长风', 依据: quote }]
        });
        expect(run(line, line)).toEqual([]);
        const current = '旧账写着，  王长风与李青保持联系。';
        expect(run(current, current)).toMatchObject([{ 姓名: '王长风' }]);
        expect(run(current, current.replace('，  ', '，'))).toEqual([]);
    });
    it('同句并列的两人分别按自己的行动采信或排除公开证据', () => {
        const social = [{ 姓名: '沈青', 关系网变量: [{ 对象姓名: '王长风' }, { 对象姓名: '李青' }] }];
        for (const text of ['王长风派人收账而李青拒绝交易。', '李青拒绝交易但是王长风派人收账。']) {
            const results = 补录公开局外人物({ social, logs: [{ sender: '沈青', text }] });
            expect(results.map(npc => npc.姓名)).toEqual(['沈青', '王长风']);
        }
        expect(补录公开局外人物({ social, logs: [{ sender: '沈青', text: '王长风并没有派人收账。' }] })).toBe(social);
    });

    it('两个不同姓名的旧哈希相撞时保留不同稳定 ID', () => {
        const opts = { logs: [{ sender: '李青', text: '王娜晧派人收账，王娟昊派人追缴这笔欠款。' }] };
        const first = 补录公开局外人物({ social: [], ...opts });
        expect(first.map(npc => npc.姓名)).toEqual(['王娜晧', '王娟昊']);
        expect(new Set(first.map(npc => npc.id)).size).toBe(2);
        expect(补录公开局外人物({ social: first, ...opts })).toBe(first);
    });
    it('即使导演和变量模型漏报，也能结合关系网、任务和已公开正文找回局外人', () => {
        const params = { social: initial, logs, directorBible, tasks, playerName: '杨培强' };
        const written = 补录公开局外人物(params);
        expect(written.map(npc => npc.姓名).sort()).toEqual(['俞月荷','俞凌风','沈天彪','钱掌柜'].sort());
        expect(written.find(npc => npc.姓名 === '俞凌风')).toMatchObject({ id: 'cast-relative', 是否在场: false, 是否队友: false });
        expect(JSON.stringify(written)).not.toMatch(/幕后真正主人|不应公开/);
        expect(written.filter(npc => !npc.是否在场).every(npc => !npc.当前位置)).toBe(true);
        expect(written.find(npc => npc.姓名 === '钱掌柜')?.简介).toContain('俞月荷');
        const normalized = 规范化社交列表(written, { 合并同名: false });
        expect(normalized.map(npc => npc.姓名).sort()).toEqual(['俞月荷','俞凌风','沈天彪','钱掌柜'].sort());
        const shopkeeper = normalized.find(npc => npc.姓名 === '钱掌柜');
        expect(shopkeeper).toMatchObject({ 身份: '掌柜', 关系状态: '已闻其名' });
        for (const field of ['年龄', '出身背景', '天赋列表', '当前位置']) expect(shopkeeper[field]).toBeUndefined();
        expect(补录公开局外人物({ ...params, social: written })).toBe(written);
    });

    it('采纳引文精确的模型候选，过滤匿名人群、猜测、历史遗产和本名未公开的人', () => {
        const updates = [
            { 姓名: 'Mira Chan', 依据: 'Mira Chan已派人来收账。' },
            { 姓名: '三名铁骨帮的弟子', 依据: logs[3].text },
            { 姓名: '杨老泉', 依据: logs[0].text },
            { 姓名: '吴巡使', 依据: logs[4].text },
            { 姓名: '未揭晓人', 依据: 'Mira Chan已派人来收账。' }
        ];
        const social = 补录公开局外人物({ social: [], logs: [logs[0], logs[3], logs[4], {sender:'旁白',text:'Mira Chan已派人来收账。'}], playerName:'杨培强', updates });
        expect(social.map(npc => npc.姓名)).toEqual(['Mira Chan']);
    });

    it('空任务、空关系网也能从第三人的确切说法和留下的持续影响建档', () => {
        const social = [{ id: 'yuehe', 姓名: '俞月荷' }];
        const written = 补录公开局外人物({ social, logs, playerName: '杨培强' });
        expect(written.map(npc => npc.姓名).sort()).toEqual(['俞月荷', '钱掌柜', '沈天彪', '俞凌风'].sort());
        expect(written.find(npc => npc.姓名 === '钱掌柜')?.简介).toContain('俞月荷提到');
        expect(written.find(npc => npc.姓名 === '俞凌风')?.简介).toContain('被俞凌风种下的气息');
        expect(补录公开局外人物({ social: written, logs, playerName: '杨培强' })).toBe(written);
    });

    it('从正文取候选时区分现场行动、组织、否定、传闻和已失去作用的往事', () => {
        const rows = [
            { sender: '旁白', text: '陈怀远下令把大门打开。' },
            { sender: '江宁', text: '李家派人收账，听说吴长河正在逼债。' },
            { sender: '江宁', text: '临江帮派人跟踪你。王长风并没有派人收账。' },
            { sender: '旁白', text: '刘青山先前留在她身上的旧伤早已痊愈。' },
            { sender: '旁白', text: '顾明川当面向两人下令，孙林川在门旁站着。' },
            { sender: '江宁', text: '顾明川派人追缴上月的欠款。' },
            { sender: '孙林川', text: '谁在说我？' }
        ];
        expect(补录公开局外人物({ social: [], logs: rows })).toEqual([]);
    });

    it.each([{}, { 来源: '正文提及', 关系状态: '已闻其名' }, { 来源: '新角色', 关系状态: '敌对' }])('从公开证据识别仅闻名的新档，保留稳定 ID 和旧的完整人物', (markers) => {
        const known = { id: 'known', 姓名: '沈天彪', 年龄: 56, 记忆: ['早前已相识'] };
        const invented = { id: 'new', 姓名: '钱掌柜', ...markers, 是否在场: false, 年龄: 45,
            境界: '凡夫俗子', 记忆: ['不可能亲耳听见'], 当前位置: '未知街区' };
        const written = 补录公开局外人物({ social: [known, invented], previousSocial: [known], logs });
        expect(written[0]).toBe(known);
        const npc = written.find(npc => npc.姓名 === invented.姓名);
        expect(npc).toMatchObject({ id: 'new', 身份: '掌柜', 是否在场: false, 简介: expect.stringContaining('俞月荷提到') });
        for (const field of ['年龄', '境界', '记忆', '当前位置']) expect(npc).not.toHaveProperty(field);
    });
});
