import { describe, expect, it } from 'vitest';
import { 规范化对白日志, 规范化可渲染对白日志 } from '../utils/dialogueLogNormalizer';

describe.each([规范化对白日志, 规范化可渲染对白日志])('角色行里的动作与台词', (normalize) => {
    it('保留截图中的纯动作和台词前后的描写，气泡只显示原话', () => {
        const action = '坐在土炕边，指尖缓缓摩挲着那卷粗糙的焦黑兽皮。他没有去看窗外，但他能听见巷口传来的凌乱脚步声。';
        const prefix = '背靠着内墙的暗格木板，她盯着杨培强手中的兽皮，眼神里掠过一丝不安。';
        const raw = `【俞月荷】${prefix}（低声）：“你还在看那东西？”她攥紧了袖口。「快走。」`;
        const result = normalize([
            { sender: '杨培强', text: action },
            { sender: '俞月荷', text: raw.slice('【俞月荷】'.length), rawText: raw }
        ]);
        expect(result).toEqual([
            { sender: '旁白', text: '杨培强' + action + '\n俞月荷' + prefix + '（低声）', rawText: raw },
            { sender: '俞月荷', text: '“你还在看那东西？”', rawText: raw },
            { sender: '旁白', text: '她攥紧了袖口。', rawText: raw },
            { sender: '俞月荷', text: '「快走。」', rawText: raw }
        ]);
        expect(normalize(result)).toEqual(result);
    });

    it('将明确的括号动作移出有引号和无引号的台词', () => {
        expect(normalize([
            { sender: '俞月荷', text: '“别出声。（摇头）再等等。”' },
            { sender: '杨培强', text: '(压低声音)：我听见了。（他推开门）' }
        ])).toEqual([
            { sender: '俞月荷', text: '“别出声。”' },
            { sender: '旁白', text: '（摇头）' },
            { sender: '俞月荷', text: '“再等等。”' },
            { sender: '旁白', text: '(压低声音)' },
            { sender: '杨培强', text: '我听见了。' },
            { sender: '旁白', text: '（他推开门）' }
        ]);
    });

    it('保留台词里的名词引号、释义括号、正常指令和连续发言', () => {
        const logs = [
            { sender: '杨培强', text: '放下刀！我说的“钥匙”（旧称门引）还在。' },
            { sender: '俞月荷', text: '“她坐在土炕边，还喊了声「等等」。”\n“那张纸（也就是借据）我收好了。”' },
            { sender: '你', text: '“你听我说“慢着”时再拔剑。”' }
        ];
        expect(normalize(logs)).toEqual(logs);
    });

    it('叙事提到的匾额文字留在旁白，裸台词前的动作单独显示', () => {
        expect(normalize([
            { sender: '俞月荷', text: '她抬头望向写着“青崖”的匾额。' },
            { sender: '杨培强', text: '（撑着墙站起身）你也听见了吗？' }
        ])).toEqual([
            { sender: '旁白', text: '她抬头望向写着“青崖”的匾额。\n（撑着墙站起身）' },
            { sender: '杨培强', text: '你也听见了吗？' }
        ]);
    });

    it('祈使句里的人称定语和动作词开头的释义仍由角色说出', () => {
        const logs = [
            { sender: '俞月荷', text: '看着他的眼睛。\n看着她的目光。' },
            { sender: '杨培强', text: '“我说的放下（放下仇恨，而非丢掉兵器）不是认输。”' }
        ];
        expect(normalize(logs)).toEqual(logs);
    });

    it('通用动作词在独立的动作提示中可拆开，作为词义补充时留在原句', () => {
        expect(normalize([{ sender: '杨培强', text: '（放下兽皮）我指的是（放下仇恨）这一层。' }])).toEqual([
            { sender: '旁白', text: '（放下兽皮）' },
            { sender: '杨培强', text: '我指的是（放下仇恨）这一层。' }
        ]);
    });

    it('逗号后继续发出指令时保留对白，有实际目光描写时保留旁白', () => {
        const instruction = '看着他的眼睛，目光不要移开。';
        const action = '看着他的眼睛，目光始终没有移开。';
        expect(normalize([{ sender: '俞月荷', text: instruction + '\n' + action }])).toEqual([
            { sender: '俞月荷', text: instruction },
            { sender: '旁白', text: '俞月荷' + action }
        ]);
    });

    it('带释义的摇头动作拆入旁白，句中解释手势含义的括号保留', () => {
        const meaning = '你问的手势（摇头，意为拒绝）我见过。';
        expect(normalize([
            { sender: '俞月荷', text: '“好。（摇头，意为拒绝）”' },
            { sender: '杨培强', text: meaning }
        ])).toEqual([
            { sender: '俞月荷', text: '“好。”' },
            { sender: '旁白', text: '（摇头，意为拒绝）' },
            { sender: '杨培强', text: meaning }
        ]);
    });
});

