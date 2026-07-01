import { describe, expect, it } from 'vitest';
import { 校验响应人称一致性, 校验响应未泄露名器档案名称, 校验响应正文词汇审查, 校验主剧情正文最低字数, 获取主剧情正文不足信息, 统计正文字符数, 主剧情流式草稿已具备完整协议 } from '../hooks/useGame/sendWorkflow';
import { 净化角色对白行, 评估润色长度结果, 检测文章优化协议确认污染, 解析正文日志文本 } from '../hooks/useGame/bodyPolish';
import { 清理润色正文输出 } from '../services/ai/storyTasks';
import { 构建主剧情请求参数, type 主剧情系统上下文 } from '../hooks/useGame/mainStoryRequest';
import { 构建字数要求提示词 } from '../prompts/runtime/protocolDirectives';
import { 默认游戏设置 } from '../utils/gameSettings';

describe('主剧情正文字数校验', () => {
    it('统计正文日志的可见字符数', () => {
        expect(统计正文字符数({
            logs: [
                { sender: '旁白', text: '  江风渐起。 ' },
                { sender: '苏清寒', text: '继续。' }
            ]
        })).toBe(8);
    });

    it('正文低于设置字数时抛出解析错误，交给自动重试或恢复流程处理', () => {
        expect(() => 校验主剧情正文最低字数({
            logs: [
                { sender: '旁白', text: '太短了。' }
            ]
        }, 50, '<正文>太短了。</正文>')).toThrow(/正文过短/);
    });

    it('正文低于设置字数时返回可供文章优化接管的不足信息', () => {
        expect(获取主剧情正文不足信息({
            logs: [
                { sender: '旁白', text: '大纲可用。' }
            ]
        }, 80)).toMatchObject({
            actual: 5,
            required: 80
        });
    });

    it('正文只差少量字数时会落入容错并保留为提示', () => {
        expect(获取主剧情正文不足信息({
            logs: [
                { sender: '旁白', text: 'x'.repeat(1934) }
            ]
        }, 2000)).toMatchObject({
            actual: 1934,
            required: 2000,
            shortage: 66,
            withinTolerance: true
        });

        expect(() => 校验主剧情正文最低字数({
            logs: [
                { sender: '旁白', text: 'x'.repeat(1934) }
            ]
        }, 2000, '<正文>略短但可读</正文>')).not.toThrow();
    });

    it('正文达到最低字数时通过', () => {
        expect(() => 校验主剧情正文最低字数({
            logs: [
                { sender: '旁白', text: '这是一段已经达到最低长度要求的正文内容，用来确认正常回合不会被误判为失败。江风穿过长街，灯影落在青石上，行人低声交谈，新的线索也随之展开。' }
            ]
        }, 50, '<正文>...</正文>')).not.toThrow();
    });

    it('文章优化不能把正常正文明显压缩成大纲', () => {
        expect(评估润色长度结果({
            sourceLength: 400,
            polishedLength: 220,
            requiredLength: 300
        })).toMatchObject({ ok: false });
    });

    it('短正文交给文章优化扩写时会按容错接受接近目标的结果', () => {
        expect(评估润色长度结果({
            sourceLength: 1800,
            polishedLength: 1934,
            requiredLength: 2000,
            allowExpansionForLength: true
        })).toMatchObject({ ok: true });

        expect(评估润色长度结果({
            sourceLength: 120,
            polishedLength: 180,
            requiredLength: 300,
            allowExpansionForLength: true
        })).toMatchObject({ ok: false });

        expect(评估润色长度结果({
            sourceLength: 120,
            polishedLength: 320,
            requiredLength: 300,
            allowExpansionForLength: true
        })).toMatchObject({ ok: true });
    });

    it('文章优化后会把污染到角色行里的旁白拆回旁白', () => {
        const logs = 净化角色对白行([
            {
                sender: '灵灵',
                text: '"那是当然。本助手可是按照地球东亚审美天花板调的参数——宿主从前不是说想回高中吗？回不去了，看看我过过瘾也行嘛。" 她说完往驾座那一处靠了靠，两条穿着黑色短袜的腿晃了两下。'
            },
            {
                sender: '旁白',
                text: '吴杰涛朝她那一处望了一眼，又把目光收回到前方那条黄土官道上。'
            }
        ]);

        expect(logs).toEqual([
            {
                sender: '灵灵',
                text: '那是当然。本助手可是按照地球东亚审美天花板调的参数——宿主从前不是说想回高中吗？回不去了，看看我过过瘾也行嘛。'
            },
            {
                sender: '旁白',
                text: '她说完往驾座那一处靠了靠，两条穿着黑色短袜的腿晃了两下。\n吴杰涛朝她那一处望了一眼，又把目光收回到前方那条黄土官道上。'
            }
        ]);
    });

    it('文章优化只提取正文块，不把正文后的记忆规划块混入正文', () => {
        const cleaned = 清理润色正文输出([
            '<thinking>检查协议。</thinking>',
            '<正文>',
            '【旁白】他的手指在口袋里摸到了两个坚硬的物体。',
            '</正文>',
            '<短期记忆>杨培强找到了手机。</短期记忆>',
            '<行动选项]',
            '【选项一】查看手机。',
            '</行动选项]'
        ].join('\n'));

        expect(cleaned).toBe('【旁白】他的手指在口袋里摸到了两个坚硬的物体。');
    });

    it('文章优化正文解析会合并被模型硬拆开的物品名续行', () => {
        const logs = 解析正文日志文本([
            '【旁白】他的手指在口袋里摸到了两个坚硬的物体。',
            '一把是他平日里习惯随身携带的',
            '【随身短刃】',
            '，刀柄的防滑纹路让他感到一阵安心；',
            '另一件则是他的',
            '【智能手机】',
            '他掏出手机按下电源键，屏幕亮起。'
        ].join('\n'));

        expect(logs).toEqual([{
            sender: '旁白',
            text: '他的手指在口袋里摸到了两个坚硬的物体。\n一把是他平日里习惯随身携带的【随身短刃】，刀柄的防滑纹路让他感到一阵安心；\n另一件则是他的【智能手机】他掏出手机按下电源键，屏幕亮起。'
        }]);
    });

    it('文章优化正文解析会合并被模型硬拆开的括号说明续行', () => {
        const logs = 解析正文日志文本([
            '【旁白】他的身体已经恢复到了巅峰状态，虽然六维属性依旧是普通人的极限',
            '（力量5、敏捷5、体质5、根骨5、悟性5、福源5）',
            '，但那种死里逃生的真实感终于落到了实处。'
        ].join('\n'));

        expect(logs).toEqual([{
            sender: '旁白',
            text: '他的身体已经恢复到了巅峰状态，虽然六维属性依旧是普通人的极限（力量5、敏捷5、体质5、根骨5、悟性5、福源5），但那种死里逃生的真实感终于落到了实处。'
        }]);
    });

    it('文章优化会识别协议确认句复读污染', () => {
        const polluted = [
            '好的，将以<正文></正文>包裹正文，并且本次会在<短期记忆>、<变量规划>、<剧情规划>等回合标签之后输出<行动选项></行动选项>，<正文>前以<thinking>作为开头进行思考并以</thinking>闭合：',
            '好的，将以<正文></正文>包裹正文，并且本次会在<短期记忆>、<变量规划>、<剧情规划>等回合标签之后输出<行动选项></行动选项>，<正文>前以<thinking>作为开头进行思考并以</thinking>闭合：'
        ].join('\n');

        expect(检测文章优化协议确认污染(polluted)).toMatchObject({
            polluted: true,
            repeats: 2
        });
    });

    it('文章优化不会把正常正文里的协议标签误判为复读污染', () => {
        const normal = [
            '<thinking>检查原文事实与对白。</thinking>',
            '<正文>',
            '【旁白】主神光球在头顶亮起，冷白色的光压住了房间里浮动的尘埃。',
            '【林岚】先别兑换，确认任务世界和限制条件。',
            '</正文>'
        ].join('\n');

        expect(检测文章优化协议确认污染(normal)).toMatchObject({
            polluted: false
        });
    });

    it('主剧情有序消息会把动态最低字数要求放到最终任务前', () => {
        const lengthPrompt = 构建字数要求提示词(1500);
        const builtContext: 主剧情系统上下文 = {
            shortMemoryContext: '',
            contextPieces: {
                AI角色声明: '你是墨染江湖叙事模型。',
                worldPrompt: '',
                地图建筑状态: '',
                同人设定摘要: '',
                境界体系提示词: '',
                离场NPC档案: '',
                otherPrompts: '',
                难度设置提示词: '',
                叙事人称提示词: '',
                字数设置提示词: '<字数>本次<正文>内的正文必须达到动态注入的最低字数要求。</字数>',
                长期记忆: '',
                中期记忆: '',
                在场NPC档案: '',
                剧情安排: '',
                女主剧情规划状态: '',
                世界状态: '',
                环境状态: '',
                角色状态: '',
                战斗状态: '',
                门派状态: '',
                任务状态: '',
                约定状态: '',
                COT提示词: '',
                格式提示词: '<正文>...</正文>',
                字数要求提示词: lengthPrompt,
                免责声明输出提示词: '',
                输出协议提示词: ''
            }
        };

        const result = 构建主剧情请求参数({
            gameConfig: {
                ...默认游戏设置,
                字数要求: 1500,
                启用GPT模式: true,
                主剧情消息模式: 'GPT'
            },
            apiConfig: {
                apiKey: 'test-key',
                baseUrl: 'https://example.test/v1',
                model: 'gemini-test'
            } as any,
            builtContext,
            updatedContextHistory: [],
            updatedMemSys: {} as any,
            sendInput: '继续剧情。'
        });

        const finalLengthEntryIndex = result.messageEntries.findIndex((entry) => entry.id === 'length_requirement_final');
        const startTaskIndex = result.messageEntries.findIndex((entry) => entry.id === 'start_task');

        expect(finalLengthEntryIndex).toBeGreaterThanOrEqual(0);
        expect(startTaskIndex).toBeGreaterThan(finalLengthEntryIndex);
        expect(result.messageEntries[finalLengthEntryIndex]).toMatchObject({
            role: 'user',
            content: expect.stringContaining('1500字以上')
        });
        expect(result.orderedMessages.some((message) => message.content.includes(lengthPrompt))).toBe(true);
    });

    it('酒馆预设模式下不注入项目字数要求，由预设自身控制输出长度', () => {
        const lengthPrompt = 构建字数要求提示词(2200);
        const builtContext: 主剧情系统上下文 = {
            shortMemoryContext: '',
            contextPieces: {
                AI角色声明: '你是墨染江湖叙事模型。',
                worldPrompt: '世界书占位',
                地图建筑状态: '',
                同人设定摘要: '',
                境界体系提示词: '',
                离场NPC档案: '',
                otherPrompts: '',
                难度设置提示词: '',
                叙事人称提示词: '',
                字数设置提示词: '<字数>旧字数提示会被运行时修正。</字数>',
                长期记忆: '',
                中期记忆: '',
                在场NPC档案: '',
                剧情安排: '',
                女主剧情规划状态: '',
                世界状态: '',
                环境状态: '',
                角色状态: '',
                战斗状态: '',
                门派状态: '',
                任务状态: '',
                约定状态: '',
                COT提示词: '',
                格式提示词: '<正文>...</正文>',
                字数要求提示词: lengthPrompt,
                免责声明输出提示词: '',
                输出协议提示词: ''
            }
        };

        const result = 构建主剧情请求参数({
            gameConfig: {
                ...默认游戏设置,
                字数要求: 2200,
                启用酒馆预设模式: true,
                当前酒馆预设ID: 'travel',
                酒馆预设角色ID: 1,
                酒馆预设列表: [{
                    id: 'travel',
                    名称: '双人旅行',
                    角色ID: 1,
                    预设: {
                        spec: 'chara_card_v3',
                        prompts: [
                            { identifier: 'main', name: 'main', role: 'system', content: '固定预设' },
                            { identifier: 'worldInfoBefore', name: 'worldInfoBefore', role: 'system', content: '' },
                            { identifier: 'userInput', name: 'userInput', role: 'user', content: '' }
                        ],
                        prompt_order: [{
                            character_id: 1,
                            order: [
                                { identifier: 'main', enabled: true },
                                { identifier: 'worldInfoBefore', enabled: true },
                                { identifier: 'userInput', enabled: true }
                            ]
                        }]
                    } as any
                }]
            },
            apiConfig: {
                apiKey: 'test-key',
                baseUrl: 'https://example.test/v1',
                model: 'gemini-test'
            } as any,
            builtContext,
            updatedContextHistory: [],
            updatedMemSys: {} as any,
            sendInput: '继续剧情。'
        });

        expect(result.tavernPresetModeEnabled).toBe(true);
        // 酒馆模式下不应注入项目字数要求，预设自身控制输出
        expect(result.orderedMessages.some((message) => message.content.includes('2200字以上'))).toBe(false);
        // 也不应注入项目输出协议和风格助手
        expect(result.orderedMessages.some((message) => message.content.includes('输出协议'))).toBe(false);
    });
});

