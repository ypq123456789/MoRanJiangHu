import { describe, expect, it } from 'vitest';
import { parseStoryRawText } from '../services/ai/storyResponseParser';

describe('开局正文对白兜底恢复', () => {
    it('主剧情严格模式不再根据无标签口语触发重试错误', () => {
        const raw = `
<正文>
俞月荷将长剑归鞘，发出“咔”的一声轻响。
我们昨天打听到的消息，万宝商会的飞舟后天就会途经苍龙岭。如果我们想搭乘飞舟去中州，今天必须凑齐足够的下品灵石。
</正文>
<短期记忆>开局。</短期记忆>
`;

        const parsed = parseStoryRawText(raw, { validateDialogueFormat: true });
        expect(parsed.logs).toEqual([{
            sender: '旁白',
            text: '俞月荷将长剑归鞘，发出“咔”的一声轻响。\n我们昨天打听到的消息，万宝商会的飞舟后天就会途经苍龙岭。如果我们想搭乘飞舟去中州，今天必须凑齐足够的下品灵石。'
        }]);
    });

    it('把无角色标签但紧邻人物动作的口语段保留为旁白', () => {
        const raw = `
<正文>
俞月荷将长剑归鞘，发出“咔”的一声轻响。
我们昨天打听到的消息，万宝商会的飞舟后天就会途经苍龙岭。如果我们想搭乘飞舟去中州，今天必须凑齐足够的下品灵石。
杨培强走到桌旁，给自己倒了一杯昨夜剩下的冷茶。
昨天在黑市，我看到有人悬赏一株蛇涎草，价格刚好是三十块下品灵石。地点就在苍龙岭外围的瘴气林。
</正文>
<短期记忆>开局。</短期记忆>
`;

        const parsed = parseStoryRawText(raw);
        expect(parsed.logs).toEqual([
            {
                sender: '旁白',
                text: '俞月荷将长剑归鞘，发出“咔”的一声轻响。\n我们昨天打听到的消息，万宝商会的飞舟后天就会途经苍龙岭。如果我们想搭乘飞舟去中州，今天必须凑齐足够的下品灵石。\n杨培强走到桌旁，给自己倒了一杯昨夜剩下的冷茶。\n昨天在黑市，我看到有人悬赏一株蛇涎草，价格刚好是三十块下品灵石。地点就在苍龙岭外围的瘴气林。'
            }
        ]);
    });

    it('保留明确叙事段，不把普通旁白误拆成角色对白', () => {
        const raw = `
<正文>
山风穿过苍龙岭，薄雾从树梢间缓缓落下。
远处的商队灯火明灭，像一串被夜色压低的星。
</正文>
<短期记忆>无。</短期记忆>
`;

        const parsed = parseStoryRawText(raw);
        expect(parsed.logs).toHaveLength(1);
        expect(parsed.logs[0].sender).toBe('旁白');
        expect(parsed.logs[0].text).toContain('山风穿过苍龙岭');
    });
});
