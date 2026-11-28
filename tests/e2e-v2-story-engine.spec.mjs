import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

let server = null;
let baseUrl = '';

const startDistServer = async () => {
    const root = path.resolve('dist');
    if (!fs.existsSync(path.join(root, 'index.html'))) {
        throw new Error('dist/index.html missing; run npm run build first');
    }
    const srv = http.createServer((req, res) => {
        let reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (reqPath === '/') reqPath = '/index.html';
        const resolved = path.join(root, path.normalize(reqPath).replace(/^(\.\.[/\\])+/, ''));
        if (resolved.startsWith(root) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
            res.writeHead(200, { 'Content-Type': MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream' });
            fs.createReadStream(resolved).pipe(res);
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        fs.createReadStream(path.join(root, 'index.html')).pipe(res);
    });
    await new Promise((resolve, reject) => {
        srv.once('error', reject);
        srv.listen(0, '127.0.0.1', resolve);
    });
    const addr = srv.address();
    return { srv, url: `http://127.0.0.1:${addr.port}/` };
};

const buildWorldBibleMockResponse = () => {
    const mapNodes = [
        { ID: 'DT-001', 名称: '九州江海', 层级: '寰宇', 父级ID: '', 描述: '九州与东海诸岛总揽', 坐标X: 50, 坐标Y: 50, 范围半径: 50 },
        { ID: 'DT-002', 名称: '云州府境', 层级: '大地点', 父级ID: 'DT-001', 描述: '漕运盐路咽喉大州', 坐标X: 30, 坐标Y: 40, 范围半径: 20 },
        { ID: 'DT-003', 名称: '沧澜群岛', 层级: '大地点', 父级ID: 'DT-001', 描述: '海外走私盐船泊地', 坐标X: 75, 坐标Y: 45, 范围半径: 18 },
        { ID: 'DT-004', 名称: '北朔雪原', 层级: '大地点', 父级ID: 'DT-001', 描述: '边军马政重镇', 坐标X: 45, 坐标Y: 15, 范围半径: 20 },
        { ID: 'DT-005', 名称: '南越瘴岭', 层级: '大地点', 父级ID: 'DT-001', 描述: '药石矿脉秘境', 坐标X: 55, 坐标Y: 80, 范围半径: 18 },
        ...Array.from({ length: 8 }, (_, idx) => ({
            ID: `DT-${String(idx + 6).padStart(3, '0')}`,
            名称: `云州中域${idx + 1}`,
            层级: '中地点',
            父级ID: `DT-00${(idx % 4) + 2}`,
            描述: `第${idx + 1}中域枢纽`,
            坐标X: 25 + idx * 7,
            坐标Y: 45,
            范围半径: 10
        })),
        ...Array.from({ length: 16 }, (_, idx) => ({
            ID: `DT-${String(idx + 14).padStart(3, '0')}`,
            名称: idx === 0 ? '云州西郊' : `江湖城镇${idx + 1}`,
            层级: '小地点',
            父级ID: `DT-${String((idx % 8) + 6).padStart(3, '0')}`,
            描述: idx === 0 ? '紧邻西市渡口的荒凉郊野' : `第${idx + 1}城镇地标`,
            叙事核心: idx === 0 ? '七日前沉船余波正于此地暗中发酵' : '',
            坐标X: 30 + idx * 4,
            坐标Y: 50,
            范围半径: 5
        })),
        { ID: 'DT-030', 名称: '云州破庙区', 层级: '区地点', 父级ID: 'DT-014', 描述: '西郊破败山神庙一带', 坐标X: 31, 坐标Y: 51, 范围半径: 3 },
        { ID: 'DT-031', 名称: '西市老渡口', 层级: '区地点', 父级ID: 'DT-014', 描述: '官差与漕帮盯防要道', 坐标X: 33, 坐标Y: 52, 范围半径: 3 },
        { ID: 'DT-032', 名称: '破庙供桌殿', 层级: '子地点', 父级ID: 'DT-030', 描述: '避雨藏身之所', 坐标X: 31, 坐标Y: 51, 范围半径: 1 }
    ];
    const factions = Array.from({ length: 6 }, (_, idx) => ({
        id: `FCT-00${idx + 1}`,
        名称: `势力甲乙${idx + 1}门`,
        类型: idx % 2 === 0 ? '宗门' : '世家',
        实力等级: 5 + (idx % 4),
        层级: (idx % 3) + 1,
        领袖: `掌门${idx + 1}`,
        核心人物: [`CAST-00${idx + 1}`],
        内部裂痕: '少壮派与长老会就盐引分成暗生嫌隙',
        对外公开立场: '维持云州商路与渡口秩序',
        真实诉求与暗中图谋: '暗中争夺十年前沉银案秘钥与密库总账',
        致命弱点或忌讳: '盐票周转亏空且暗桩名单恐遭外泄',
        跨势力账目: [
            { 对方势力: `势力甲乙${((idx + 1) % 6) + 1}门`, 关系: '利益互锁', 具体渊源: '争夺西市渡口税权与秘钥下落' },
            { 对方势力: `势力甲乙${((idx + 2) % 6) + 1}门`, 关系: '宿怨掣肘', 具体渊源: '十年前沉银劫案旧账未清' }
        ],
        地盘: ['云州西郊', '西市老渡口']
    }));
    const cast = Array.from({ length: 7 }, (_, idx) => ({
        id: `CAST-00${idx + 1}`,
        姓名: idx === 0 ? '顾霜晚' : `江湖人士${idx + 1}`,
        性别: idx % 2 === 0 ? '女' : '男',
        身份与势力: `势力甲乙${(idx % 6) + 1}门要员`,
        所处层级: (idx % 3) + 1,
        生平与过往执念: '早年失落家族契约与十年前渡口旧案息息相关',
        表层伪装: '沉静持重的行商或客卿',
        真实诉求与利益底线: '绝不令青铜秘钥落入靖安司暗桩之手',
        隐藏秘密: `持有线索号${idx + 1}`,
        初始认知边界: { 已知事实: ['码头夜船暗号'], 盲区: ['不知主角随身携带半块玉扣'] },
        人际渊源: [{ 对象: '林秋水', 真实关系与心思: '试探利用却暂保合作底线' }],
        幕后当前日程: { 当前目标: `封锁第${idx + 1}码头`, 正在推进的步骤: '暗调人手布防并清点过往船只', 行动倒计时回合: 2, 已触发影响: [] },
        是否已登场: idx === 0
    }));
    const foreshadows = Array.from({ length: 6 }, (_, idx) => ({
        id: `FS-00${idx + 1}`,
        类型: '物件',
        表面载体: idx === 0 ? '青铜碎钥' : `古旧线索${idx + 1}`,
        底层真相: idx === 0 ? '绝密真相_盐库暗门密钥' : `隐藏真相${idx + 1}`,
        知情人: ['CAST-002'],
        盲区人物: ['林秋水'],
        建议埋设阶段: idx === 0 ? '第0~1回合' : `第${idx + 1}回合`,
        建议回收阶段: '第1幕高潮',
        触发或回收条件: '对照盐引铜模',
        状态: '未埋设'
    }));
    const acts = Array.from({ length: 4 }, (_, idx) => ({
        幕次: idx + 1,
        标题: `第${idx + 1}幕·风雨欲来`,
        核心矛盾: '盐引秘钥引发多方暗战与底层求生挣扎',
        主角目标与破局路径: '在围追堵截中查明账簿下落并稳住同路人',
        关键势力与人物: ['林秋水', '顾霜晚'],
        跃迁至下一幕条件: '破解第一重暗桩',
        当前状态: idx === 0 ? '推进中' : '未开始'
    }));

    const worldProse = [
        '九州疆域辽阔，以云州府境为南北漕运盐路咽喉，北接雪原边军防线，东连沧澜群岛私舶暗港，南望十万瘴岭药矿险地，西扼古道关隘。表面上朝廷设盐铁转运司统御九州商税与盐引勘合，六大宗门与百年世家各守祖制、以武止戈，维系着百年来表面平和的江湖秩序、坊市规矩与官民商路往来，令无数寒门子弟仍以为勤修苦练便能出人头地。',
        '然而在民间市井与外围散修眼中，近十年来官盐价钱节节攀升，西市老渡口屡传夜船失事沉江之闻，凡私运私盐、打听旧案或携有残缺铜牌者往往一夜蒸发，坊间暗流早已汹涌难平。外围武者修习粗浅吐纳法门，常为一枚引气丹或半张渡船路引奔波卖命；而高居内城阁楼之上的人物，却只用一纸令签便能封锁整条江面。今夜大雨倾盆，七日前那场沉船旧案的余波正席卷而来，正是山雨欲来风满楼的前夕。'
    ].join('\n\n');

    return [
        `<世界观>${worldProse}</世界观>`,
        `<世界基底>${JSON.stringify({ 地图层级: mapNodes })}</世界基底>`,
        `<导演圣经>${JSON.stringify({
            version: 2,
            世界观表层摘要: '云州商道风云诡谲，表面盐铁秩序下暗藏多方势力角逐。',
            顶层隐秘秩序: '十年前起云州盐引与边军军饷便被高层通过暗库总账私下勾兑垄断，违者一律以沉船水匪名义抹除。',
            核心历史原罪: '十年前云州百艘运银官船一夜沉江的旧案实为顶层瓜分失衡所致，遗留两半青铜密钥至今下落不明。',
            终局方向与逆推因果: '循着青铜碎钥与沉银账簿逆推顶层密约，撬动六派制衡秩序。',
            空间阶梯: [
                { 层级序号: 1, 层级名称: '云州下城码头', 典型区域: ['西市老渡口', '云州西郊'], 准入壁垒: '无盐引不得夜行登船', 核心资源与垄断者: '私盐渡口归漕帮暗控', 主要压迫冲突: '差役盘剥与黑市灭口' },
                { 层级序号: 2, 层级名称: '内城宗门世家', 典型区域: ['云州府城'], 准入壁垒: '须持宗门腰牌或世家荐书', 核心资源与垄断者: '筑基灵药与官营盐票', 主要压迫冲突: '旁支倾轧与借刀杀人' },
                { 层级序号: 3, 层级名称: '列国靖安司网', 典型区域: ['南北漕运总署'], 准入壁垒: '三品令签方可调阅旧案卷宗', 核心资源与垄断者: '总账名册与缉捕大权', 主要压迫冲突: '灭口清场与派系换血' },
                { 层级序号: 4, 层级名称: '天京秘阁顶层', 典型区域: ['沧澜秘岛'], 准入壁垒: '唯有半块旧钥可启封海图', 核心资源与垄断者: '长生古丹方与天下盐脉', 主要压迫冲突: '破局立新抑或成为下一个执棋者' }
            ],
            前史导火索: [{ 事件名: '渡口翻船案', 发生时间: '开局前七日', 真实经过: '秘钥随货坠江引发各派密探截杀', 表层流言版本: '水鬼索命沉船无人生还', 卷入各方: ['势力甲乙1门', '势力甲乙2门'], 留下的烫手筹码或危机: '生还者正遭全城搜捕灭口' }],
            主角核心困局: { 开局处境: '身怀半块玉扣且被差役盯上行踪', 最大威胁源: '靖安司暗桩与漕帮追兵', 手中唯一筹码或信息差: '知晓沉船真实方位与玉扣暗纹', 短中期推进动力: '雨夜突围保命并反查内鬼' },
            宏观分幕大纲: acts,
            当前幕次: 1,
            势力暗账: factions,
            核心卡司: cast,
            伏笔台账: foreshadows,
            动态轨迹记录: [],
            下回合导演简报: {
                生成于回合: 0,
                本回合舞台焦点: '雨夜破庙避雨与陌生同路人试探',
                必须守住的悬念或冲突: '门外脚步声越来越近',
                待埋或推进伏笔ID: 'FS-001',
                待埋伏笔演出方式: '墙角供桌下露出一枚沾泥青铜碎钥',
                即将落地的外溢世界波及: ['黑市放话悬赏沉船生还者'],
                在场人物私密动向提示: [],
                下一拍预计走向: '试探同行者来历'
            }
        })}</导演圣经>`
    ].join('\n');
};

const buildSseChunk = (content) => {
    const piece = JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content }, finish_reason: null }] });
    const end = JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
    return `data: ${piece}\n\ndata: ${end}\n\ndata: [DONE]\n\n`;
};

