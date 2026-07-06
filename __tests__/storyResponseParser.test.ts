import { describe, expect, it } from 'vitest';
import { parseStoryRawText, StoryResponseParseError, 解析命令块 } from '../services/ai/storyResponseParser';
import { 规范化可渲染对白日志 } from '../utils/dialogueLogNormalizer';
import { 构建标签缺失补充提示 } from '../utils/parseErrorHints';

describe('storyResponseParser', () => {
    it('parses Izumi-style options tag into quick action options', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】灯火在客栈窗纸上轻轻摇晃。',
            '</正文>',
            '<短期记忆>主角在客栈中停留。</短期记忆>',
            '<options>',
            '>选项一：查看窗外动静',
            '>选项二：询问掌柜传闻',
            '>选项三：回房整理行囊',
            '>选项四：拔剑戒备',
            '</options>'
        ].join('\n'));

        expect(parsed.action_options).toEqual([
            '查看窗外动静',
            '询问掌柜传闻',
            '回房整理行囊',
            '拔剑戒备'
        ]);
    });

    it('rejects successful story parse when required action options are missing', () => {
        expect(() => parseStoryRawText([
            '<thinking>',
            '计划中提到最终要输出 <行动选项>，但后文没有真实选项块。',
            '</thinking>',
            '<正文>',
            '【旁白】晨钟响起，你和俞月荷走出杂役小院。',
            '</正文>',
            '<短期记忆>主角与俞月荷准备前往执事堂。</短期记忆>'
        ].join('\n'), { requireActionOptionsTag: true })).toThrow(StoryResponseParseError);
    });

    it('does not render Izumi state blocks or status lines as quick action options', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】你推开门，外面的天空阴沉。',
            '</正文>',
            '<短期记忆>主角与俞月荷发现外界异常。</短期记忆>',
            '<current_event>',
            '当前主线任务:MQ.1_生化危机生存挑战',
            '当前支线事件:SQ.1_探索民宅安全状况',
            '最新使用支线事件编号:SQ.1',
            '</current_event>',
            '<progress>',
            'PG.1',
            '时间推进:1:01:01:00:00 -> 1:01:01:08:15',
            '</progress>',
            '<options>',
            '>选项一：检查门外走廊',
            '<current_event>',
            '当前主线任务:MQ.1_生化危机生存挑战',
            '</current_event>',
            '<progress>',
            'PG.1',
            '</progress>',
            '>选项二：询问俞月荷是否受伤',
            '</options>'
        ].join('\n'));

        const body = parsed.logs.map(item => item.text).join('\n');
        expect(body).not.toContain('current_event');
        expect(body).not.toContain('当前主线任务');
        expect(parsed.action_options).toEqual([
            '检查门外走廊',
            '询问俞月荷是否受伤'
        ]);
    });

    it('does not expose malformed closing action tag as a quick action', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】倒计时仍在墙上跳动。',
            '</正文>',
            '<短期记忆>主角与俞月荷在主神空间等待试炼。</短期记忆>',
            '<行动选项>',
            '尝试通过意识沟通半空中的主神光球',
            '推开金属门，前往外面的主神广场查看',
            '与俞月荷详细商讨接下来的防卫分工',
            '仔细搜查个人房间的金属墙壁与角落',
            '</行动选项]'
        ].join('\n'));

        expect(parsed.action_options).toEqual([
            '尝试通过意识沟通半空中的主神光球',
            '推开金属门，前往外面的主神广场查看',
            '与俞月荷详细商讨接下来的防卫分工',
            '仔细搜查个人房间的金属墙壁与角落'
        ]);
    });

    it('accepts narrative event tags between body and short memory', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】风声掠过檐角，你按住桌上的旧信，听见楼下有人低声议论城外的夜雨。',
            '</正文>',
            '<情节事件>延续：夜雨客栈</情节事件>',
            '<短期记忆>主角在客栈等待，并听见楼下议论。</短期记忆>'
        ].join('\n'), { validateTagCompleteness: true });

        expect(parsed.logs).toEqual([
            {
                sender: '旁白',
                text: '风声掠过檐角，你按住桌上的旧信，听见楼下有人低声议论城外的夜雨。'
            }
        ]);
        expect(parsed.shortTerm).toBe('主角在客栈等待，并听见楼下议论。');
    });

    it('does not fold variable plan or short memory into body fallback', () => {
        const parsed = parseStoryRawText([
            '<变量规划>',
            '角色状态需要初始化。',
            '</变量规划>',
            '正文：',
            '【旁白】忠伯推开柴门，向院中望去。',
            '短期记忆：',
            '忠伯在院中现身。',
            '命令：',
            'set 环境.具体地点 = "柴门小院"'
        ].join('\n'), { enableTagRepair: false });

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '忠伯推开柴门，向院中望去。' }
        ]);
        expect(parsed.t_var_plan).toBe('角色状态需要初始化。');
        expect(parsed.shortTerm).toBe('忠伯在院中现身。');
    });

    it('cuts residual protocol blocks out of a malformed body block', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】忠伯推开柴门，向院中望去。',
            '短期记忆：',
            '忠伯在院中现身。',
            '变量规划：',
            '环境地点发生变化。',
            '</正文>',
            '<短期记忆>忠伯在院中现身。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '忠伯推开柴门，向院中望去。' }
        ]);
        expect(parsed.shortTerm).toBe('忠伯在院中现身。');
    });

    it('removes leaked opening initialization tables from rendered body', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '### 1. 角色初始化',
            '- **基础信息**：姓名“杨培强”，性别“男”。',
            '- **天赋列表**（完整承接建档）：',
            '- [0] 名称：福星高照｜描述：命数偏吉。',
            '### 4. 门派与任务初始化',
            '- **玩家门派**：ID: none, 名称: 无门无派。',
            '- **任务列表**：',
            '- [Task001] 晨间问安：当前状态“进行中”。',
            '【旁白】窗纸被晨光照得微亮，院外传来木桶落地的轻响。',
            '</正文>',
            '<短期记忆>主角在晨间醒来。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '窗纸被晨光照得微亮，院外传来木桶落地的轻响。' }
        ]);
    });

    it('rejects bare canonical game time lines during strict story parsing', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '此时是1:01:01:06:30。',
            '【旁白】云岫山脉的晨雾尚未散尽，执事堂前的青石台阶泛着湿光。',
            '</正文>',
            '<短期记忆>主角抵达执事堂前。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/标准时间真值行|后台标准时间字符串/);
    });

    it('removes colon-suffixed opening initialization lists from body tail', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】杨培强在自家后院晨练结束，杨青儿送来温水。林婉清随林家长辈登门拜访。',
            '1. 角色初始化：',
            '- 姓名：杨培强｜境界：开脉境三重（累计境界值：3）｜内力：30/30｜经验：150/300',
            '- 六维：力量 5 / 敏捷 5 / 体质 5 / 根骨 5 / 悟性 5 / 福源 5',
            '- 装备：[ID:Item001] 青色练功服（穿戴：胸部/腹部/四肢）',
            '2. 环境初始化：',
            '- 时间：0001:01:01:06:15（1年1月1日卯时一刻）',
            '- 地点：中州 -> 杨家堡 -> 杨府 -> 后院演武场',
            '3. 社交初始化：',
            '- [NPC001] 杨青儿：16岁，杨培强亲妹，身份：杨府小姐。',
            '4. 门派与任务初始化：',
            '- 玩家门派：[ID:Org001] 杨家堡。职位：少主/长子。',
            '- 任务列表：[ID:Task001] 前厅探秘。状态：进行中。',
            '</正文>',
            '<短期记忆>林家登门，杨培强准备去前厅。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '杨培强在自家后院晨练结束，杨青儿送来温水。林婉清随林家长辈登门拜访。' }
        ]);
    });

    it('rejects quoted dialogue embedded in narrator lines during strict parsing', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '【旁白】晨风卷过演武场，杨镇远负手站在石阶前，沉声道：“剑势散了，脚下也浮。再走一遍。”',
            '【旁白】杨培强收剑回身，说道：“侄儿明白。”杨镇远点了点头，目光仍落在剑尖上。',
            '</正文>',
            '<短期记忆>杨镇远在演武场考校杨培强剑法。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/对白嵌在旁白引号中|写在【旁白】行内/);
    });

    it('does not flag narrative phrase prefixes as unlabeled dialogue speakers', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '随着她低头清点物资，墙角的灯光一点点暗下去。',
            '他是个正常的男人，如果是在旧时代，也许会有更轻松的选择。',
            '</正文>',
            '<短期记忆>清点物资时气氛沉默。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        expect(parsed.logs).toEqual([{
            sender: '旁白',
            text: '随着她低头清点物资，墙角的灯光一点点暗下去。\n他是个正常的男人，如果是在旧时代，也许会有更轻松的选择。'
        }]);
    });

    it('rejects an empty body protocol tag followed by bare Xiaomi MiMo prose', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '【旁白】',
            '冷白光从头顶泻下来，不刺眼，却无处不在。',
            '',
            '杨培强睁开眼。',
            '',
            '"你倒是起得早。"',
            '',
            '声音从走廊方向传过来。',
            '</正文>',
            '<短期记忆>杨培强在主神空间醒来。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/正文协议|裸文|裸引号|【旁白】/);
    });

    it('keeps bracketed action and narrative phrase tags as narration instead of speakers', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【他摇了摇头】至于玄铁精石，听起来确实不像普通矿材。',
            '【带来的极致眼力】楚有常的视线从灯火里掠过，没有落在任何人脸上。',
            '【林间细雨】落在青石阶上，声音压得很低。',
            '</正文>',
            '<短期记忆>楚有常谈到玄铁精石。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([{
            sender: '旁白',
            text: '【他摇了摇头】至于玄铁精石，听起来确实不像普通矿材。\n【带来的极致眼力】楚有常的视线从灯火里掠过，没有落在任何人脸上。\n【林间细雨】落在青石阶上，声音压得很低。'
        }]);
    });

    it('keeps consecutive valid speaker tags as dialogue turns', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【楚有常】玄铁精石不是凡火能炼的东西。',
            '【杨培强】那就先封存，等找到合适的炉火再说。',
            '</正文>',
            '<短期记忆>楚有常与杨培强讨论玄铁精石。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '楚有常', text: '玄铁精石不是凡火能炼的东西。' },
            { sender: '杨培强', text: '那就先封存，等找到合适的炉火再说。' }
        ]);
    });

    it('accepts known four-character in-scene speaker tags as dialogue turns', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【阿卡菲尔】我已经在这里等你很久了。',
            '【旁白】雨声压过窗棂。',
            '</正文>',
            '<短期记忆>阿卡菲尔在场并与主角交谈。</短期记忆>'
        ].join('\n'), {
            validateDialogueFormat: true,
            knownSpeakers: ['阿卡菲尔']
        });

        expect(parsed.logs).toEqual([
            { sender: '阿卡菲尔', text: '我已经在这里等你很久了。' },
            { sender: '旁白', text: '雨声压过窗棂。' }
        ]);
    });

    it('rejects a speaker tag on its own line so the model must repair the body format', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '【旁白】冷雾在黑色的竹林间缓缓流淌。',
            '【散修首领】',
            '“小娘们，跑得挺快啊。乖乖把身上的灵石和那柄铁剑交出来。”俞月荷没有答话，只是再次向后退了一步。',
            '【旁白】她的靴底踩碎了一块枯竹枝。',
            '</正文>',
            '<短期记忆>散修首领在铁线竹林中拦截俞月荷。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/空的【散修首领】标签|裸引号对白|局部修复/);
    });

    it('rejects repeated standalone title-like speaker tags instead of repairing them locally', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '【旁白】散修首领挥刀逼近。',
            '【散修首领】',
            '“找死！”',
            '【旁白】他怒吼着，将灵力灌入铁刀。',
            '【散修首领】',
            '“啊——！”',
            '【旁白】厚铁刀当啷一声掉落在泥泞中。',
            '</正文>',
            '<短期记忆>散修首领被主角和俞月荷伏击重创。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/空的【散修首领】标签|裸引号对白|局部修复/);
    });

    it('rejects narration appended after a tagged quoted dialogue line', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '【旁白】散修首领挥刀逼近。',
            '【散修首领】“找死！”他怒吼着，将灵力灌入铁刀。',
            '</正文>',
            '<短期记忆>散修首领挥刀逼近。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/对白闭合后又接了旁白|必须拆成/);
    });

    it('detects colon dialogue for known four-character speakers during strict parsing', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '阿卡菲尔：我已经在这里等你很久了。',
            '</正文>',
            '<短期记忆>阿卡菲尔在场并与主角交谈。</短期记忆>'
        ].join('\n'), {
            validateDialogueFormat: true,
            knownSpeakers: ['阿卡菲尔']
        })).toThrow(/阿卡菲尔.*冒号格式/);
    });

    it('rejects bare colon speaker lines during strict parsing', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '林婉儿：我也看到这个异常了，有些角色说话的时候对话框就没了。',
            '</正文>',
            '<短期记忆>林婉儿反馈部分角色对白缺少气泡。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/冒号格式/);
    });

    it('rejects colon speaker lines with action hints without promoting protocol labels', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '地点：杨家堡后院',
            '任务：检查对话框',
            '林婉儿（皱眉）：真正的对白才需要头像。',
            '</正文>',
            '<短期记忆>林婉儿说明对白气泡问题。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/林婉儿.*冒号格式/);
    });

    it('still rejects likely unlabeled oral dialogue during strict parsing', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '俞月荷冷笑一声，将表格拍在桌上。',
            '三百点？你真觉得这点贡献够换一整箱药？',
            '</正文>',
            '<短期记忆>俞月荷质疑贡献兑换。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/疑似角色「俞月荷」/);
    });

    it('rejects quote text split across body lines during strict parsing', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '【旁白】雨声忽然压低。',
            '【沈砚】“师父曾说：‘若你踏入这座城，',
            '就不要再回头，因为城门之后等着你的，不只是仇人，',
            '还有你自己最不愿承认的心魔。’我一直记得。”',
            '【旁白】油灯在风里晃了一下。',
            '</正文>',
            '<短期记忆>沈砚复述师父告诫。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/引号内容跨行|引号内文字/);
    });

    it('reports likely truncation when tag repair is disabled and a required tag is left open', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '【旁白】晨雾压在院墙上。',
            '</正文>',
            '<短期记忆>',
            '主角在清晨醒来，准备出门'
        ].join('\n'), {
            validateTagCompleteness: true,
            enableTagRepair: false
        })).toThrow(/疑似输出在 <短期记忆> 内被截断|提高最大输出Token/);
    });

    it('reports concrete missing protocol tags instead of a generic parse failure', () => {
        try {
            parseStoryRawText([
                '<thinking>检查标签。</thinking>',
                '<短期记忆>主角听见院外脚步。</短期记忆>',
                '<命令>set 环境.天气 = "晴"</命令>'
            ].join('\n'));
            throw new Error('expected parser to throw');
        } catch (error) {
            expect(error).toBeInstanceOf(StoryResponseParseError);
            const parseError = error as StoryResponseParseError;
            expect(parseError.parseDetail || '').toMatch(/顶层标签顺序错误|正文/);
            expect(parseError.protocolIssues || []).toContain('顶层标签顺序错误：<短期记忆> 出现在 <正文> 之前');
        }
    });

    it('includes the Gemini fake-streaming hint when the label failure is tied to missing tags', () => {
        const detail = 构建标签缺失补充提示({
            parseErrorDetail: '缺少 <正文>...</正文> 标签；缺少 <短期记忆>...</短期记忆> 标签',
            apiConfig: {
                供应商: 'gemini',
                model: 'gemini-2.5-flash-假流式',
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta'
            } as any
        });

        expect(detail).toContain('公益站使用 Gemini');
        expect(detail).toContain('假流式模型');
    });

    it('keeps sub commands as sub actions for inventory deduction', () => {
        const commands = 解析命令块([
            '<命令>',
            'sub 角色.物品列表[0].堆叠数量 = 1',
            '</命令>'
        ].join('\n'));

        expect(commands).toEqual([
            { action: 'sub', key: '角色.物品列表[0].堆叠数量', value: 1 }
        ]);
    });

    it('rejects isolated punctuation lines during strict parsing', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '【旁白】倒计时冰冷地跳动着，昭示着平静的时光正在飞速流逝。',
            '。',
            '【旁白】她握紧手中的手摇电筒，等待杨培强的决定。',
            '</正文>',
            '<短期记忆>主神空间倒计时继续推进。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/孤立标点|标点单独成行/);
    });

    it('rejects knuckle-whitening stock phrasing during strict parsing', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '她看着杨培强，虽然脸上还挂着那副有些别扭的傲娇神情，但眼神中的探询与不安却极其明显。',
            '她握紧了手中的手摇电筒，指关节因为用力而微微泛白，等待着杨培强的决定。',
            '</正文>',
            '<短期记忆>未知空间内，她等待杨培强做决定。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/高频套话|指关节|泛白/);
    });

    it('rejects multi-word English fragments mixed into Chinese story body during strict parsing', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '清晨的冷雾像是有分量的薄纱，沉甸甸地压在云岫剑宗碧落峰 lower slope 的石板路上。',
            '</正文>',
            '<短期记忆>主角在碧落峰清晨醒来。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/异常英文片段|英文夹杂|自然中文|lower slope/);
    });

    it('keeps only explicit tagged single-speaker text as character bubbles for rendering', () => {
        const rendered = 规范化可渲染对白日志([
            { sender: '杨培强', text: '“弟子，领命。”\n\n风，渐渐停了。\n\n铅灰色的云层开始散去。' },
            { sender: '众人齐声', text: '“遵命！”' },
            { sender: '杨镇远', text: '风声穿过长廊。' },
            { sender: '杨青儿', text: '“哥，小心些。”' },
            { sender: '【林云轩】', text: '（将铜盆放稳，拧干热帕子）“娘，先净净面吧。”' }
        ]);

        expect(rendered).toEqual([
            { sender: '杨培强', text: '“弟子，领命。”' },
            { sender: '旁白', text: '风，渐渐停了。\n\n铅灰色的云层开始散去。\n“遵命！”' },
            { sender: '杨镇远', text: '风声穿过长廊。' },
            { sender: '杨青儿', text: '“哥，小心些。”' },
            { sender: '林云轩', text: '（将铜盆放稳，拧干热帕子）“娘，先净净面吧。”' }
        ]);
    });

    it('filters leaked judge fragments from renderable logs', () => {
        const rendered = 规范化可渲染对白日志([
            { sender: '旁白', text: '城门金色流光转动。' },
            { sender: '【洞察】', text: '入城气机感知' },
            { sender: '旁白', text: '判定值 22 / 难度 15\n基础 B(+10,静心观微)\n状态 S(+10,水银灵力内敛)\n环境 E(+2,城门阵法压迫)\n结果：大成功\n</judge>' },
            { sender: '【判定】', text: '【判定】[洞察]入城气机感知｜触发对象 玩家:杨培强｜判定值 22/难度 15｜结果=大成功' },
            { sender: '旁白', text: '你跨过青石门槛。' }
        ]);

        expect(rendered).toEqual([
            { sender: '旁白', text: '城门金色流光转动。' },
            { sender: '【判定】', text: '【判定】[洞察]入城气机感知｜触发对象 玩家:杨培强｜判定值 22/难度 15｜结果=大成功' },
            { sender: '旁白', text: '你跨过青石门槛。' }
        ]);
    });

    it('extracts square-bracket judgment lines without swallowing following narration', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】老王头被这股阴冷的气势一激，退到一旁。',
            '[洞察]查阅账目漏洞｜触发对象 玩家:杨培强｜判定值 11/难度 8｜基础 B(+6,观察与逻辑分析)｜状态 S(+3,过目不忘天赋加成)｜结果=成功',
            '杨培强的手指在泛黄的账页上快速划过，一目十行。',
            '</正文>',
            '<短期记忆>杨培强查账成功。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '老王头被这股阴冷的气势一激，退到一旁。' },
            { sender: '[洞察]', text: '[洞察]查阅账目漏洞｜触发对象 玩家:杨培强｜判定值 11/难度 8｜基础 B(+6,观察与逻辑分析)｜状态 S(+3,过目不忘天赋加成)｜结果=成功' },
            { sender: '旁白', text: '杨培强的手指在泛黄的账页上快速划过，一目十行。' }
        ]);
    });

    it('splits narration leaked onto the same judgment line', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】王管事脸色发白。',
            '【交涉】威压管事查账｜触发对象 玩家:杨培强｜判定值 10/难度 6｜结果=成功 杨培强没有废话，直接释放灵力波动。',
            '</正文>',
            '<短期记忆>杨培强威压王管事。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '王管事脸色发白。' },
            { sender: '【交涉】', text: '【交涉】威压管事查账｜触发对象 玩家:杨培强｜判定值 10/难度 6｜结果=成功' },
            { sender: '旁白', text: '杨培强没有废话，直接释放灵力波动。' }
        ]);
    });

    it('removes orphan judge detail blocks from rendered body', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】州府城门高达数十丈，玄色砖石上隐约可见金色流光转动。',
            '【洞察】入城气机感知',
            '判定值 22 / 难度 15',
            '基础 B(+10,静心观微)',
            '状态 S(+10,水银灵力内敛)',
            '环境 E(+2,城门阵法压迫)',
            '结果：大成功',
            '</judge>',
            '【判定】[洞察]入城气机感知｜触发对象 玩家:杨培强｜判定值 22/难度 15｜基础 B(+10,静心观微)｜状态 S(+10,水银灵力内敛)｜环境 E(+2,城门阵法压迫)｜结果=大成功',
            '【旁白】跨过那道刻满繁复符文的青石门槛时，你目不斜视。',
            '</正文>',
            '<短期记忆>杨培强入城时成功收敛气机。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '州府城门高达数十丈，玄色砖石上隐约可见金色流光转动。' },
            { sender: '【判定】', text: '【判定】[洞察]入城气机感知｜触发对象 玩家:杨培强｜判定值 22/难度 15｜基础 B(+10,静心观微)｜状态 S(+10,水银灵力内敛)｜环境 E(+2,城门阵法压迫)｜结果=大成功' },
            { sender: '旁白', text: '跨过那道刻满繁复符文的青石门槛时，你目不斜视。' }
        ]);
        expect(parsed.logs.map(item => item.text).join('\n')).not.toContain('</judge>');
        expect(parsed.logs.map(item => item.text).join('\n')).not.toContain('判定值 22 / 难度 15');
    });

    it('strips HTML comment fragments leaked by tavern presets from body instead of retrying a complete story', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】竹林深处，隐隐有兵刃交击之声和厉喝声顺着湿热的风飘了过来。',
            '<!',
            '-- 结尾停留在冲突即将爆发的边缘，留白恰到好处，引人遐想。',
            '-->',
            '【旁白】奥姑微微侧过头，帷帽下的双眸中闪过一抹锐利的锋芒。',
            '</正文>',
            '<短期记忆>竹林深处传来冲突声，奥姑察觉异样。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        const body = parsed.logs.map(item => item.text).join('\n');
        expect(body).toContain('竹林深处');
        expect(body).toContain('奥姑微微侧过头');
        expect(body).not.toContain('<!');
        expect(body).not.toContain('-->');
        expect(body).not.toContain('结尾停留');
    });

    it('parses <角色名单> tag and passes declared names to dialogue validation', () => {
        const parsed = parseStoryRawText([
            '<角色名单>',
            '芙莉莲',
            '琪亚娜',
            '伊莎贝尔',
            '</角色名单>',
            '<正文>',
            '【芙莉莲】"魔法可不是万能的。"',
            '【琪亚娜】"但至少能让我们走得更远。"',
            '【伊莎贝尔】"你们俩别吵了，快看前面。"',
            '【旁白】三人望向远处的浓雾。',
            '</正文>',
            '<短期记忆>芙莉莲和琪亚娜起了争执。</短期记忆>'
        ].join('\n'));

        expect(parsed.declaredSpeakers).toEqual(['芙莉莲', '琪亚娜', '伊莎贝尔']);
        expect(parsed.logs).toHaveLength(4);
        expect(parsed.logs[0].sender).toBe('芙莉莲');
        expect(parsed.logs[1].sender).toBe('琪亚娜');
        expect(parsed.logs[2].sender).toBe('伊莎贝尔');
        expect(parsed.logs[3].sender).toBe('旁白');
    });

    it('keeps environment labels as narration in lenient parsing', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【庞博】"卧槽！那到底是什么东西?!"',
            '【环境】轰——！',
            '这不是普通的重物落地，这简直像是一颗陨石砸进了泰山。',
            '</正文>',
            '<短期记忆>黑龙尸体砸落玉皇顶。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '庞博', text: '"卧槽！那到底是什么东西?!"' },
            {
                sender: '旁白',
                text: '【环境】轰——！\n这不是普通的重物落地，这简直像是一颗陨石砸进了泰山。'
            }
        ]);
    });

    it('asks for local AI repair when strict parsing sees environment labels as dialogue bubbles', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '【庞博】"卧槽！那到底是什么东西?!"',
            '【环境】轰——！',
            '这不是普通的重物落地，这简直像是一颗陨石砸进了泰山。',
            '</正文>',
            '<短期记忆>黑龙尸体砸落玉皇顶。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/疑似非角色标签「环境」|局部修复/);
    });

    it('repairs incomplete <角色名单> tag (missing closing tag)', () => {
        const parsed = parseStoryRawText([
            '<角色名单>',
            '芙莉莲',
            '琪亚娜',
            '<正文>',
            '【芙莉莲】"你好。"',
            '</正文>',
            '<短期记忆>test</短期记忆>'
        ].join('\n'));

        expect(parsed.declaredSpeakers).toEqual(['芙莉莲', '琪亚娜']);
        expect(parsed.logs[0].sender).toBe('芙莉莲');
    });

    it('handles wrong closing tag with 兼容错误闭合', () => {
        const parsed = parseStoryRawText([
            '<角色名单>芙莉莲<角色名单>',
            '<正文>',
            '【芙莉莲】"测试。"',
            '</正文>',
            '<短期记忆>test</短期记忆>'
        ].join('\n'));

        expect(parsed.declaredSpeakers).toEqual(['芙莉莲']);
        expect(parsed.logs[0].sender).toBe('芙莉莲');
    });

    it('recognizes English aliases for 角色名单', () => {
        const parsed = parseStoryRawText([
            '<rolelist>芙莉莲, 琪亚娜</rolelist>',
            '<正文>',
            '【芙莉莲】"Hi."',
            '</正文>',
            '<短期记忆>test</短期记忆>'
        ].join('\n'));

        expect(parsed.declaredSpeakers).toEqual(['芙莉莲', '琪亚娜']);
        expect(parsed.logs[0].sender).toBe('芙莉莲');
    });
});
