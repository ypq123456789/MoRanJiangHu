import { describe, expect, it } from 'vitest';
import { 构建题材生图额外要求 } from '../utils/topicImageGuidance';

describe('topic image guidance', () => {
    it('forbids modern carrying items in ancient wuxia and xianxia character images', () => {
        const wuxia = 构建题材生图额外要求('武侠');
        const xianxia = 构建题材生图额外要求('仙侠');

        expect(wuxia).toContain('禁止现代物品');
        expect(wuxia).toMatch(/背包|手提包|斜挎包|旅行包/);
        expect(xianxia).toContain('禁止现代物品');
        expect(xianxia).toMatch(/backpack|handbag|shoulder bag|duffel bag/i);
    });
});