const putSetting = async (page, key, value) => {
    await page.evaluate(async ({ key, value }) => {
        const req = indexedDB.open('WuxiaGameDB');
        const db = await new Promise((resolve, reject) => {
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves', { keyPath: 'id', autoIncrement: true });
                if (!db.objectStoreNames.contains('save_summaries')) db.createObjectStore('save_summaries', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('image_assets')) db.createObjectStore('image_assets', { keyPath: 'id' });
            };
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction(['settings'], 'readwrite');
            tx.objectStore('settings').put({
                key,
                value,
                version: 2,
                category: 'e2e',
                updatedAt: Date.now()
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }, { key, value });
};

const clickVisible = async (page, candidates) => {
    for (const c of candidates) {
        const btn = page.getByRole('button', { name: c }).first();
        if (await btn.count() && await btn.isVisible().catch(() => false)) {
            await btn.click({ force: true });
            return true;
        }
        const txt = page.getByText(c, { exact: false }).first();
        if (await txt.count() && await txt.isVisible().catch(() => false)) {
            await txt.click({ force: true });
            return true;
        }
    }
    return false;
};

test.describe('MoRanJiangHu 2.0 E2E (dist/)', () => {
    test.beforeAll(async () => {
        const started = await startDistServer();
        server = started.srv;
        baseUrl = started.url;
    });

    test.afterAll(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    test('Full 2.0 flow: WorldGen -> Opening -> Turn 1 -> StoryModal clues -> Zero Battle/Auction UI', async ({ page }, testInfo) => {
        test.setTimeout(120000);
        const pageErrors = [];
        const capturedCalls = [];
        page.on('pageerror', (err) => { console.log('[PAGEERROR]', err.message); pageErrors.push(err.message); });
        page.on('console', (msg) => {
            if (msg.type() === 'error' || /cannot (?:contain a nested|be a descendant)|validateDOMNesting/i.test(msg.text())) pageErrors.push(msg.text());
            if (msg.type() === 'error' || msg.type() === 'warning' || msg.text().includes('2.0')) {
                console.log(`[CONSOLE:${msg.type()}]`, msg.text());
            }
        });

        await page.addInitScript(() => {
            localStorage.setItem('moranjianghu.releaseNotesSuppressDate', new Date().toISOString().slice(0, 10));
        });
        // 产物测试使用本地构建的版本信息和静态服务，测试期间不依赖线上公告或在线人数。
        await page.route('**/release-info.json*', route => route.fulfill({
            path: path.resolve('dist/release-info.json'),
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' }
        }));
        await page.routeWebSocket('**/api/admin/online*', () => {});

        await page.route('**/v1/chat/completions', async (route) => {
            const body = route.request().postDataJSON();
            const joined = (body?.messages || []).map((m) => `${m.role}: ${m.content}`).join('\n');
            console.log('[AI_ROUTE_CALL]', {
                stream: body?.stream,
                msgCount: body?.messages?.length,
                head: joined.slice(0, 120).replace(/\s+/g, ' '),
                tail: joined.slice(-180).replace(/\s+/g, ' ')
            });
            let replyText = '';

            if (joined.includes('角色视觉锚点提取器')) {
                capturedCalls.push('visual_anchor');
                replyText = JSON.stringify({
                    外貌锚点: 'black hair, dark eyes, hanfu, pale skin, elegant',
                    视觉年龄建议岁数: 18
                });
            } else if (joined.includes('构建一台【开局前就已经上了发条的高压因果机器】')) {
                if ((body?.messages?.length || 0) >= 3) {
                    console.log('[WORLD_BIBLE_REPAIR_REASON]', String(body.messages[2]?.content || '').slice(0, 400));
                }
                capturedCalls.push('world_bible_v2');
                replyText = buildWorldBibleMockResponse();
            } else if (joined.includes('【变量生成COT】')) {
                capturedCalls.push('variable');
                replyText = '<thinking>核对正文</thinking><说明>状态一致</说明><命令>无</命令>';
            } else if (joined.includes('【已有地图层级】') && joined.includes('【自动更新规则】')) {
                capturedCalls.push('map');
                replyText = '<thinking>对照地图核对当前房间</thinking><说明>房间已记录</说明><命令>无</命令>';
            } else if (joined.includes('只输出合法 JSON（包裹在 <导演更新JSON>')) {
                const isTurn0 = joined.includes('开局初始化') || capturedCalls.filter((c) => c === 'director_post').length === 0;
                capturedCalls.push('director_post');
                replyText = '<导演更新JSON>' + JSON.stringify({
                    环境变更: { 推进分钟数: isTurn0 ? 0 : 15, 小地点: '云州破庙区', 具体地点: '破庙供桌殿' },
                    社交人物更新: isTurn0 ? [{ 姓名: '顾霜晚', 交易资产初见: { 依据: '顾霜晚把钱袋摊开，只有十九枚铜钱。', 余额Base: 19 } }] : [],
                    主角变化: isTurn0 ? {} : { 获得物品: [{ 名称: '兽药', 类型: '材料', 数量: 1 }] },
                    伏笔迁移: [
                        isTurn0
                            ? { id: 'FS-001', nextStatus: '已埋设', 落点描述: '供桌青砖缝里露出一枚沾泥青铜碎钥' }
                            : { id: 'FS-001', nextStatus: '发酵中', 落点描述: '门外搜检官差腰间挂着同款青铜锁牌' }
                    ],
                    幕后人物推进: isTurn0
                        ? [{ id: 'CAST-002', 行动倒计时变化: -1, 触发外溢波及: '官差夜封西市渡口' }]
                        : [],
                    动态重规划: { 需要重规划: false },
                    下回合导演简报: {
                        本回合舞台焦点: '破庙门外火把逼近，顾霜晚神色微动',
                        必须守住的悬念或冲突: '碎钥与官差铜牌如出一辙',
                        在场人物私密动向提示: [],
                        下一拍预计走向: '盘查或潜走'
                    }
                }) + '</导演更新JSON>';
            } else if (joined.includes('2.0 剧情导演开局简报')) {
                capturedCalls.push('turn0_opening_v2');
                replyText = [
                    '<thinking>构建2.0开局紧张雨夜氛围，埋下FS-001载体</thinking>',
                    '<正文>',
                    '檐角雨水连成细线砸在青石台阶上。你握紧袖中半块温润玉扣，目光落在供桌青砖缝里露出的一枚沾泥青铜碎钥。',
                    '【顾霜晚】把钱袋摊开，只有十九枚铜钱。',
                    '【顾霜晚】（低声）：“这庙里潮气重，阁下还是莫要乱翻旧物的好。”',
                    '</正文>',
                    '<短期记忆>林秋水于云州破庙避雨，瞥见青铜碎钥，同行女子顾霜晚开口提醒。</短期记忆>',
                    '<行动选项>',
                    'A.不动声色用脚尖将碎钥拨进阴影再试探顾霜晚',
                    'B.俯身捡起青铜碎钥端详其缺口纹路',
                    'C.推开半扇破门望向山道火光动向',
                    'D.抱臂靠柱闭目养神静观其变',
                    '</行动选项>'
                ].join('\n');
            } else {
                capturedCalls.push('turn1_normal_v2');
                const fillerParagraphs = [
                    '林秋水收起一包兽药。林秋水指节微曲，趁火堆噼啪炸响的一瞬探手将碎钥收入袖底。庙外泥地里传来整齐的靴声，领头差役腰间赫然悬着同款制式铜牌，在湿冷夜风里泛着暗沉铁光。雨水顺着残破飞檐急急滴落，打在门槛青石上溅起细碎水花，将门外火把映出的几道影子拉得忽长忽短，仿佛几柄随时准备出鞘的窄刀贴着门板游移。你放轻呼吸，指尖隔着粗布衣袖缓缓摩挲那半块碎钥的冰凉缺口，只觉其边缘锯齿竟像是刻意锉磨而成，绝非寻常匠铺流出的民间锁具。',
                    '供桌另一侧的阴影里，顾霜晚不知何时已收回半步，右手搭在腰间短刃的鲨鱼皮柄上，目光穿过火堆跳跃的烟柱斜睨向门隙。火光把她眉骨底下那一寸淡色疤痕映得格外分明，湿透的斗篷下摆正一滴一滴往干草堆里渗着雨水，空气中弥漫着潮湿霉味与松烟辛辣。庙门外传来的甲叶轻响愈发清晰，先是两个人绕着荒庙外墙慢步巡查，靴底踩碎积水里的枯叶发出沙沙声响，紧接着又有低沉的传令声隔着雨幕飘了进来，言辞简短急促，像是在核对渡口与南门两条水陆暗哨的换防时辰。',
                    '你借着起身添柴的动作将残火压暗三分，眼角余光留意到门坎外多了一盏防风油灯的晕光。领头那名老差役似乎并未急着推门，反而停在石阶下俯身检查刚刚被雨水冲淡的车辙印痕，口中含糊地嘟囔着几句盐帮夜行规矩与巡防文书的错漏。就在这时，庙梁栖息的寒鸦受火烟惊扰扑棱棱振翅掠出缺瓦，引得外头差役齐刷刷抬眼喝问一句是谁在里面避雨，整座荒庙的气机登时绷紧如拉满的硬弓。',
                    '顾霜晚朝你微不可察地摇了摇头，唇瓣几乎未动，却已压低声线把外头布防的虚实传了过来。她肩头微沉，左脚脚尖悄悄踩实了砖缝一块松动石板，显然早已算好了破窗或硬拼的两条退路。庙外长街尽头隐隐传来三更梆子敲响的沉闷回音，紧接着又是几声急促哨响穿过重重雨帘，仿佛西市老渡口那边当真发生了什么足以惊动全城盐铁暗桩的大动静。',
                    '火堆最后一截枯枝咔嚓断成两截，火星顺着风势斜斜飘向门缝，照亮了石阶上那排凌乱泥印。你按捺住直接掀开暗袋核对铜印字样的冲动，背脊缓缓贴近冰凉石柱，将浑身真气沉入丹田四肢，只等门外那盏油灯再度逼近三步之内便决定先机出手还是顺势周旋，整个人如蛰伏枯草间的猎鹰般稳住了呼吸节奏。',
                    '窗棂缝隙灌入的一缕寒风吹得烛焰猛地摇晃，映得破庙四壁斑驳泥塑神像忽明忽暗，残缺泥臂在墙面投下一大片扭曲黑影。你留意到神台底下一块青砖边缘微微翘起，砖缝深处似乎还夹着半张被潮气浸得发皱的旧纸边角，上面隐约可见朱砂印泥的淡红痕迹。顾霜晚同样瞥见了那半片旧纸，但她只是借着整理裙摆袖口的动作顺势挡住火堆反光，将神色藏进更深的阴影里，没有在这个当口贸然俯身去揭开秘密。',
                    '庙外积水沿着倾颓阶檐汇成一道浑浊细流，咕嘟咕嘟漫过门槛低洼处，把泥地上刚留下的半枚靴印冲得模糊不清。先前提着防风油灯的差役低声同身旁同伴交代了几句什么，随后脚步声逐渐分开成两股，一前一后沿着残破院墙缓慢绕行。你默数着彼此踩泥踏水的间隔拍子，心里迅速推演出这支夜巡队共有四人：门外阶下正中二人守住退路，院墙外侧一人游走放哨，还有一人多半正借着庙檐死角盯紧后窗竹林方向。',
                    '短暂的对峙令荒庙内的空气仿佛凝成了冰水，连火堆余烬熄灭时的细微滋啦声都显得格外刺耳。你指尖轻轻抵住袖底那枚青铜碎钥的菱角边缘，顺势回忆起临行前账房老先生欲言又止的神态与西市老渡口近年屡屡改期的盐船班次。越是看似严密无漏的夜巡封锁，往往越说明对方真正紧张害怕的物件就在这座破庙方圆数里之内，绝非寻常稽查私盐那般简单。'
                ].join('\n');
                replyText = [
                    '<thinking>承接玩家选项与FS-001推进</thinking>',
                    '<正文>',
                    fillerParagraphs,
                    '【顾霜晚】“官差封了西市渡口，今夜走水路已是不成。”',
                    '</正文>',
                    '<短期记忆>林秋水暗藏青铜碎钥，发现官差腰牌纹路一致，西市渡口已被封锁。</短期记忆>',
                    '<行动选项>',
                    'A.从破庙后窗翻入竹林绕开差役',
                    'B.借火把暗影亮出半枚碎钥试探顾霜晚反应',
                    'C.故意咳嗽惊动外头差役探听封渡口风声',
                    'D.退回佛龛后方观察来人腰牌字样',
                    '</行动选项>'
                ].join('\n');
            }
            console.log('[ROUTE_MATCHED]', capturedCalls[capturedCalls.length - 1]);
            const checkTag = joined.match(/原样输出校验标记 (\[CTXCHK:[a-z0-9]+\])/u)?.[1];
            if (checkTag) replyText += '\n' + checkTag;

            if (body?.stream) {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/event-stream; charset=utf-8',
                    body: buildSseChunk(replyText)
                });
            } else {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json; charset=utf-8',
                    body: JSON.stringify({ choices: [{ message: { content: replyText } }] })
                });
            }
        });

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(baseUrl, { waitUntil: 'networkidle' });

        const apiSettings = {
            activeConfigId: 'mock-v2',
            configs: [{
                id: 'mock-v2',
                名称: 'Mock V2 AI',
                供应商: 'openai_compatible',
                协议覆盖: 'openai',
                baseUrl: 'https://mock-v2-ai.local/v1',
                apiKey: 'mock-key',
                model: 'mock-flash',
                maxTokens: 2048,
                temperature: 0.5,
                createdAt: Date.now(),
                updatedAt: Date.now()
            }],
            功能模型占位: {
                主剧情使用模型: 'mock-flash',
                世界演变功能启用: false,
                规划分析功能启用: false,
                文生图功能启用: false
            }
        };
        await putSetting(page, 'api_settings', apiSettings);
        await putSetting(page, 'app_theme', 'day');
        await page.evaluate((s) => {
            localStorage.setItem('moranjianghu.apiConfig.localMirror.v1', JSON.stringify(s));
        }, apiSettings);
        await page.reload({ waitUntil: 'networkidle' });

        expect(await clickVisible(page, ['本地游玩'])).toBe(true);
        await page.waitForTimeout(300);
        expect(await clickVisible(page, ['踏入江湖', '新的江湖', '开始游戏', '新建存档', '初入江湖'])).toBe(true);

        await expect(page.getByText(/1\s*\/\s*6/).first()).toBeVisible({ timeout: 10000 });
        for (let i = 0; i < 5; i += 1) {
            expect(await clickVisible(page, ['下一步 →', '下一步'])).toBe(true);
            await page.waitForTimeout(250);
            if (i === 1) {
                const nameInput = page.locator('input:visible').first();
                await expect(nameInput).toBeVisible({ timeout: 5000 });
                await nameInput.fill('林秋水');
            }
            if (i === 2) {
                const partnerSwitch = page.getByText('启用开局伙伴', { exact: true }).locator('../..').getByRole('button');
                await expect(partnerSwitch).toBeVisible();
                if ((await partnerSwitch.innerText()).includes('已关闭')) await partnerSwitch.click();
                await expect(partnerSwitch).toHaveText(/已启用/);
                const partnerInput = page.getByPlaceholder(/同伴名号|同伴姓名/).first();
                await expect(partnerInput).toBeVisible();
                await partnerInput.fill('顾霜晚');
                await page.getByRole('button', { name: /^保存当前(伙伴)?$/ }).click();
            }
        }

        await expect(page.getByText(/伙伴名单[:：]/)).toContainText('顾霜晚');
        const finishBtn = page.getByRole('button', { name: /开启世界推演|一键生成/ }).first();
        await expect(finishBtn).toBeVisible({ timeout: 10000 });
        await finishBtn.click();
        const confirmStartBtn = page.getByRole('button', { name: '开始生成', exact: true }).first();
        await expect(confirmStartBtn).toBeVisible({ timeout: 5000 });
        await confirmStartBtn.click();

        // Wait for Turn 0 prose to appear (use phrase unique to turn0_opening_v2, not world_bible_v2 preview)
        await expect(page.getByText('这庙里潮气重', { exact: false }).first()).toBeVisible({ timeout: 25000 });
        const openingDialogue = page.locator('.mobile-chat-dialogue-bubble p').filter({ hasText: '这庙里潮气重' });
        await expect(openingDialogue).toHaveText(/^[“「]?这庙里潮气重，阁下还是莫要乱翻旧物的好。[”」]?$/);
        await expect(page.locator('.narrator-renderer').filter({ hasText: '把钱袋摊开' }).first()).toBeVisible();
        expect(capturedCalls.filter((c) => c === 'world_bible_v2')).toHaveLength(1);
        expect(capturedCalls).toContain('turn0_opening_v2');

        // Verify zero Battle & Auction buttons in Desktop RightPanel
        await expect(page.locator('button', { hasText: /^战斗$/ })).toHaveCount(0);
        await expect(page.locator('button', { hasText: /拍卖行|主神商城|当铺牙行/ })).toHaveCount(0);

        // Wait until director post-turn finishes and send Turn 1 via action option button
        await expect.poll(() => capturedCalls.filter((c) => c === 'director_post').length, { timeout: 15000 }).toBeGreaterThanOrEqual(1);
        await expect.poll(() => capturedCalls.filter(c => c === 'map').length, { timeout: 15000 }).toBe(1);
        expect(capturedCalls.filter(c => c === 'variable')).toHaveLength(1);
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
        await page.getByTitle('展开独立更新阶段队列').click();
        for (const label of ['开局动态世界', '开局规划分析']) {
            const stage = page.locator('.rounded.border').filter({ has: page.getByText(label, { exact: true }) }).last();
            await expect(stage).toContainText('已跳过');
            await expect(stage).toContainText('开局导演推演');
            await expect(stage.getByRole('button', { name: '查看原始回复' })).toHaveCount(0);
            await expect(stage.getByText(/^\d+(?:\.\d+)?(?:s|ms)$/)).toHaveCount(0);
        }
        const directorStage = page.locator('.rounded.border').filter({ has: page.getByText('开局导演推演', { exact: true }) }).last();
        await directorStage.getByRole('button', { name: '查看原始回复' }).click();
        await expect(page.locator('pre').filter({ hasText: '<导演更新JSON>' })).toBeVisible();
        await page.getByTitle('收起独立更新阶段队列').click();
        const worldButton = page.getByRole('button', { name: '世界', exact: true });
        if (!(await worldButton.isVisible())) await page.getByText('江湖舆图', { exact: true }).first().click();
        await worldButton.click();
        await page.getByRole('button', { name: /世界总纲/ }).click();
        await expect(page.getByText(/九州疆域辽阔/).first()).toBeVisible();
        await expect(page.getByText('云州下城码头', { exact: false })).toHaveCount(0);
        await expect(page.getByText('在围追堵截中查明账簿下落并稳住同路人')).toHaveCount(0);
        await page.getByRole('button', { name: '揭示第 1 幕破局方向' }).click();
        await expect(page.getByText('在围追堵截中查明账簿下落并稳住同路人')).toBeVisible();
        await page.getByRole('button', { name: '揭示天地空间阶梯' }).click();
        await expect(page.getByText('云州下城码头', { exact: false }).first()).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('worldview-day.png'), animations: 'disabled' });
        await page.getByRole('button', { name: '关闭世界' }).click();

        await page.getByRole('button', { name: '地图', exact: true }).click();
        const map = page.locator('svg:has([data-node="DT-032"])');
        const room = map.locator('[data-node="DT-032"]');
        await expect(map.locator('[data-people-node="DT-032"]')).toContainText('林秋水');
        await expect(map.locator('[data-people-node="DT-032"]')).toContainText('顾霜晚');
        await expect.poll(async () => {
            const bounds = await room.boundingBox();
            return bounds ? Math.min(bounds.width, bounds.height) : 0;
        }).toBeGreaterThan(80);
        const viewWidth = () => map.evaluate(svg => svg.viewBox.baseVal.width);
        const initialWidth = await viewWidth();
        await page.getByTitle('放大', { exact: true }).click();
        await expect.poll(viewWidth).toBeLessThan(initialWidth);
        const roomBounds = await room.boundingBox();
        const playerLabel = await map.locator('[data-people-node="DT-032"] text').filter({ hasText: '林秋水' }).boundingBox();
        expect(playerLabel.y + playerLabel.height).toBeLessThan(roomBounds.y + roomBounds.height - 3);
        await page.getByTitle('放大', { exact: true }).click();
        await expect.poll(async () => 1000 / await viewWidth()).toBeGreaterThan(14.3);
        await page.screenshot({ path: testInfo.outputPath('room-day.png'), animations: 'disabled' });
        await page.getByTitle('关闭', { exact: true }).filter({ visible: true }).click();
        await page.getByRole('button', { name: /^(队伍|同行)$/ }).click();
        await expect(page.getByText('TEAM ROSTER', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /顾霜晚/ }).first()).toBeVisible();
        await page.getByTitle('关闭', { exact: true }).filter({ visible: true }).click();
        const optBtn = page.getByText('俯身捡起青铜碎钥端详其缺口纹路', { exact: false }).first();
        await expect(optBtn).toBeVisible({ timeout: 10000 });
        await optBtn.click({ force: true });
        const sendBtn = page.getByRole('button', { name: /发送/ }).first();
        await expect(sendBtn).toBeVisible({ timeout: 5000 });
        await sendBtn.click();

        await expect(page.getByText('同款制式铜牌', { exact: false }).first()).toBeVisible({ timeout: 20000 });
        expect(capturedCalls).toContain('turn1_normal_v2');
        await expect.poll(() => capturedCalls.filter((c) => c === 'director_post').length, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
        await expect.poll(() => capturedCalls.filter(c => c === 'map').length, { timeout: 15000 }).toBe(2);
        expect(capturedCalls.filter(c => c === 'variable')).toHaveLength(2);

        // Open StoryModal ("剧情") - expand 纪事卷宗 accordion in RightPanel if collapsed
        const storyBtn = page.getByRole('button', { name: '剧情', exact: true }).first();
        if (!(await storyBtn.isVisible().catch(() => false))) {
            await page.getByText('纪事卷宗', { exact: false }).first().click({ force: true });
        }
        await expect(storyBtn).toBeVisible({ timeout: 10000 });
        await storyBtn.click({ force: true });
        const v2ClueSection = page.locator('section:visible').filter({ hasText: '2.0 因果脉络与伏笔线索簿' }).first();
        await v2ClueSection.scrollIntoViewIfNeeded();
        await expect(v2ClueSection).toBeVisible({ timeout: 10000 });
        await expect(v2ClueSection.getByText('青铜碎钥', { exact: true })).toBeVisible({ timeout: 5000 });
        await expect(v2ClueSection.getByText('发酵中').first()).toBeVisible({ timeout: 5000 });
        await expect(v2ClueSection.getByText('官差夜封西市渡口', { exact: false }).first()).toBeVisible({ timeout: 5000 });
        const bodyAll = await page.locator('body').innerText();
        expect(bodyAll).not.toContain('绝密真相_盐库暗门密钥');

        // Close StoryModal drawer cleanly before interacting with InputArea controls
        await page.locator('button[aria-label="关闭"]:visible').first().click();
        await expect(v2ClueSection).toHaveCount(0);

        // Verify bottom-left optional plugins ("情境交易" & "战术交锋") work & honor Settings toggles
        const tradeBtn = page.getByRole('button', { name: '情境交易', exact: true }).first();
        const clashBtn = page.getByRole('button', { name: '战术交锋', exact: true }).first();
        await expect(tradeBtn).toBeVisible({ timeout: 5000 });
        await expect(clashBtn).toBeVisible({ timeout: 5000 });

        await tradeBtn.click();
        await expect(page.getByText('与在场人物交易', { exact: false }).first()).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(/对方当前可付 19 /)).toBeVisible();
        const confirmPresent = page.getByRole('button', { name: '确认对方此刻就在面前可当面交易' });
        if (await confirmPresent.isVisible()) await confirmPresent.click();
        const drug = page.getByText('兽药', { exact: false }).filter({ visible: true }).filter({ hasText: /兽药\s*×1$/ }).last();
        const offerRow = drug.locator('../..');
        await offerRow.getByRole('button', { name: '+', exact: true }).click();
        const receipt = page.getByRole('spinbutton', { name: '我方收取' });
        await expect(receipt).toBeVisible({ timeout: 5000 });
        expect(Number(await receipt.inputValue())).toBeGreaterThan(19);
        await expect(page.getByText(/对方余额不足，尚差/)).toBeVisible();
        const confirmSale = page.getByRole('button', { name: '确认落账成交' });
        await expect(confirmSale).toBeDisabled();
        await receipt.fill('19');
        await confirmSale.click();
        await expect(page.getByText(/已成交并落账.*兽药.*19.*好感 \+1/)).toBeVisible();
        await expect(page.getByText(/对方当前可付 0 /)).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('trade-day.png') });
        await page.getByRole('dialog', { name: '情境交易' }).getByRole('button', { name: '关闭', exact: true }).click();
        const saleNotice = page.getByText('情境交易已暂存', { exact: true });
        if (await saleNotice.isVisible()) await saleNotice.locator('../..').getByRole('button', { name: '关闭' }).click();

        await clashBtn.click();
        await expect(page.getByText('直观战术交锋 · 明牌对阵', { exact: false }).first()).toBeVisible({ timeout: 5000 });
        await expect(page.getByLabel('己方阵容')).toContainText('顾霜晚');
        await expect(page.getByLabel('敌方阵容')).toHaveText(/暂无/);
        await expect(page.getByRole('button', { name: /强攻压招/ })).toHaveCount(0);
        await page.getByRole('button', { name: '切磋试探', exact: true }).click();
        await expect(page.getByRole('button', { name: /强攻压招/ })).toHaveCount(0);
        await page.getByRole('combobox', { name: '切磋对象' }).selectOption({ label: '顾霜晚' });
        await expect(page.getByLabel('切磋方阵容')).toContainText('顾霜晚');
        await expect(page.getByText('战前明牌诊断与变强指引：', { exact: false }).first()).toBeVisible({ timeout: 5000 });
        const confirmClashRange = page.getByRole('button', { name: /确认.*在交手距离内/ });
        if (await confirmClashRange.isVisible()) {
            await expect(page.getByRole('button', { name: /强攻压招/ }).first()).toBeDisabled();
            await confirmClashRange.click();
        }
        await page.getByRole('button', { name: /强攻压招/ }).first().click();
        await expect(page.getByText('出招拆解实录', { exact: false }).first()).toBeVisible({ timeout: 5000 });
        await page.getByRole('dialog', { name: '战术交锋' }).getByRole('button', { name: '关闭', exact: true }).click();

        // Toggle Tactical Clash plugin off via Settings and confirm the button disappears
        await clashBtn.click();
        await page.getByRole('button', { name: '插件设置', exact: true }).first().click();
        const clashToggle = page.locator('button[aria-label="切换直观战术交锋插件"]:visible').first();
        await clashToggle.scrollIntoViewIfNeeded();
        await expect(clashToggle).toBeVisible({ timeout: 5000 });
        await clashToggle.click({ force: true });
        await page.getByRole('button', { name: '关闭设置' }).first().click();
        await expect(page.getByRole('button', { name: '战术交锋', exact: true })).toHaveCount(0);

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        await expect(page.locator('button', { hasText: /^战斗$/ })).toHaveCount(0);
        await expect(page.locator('button', { hasText: /^拍卖$/ })).toHaveCount(0);
        const expandMenu = page.getByRole('button', { name: '展开功能栏' });
        if (await expandMenu.isVisible()) await expandMenu.click();
        await page.getByRole('button', { name: '世界', exact: true }).click({ timeout: 8000 });
        await page.getByRole('button', { name: '总纲', exact: true }).click();
        await expect(page.getByText(/九州疆域辽阔/).first()).toBeVisible();
        await expect(page.getByText('云州下城码头', { exact: false })).toHaveCount(0);
        await page.getByRole('button', { name: '揭示天地空间阶梯' }).click();
        await expect(page.getByText('云州下城码头', { exact: false }).first()).toBeVisible();
        await page.getByRole('button', { name: '关闭世界' }).click();
        await page.getByRole('button', { name: '地图', exact: true }).click({ timeout: 8000 });
        await expect(page.locator('[data-people-node="DT-032"]')).toContainText('林秋水');
        await page.screenshot({ path: testInfo.outputPath('room-mobile-day.png'), animations: 'disabled' });

        expect(pageErrors).toEqual([]);
    });
});
