import { describe, expect, it } from 'vitest';
import { parseStoryRawText, StoryResponseParseError, 解析命令块, 提取首尾思考区段 } from '../services/ai/storyResponseParser';
import { 规范化可渲染对白日志 } from '../utils/dialogueLogNormalizer';
import { 构建标签缺失补充提示 } from '../utils/parseErrorHints';

describe('storyResponseParser', () => {
    it('把已闭合角色对白后的无标签叙事切回旁白，保留后续同角色短句气泡', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '折生的话音刚落，房间里那股原本还算欢快的邀功气氛，极其突兀地停滞了一瞬。',
            '【萧蒲童子】“哈？”',
            '萧蒲童子终于反应过来了，她指着地上还在不停扭动、流着口水的苏清月，爆发出一阵极其夸张的大笑。',
            '【萧蒲童子】“民女？主人，你是不是昨晚睡觉把脑子给压扁了？谁家民女大半夜的在荒郊野外的破庙里御剑飞行啊！还拿着把冷飕飕的破剑到处乱砍！”',
            '葛叶御前松开踩在苏清月臀部上的脚，双手抱胸，踩着高齿木履往前走了一步。',
            '【葛叶御前】“妾身看你不仅抠门，眼神也不太好使。”',
            '</正文>',
            '<短期记忆>萧蒲童子与葛叶御前回应折生。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: false });

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '折生的话音刚落，房间里那股原本还算欢快的邀功气氛，极其突兀地停滞了一瞬。' },
            { sender: '萧蒲童子', text: '“哈？”' },
            { sender: '旁白', text: '萧蒲童子终于反应过来了，她指着地上还在不停扭动、流着口水的苏清月，爆发出一阵极其夸张的大笑。' },
            { sender: '萧蒲童子', text: '“民女？主人，你是不是昨晚睡觉把脑子给压扁了？谁家民女大半夜的在荒郊野外的破庙里御剑飞行啊！还拿着把冷飕飕的破剑到处乱砍！”' },
            { sender: '旁白', text: '葛叶御前松开踩在苏清月臀部上的脚，双手抱胸，踩着高齿木履往前走了一步。' },
            { sender: '葛叶御前', text: '“妾身看你不仅抠门，眼神也不太好使。”' }
        ]);

        const rendered = 规范化可渲染对白日志(parsed.logs);
        expect(rendered[1]?.sender).toBe('萧蒲童子');
        expect(rendered[1]?.text).toBe('“哈？”');
        expect(rendered[2]?.sender).toBe('旁白');
        expect(rendered[2]?.text).toContain('终于反应过来了');
        expect(rendered[3]?.sender).toBe('萧蒲童子');
        expect(rendered[3]?.text).toContain('民女？主人');
    });

    it('识别带括号动作前缀的完整角色对白边界', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【萧蒲童子】（轻笑）“哈？”',
            '她抬手指向门外。',
            '【旁白】风声从廊下掠过。',
            '</正文>',
            '<短期记忆>萧蒲童子轻笑后观察门外。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: false });

        expect(parsed.logs).toEqual([
            { sender: '萧蒲童子', text: '（轻笑）“哈？”' },
            { sender: '旁白', text: '她抬手指向门外。\n风声从廊下掠过。' }
        ]);
    });

    it('剥离闭合的 subtext 思维链注释块，正文不受影响', () => {
        const result = 提取首尾思考区段([
            '<thinking>',
            '<!-- begin_of_Subtext_think -->',
            '嘿嘿，我们来了呢。"你没急着回答"这句是对白残留。',
            '<!-- end_of_Subtext_think -->',
            '正式思考内容。',
            '</thinking>',
            '<正文>',
            '【旁白】晨钟响起。',
            '</正文>'
        ].join('\n'));

        expect(result.textWithoutThinking).toContain('<正文>');
        expect(result.textWithoutThinking).not.toContain('begin_of_Subtext_think');
        expect(result.textWithoutThinking).not.toContain('你没急着');
        expect(result.thinking).toContain('你没急着');
        expect(result.thinking).toContain('正式思考内容');
    });

    it('剥离无 <thinking> 包裹的 subtext 思维链注释块', () => {
        const result = 提取首尾思考区段([
            '<!-- begin_of_Subtext_think -->',
            '嘿嘿，我们来了呢。她说："你没急着走。"',
            '<!-- end_of_Subtext_think -->',
            '<正文>',
            '【旁白】晨钟响起。',
            '</正文>'
        ].join('\n'));

        expect(result.textWithoutThinking).toContain('<正文>');
        expect(result.textWithoutThinking).not.toContain('你没急着');
        expect(result.thinking).toContain('你没急着');
    });

    it('subtext 注释块未闭合时截到下一个协议标签为止', () => {
        const result = 提取首尾思考区段([
            '<!-- begin_of_Subtext_think -->',
            '思考内容："你没急着回答。"',
            '<正文>',
            '【旁白】晨钟响起。',
            '</正文>'
        ].join('\n'));

        expect(result.textWithoutThinking).toContain('<正文>');
        expect(result.textWithoutThinking).not.toContain('你没急着');
        expect(result.thinking).toContain('你没急着');
    });

    it('subtext 注释块未闭合时不吞掉后续的短期记忆等状态块', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】晨钟响起，你和俞月荷走出杂役小院。',
            '</正文>',
            '<!-- begin_of_Subtext_think -->',
            '未闭合的思维链残留："你没急着走。"',
            '<短期记忆>主角与俞月荷准备前往执事堂。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '晨钟响起，你和俞月荷走出杂役小院。' }
        ]);
        expect(parsed.shortTerm).toContain('执事堂');
    });

    it('subtext 思维链残留不再触发正文对白格式误报', () => {
        const parsed = parseStoryRawText([
            '<!-- begin_of_Subtext_think -->',
            '嘿嘿，我们来了呢。她说："你没急着走。"',
            '<!-- end_of_Subtext_think -->',
            '<正文>',
            '【旁白】晨钟响起，你和俞月荷走出杂役小院。',
            '</正文>',
            '<短期记忆>主角与俞月荷准备前往执事堂。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '晨钟响起，你和俞月荷走出杂役小院。' }
        ]);
    });

    it('合并模型返回的多个正文标签，避免界面只显示第一段', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【角色乙】山雨落在青瓦上。',
            '</正文>',
            '<正文>',
            '【角色甲】门外传来急促脚步声。',
            '</正文>',
            '<短期记忆>两段正文均已发生。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '角色乙', text: '山雨落在青瓦上。' },
            { sender: '角色甲', text: '门外传来急促脚步声。' }
        ]);
    });

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

    it('strips leaked variable/memory command block appended after body', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】厚重的朱漆大门已然敞开，殿内隐约可见几盏长明灯的昏黄火光。',
            '【环境.时间】',
            '"1:01:01:07:00"',
            '【俞月荷.好感度】',
            '=62',
            '【俞月荷.记忆】',
            '=push 社交[0].记忆 {',
            '"内容": "清晨指点入门剑法，随后一同抵达外务堂",',
            '"时间": "1:01:01:07:00"',
            '}',
            '</正文>',
            '<短期记忆>两人抵达外务堂准备登记。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '厚重的朱漆大门已然敞开，殿内隐约可见几盏长明灯的昏黄火光。' }
        ]);
        const body = parsed.logs.map(item => item.text).join('\n');
        expect(body).not.toContain('环境.时间');
        expect(body).not.toContain('好感度');
        expect(body).not.toContain('push 社交[0].记忆');
    });

    it('strips a malformed unclosed 变量规划 tag block with markdown path assignments', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】你没答话，只是将身子压得更紧，用自己温热的身体去焐她那近乎冻结的娇躯。',
            '<变量规划',
            '- 角色.内力: 89 -> 69',
            '（运转灵力驱寒消耗）',
            '- 角色.精力: 84 -> 69',
            '- 社交[0].好感度: 40 -> 45',
            '- 社交[0].记忆: push {',
            '"内容": "在寒雾弥漫的石径避风处驱散寒气。",',
            '"时间": "1:01:01:01:30"',
            '}',
            '- 环境.时间:',
            '"1:01:01:01:00"',
            '->',
            '"1:01:01:01:30"',
            '>',
            '</正文>',
            '<短期记忆>杨培强为俞月荷驱散寒气。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '你没答话，只是将身子压得更紧，用自己温热的身体去焐她那近乎冻结的娇躯。' }
        ]);
        const body = parsed.logs.map(item => item.text).join('\n');
        expect(body).not.toContain('变量规划');
        expect(body).not.toContain('角色.内力');
        expect(body).not.toContain('好感度');
        expect(body).not.toContain('push {');
    });

    it('strips markdown 正文 heading and recognizes 【你】 as protagonist speaker', () => {
        const parsed = parseStoryRawText([
            '### 正文',
            '【旁白】沉甸甸的灵谷袋被你卸在青石板上，发出一声闷响。',
            '【你】“别逞强了。你体内的这股寒气，可还能压制回去？”',
            '【俞月荷】“……不、不成的……你别管我……”',
            '<短期记忆>你为俞月荷驱寒。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '沉甸甸的灵谷袋被你卸在青石板上，发出一声闷响。' },
            { sender: '你', text: '“别逞强了。你体内的这股寒气，可还能压制回去？”' },
            { sender: '俞月荷', text: '“……不、不成的……你别管我……”' }
        ]);
        const body = parsed.logs.map(item => item.text).join('\n');
        expect(body).not.toContain('### 正文');
        expect(body).not.toContain('正文');
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

    it('does not treat a connective-led action line as the speaker of following first-person narration', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '而是看着水面上倒映的烛火，久久没有动作。',
            '我并不打算把这份沉默解释成软弱。',
            '</正文>',
            '<短期记忆>烛火映在水面，气氛沉默。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        expect(parsed.logs).toEqual([{
            sender: '旁白',
            text: '而是看着水面上倒映的烛火，久久没有动作。\n我并不打算把这份沉默解释成软弱。'
        }]);
    });

    it('does not treat a connective plus pronoun action line as a dialogue speaker', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '而是他看着水面上倒映的烛火，久久没有动作。',
            '我并不打算把这份沉默解释成软弱。',
            '</正文>',
            '<短期记忆>烛火映在水面，气氛沉默。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        expect(parsed.logs).toEqual([{
            sender: '旁白',
            text: '而是他看着水面上倒映的烛火，久久没有动作。\n我并不打算把这份沉默解释成软弱。'
        }]);
    });

    it('does not treat a connective plus plural pronoun action line as a dialogue speaker', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '而是他们看着水面上倒映的烛火，久久没有动作。',
            '我不会再解释了。',
            '</正文>',
            '<短期记忆>众人看着水面，气氛沉默。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        expect(parsed.logs).toEqual([{
            sender: '旁白',
            text: '而是他们看着水面上倒映的烛火，久久没有动作。\n我不会再解释了。'
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

    it('keeps a real name that starts with a narrative connective as a dialogue speaker', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【于是之】“台上见真章。”',
            '</正文>',
            '<短期记忆>于是之约定台上较量。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        expect(parsed.logs).toEqual([
            { sender: '于是之', text: '“台上见真章。”' }
        ]);
    });

    it('still rejects unlabeled quoted dialogue from a real name that starts with a connective', () => {
        expect(() => parseStoryRawText([
            '<正文>',
            '【旁白】于是之放下茶盏，抬眼开口：“台上见真章。”',
            '</正文>',
            '<短期记忆>于是之约定台上较量。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/疑似角色「于是之」/);
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

    it('rejects quoted dialogue from a declared four-character speaker embedded in narration', () => {
        expect(() => parseStoryRawText([
            '<角色名单>阿卡菲尔</角色名单>',
            '<正文>',
            '【旁白】阿卡菲尔放下茶盏，抬眼开口：“台上见真章。”',
            '</正文>',
            '<短期记忆>阿卡菲尔约定台上较量。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true })).toThrow(/疑似角色「阿卡菲尔」/);
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

    it('does not mistake lowercase preset metadata fields for colon dialogue', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            'time: 9月上旬 · 某日（夜风微凉）☆22:50-23:15',
            'scene: 海川市·海川大学城·男生7号楼402宿舍',
            '你把鼠标往鼠标垫边缘一推，顺手拉开电脑桌的抽屉。',
            '</正文>',
            '<短期记忆>主角在宿舍整理桌面。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        expect(parsed.logs.map(log => log.text).join('\n')).toContain('time: 9月上旬');
    });

    it('does not mistake narrative connectives before quoted speech for character names', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】苏辰没有急着饮茶，而是看着水面上倒映出的烛火，沉默片刻后开口：“凡儿这孩子，心思太重。”',
            '</正文>',
            '<短期记忆>苏辰谈起凡儿。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        expect(parsed.logs).toEqual([
            {
                sender: '旁白',
                text: '苏辰没有急着饮茶，而是看着水面上倒映出的烛火，沉默片刻后开口：“凡儿这孩子，心思太重。”'
            }
        ]);
    });

    it('does not mistake a connective plus pronoun before quoted speech for a character name', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】于是他看着水面，沉默片刻后开口：“此事不可。”',
            '</正文>',
            '<短期记忆>他拒绝了此事。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        expect(parsed.logs).toEqual([{
            sender: '旁白',
            text: '于是他看着水面，沉默片刻后开口：“此事不可。”'
        }]);
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

    it('模型省略 <正文> 标签时，标签修复不会吞掉后面的 <行动选项>/<短期记忆>', () => {
        const parsed = parseStoryRawText([
            '【旁白】陆凡站在礁石滩上，看着她头也不回地走远。',
            '<短期记忆>',
            '陆凡到礁石滩找陆芹，帮她解开卡在石缝的蟹笼。',
            '</短期记忆>',
            '<行动选项>',
            'A. 先去南坡把野蜂窝处理干净',
            'B. 陪柳青青一起准备下午的铺垫',
            'C. 带着陆荷陆养再去水洼边玩一会',
            '</行动选项>'
        ].join('\n'), { requireActionOptionsTag: true, enableTagRepair: true });

        expect(parsed.action_options).toEqual([
            'A. 先去南坡把野蜂窝处理干净',
            'B. 陪柳青青一起准备下午的铺垫',
            'C. 带着陆荷陆养再去水洼边玩一会'
        ]);
        expect(parsed.shortTerm).toBe('陆凡到礁石滩找陆芹，帮她解开卡在石缝的蟹笼。');
        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '陆凡站在礁石滩上，看着她头也不回地走远。' }
        ]);
    });

    it('思考区之后省略 <正文> 标签时同样保留命令与行动选项', () => {
        const parsed = parseStoryRawText([
            '<thinking>先规划本回合。</thinking>',
            '【旁白】山风穿林而过。',
            '【陆凡】“该动身了。”',
            '<短期记忆>陆凡准备出发。</短期记忆>',
            '<命令>set 陆凡.体力 = 80</命令>',
            '<行动选项>',
            'A. 立刻出发',
            'B. 再等等',
            '</行动选项>'
        ].join('\n'), { requireActionOptionsTag: true, enableTagRepair: true });

        expect(parsed.action_options).toEqual(['A. 立刻出发', 'B. 再等等']);
        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '山风穿林而过。' },
            { sender: '陆凡', text: '“该动身了。”' }
        ]);
        expect(parsed.tavern_commands && parsed.tavern_commands.length).toBeGreaterThan(0);
    });

    it('裸正文后接 <options> 别名时，选项块不被吞入正文且解析正常', () => {
        const parsed = parseStoryRawText([
            '【旁白】陆凡站在礁石滩上，看着她头也不回地走远。',
            '<options>',
            'A. 先去南坡把野蜂窝处理干净',
            'B. 陪柳青青一起准备下午的铺垫',
            '</options>'
        ].join('\n'), { requireActionOptionsTag: true, enableTagRepair: true });

        expect(parsed.action_options).toEqual([
            'A. 先去南坡把野蜂窝处理干净',
            'B. 陪柳青青一起准备下午的铺垫'
        ]);
        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '陆凡站在礁石滩上，看着她头也不回地走远。' }
        ]);
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
            // 标签修复会在首个协议区块前补上 <正文> 空壳（而不是追加到文本末尾），
            // 因此这里不再出现「标签顺序错误」，而是给出更准确的「正文内容为空」诊断。
            expect(parseError.protocolIssues || []).toContain('<正文>...</正文> 内容为空');
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

    it('allows modern setting English fragments inside Chinese story body during strict parsing', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '手机屏幕上弹出 Team Meeting 的提醒，楼下咖啡店的 WiFi 名称还停在列表第一行。',
            '</正文>',
            '<短期记忆>主角在都市日常中收到会议提醒。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        expect(parsed.logs[0]?.text).toContain('Team Meeting');
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

    it('preserves judgment and trailing story after an unclosed judge tag', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】外面的官道上传来急促马蹄声。',
            '<judge>',
            '【判定】[洞察]辨认来者｜判定值 8/难度 6｜结果=成功',
            '【旁白】李星云听出马蹄来自熟悉的坐骑。',
            '</正文>',
            '<短期记忆>李星云在酒楼辨认出接近者。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '外面的官道上传来急促马蹄声。' },
            { sender: '【判定】', text: '【判定】[洞察]辨认来者｜判定值 8/难度 6｜结果=成功' },
            { sender: '旁白', text: '李星云听出马蹄来自熟悉的坐骑。' }
        ]);
    });

    it('preserves trailing story after a correctly closed judge block inside body', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】外面的官道上传来急促马蹄声。',
            '<judge>',
            '判定类型：洞察',
            '判定值：8',
            '难度值：6',
            '</judge>',
            '【判定】[洞察]辨认来者｜判定值 8/难度 6｜结果=成功',
            '【旁白】李星云听出马蹄来自熟悉的坐骑。',
            '</正文>',
            '<短期记忆>李星云在酒楼辨认出接近者。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '外面的官道上传来急促马蹄声。' },
            { sender: '【判定】', text: '【判定】[洞察]辨认来者｜判定值 8/难度 6｜结果=成功' },
            { sender: '旁白', text: '李星云听出马蹄来自熟悉的坐骑。' }
        ]);
        expect(parsed.judge_blocks?.[0]?.text).toContain('判定类型：洞察');
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

    it('兜底拆分模型未换行的多标签正文', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】周围镇民哄笑。【卖豆腐的王大娘】“就是啊宋小子！”【旁白】高台上二当家没有生气。',
            '</正文>',
            '<短期记忆>test</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '周围镇民哄笑。' },
            { sender: '卖豆腐的王大娘', text: '就是啊宋小子！' },
            { sender: '旁白', text: '高台上二当家没有生气。' }
        ]);
    });

    it('兜底拆分不会切开正文中间的物品名标签', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【宋青书】“我要查看【青霜剑】的品相。”【旁白】他把剑推到柜台上。',
            '</正文>',
            '<短期记忆>test</短期记忆>'
        ].join('\n'));

        // 【青霜剑】夹在同一句对白中间（前文「我要查看」不是句末），不能被当成新说话人拆行；
        // 而【旁白】前面是完整句子的收尾引号，应当正常拆分。
        expect(parsed.logs).toEqual([
            { sender: '宋青书', text: '“我要查看【青霜剑】的品相。”' },
            { sender: '旁白', text: '他把剑推到柜台上。' }
        ]);
    });

    it('正文其他位置换行很多时，仍会拆分挤在同一行的多个标签', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】天光初亮。',
            '【旁白】街市渐渐热闹起来。',
            '【旁白】风里带着炊烟味。',
            '【旁白】他停在摊前。【宋青书】“来两屉包子。”',
            '</正文>',
            '<短期记忆>test</短期记忆>'
        ].join('\n'));

        // 整段换行数已超过标签数，旧的「换行总数」判据会跳过预处理，
        // 导致最后一行的两个标签被合成一条日志。
        expect(parsed.logs[parsed.logs.length - 1]).toEqual({ sender: '宋青书', text: '“来两屉包子。”' });
        expect(parsed.logs.some((log) => log.text.includes('【宋青书】'))).toBe(false);
    });
});
