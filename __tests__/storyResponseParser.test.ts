import { describe, expect, it } from 'vitest';
import { parseStoryRawText } from '../services/ai/storyResponseParser';
import { 规范化可渲染对白日志 } from '../utils/dialogueLogNormalizer';

describe('storyResponseParser', () => {
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

    it('keeps quoted dialogue embedded in narrator lines as narration without bracket labels', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '【旁白】晨风卷过演武场，杨镇远负手站在石阶前，沉声道：“剑势散了，脚下也浮。再走一遍。”',
            '【旁白】杨培强收剑回身，说道：“侄儿明白。”杨镇远点了点头，目光仍落在剑尖上。',
            '</正文>',
            '<短期记忆>杨镇远在演武场考校杨培强剑法。</短期记忆>'
        ].join('\n'));

        expect(parsed.logs).toEqual([
            {
                sender: '旁白',
                text: '晨风卷过演武场，杨镇远负手站在石阶前，沉声道：“剑势散了，脚下也浮。再走一遍。”\n杨培强收剑回身，说道：“侄儿明白。”杨镇远点了点头，目光仍落在剑尖上。'
            }
        ]);
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

    it('keeps bare colon speaker lines as narration', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '林婉儿：我也看到这个bug了，有些角色说话的时候对话框就没了。',
            '</正文>',
            '<短期记忆>林婉儿反馈部分角色对白缺少气泡。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '林婉儿：我也看到这个bug了，有些角色说话的时候对话框就没了。' }
        ]);
    });

    it('keeps colon speaker lines with action hints as narration', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '地点：杨家堡后院',
            '任务：检查对话框',
            '林婉儿（皱眉）：真正的对白才需要头像。',
            '</正文>',
            '<短期记忆>林婉儿说明对白气泡问题。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        expect(parsed.logs).toEqual([
            { sender: '旁白', text: '地点：杨家堡后院\n任务：检查对话框\n林婉儿（皱眉）：真正的对白才需要头像。' }
        ]);
    });

    it('keeps likely unlabeled oral dialogue during strict parsing', () => {
        const parsed = parseStoryRawText([
            '<正文>',
            '俞月荷冷笑一声，将表格拍在桌上。',
            '三百点？你真觉得这点贡献够换一整箱药？',
            '</正文>',
            '<短期记忆>俞月荷质疑贡献兑换。</短期记忆>'
        ].join('\n'), { validateDialogueFormat: true });

        expect(parsed.logs).toEqual([{
            sender: '旁白',
            text: '俞月荷冷笑一声，将表格拍在桌上。\n三百点？你真觉得这点贡献够换一整箱药？'
        }]);
    });

    it('keeps only fully quoted single-speaker text as character bubbles for rendering', () => {
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
});
