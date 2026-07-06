import { describe, expect, it } from 'vitest';
import { 净化角色对白行, 解析正文日志文本 } from '../hooks/useGame/bodyPolish';

describe('body polish dialogue parsing', () => {
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

    it('keeps Japanese-style 4-char speaker names in polished body text', () => {
        const logs = 净化角色对白行(解析正文日志文本([
            '【旁白】伊贺流上忍，雾隐彩月，应将军大人的邀请而来。',
            '【雾隐彩月】“初次见面，您的气味……真是让人兴奋得浑身发抖呢。”'
        ].join('\n')));

        expect(logs).toEqual([
            { sender: '旁白', text: '伊贺流上忍，雾隐彩月，应将军大人的邀请而来。' },
            { sender: '雾隐彩月', text: '初次见面，您的气味……真是让人兴奋得浑身发抖呢。' }
        ]);
    });
});