describe('主剧情叙事人称校验', () => {
    const rawText = '<正文>测试正文</正文>';

    it('第三人称旁白 + 角色对白含“你”时不报错', () => {
        expect(() => 校验响应人称一致性({
            角色: { 姓名: '沈砚' },
            logs: [
                { sender: '旁白', text: '林清月垂下眼，袖口的雨水顺着指尖滴落。' },
                { sender: '林清月', text: '你没有要过她任何一丝一毫的回报。' }
            ]
        } as any, rawText, '第三人称')).not.toThrow();
    });

    it('第三人称旁白引号内含“你”时不报错', () => {
        expect(() => 校验响应人称一致性({
            角色: { 姓名: '沈砚' },
            logs: [
                { sender: '旁白', text: '林清月低声说：“你走进房间。你感到一阵寒意。”随后她把目光移向窗外。' }
            ]
        } as any, rawText, '第三人称')).not.toThrow();
    });

    it('玩家输入摘要、系统提示和任务提示含“你”时不报错', () => {
        expect(() => 校验响应人称一致性({
            角色: { 姓名: '沈砚' },
            logs: [
                {
                    sender: '旁白',
                    text: [
                        '玩家输入摘要：你走进房间，询问林清月。',
                        '系统提示：你感到一阵寒意时需要等待判定。',
                        '任务提示：你决定继续向前会推进主线。',
                        '林清月站在廊下，雨声遮住了她短促的呼吸。'
                    ].join('\n')
                }
            ]
        } as any, rawText, '第三人称')).not.toThrow();
    });

    it('第三人称正文不出现主角姓名、只用他她少年时不报错', () => {
        expect(() => 校验响应人称一致性({
            角色: { 姓名: '沈砚' },
            logs: [
                { sender: '旁白', text: '少年推开木门，望见廊下的灯影。他停了片刻，随后向她点头。' }
            ]
        } as any, rawText, '第三人称')).not.toThrow();
    });

    it('正文主体明显连续使用第二人称时会报错', () => {
        expect(() => 校验响应人称一致性({
            角色: { 姓名: '沈砚' },
            logs: [
                { sender: '旁白', text: '你走进房间。你感到寒意。你决定继续向前。' }
            ]
        } as any, rawText, '第三人称')).toThrow(/叙事人称不符/);
    });

    it('关闭正文词汇审查不会关闭人称和标签结构校验', () => {
        const templateNameResponse = {
            logs: [
                { sender: '苏婉儿', text: '少侠，我随你同去。' }
            ],
            tavern_commands: [
                {
                    action: 'push' as const,
                    key: '社交',
                    value: { 姓名: '苏婉儿', 性别: '女' }
                }
            ]
        };
        expect(() => 校验响应正文词汇审查(templateNameResponse as any, [], JSON.stringify(templateNameResponse), '主剧情', false))
            .not.toThrow();
        expect(() => 校验响应人称一致性({
            角色: { 姓名: '沈砚' },
            logs: [
                { sender: '旁白', text: '你走进房间。你感到寒意。你决定继续向前。' }
            ]
        } as any, rawText, '第三人称')).toThrow(/叙事人称不符/);
        expect(主剧情流式草稿已具备完整协议('只有正文，没有标签结构')).toBe(false);
    });

    it('第一人称模式下，对话里出现“你”但旁白稳定用“我”时不报错', () => {
        expect(() => 校验响应人称一致性({
            角色: { 姓名: '沈砚' },
            logs: [
                { sender: '旁白', text: '我走进房间，听见窗外雨声渐急。我决定先把灯点亮。' },
                { sender: '林清月', text: '你先别急，外面还有人。' }
            ]
        } as any, rawText, '第一人称')).not.toThrow();
    });
});

