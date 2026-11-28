import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { 净化2_0酒馆预设, 过滤非场景世界书, 构建2_0写作规则池 } from '../engine/storyV2/promptFiltering';
import { 过滤并精简V2行动选项, 渲染主剧情回合V2 } from '../engine/storyV2/storyTurnRenderer';
import { 构建本回合导演简报 } from '../engine/storyV2/sceneBriefBuilder';
import { 从状态构建2_0导演圣经, 提取2_0流式正文预览 } from '../engine/storyV2/legacySaveBridge';
import { 执行导演后处理V2 } from '../engine/storyV2/directorPostTurn';
import { parseStoryRawText } from '../services/ai/storyResponseParser';
import { 创建空白导演圣经 } from '../models/directorBible';
import { 默认游戏设置 } from '../utils/gameSettings';
import StoryModal from '../components/features/Story/StoryModal';
import * as chatClient from '../services/ai/chatCompletionClient';
import { 生成世界与导演圣经V2 } from '../engine/storyV2/worldBibleGenerator';
import { getDiagnosticLogs } from '../services/diagnosticLog';

vi.mock('../services/ai/chatCompletionClient', async () => {
    const actual = await vi.importActual<any>('../services/ai/chatCompletionClient');
    return {
        ...actual,
        请求模型文本: vi.fn()
    };
});

