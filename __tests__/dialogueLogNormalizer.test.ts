import { describe, expect, it } from 'vitest';
import { 规范化对白日志, 规范化可渲染对白日志 } from '../utils/dialogueLogNormalizer';

describe('dialogueLogNormalizer story readability cleanup', () => {
    it('removes repeated knuckle-whitening phrasing and duplicate punctuation', () => {
        const logs = 规范化对白日志([
            {
                sender: '旁白',
                text: '她握住茶壶时，指节处泛起了一丝不正常的苍白。。屋内安静下来。。'
            }
        ] as any);

        expect(logs).toHaveLength(1);
        expect(logs[0].text).toContain('手指收紧');
        expect(logs[0].text).not.toContain('指节处泛起了一丝不正常的苍白');
        expect(logs[0].text).not.toContain('。。');
    });

    it('splits very long narration into readable paragraphs', () => {
        const longText = [
            '卯时的青云仙城尚未大亮，晨雾覆在飞檐之上。',
            '云水客栈二号房内，灵气沿着阵纹缓缓流转。',
            '窗外有脚步声远远传来，却又在门前停住。',
            '桌上的残烛早已燃尽，只余淡淡安神香气。',
            '你睁开眼时，屋内陈设简单，却透出久住的痕迹。',
            '门外那人没有立刻开口，只让气息沉在风里。',
            '廊下木板被晨露浸得微凉，偶尔有远处钟声越过坊墙。',
            '这座仙城在天光亮起前显得格外空阔，连茶盏边缘的水痕都清晰可见。',
            '你能听见自己的呼吸渐渐平稳，也能察觉门外来人刻意压下的急切。',
            '案边旧册摊开在昨夜翻到的那一页，墨迹被潮气浸得略微发淡。',
            '所有细节堆在一起时，便不再像普通清晨，而像某件事即将被推到眼前。'
        ].join('');

        const logs = 规范化可渲染对白日志([{ sender: '旁白', text: longText }] as any);

        expect(logs[0].text).toContain('\n\n');
    });

    it('keeps quoted dialogue from narration as narration without bracket labels', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: '杨培强停下手里的动作。一个清冷的女声从侧后方传来。俞月荷正站在门边，低声说道：“你动作能不能轻一点？如果里面装的是玻璃安瓿瓶，你刚才那一下，至少报废了我们半个月的口粮。”'
        }] as any);
        expect(logs).toEqual([{
            sender: '旁白',
            text: '杨培强停下手里的动作。一个清冷的女声从侧后方传来。俞月荷正站在门边，低声说道：“你动作能不能轻一点？如果里面装的是玻璃安瓿瓶，你刚才那一下，至少报废了我们半个月的口粮。”'
        }]);
    });

    it('protects line breaks inside quoted narration without inferring speaker', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: [
                '叶青压低声音说道：“先别兑换，',
                '确认任务世界和限制条件。',
                '如果主神限制热武器，我们就换侦查能力。”'
            ].join('\n')
        }] as any);

        expect(logs).toEqual([
            {
                sender: '旁白',
                text: '叶青压低声音说道：“先别兑换，确认任务世界和限制条件。如果主神限制热武器，我们就换侦查能力。”'
            }
        ]);
    });

    it('merges adjacent narration entries when an opening quote was split across logs', () => {
        const logs = 规范化可渲染对白日志([
            { sender: '旁白', text: '叶青压低声音说道：“先别兑换，' },
            { sender: '旁白', text: '确认任务世界和限制条件。”她看向主神光球。' }
        ] as any);

        expect(logs).toEqual([
            { sender: '旁白', text: '叶青压低声音说道：“先别兑换，确认任务世界和限制条件。”她看向主神光球。' }
        ]);
    });

    it('does not infer speaker names from action tails', () => {
        const logs = 规范化可渲染对白日志([
            { sender: '旁白', text: '叶青点点头说道：“我去检查补给箱，' },
            { sender: '旁白', text: '看看有没有止血喷雾。”白光重新稳定。' }
        ] as any);

        expect(logs).toEqual([
            { sender: '旁白', text: '叶青点点头说道：“我去检查补给箱，看看有没有止血喷雾。”白光重新稳定。' }
        ]);
    });

    it('splits bracket speaker lines from narration into character bubbles', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: [
                '门被从外面推开，热水汽涌进屋内。',
                '【绛雨】 “师姐，铁匠大哥，你们在聊什么呢？”',
                '她一边擦着头发，一边走到桌前。'
            ].join('\n')
        }] as any);

        expect(logs).toEqual([
            { sender: '旁白', text: '门被从外面推开，热水汽涌进屋内。' },
            { sender: '绛雨', text: '师姐，铁匠大哥，你们在聊什么呢？' },
            { sender: '旁白', text: '她一边擦着头发，一边走到桌前。' }
        ]);
    });

    it('keeps bare colon speaker lines from old narration as narration', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: [
                '门外有人走来。',
                '林婉儿（皱眉）：我也看到这个bug了，有些角色说话的时候对话框就没了。',
                '她抬头看你。'
            ].join('\n')
        }] as any);

        expect(logs).toEqual([
            { sender: '旁白', text: '门外有人走来。\n林婉儿（皱眉）：我也看到这个bug了，有些角色说话的时候对话框就没了。\n她抬头看你。' }
        ]);
    });

    it('splits xml-style character tags into character bubbles', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: '主神光球闪烁了一下。<林岚>先别兑换，确认任务世界和限制条件。</林岚><叶青>我去检查补给箱。</叶青>白光重新稳定。'
        }] as any);

        expect(logs).toEqual([
            { sender: '旁白', text: '主神光球闪烁了一下。' },
            { sender: '林岚', text: '先别兑换，确认任务世界和限制条件。' },
            { sender: '叶青', text: '我去检查补给箱。' },
            { sender: '旁白', text: '白光重新稳定。' }
        ]);
    });

    it('splits escaped xml-style character tags from saved or streamed text', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: '队伍频道亮起：&lt;秦映雪&gt;别急着开门，先看门缝下面有没有影子。&lt;/秦映雪&gt;'
        }] as any);

        expect(logs).toEqual([
            { sender: '旁白', text: '队伍频道亮起：' },
            { sender: '秦映雪', text: '别急着开门，先看门缝下面有没有影子。' }
        ]);
    });

    it('keeps all bare colon lines as narration', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: [
                '地点：杨家堡后院',
                '任务：检查对话框',
                '林婉儿：真正的对白才需要头像。'
            ].join('\n')
        }] as any);

        expect(logs).toEqual([
            { sender: '旁白', text: '地点：杨家堡后院\n任务：检查对话框\n林婉儿：真正的对白才需要头像。' }
        ]);
    });

    it('does not treat narrative phrase prefixes as speaker names', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: [
                '随着她低头清点物资，墙角的灯光一点点暗下去。',
                '他是个正常的男人，如果是在旧时代，也许会有更轻松的选择。'
            ].join('\n')
        }] as any);

        expect(logs).toEqual([{
            sender: '旁白',
            text: '随着她低头清点物资，墙角的灯光一点点暗下去。\n他是个正常的男人，如果是在旧时代，也许会有更轻松的选择。'
        }]);
    });

    it('downgrades bogus speaker labels produced from narration snippets', () => {
        const logs = 规范化可渲染对白日志([
            { sender: '他摇了摇头', text: '至于玄铁精石，听起来确实不像普通矿材。' },
            { sender: '带来的极致眼力', text: '楚有常的视线从灯火里掠过。' }
        ] as any);

        expect(logs).toEqual([{
            sender: '旁白',
            text: '至于玄铁精石，听起来确实不像普通矿材。\n楚有常的视线从灯火里掠过。'
        }]);
    });

    it('keeps adjacent valid named turns as dialogue instead of narration', () => {
        const logs = 规范化可渲染对白日志([
            { sender: '楚有常', text: '玄铁精石不是凡火能炼的东西。' },
            { sender: '杨培强', text: '那就先封存，等找到合适的炉火再说。' }
        ] as any);

        expect(logs).toEqual([
            { sender: '楚有常', text: '玄铁精石不是凡火能炼的东西。' },
            { sender: '杨培强', text: '那就先封存，等找到合适的炉火再说。' }
        ]);
    });

    it('does not promote unlabeled follow-up lines that look like oral speech', () => {
        const oral = 规范化可渲染对白日志([{
            sender: '旁白',
            text: '俞月荷冷笑一声，将表格拍在桌上。\n三百点？你真觉得这点贡献够换一整箱药？'
        }] as any);

        expect(oral).toEqual([{
            sender: '旁白',
            text: '俞月荷冷笑一声，将表格拍在桌上。\n三百点？你真觉得这点贡献够换一整箱药？'
        }]);
    });

    it('keeps quoted oral speech after voice and gaze cues as narration without bracket labels', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: [
                '秦映雪的声音里透着一股被废土现实反复踩踏后的沙哑与无奈，“制式消音器？那玩意儿早在两年前的防线溃败里就打光了。现在整个废土行省，能拿出成套消音装备的，除了核心区的猎鹰连，就只有那些垄断了黑市的大商队。”',
                '“这是维修工秦砚舟上个月捣鼓出来的土法子。用绝缘胶布死死缠在枪管上，里面塞满破布和钢丝球。能压住前两发的枪口焰和部分噪音，但第三发开始，里面的破布就会被高温点燃，甚至可能导致炸膛。”秦映雪盯着你，眼神冷厉，“如果你觉得这玩意儿比你的短刀更靠谱，你可以拿走。但我个人的建议是，不到万不得已，不要开枪。”',
                '你的刀，才是最安静的消音器。'
            ].join('\n\n')
        }] as any);

        expect(logs).toHaveLength(1);
        expect(logs[0].sender).toBe('旁白');
        expect(logs[0].text).toContain('制式消音器');
        expect(logs[0].text).toContain('如果你觉得这玩意儿');
    });

    it('keeps unlabeled quoted exclamations as narration', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: '吴杰涛的手猛地一抖……\n“我操……”'
        }] as any);

        expect(logs).toEqual([{
            sender: '旁白',
            text: '吴杰涛的手猛地一抖……\n“我操……”'
        }]);
    });
});
