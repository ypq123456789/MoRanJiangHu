import { describe, expect, it } from 'vitest';
import { 净化角色对白行, 解析正文日志文本 } from '../hooks/useGame/bodyPolish';

describe('body polish dialogue parsing', () => {
    it('文章优化保留被动作隔开的两句台词', () => {
        const logs = 净化角色对白行(解析正文日志文本('【俞月荷】背靠着内墙。 （低声）：“门外有人。”她抬起手：“听。”'));
        expect(logs).toEqual([
            { sender: '旁白', text: '俞月荷背靠着内墙。 （低声）' },
            { sender: '俞月荷', text: '门外有人。' },
            { sender: '旁白', text: '她抬起手' },
            { sender: '俞月荷', text: '听。' }
        ]);
    });
    it('keeps dialogue when the speaker tag and quoted line are split across lines', () => {
        const logs = 净化角色对白行(解析正文日志文本([
            '【旁白】',
            '半空中的主神光球依然在散发着冷光。',
            '',
            '【主角】',
            '“醒醒。别睡了。”',
            '',
            '【俞月荷】',
            '“你……杨培强？你怎么会在这里？”',
            '',
            '【旁白】',
            '她抬头看着你，等待着你的决定。'
        ].join('\n')));

        expect(logs).toEqual([
            { sender: '旁白', text: '半空中的主神光球依然在散发着冷光。' },
            { sender: '主角', text: '醒醒。别睡了。' },
            { sender: '俞月荷', text: '你……杨培强？你怎么会在这里？' },
            { sender: '旁白', text: '她抬头看着你，等待着你的决定。' }
        ]);
    });

    it('removes bare canonical game time lines from polished body text', () => {
        const logs = 净化角色对白行(解析正文日志文本([
            '此时是1:01:01:06:30。',
            '【旁白】云岫山脉的晨雾尚未散尽，执事堂前的青石台阶泛着湿光。'
        ].join('\n')));

        const body = logs.map(item => item.text).join('\n');
        expect(body).not.toContain('1:01:01:06:30');
        expect(body).toContain('执事堂前的青石台阶');
    });

    it('strips leaked variable/plan/option blocks appended after the polished body', () => {
        const logs = 净化角色对白行(解析正文日志文本([
            '【旁白】你没答话，只是将身子压得更紧，用自己温热的身体去焐她那近乎冻结的娇躯。',
            '【俞月荷】“杨培强……你体内的灵力本就稀薄……莫要为了我，白白废了苦修的根基……”',
            '<变量规划',
            '- 角色.内力: 89 -> 69',
            '- 社交[0].好感度: 40 -> 45',
            '- 社交[0].记忆: push { "内容": "驱寒", "时间": "1:01:01:01:30" }',
            '- 环境.时间: "1:01:01:01:00" -> "1:01:01:01:30"',
            '>',
            '<剧情规划>',
            '- 主线推进：耽搁两刻钟后需尽快赶往外务堂。',
            '</剧情规划>',
            '<options>',
            '选项一：扶着俞月荷休息片刻。',
            '选项二：强行抱起她赶路。',
            '</options>'
        ].join('\n')));

        expect(logs).toEqual([
            { sender: '旁白', text: '你没答话，只是将身子压得更紧，用自己温热的身体去焐她那近乎冻结的娇躯。' },
            { sender: '俞月荷', text: '杨培强……你体内的灵力本就稀薄……莫要为了我，白白废了苦修的根基……' }
        ]);
        const body = logs.map(item => item.text).join('\n');
        expect(body).not.toContain('变量规划');
        expect(body).not.toContain('角色.内力');
        expect(body).not.toContain('好感度');
        expect(body).not.toContain('剧情规划');
        expect(body).not.toContain('选项一');
        expect(body).not.toContain('options');
    });

    it('strips bracketed variable command blocks appended after the polished body', () => {
        const logs = 净化角色对白行(解析正文日志文本([
            '【旁白】厚重的朱漆大门已然敞开，殿内隐约可见几盏长明灯的昏黄火光。',
            '【环境.时间】',
            '"1:01:01:07:00"',
            '【俞月荷.好感度】',
            '=62',
            '【俞月荷.记忆】',
            '=push 社交[0].记忆 { "内容": "抵达外务堂", "时间": "1:01:01:07:00" }'
        ].join('\n')));

        expect(logs).toEqual([
            { sender: '旁白', text: '厚重的朱漆大门已然敞开，殿内隐约可见几盏长明灯的昏黄火光。' }
        ]);
        const body = logs.map(item => item.text).join('\n');
        expect(body).not.toContain('环境.时间');
        expect(body).not.toContain('好感度');
        expect(body).not.toContain('push 社交[0].记忆');
    });
});