describe('MoRanJiangHu 2.0 Story Engine', () => {
    beforeEach(() => {
        vi.mocked(chatClient.请求模型文本).mockReset();
    });

    it('普通世界书、禁止跳转的写作规则以及不足三条的合法选项均保留', () => {
        expect(过滤非场景世界书([{ id: 'analysis-notes' }, { id: 'anal-notes' }] as any, false).map(x => x.id)).toEqual(['analysis-notes']);
        const config = 净化2_0酒馆预设({ 启用酒馆预设模式: true, 酒馆预设: { prompts: [
            { identifier: 'style', content: '禁止时间跳转，按当前时刻连续叙事', enabled: true }
        ] } } as any);
        expect(config.酒馆预设?.prompts?.[0].enabled).toBe(true);
        expect(过滤并精简V2行动选项(['A.[视角切换] 转场', 'B.看账本'])).toEqual(['A.看账本']);
    });

    const renderTurn = (gameConfig: any, minBodyLength = 0, playerInput = '检视票据') => 渲染主剧情回合V2({
        turnIndex: 1, gameInitialTime: '1:01:01:08:00', directorBible: 创建空白导演圣经(), 世界: {}, 剧情: {}, 社交: [],
        角色: { 姓名: '渡客' }, 环境: {}, 记忆系统: { 回忆档案: [], 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] },
        历史记录: [], 任务列表: [], 世界大事: []
    } as any, { gameConfig: { ...默认游戏设置, ...gameConfig }, openingConfig: {}, worldConfig: { worldName: '九州' },
        apiConfig: { id: 'main', model: 'test' } } as any, playerInput, { stream: false, minBodyLength });

    it('门派研习时只登记模型确认习得的典籍', async () => {
        const request = vi.mocked(chatClient.请求模型文本);
        const opening = '<正文>【旁白】你习得了引泉诀。</正文><短期记忆>习得引泉诀。</短期记忆>';
        request.mockResolvedValueOnce(opening + '<命令>push 角色.功法列表 = {"名称":"引泉诀","来源藏经ID":"b1"}</命令>');
        const success = await renderTurn({ 启用行动选项: false }, 0, '【门派研习】我申请研习《引泉诀》。');
        expect(request.mock.calls[0][1].at(-1)?.content).toContain('门派研习结算');
        expect(success.response.tavern_commands).toContainEqual({ action: 'push', key: '角色.功法列表', value: { 名称: '引泉诀', 来源藏经ID: 'b1' } });
        request.mockResolvedValueOnce('<正文>【旁白】师兄认为火候未到。</正文><短期记忆>暂未学成。</短期记忆>');
        const attempt = await renderTurn({ 启用行动选项: false }, 0, '【门派研习】我申请研习《引泉诀》。');
        expect(attempt.response.tavern_commands || []).toHaveLength(0);
    });

    it('V2 解析保留旧酒馆的清理脚本和分支选项', async () => {
        const preset = { extensions: { regex_scripts: [{ id: 'clean', scriptName: '正文清理', findRegex: '/旧暗号/g', replaceString: '新暗号', placement: [2], markdownOnly: true }] } };
        vi.mocked(chatClient.请求模型文本).mockResolvedValue('<正文>【旁白】旧暗号贴在渡口，桥旁三两船家正在等船到岸。</正文><短期记忆>抵达渡口</短期记忆><branches>\n询问船家\n查看船票\n</branches>');
        const turn = await renderTurn({ 启用行动选项: true, 启用严格正文对白格式: false, 启用酒馆预设模式: true, 酒馆预设: preset });
        expect(turn.response.logs.map(l => l.text).join('')).toContain('新暗号');
        expect(turn.response.action_options).toEqual(['A.询问船家', 'B.查看船票']);
    });

    it('第 3 次放宽对白格式时仍拒绝篇幅不足的正文', async () => {
        vi.mocked(chatClient.请求模型文本).mockResolvedValue('<正文>【渡客】“去哪里？”他说道。</正文><短期记忆>发问。</短期记忆>');
        await expect(renderTurn({ 启用严格正文对白格式: true, 启用行动选项: false }, 600)).rejects.toThrow(/正文过短/);
    });

    it('只从空选项标签到下一个协议块之间恢复行动', () => {
        const response = parseStoryRawText('<正文>【旁白】大雨落在码头。</正文><行动选项></行动选项>\nA.看账本\nB.查船票\n<短期记忆>\n1.旧事甲\n2.旧事乙\n</短期记忆>', { validateTagCompleteness: false });
        expect(response.action_options).toHaveLength(2);
        expect(response.action_options?.join('')).not.toContain('旧事');
    });

    const worldFixture = () => {
        const world = '码头盐路贯通南北，过河商旅须先持引到渡口登记。'.repeat(12);
        const tiers = ['寰宇', '大地点', '中地点', '小地点', '区地点', '子地点'];
        const parents = [-1, 0, 1, 2, 3, 4, 0, 1, 6, 6, 2, 7, 7, 8, 8, 9, 9, 3, 10, 11, 12, 13, 14, 15];
        const depths: number[] = [];
        const nodes = parents.map((parent, i) => {
            depths[i] = parent < 0 ? 0 : depths[parent] + 1;
            return { ID: String(i), 名称: `地点${i}`, 层级: tiers[depths[i]], 父级ID: parent < 0 ? '' : String(parent) };
        });
        const bible = {
            世界观表层摘要: '官盐漕运贯通九州，各郡凭路引出入。',
            顶层隐秘秩序: '六家盐商凭旧契与转运司一同控制沿岸的渡引。',
            核心历史原罪: '十年前盐船沉没时尚有一册副账被船夫带离现场。',
            空间阶梯: tiers.slice(0, 3).map((层级名称) => ({ 层级名称 })),
            势力暗账: Array.from({ length: 6 }, (_, i) => ({ 名称: `盐商${i}`, 领袖: `掌柜${i}`, 跨势力账目: [{ 对方势力: '转运司' }, { 对方势力: '船行' }] })),
            核心卡司: Array.from({ length: 7 }, (_, i) => ({ 姓名: `掌柜${i}`, 所处层级: 1 + i % 3 })),
            前史导火索: [{ 事件名: '渡口失火' }],
            主角核心困局: { 最大威胁源: '搜船的差役', 手中唯一筹码或信息差: '半张路引' },
            宏观分幕大纲: Array.from({ length: 4 }, (_, i) => ({ 标题: `卷${i}` })),
            伏笔台账: Array.from({ length: 6 }, (_, i) => ({ 表面载体: `旧盐票${i}` }))
        };
        return { world, nodes, bible };
    };
    const makeRequest = (worldConfig: { factionCount?: number; difficulty?: string } = {}) => 生成世界与导演圣经V2({
        worldConfig: { worldName: '九州', ...worldConfig }, charData: { 姓名: '渡客' } as any,
        apiConfig: { model: 'fixture-model' } as any, openingConfig: {} as any, stream: false
    });

    it('给导演提供建档门派与职位，世界和成员档案沿用同一组织', async () => {
        const { world, nodes, bible } = worldFixture();
        const requests = vi.mocked(chatClient.请求模型文本).mockResolvedValue(
            '<世界观>' + world + '</世界观><世界基底>' + JSON.stringify({ 地图层级: nodes }) + '</世界基底><导演圣经>' + JSON.stringify(bible) + '</导演圣经>'
        );
        await 生成世界与导演圣经V2({ worldConfig: { worldName: '九州' }, charData: { 姓名: '渡客', 所属门派ID: '青崖真宫', 门派职位: '杂役弟子' } as any,
            apiConfig: { model: 'fixture-model' } as any, openingConfig: {} as any, stream: false });
        const prompt = requests.mock.calls[0][1].at(-1)?.content || '';
        expect(prompt).toContain('青崖真宫');
        expect(prompt).toContain('杂役弟子');
    });

    it('势力账本遵循显式数量，首次与补写提示都采用玩家难度、数量', async () => {
        const { world, nodes, bible } = worldFixture();
        const requests = vi.mocked(chatClient.请求模型文本)
            .mockResolvedValueOnce(`<世界观>${world}</世界观><世界基底>${JSON.stringify({ 地图层级: nodes })}</世界基底><导演圣经>${JSON.stringify(bible)}</导演圣经>`)
            .mockResolvedValueOnce(JSON.stringify({ ...bible, 势力暗账: bible.势力暗账.slice(0, 4) }));
        const result = await makeRequest({ factionCount: 4, difficulty: 'extreme' });
        expect(result.directorBible.势力暗账).toHaveLength(4);
        for (const call of requests.mock.calls) {
            const prompt = call[1].at(-1)?.content || '';
            expect(prompt).toContain('极限（extreme）');
            expect(prompt).toContain('收益稀缺');
            expect(prompt).toContain('恰好 4 个');
            expect(prompt).not.toContain('6 个及以上');
        }
    });

    it('数量达标而缺少房间的地图仍需补写；改名后继续修复势力地盘引用', async () => {
        const { world, nodes, bible } = worldFixture();
        const old = nodes.map((n, i) => i < 5 ? n : { ...n, 层级: '区地点', 父级ID: '3' });
        const renamed = nodes.map((n, i) => i === 1 ? { ...n, 名称: '新盐口' } : n);
        const factions = (place: string) => bible.势力暗账.map(f => ({ ...f, 地盘: [place] }));
        const requests = vi.mocked(chatClient.请求模型文本)
            .mockResolvedValueOnce(`<世界观>${world}</世界观><世界基底>${JSON.stringify({ 地图层级: old })}</世界基底><导演圣经>${JSON.stringify({ ...bible, 势力暗账: factions('地点1') })}</导演圣经>`)
            .mockResolvedValueOnce(`<世界基底>${JSON.stringify({ 地图层级: renamed })}</世界基底>`)
            .mockResolvedValueOnce(JSON.stringify({ ...bible, 势力暗账: factions('新盐口') }));
        const result = await makeRequest();
        expect(result.directorBible.势力暗账[0].地盘).toEqual(['新盐口']);
        expect(requests.mock.calls[2][1].at(-1)?.content).toContain('地点1');
        expect(result.mapLayers.some(n => n.层级 === '子地点')).toBe(true);
    });

    it('开局地图节点数达标时仍逐大陆和地域检查分支，并定向补足', async () => {
        const { world, nodes, bible } = worldFixture();
        const sparse = nodes.map(n => n.ID === '8' || n.ID === '9' ? { ...n, 父级ID: '1' } :
            n.ID === '10' ? { ...n, 父级ID: '7' } : n);
        const requests = vi.mocked(chatClient.请求模型文本)
            .mockResolvedValueOnce(`<世界观>${world}</世界观><世界基底>${JSON.stringify({ 地图层级: sparse })}</世界基底><导演圣经>${JSON.stringify(bible)}</导演圣经>`)
            .mockResolvedValueOnce(`<世界基底>${JSON.stringify({ 地图层级: nodes })}</世界基底>`);
        const result = await makeRequest();
        expect(requests).toHaveBeenCalledTimes(2);
        const repair = requests.mock.calls[1][1].at(-1)?.content;
        expect(repair).toContain('地点6');
        expect(repair).toContain('地点2');
        expect(result.mapLayers.filter(n => n.父级ID === '6')).toHaveLength(2);
    });

    it('世界观在补写中变长且圣经未提供摘要时，从最终采用的正文生成摘要', async () => {
        const { world, nodes, bible } = worldFixture();
        vi.mocked(chatClient.请求模型文本)
            .mockResolvedValueOnce(`<世界观>初稿</世界观><世界基底>${JSON.stringify({ 地图层级: nodes })}</世界基底><导演圣经>${JSON.stringify({ ...bible, 世界观表层摘要: '' })}</导演圣经>`)
            .mockResolvedValueOnce(`<世界观>${world}</世界观>`);
        expect((await makeRequest()).directorBible.世界观表层摘要).toBe(world.slice(0, 500));
    });

    it.each(['世界观', '世界基底', '导演圣经'])('仅补写未达标的%s，并保留第一轮已验收的内容', async (missingTag) => {
        const { world, nodes, bible } = worldFixture();
        const valid: Record<string, string> = { 世界观: world, 世界基底: JSON.stringify({ 地图层级: nodes }), 导演圣经: JSON.stringify(bible) };
        const damaged: Record<string, string> = {
            世界观: '旧短稿', 世界基底: JSON.stringify({ 地图层级: nodes.map((n, i) => i ? n : { ...n, 层级: '子地点' }) }), 导演圣经: '{}'
        };
        const envelope = (tag: string, body: string) => `<${tag}>${body}</${tag}>`;
        const requests = vi.mocked(chatClient.请求模型文本)
            .mockResolvedValueOnce(Object.entries(valid).map(([tag, body]) => envelope(tag, tag === missingTag ? damaged[tag] : body)).join('\n'))
            .mockResolvedValueOnce(envelope(missingTag, valid[missingTag]));
        const result = await 生成世界与导演圣经V2({
            worldConfig: { worldName: '九州' }, charData: { 姓名: '渡客' } as any,
            apiConfig: { model: 'fixture-model' } as any, openingConfig: {} as any, stream: false
        });
        expect(requests).toHaveBeenCalledTimes(2);
        const repair = requests.mock.calls[1][1].at(-1)?.content || '';
        expect(repair).toContain(`本次只输出：<${missingTag}>`);
        expect(result.worldPrompt).toBe(world);
        expect(result.mapLayers[0].层级).toBe('寰宇');
        expect(result.directorBible.世界观表层摘要).toBe(bible.世界观表层摘要);
        const log = getDiagnosticLogs().find((entry) => entry.message === '2.0 开局世界观生成完成');
        expect(JSON.parse(log?.detail || '{}')).toMatchObject({ model: 'fixture-model', requestCount: 2, elapsedMs: expect.any(Number) });
    });

    it('净化2_0酒馆预设 strips A-J quick-reply/summary bloat while keeping writing style', () => {
        const gameConfig = {
            ...默认游戏设置,
            启用酒馆预设模式: true,
            酒馆预设: {
                name: 'test-preset',
                prompts: [
                    { identifier: 'style_1', name: '古龙冷峻文风', content: '多用短句与动作描写', enabled: true },
                    { identifier: 'quick_aj', name: '🔘丨快捷回复@lv（墨染江湖A-J兼容）', content: '必须输出A-J 10个选项与视角切换', enabled: true },
                    { identifier: 'summary_1', name: '🔘丨摘要与总结', content: '每回合总结', enabled: true }
                ],
                prompt_order: [
                    {
                        character_id: 100001,
                        order: [
                            { identifier: 'style_1', enabled: true },
                            { identifier: 'quick_aj', enabled: true },
                            { identifier: 'summary_1', enabled: true }
                        ]
                    }
                ],
                extensions: {
                    regex_scripts: [
                        { id: 'r1', scriptName: '行动选项美化HTML', findRegex: '<行动选项>', replaceString: '' },
                        { id: 'r2', scriptName: '保留正文字体排版', findRegex: '<正文>', replaceString: '' }
                    ]
                }
            }
        } as any;

        const cleaned = 净化2_0酒馆预设(gameConfig);
        const prompts = cleaned.酒馆预设!.prompts!;
        expect(prompts.find((p: any) => p.identifier === 'style_1')?.enabled).toBe(true);
        expect(prompts.find((p: any) => p.identifier === 'quick_aj')?.enabled).toBe(false);
        expect(prompts.find((p: any) => p.identifier === 'summary_1')?.enabled).toBe(false);
        expect((cleaned.酒馆预设 as any).extensions.regex_scripts.map((r: any) => r.id)).toEqual(['r2']);
    });

    it('过滤非场景世界书 and 构建2_0写作规则池 remove legacy combat/auction/intimate bloat', () => {
        const filteredBooks = 过滤非场景世界书([
            { id: 'wb_scene', 标题: '临安客栈风貌', 内容: '青石板街' } as any,
            { id: 'wb_nsfw', 标题: '私密器官词库', 内容: '器官细节' } as any
        ], false);
        expect(filteredBooks.map((b) => b.id)).toEqual(['wb_scene']);

        const pool = 构建2_0写作规则池([
            { id: 'stat_combat', 标题: '战斗结算', 内容: '战斗轮次', 启用: true, 分类: '核心' } as any,
            { id: 'core_world', 标题: '世界观', 内容: '旧文本', 启用: true, 分类: '核心' } as any
        ], '新版因果世界\n禁止拍卖行规则\n群山连绵');
        expect(pool.some((p) => p.id === 'stat_combat')).toBe(false);
        const worldItem = pool.find((p) => p.id === 'core_world');
        expect(worldItem?.内容).toContain('群山连绵');
        expect(worldItem?.内容).not.toContain('拍卖行');
    });

    it('过滤并精简V2行动选项 removes meta/NSFW options and reindexes 4~5 clean options', () => {
        const filtered = 过滤并精简V2行动选项([
            'A.顺着血迹推开耳房木门查看',
            'B.扣紧腰间短刀先退入回廊阴影',
            'C.低声盘问店内小二昨夜谁曾登楼',
            'D.[视角切换] 切换到反派密室',
            'E.[双线叙事] 看另一条街动静',
            'F.[NSFW-A] 强制暧昧桥段',
            'G.亮出信物逼退门外暗桩'
        ]);
        expect(filtered).toEqual([
            'A.顺着血迹推开耳房木门查看',
            'B.扣紧腰间短刀先退入回廊阴影',
            'C.低声盘问店内小二昨夜谁曾登楼',
            'D.亮出信物逼退门外暗桩'
        ]);
    });

    it('构建本回合导演简报 excludes protagonist and on-stage NPCs from off-stage spillover threats', () => {
        const bible = 创建空白导演圣经();
        bible.宏观分幕大纲 = [{
            幕次: 1,
            标题: '雨夜迷踪',
            核心矛盾: '盐税账册丢失引发黑白两道追杀',
            主角目标与破局路径: '在追兵合围前辨明内鬼',
            关键势力与人物: ['沈砚', '柳青丝'],
            跃迁至下一幕条件: '拿到账册残页',
            当前状态: '推进中'
        }];
        bible.核心卡司 = [
            {
                id: 'NPC-1',
                姓名: '柳青丝',
                性别: '女',
                身份与势力: '漕帮账房',
                所处层级: 1,
                生平与过往执念: '寻兄下落',
                表层伪装: '怯懦算账先生',
                真实诉求与利益底线: '借主角试探码头暗桩',
                隐藏秘密: '掌握地下银库钥匙',
                初始认知边界: { 已知事实: [], 盲区: [] },
                人际渊源: [],
                是否已登场: true,
                幕后当前日程: { 当前目标: '在场传信试探', 正在推进的步骤: '指尖敲击桌角暗示', 行动倒计时回合: 1, 已触发影响: [] }
            },
            {
                id: 'NPC-2',
                姓名: '顾斩潮',
                性别: '男',
                身份与势力: '靖安司千户',
                所处层级: 3,
                生平与过往执念: '清洗江南盐政',
                表层伪装: '冷面督办',
                真实诉求与利益底线: '封锁码头抓活口',
                隐藏秘密: '私藏半本盐引底簿',
                初始认知边界: { 已知事实: [], 盲区: [] },
                人际渊源: [],
                是否已登场: false,
                幕后当前日程: { 当前目标: '调兵封锁渡口', 正在推进的步骤: '城门增派黑甲步卒排查', 行动倒计时回合: 1, 已触发影响: [] }
            }
        ];
        bible.伏笔台账 = [{
            id: 'FS-1',
            类型: '物件',
            表面载体: '缺角铜算盘',
            底层真相: '算盘暗格藏着私盐密押',
            知情人: ['顾斩潮'],
            盲区人物: ['沈砚'],
            建议埋设阶段: '第1回合',
            建议回收阶段: '第4回合',
            触发或回收条件: '主角细查算盘底部暗榫',
            状态: '未埋设'
        }];

        const brief = 构建本回合导演简报({
            bible,
            turnIndex: 1,
            playerName: '沈砚',
            presentNpcNames: ['柳青丝'],
            gameConfig: 默认游戏设置
        });
        expect(brief.directorBriefText).toContain('调兵封锁渡口');
        expect(brief.directorBriefText).not.toContain('在场传信试探');
        expect(brief.focusForeshadowId).toBe('FS-1');
    });

    it('执行导演后处理V2 enforces monotonic foreshadow progression and records offscreen spillovers', async () => {
        const bible = 创建空白导演圣经();
        bible.宏观分幕大纲 = [{
            幕次: 1,
            标题: '暗潮涌动',
            核心矛盾: '码头失火后的清查',
            主角目标与破局路径: '寻出纵火者',
            关键势力与人物: ['沈砚', '顾斩潮'],
            跃迁至下一幕条件: '查明幕后主使',
            当前状态: '推进中'
        }];
        bible.伏笔台账 = [
            {
                id: 'FS-1',
                类型: '物件',
                表面载体: '半枚焦黑腰牌',
                底层真相: '腰牌属于州府暗卫副统领',
                知情人: ['顾斩潮'],
                盲区人物: ['沈砚'],
                建议埋设阶段: '第1回合',
                建议回收阶段: '第5回合',
                触发或回收条件: '对照府衙制式铜模',
                状态: '发酵中',
                埋设回合: 1,
                埋设落点描述: '从灰烬里拾起'
            },
            {
                id: 'FS-2',
                类型: '人物怪癖',
                表面载体: '船夫左袖朱砂印',
                底层真相: '那是红莲教水鬼标记',
                知情人: ['船夫'],
                盲区人物: ['沈砚'],
                建议埋设阶段: '第1回合',
                建议回收阶段: '第3回合',
                触发或回收条件: '水鬼露面',
                状态: '已埋设',
                埋设回合: 0,
                埋设落点描述: '渡口借火时一晃而过'
            }
        ];
        bible.当前幕次 = 2;
        bible.宏观分幕大纲.push({ ...bible.宏观分幕大纲[0], 幕次: 2, 标题: '对峙' });
        bible.伏笔台账.push({ ...bible.伏笔台账[0], id: 'FS-004', 状态: '已回收' });
        bible.核心卡司 = [{
            id: 'NPC-3',
            姓名: '顾斩潮',
            性别: '男',
            身份与势力: '靖安司千户',
            所处层级: 3,
            生平与过往执念: '清洗江南盐政',
            表层伪装: '冷面督办',
            真实诉求与利益底线: '暗中封江',
            隐藏秘密: '手握暗卫名录',
            初始认知边界: { 已知事实: [], 盲区: [] },
            人际渊源: [],
            是否已登场: false,
            幕后当前日程: {
                当前目标: '封锁南渡口',
                正在推进的步骤: '调遣巡防营哨船合围',
                行动倒计时回合: 1,
                已触发影响: []
            }
        }];

        vi.mocked(chatClient.请求模型文本).mockResolvedValueOnce(
            '<导演更新JSON>' + JSON.stringify({
                环境变更: { 推进分钟数: 20, 小地点: '临安西市客栈', 具体地点: '临安西市客栈' },
                势力声望更新: [
                    { 势力ID: 'F1', 主角声望: 27, 依据: '漕帮将沈砚列为座上宾' },
                    { 势力ID: 'F2', 主角声望: -49, 依据: '正文从未提到的风声' },
                    { 势力ID: 'F3', 主角声望: 101, 依据: '漕帮将沈砚列为座上宾' },
                    { 势力ID: 'F4', 主角声望: 80, 依据: '漕帮将沈砚列为座上宾' }
                ],
                已知局外人物: [{ 姓名: '何掌柜', 依据: '何掌柜派人去巡防营讨债。', 身份: '幕后掌印使' }],
                社交人物更新: [{ 姓名: '顾斩潮', 是否在场: false, 身份: '未公开的暗卫' }, { 姓名: '藏锋客', 是否在场: true },
                    { 姓名: '顾霜晚', 是否在场: true, 身份: '持令使者' }, { 姓名: '赵明川', 是否在场: true, 身份: '账房' }],
                伏笔迁移: [
                    { id: 'FS-1', nextStatus: '已埋设', 落点描述: '试图倒退回已埋设' },
                    { id: 'FS-2', nextStatus: '已回收', 落点描述: '船夫当众露出朱砂印身份' },
                    { id: 'FS-004', nextStatus: '已改线' }
                ],
                幕后人物推进: [
                    { id: 'NPC-3', 行动倒计时变化: -1, 触发外溢波及: '官差敲锣封锁南渡渡口' }
                ],
                新增伏笔: [{ 表面载体: '铜模', 底层真相: '藏银' }],
                动态重规划: { 需要重规划: false, 推进到幕次: 1 },
                下回合导演简报: {
                    本回合舞台焦点: '客栈内外官兵盘查收紧',
                    必须守住的悬念或冲突: '腰牌来源仍待印证',
                    在场人物私密动向提示: [],
                    下一拍预计走向: '官兵登楼搜检'
                }
            }) + '</导演更新JSON>'
        );

        const res = await 执行导演后处理V2({
            state: {
                turnIndex: 2,
                gameInitialTime: '1:01:01:08:00',
                worldPrompt: '江南武林',
                directorBible: bible,
                角色: { 姓名: '沈砚', 当前血量: 100, 最大血量: 100 } as any,
                环境: { 时间: '1:01:01:08:00', 年份: 1, 月份: 1, 日期: 1, 小时: 8, 分钟: 0, 季节: '春', 天气: '小雨', 大地点: '临安', 中地点: '西市', 小地点: '客栈', 区地点: '', 子地点: '', 具体地点: '临安西市客栈' } as any,
                社交: [{ id: 'NPC-002', 姓名: '周衡', 是否在场: false } as any],
                世界: { 地图层级: [], 势力列表: [{ ID: 'F1', 名称: '漕帮' }, { ID: 'F2', 名称: '商会', 主角声望: 0 }, { ID: 'F3', 名称: '伏龙山' }], 江湖史册: [], 进行中事件: [] } as any,
                剧情: { 当前章节: { 标题: '第一章', 原文内容: '', 当前分解组: 1 }, 历史卷宗: [] } as any,
                剧情规划: { 近期剧情规划: [], 中期剧情规划: [], 长期剧情规划: [], 跨章延续事项: [] } as any,
                记忆系统: { 回忆档案: [], 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] },
                历史记录: [],
                任务列表: [],
                世界大事: []
            },
            apiConfig: { id: 'dir', 名称: '测试', 供应商: 'openai_compatible', baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm' } as any,
            storyResponse: { logs: [
                { sender: '旁白', text: '雨点砸在窗纸上，远处传来锣声。漕帮将沈砚列为座上宾。顾斩潮下令封锁渡口。何掌柜派人去巡防营讨债。' },
                { sender: '沈砚', text: '张掌柜派人追缴上月的欠款。' },
                { sender: '旁白', text: '顾霜晚递给你一枚铜令。赵明川数着桌上的钱。' }
            ], shortTerm: '沈砚在客栈歇脚。', tavern_commands: [] },
            stream: false,
            playerInput: '推开窗看楼下动静'
        });

        const fs1 = res.nextState.directorBible.伏笔台账.find((f) => f.id === 'FS-1');
        const fs2 = res.nextState.directorBible.伏笔台账.find((f) => f.id === 'FS-2');
        expect(vi.mocked(chatClient.请求模型文本).mock.lastCall?.[2]?.streamOptions?.stream).toBe(false);
        expect(vi.mocked(chatClient.请求模型文本).mock.lastCall?.[1].map(message => message.content).join('')).toContain('势力声望更新');
        expect(res.nextState.世界.势力列表.map(faction => [faction.ID, faction.主角声望])).toEqual([['F1', 27], ['F2', 0], ['F3', undefined]]);
        expect(res.nextState.社交.map(npc => npc.姓名).sort()).toEqual(['周衡', '顾斩潮', '何掌柜', '张掌柜', '顾霜晚', '赵明川'].sort());
        expect(res.nextState.社交.find(npc => npc.姓名 === '周衡')?.id).toBe('NPC-002');
        expect(new Set(res.nextState.社交.map(npc => npc.id)).size).toBe(res.nextState.社交.length);
        expect(res.nextState.社交.find(npc => npc.姓名 === '张掌柜')?.简介).toContain('沈砚提到');
        expect(res.nextState.社交.filter(npc => npc.是否在场).map(npc => npc.姓名).sort()).toEqual(['顾霜晚', '赵明川'].sort());
        expect(res.nextState.社交.every(npc => !npc.是否队友)).toBe(true);
        expect(JSON.stringify(res.nextState.社交)).not.toMatch(/未公开的暗卫|幕后掌印使/);
        expect(res.nextState.directorBible.核心卡司.find(c => c.姓名 === '顾斩潮')?.是否已登场).toBe(false);
        expect(res.nextState.directorBible.当前幕次).toBe(2);
        expect(res.nextState.directorBible.伏笔台账.find(f => f.id === 'FS-004')?.状态).toBe('已回收');
        expect(res.nextState.directorBible.伏笔台账.find(f => f.表面载体 === '铜模')?.id).toBe('FS-005');
        expect(fs1?.状态).toBe('发酵中');
        expect(fs2?.状态).toBe('已回收');
        expect(res.offscreenSpillovers.some((s) => s.includes('封锁南渡渡口'))).toBe(true);
        expect(res.nextState.世界大事.some((s) => s.includes('封锁南渡渡口'))).toBe(true);
    });

    it('从状态构建2_0导演圣经 upgrades legacy 1.x saves without duplicating protagonist into cast', () => {
        const bible = 从状态构建2_0导演圣经({
            worldPrompt: '北境风雪江湖',
            role: { 姓名: '沈砚', 性别: '男' } as any,
            social: [
                { 姓名: '沈砚', 身份: '重复主角' },
                { 姓名: '苏清寒', 性别: '女', 身份: '听雪楼剑侍', 境界: '金丹期', 是否在场: true }
            ],
            world: {
                势力列表: [{ ID: 'F1', 名称: '听雪楼', 势力类型: '宗门', 关系网: { 黑风寨: '敌对' } } as any]
            },
            storyPlan: {
                跨章延续事项: [{ 标题: '残剑缺口之谜', 延续到何时: '第2幕', 后续接续条件: ['寻访铸剑师'] }]
            } as any
        });

        expect(bible.核心卡司.some((c) => c.姓名 === '沈砚')).toBe(false);
        expect(bible.核心卡司.some((c) => c.姓名 === '苏清寒')).toBe(true);
        expect(bible.势力暗账[0]?.名称).toBe('听雪楼');
        expect(bible.伏笔台账.some((f) => f.表面载体 === '残剑缺口之谜')).toBe(true);
    });

    it('提取2_0流式正文预览 hides raw thinking and strips ### 正文 prefix, and parseStoryRawText cleans Judge leaks', () => {
        expect(提取2_0流式正文预览('<thinking>内部推演</thinking>')).not.toContain('内部推演');
        expect(提取2_0流式正文预览('<thinking>构思</thinking><正文>\n### 正文\n夜风吹灭了灯笼。')).toBe('夜风吹灭了灯笼。');

        const parsed = parseStoryRawText([
            '<thinking>ok</thinking>',
            '<正文>',
            '【沈砚】“这一剑我接下了。”',
            '判定类型：身手检定',
            '行动目标：硬接来袭剑招',
            '判定值拆解：基础B10 + 环境E0 = 10',
            '变量影响：好感度+2',
            '院门吱呀一声被推开。',
            '</正文>',
            '<短期记忆>沈砚接下一剑。</短期记忆>',
            '<行动选项>',
            'A.顺势追击',
            'B.收剑入鞘',
            '</行动选项>'
        ].join('\n'));
        const bodyText = parsed.logs.map((l) => l.text).join('\n');
        expect(bodyText).toContain('院门吱呀一声被推开');
        expect(bodyText).not.toContain('判定类型：');
        expect(bodyText).not.toContain('变量影响：');
        expect(bodyText).not.toContain('行动目标：');
    });

    it('StoryModal shows planted/fermenting clues safely without leaking unrevealed secrets', () => {
        const bible = 创建空白导演圣经();
        bible.宏观分幕大纲 = [{
            幕次: 1,
            标题: '津门夜雨',
            核心矛盾: '盐引失窃',
            主角目标与破局路径: '寻回账簿',
            关键势力与人物: ['柳青丝'],
            跃迁至下一幕条件: '入夜探仓',
            当前状态: '推进中'
        }];
        bible.伏笔台账 = [
            {
                id: 'FS-PLANTED',
                类型: '物件',
                表面载体: '生锈铜算盘',
                底层真相: '绝密真相_不应该提前剧透',
                知情人: [],
                盲区人物: ['沈砚'],
                建议埋设阶段: '第1回合',
                建议回收阶段: '第4回合',
                触发或回收条件: '拆解算盘',
                状态: '发酵中',
                埋设回合: 1,
                埋设落点描述: '柜台暗格内发现缺珠算盘'
            },
            {
                id: 'FS-RECOVERED',
                类型: '身份暗桩',
                表面载体: '红绳旧铃',
                底层真相: '真相_失散师妹信物已验证',
                知情人: ['沈砚'],
                盲区人物: [],
                建议埋设阶段: '第0回合',
                建议回收阶段: '第2回合',
                触发或回收条件: '对暗号',
                状态: '已回收',
                埋设回合: 0,
                埋设落点描述: '腕间一晃而过的银铃'
            }
        ];

        const html = renderToStaticMarkup(
            React.createElement(StoryModal, {
                story: { 当前章节: undefined as any, 历史卷宗: [] } as any,
                directorBible: bible,
                worldEvents: ['码头戒严升级'],
                onClose: () => {}
            })
        );
        expect(html).toContain('生锈铜算盘');
        expect(html).toContain('柜台暗格内发现缺珠算盘');
        expect(html).not.toContain('绝密真相_不应该提前剧透');
        expect(html).toContain('真相_失散师妹信物已验证');
        expect(html).toContain('码头戒严升级');
    });
});