describe('主剧情名器档案名称正文泄露校验', () => {
    const rawText = '<正文>测试正文</正文>';

    it('正文直接写出已有名器档案名称时会退回重生', () => {
        expect(() => 校验响应未泄露名器档案名称({
            logs: [
                { sender: '旁白', text: '她强忍羞意，低声提到了雪玉灵窍这个隐秘名字。' }
            ]
        } as any, [
            {
                姓名: '林清月',
                名器档案: [
                    { 部位: '小穴', 名称: '雪玉灵窍', 品质: '极品', 稳定描述: '档案描述', 效果: { 说明: '机制说明' } },
                    { 部位: '胸部', 名称: '无名器', 品质: '无', 稳定描述: '档案描述', 效果: { 说明: '机制说明' } }
                ]
            }
        ], rawText, '主剧情')).toThrow(/名器档案名称/);
    });

    it('正文只写代称不写档案名称时允许通过', () => {
        expect(() => 校验响应未泄露名器档案名称({
            logs: [
                { sender: '旁白', text: '她只以含糊代称带过那处隐秘体质，没有把档案名说出口。' }
            ]
        } as any, [
            {
                姓名: '林清月',
                名器档案: [
                    { 部位: '小穴', 名称: '雪玉灵窍', 品质: '极品', 稳定描述: '档案描述', 效果: { 说明: '机制说明' } }
                ]
            }
        ], rawText, '主剧情')).not.toThrow();
    });
});