describe('dialogueLogNormalizer story readability cleanup', () => {
    it('does not rewrite knuckle-whitening phrasing locally', () => {
        const logs = 规范化对白日志([
            {
                sender: '旁白',
                text: '她握住茶壶时，指节处泛起了一丝不正常的苍白。。屋内安静下来。。'
            }
        ] as any);

        expect(logs).toHaveLength(1);
        expect(logs[0].text).toContain('指节处泛起了一丝不正常的苍白');
        expect(logs[0].text).not.toContain('手指收紧');
        expect(logs[0].text).not.toContain('。。');
    });

    it('keeps very long narration unchanged instead of inserting local paragraph breaks', () => {
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

        expect(logs[0].text).toBe(longText);
    });

    it('keeps narrated quoted speech as narration instead of guessing character bubbles', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: '杨培强停下手里的动作。一个清冷的女声从侧后方传来。俞月荷正站在门边，低声说道：“你动作能不能轻一点？如果里面装的是玻璃安瓿瓶，你刚才那一下，至少报废了我们半个月的口粮。”'
        }] as any);
        expect(logs).toEqual([
            {
                sender: '旁白',
                text: '杨培强停下手里的动作。一个清冷的女声从侧后方传来。俞月荷正站在门边，低声说道：“你动作能不能轻一点？如果里面装的是玻璃安瓿瓶，你刚才那一下，至少报废了我们半个月的口粮。”'
            }
        ]);
    });

    it('protects line breaks inside quoted narration without assigning a speaker', () => {
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

    it('merges adjacent split quote entries without recovering a character bubble', () => {
        const logs = 规范化可渲染对白日志([
            { sender: '旁白', text: '叶青压低声音说道：“先别兑换，' },
            { sender: '旁白', text: '确认任务世界和限制条件。”她看向主神光球。' }
        ] as any);

        expect(logs).toEqual([
            { sender: '旁白', text: '叶青压低声音说道：“先别兑换，确认任务世界和限制条件。”她看向主神光球。' }
        ]);
    });

    it('keeps trailing narration together when quoted narration is not explicitly tagged', () => {
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

    it('splits explicit bracket speaker dialogue embedded inside a narration paragraph', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: '亨特没有抬眼，只把杯子推到桌边。【亨特】“说真的，这地方的品味简直糟透了。”他只是缓缓伸出右手，把冰冷的杯壁贴近嘴唇。'
        }] as any);

        expect(logs).toEqual([
            { sender: '旁白', text: '亨特没有抬眼，只把杯子推到桌边。' },
            { sender: '亨特', text: '说真的，这地方的品味简直糟透了。' },
            { sender: '旁白', text: '他只是缓缓伸出右手，把冰冷的杯壁贴近嘴唇。' }
        ]);
    });

    it('keeps narration around multiple embedded bracket speaker turns', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: '夜店里的灯光晃了一下。【亨特】“不过，我们今天不是来查税的。”【陈小刀】“他现在就在二楼。”人群又把声音吞了回去。'
        }] as any);

        expect(logs).toEqual([
            { sender: '旁白', text: '夜店里的灯光晃了一下。' },
            { sender: '亨特', text: '不过，我们今天不是来查税的。' },
            { sender: '陈小刀', text: '他现在就在二楼。' },
            { sender: '旁白', text: '人群又把声音吞了回去。' }
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

    it('keeps xml-style character tags in narration instead of character bubbles', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: '主神光球闪烁了一下。<林岚>先别兑换，确认任务世界和限制条件。</林岚><叶青>我去检查补给箱。</叶青>白光重新稳定。'
        }] as any);

        expect(logs).toEqual([
            { sender: '旁白', text: '主神光球闪烁了一下。<林岚>先别兑换，确认任务世界和限制条件。</林岚><叶青>我去检查补给箱。</叶青>白光重新稳定。' }
        ]);
    });

    it('keeps escaped xml-style character tags in narration', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: '队伍频道亮起：&lt;秦映雪&gt;别急着开门，先看门缝下面有没有影子。&lt;/秦映雪&gt;'
        }] as any);

        expect(logs).toEqual([
            { sender: '旁白', text: '队伍频道亮起：&lt;秦映雪&gt;别急着开门，先看门缝下面有没有影子。&lt;/秦映雪&gt;' }
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

    it('downgrades body-part labels such as 双手 to narration', () => {
        const logs = 规范化可渲染对白日志([
            { sender: '双手', text: '慢慢合拢，指尖扣住杯沿。' },
            { sender: '指尖', text: '在杯壁上停了一瞬。' }
        ] as any);

        expect(logs).toEqual([{
            sender: '旁白',
            text: '慢慢合拢，指尖扣住杯沿。\n在杯壁上停了一瞬。'
        }]);
    });

    it('keeps raw debug source when body-part labels are downgraded', () => {
        const logs = 规范化可渲染对白日志([
            {
                sender: '双手',
                text: '慢慢合拢，指尖扣住杯沿。',
                rawText: '{\"sender\":\"双手\",\"text\":\"慢慢合拢，指尖扣住杯沿。\"}'
            }
        ] as any);

        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
            sender: '旁白',
            text: '慢慢合拢，指尖扣住杯沿。'
        });
        expect(logs[0].rawText).toContain('\"sender\":\"双手\"');
    });

    it('does not split body-part bracket tags into character bubbles', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: '她垂下眼。【双手】“慢慢合拢，像是把那点犹豫压回掌心。”烛火轻轻晃了一下。'
        }] as any);

        expect(logs).toEqual([{
            sender: '旁白',
            text: '她垂下眼。【双手】“慢慢合拢，像是把那点犹豫压回掌心。”烛火轻轻晃了一下。'
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

    it('keeps quoted oral speech after voice and gaze cues as narration unless explicitly tagged', () => {
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
        expect(logs[0].text).toContain('秦映雪的声音里透着');
        expect(logs[0].text).toContain('“制式消音器？');
        expect(logs[0].text).toContain('“如果你觉得这玩意儿比你的短刀更靠谱');
        expect(logs[0].text).toContain('你的刀，才是最安静的消音器。');
    });

    it('does not infer a speaker from narrative adverbs before inner quoted thoughts', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: [
                '她低下头，红宝石般的眼眸透过兜帽的阴影，死死盯着脚下那块青石。',
                '',
                '“只要走上去……就有白面馒头吃。”'
            ].join('\n')
        }] as any);

        expect(logs).toHaveLength(1);
        expect(logs[0]).toEqual({
            sender: '旁白',
            text: '她低下头，红宝石般的眼眸透过兜帽的阴影，死死盯着脚下那块青石。\n“只要走上去……就有白面馒头吃。”'
        });
        expect(logs.some(item => item.sender === '死死' || item.sender === '死')).toBe(false);
    });

    it('keeps quoted oral speech without a concrete speaker cue as narration', () => {
        const logs = 规范化可渲染对白日志([{
            sender: '旁白',
            text: '一个清冷的女声从侧后方传来，“别乱动，柜子后面可能有机关。”'
        }] as any);

        expect(logs).toHaveLength(1);
        expect(logs[0].sender).toBe('旁白');
        expect(logs[0].text).toContain('柜子后面可能有机关');
    });
});
