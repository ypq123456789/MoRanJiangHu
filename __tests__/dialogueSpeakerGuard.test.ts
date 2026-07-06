import { describe, expect, it } from 'vitest';
import { 是否可信角色发送者, 是否可信正文标签发送者 } from '../utils/dialogueSpeakerGuard';

describe('additional name support (non-standard CJK names)', () => {
    describe('是否可信角色发送者', () => {
        it('accepts 2-char CJK name without known surname', () => {
            expect(是否可信角色发送者('云照')).toBe(true);
        });

        it('accepts 3-char non-standard name without known surname (芙莉莲)', () => {
            expect(是否可信角色发送者('芙莉莲')).toBe(true);
        });

        it('accepts 3-char non-standard name without known surname (琪亚娜)', () => {
            expect(是否可信角色发送者('琪亚娜')).toBe(true);
        });

        it('accepts 4-char name with known surname (伊莎贝尔)', () => {
            expect(是否可信角色发送者('伊莎贝尔')).toBe(true);
        });

        it('accepts 4-char name with compound surname (上官婉儿)', () => {
            expect(是否可信角色发送者('上官婉儿')).toBe(true);
        });

        it('accepts 4-char Japanese-style name with a 2-char surname (雾隐彩月)', () => {
            expect(是否可信角色发送者('雾隐彩月')).toBe(true);
        });

        it('rejects 4-char name without known surname', () => {
            expect(是否可信角色发送者('阿卡菲尔')).toBe(false);
        });

        it('rejects 7-char CJK name (超过6字上限)', () => {
            expect(是否可信角色发送者('伊丽莎白万万岁')).toBe(false);
        });

        it('rejects obvious narration noise (她轻声细语地)', () => {
            expect(是否可信角色发送者('她轻声细语地')).toBe(false);
        });

        it('rejects obvious narration noise (只能强辩)', () => {
            expect(是否可信角色发送者('只能强辩')).toBe(false);
        });

        it('rejects special sender (旁白)', () => {
            expect(是否可信角色发送者('旁白')).toBe(false);
        });

        it('rejects environment and mechanic labels as character names', () => {
            expect(是否可信角色发送者('环境')).toBe(false);
            expect(是否可信角色发送者('状态')).toBe(false);
            expect(是否可信角色发送者('装备')).toBe(false);
            expect(是否可信正文标签发送者('环境')).toBe(false);
        });

        it('accepts names via knownSpeakers override', () => {
            expect(是否可信角色发送者('芙莉莲', { knownSpeakers: ['芙莉莲'] })).toBe(true);
        });

        it('accepts name via declaredNames override even if normally rejected', () => {
            expect(是否可信角色发送者('阿卡菲尔', { declaredNames: new Set(['阿卡菲尔']) })).toBe(true);
        });

        it('accepts noise-like name via declaredNames override', () => {
            expect(是否可信角色发送者('她轻声细语地', { declaredNames: new Set(['她轻声细语地']) })).toBe(true);
        });

        it('rejects when allowUnknownName is false and name is not in knownSpeakers', () => {
            expect(是否可信角色发送者('芙莉莲', { allowUnknownName: false })).toBe(false);
        });

        it('still accepts when allowUnknownName is false but name is in declaredNames', () => {
            expect(是否可信角色发送者('芙莉莲', { allowUnknownName: false, declaredNames: new Set(['芙莉莲']) })).toBe(true);
        });
    });

    describe('是否可信正文标签发送者', () => {
        it('passes declaredNames through to 是否可信角色发送者', () => {
            expect(是否可信正文标签发送者('阿卡菲尔', { declaredNames: new Set(['阿卡菲尔']) })).toBe(true);
        });

        it('accepts standard name without special options', () => {
            expect(是否可信正文标签发送者('顾长风')).toBe(true);
        });

        it('rejects narration noise', () => {
            expect(是否可信正文标签发送者('只能强辩')).toBe(false);
        });
    });
});
