import { 是否判定日志文本 } from './judgmentFormat';
import { 姓名含已知中文姓氏 } from './chineseName';

const 转义正则文本 = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const 泛称或非角色标签正则 = /^(?:旁白|奖励|系统|玩家|我|你|他|她|它|我们|你们|他们|她们|有人|无人|众人|众弟子|众门人|众侍从|众士卒|所有人|全场|人群|群声|齐声|对方|那人|这人|此人|男子|女子|少年|少女|老人|老者|汉子|侍女|侍从|弟子|门人|店小二|声音|语气|目光|视线|眼神|空气|雨声|风声|脚步声|灯光|夜色|晨光|地点|时间|天气|任务|命令|短期记忆|中期记忆|长期记忆|即时记忆|剧情规划|变量规划|正文|行动选项|动态世界|触发对象|对象|判定值|难度|胜方|败方|差值|伤害值|消耗|剩余|后果|发现度|基础|环境|状态|幸运|装备|结果|获得|失去)$/;
const 明显叙事短语起始正则 = /^(?:随着|伴随|当他|当她|当你|当我|如果|若是|只是|这是|那是|这个|那个|这种|那种|此时|这时|随后|然后|接着|同时|终于|突然|忽然|仍然|已经|开始|继续|至于|关于|听起来|看起来|说起来|带来|带来的|传来|传来的|映入|落在|压在|来自|所有|全场|一切|空气|雨声|风声|灯光|夜色|晨光|脚步|声音|带来的)/;
const 叙事动作词正则 = /(?:摇头|点头|皱眉|叹息|沉默|冷笑|苦笑|轻笑|发笑|开口|说道|说着|问道|答道|喝道|喊道|提醒|解释|望向|看向|盯着|看着|望着|瞥向|注视|抬头|低头|回头|转身|上前|退后|伸手|抬手|握住|按住|放下|拿起|推开|打开|走到|来到|回到|站在|坐在|停下|落在|映在|传来|带来|听起来|看起来)/;
const 结构或句子符号正则 = /[，,。！？!?；;：:\n\r\t<>]|[“”"「」『』]/;
const 明显正文片段正则 = /(?:的|了|着|地|得|将|把|被|让|向|对|朝|从|在|与|和|及|或|于|至于|已经|正在|仍然|没有|不是|可以|应该)/;
const 身体部位或物件标签正则 = /^(?:双手|两手|左手|右手|手掌|掌心|掌背|手背|手指|指尖|指节|手腕|拳头|双拳|左拳|右拳|双臂|手臂|胳膊|肩膀|双肩|胸口|心口|腹部|腰间|腰身|后背|脊背|背脊|双腿|左腿|右腿|膝盖|脚尖|脚踝|双脚|左脚|右脚|眼睛|双眼|左眼|右眼|眉眼|眼眸|眸子|瞳孔|嘴角|唇角|嘴唇|喉咙|嗓子|发丝|衣袖|袖口|衣摆|裙摆|长剑|短刀|剑光|刀光|灵气|气息|香气|茶盏|烛火)$/;
const 额外常见姓氏 = new Set(['楚']);
const 常见复姓列表 = [
    '欧阳', '太史', '端木', '上官', '司马', '东方', '独孤', '南宫', '闻人',
    '夏侯', '诸葛', '尉迟', '公孙', '慕容', '长孙', '宇文', '司徒', '司空',
    '轩辕', '令狐'
];
const 常见日式二字姓氏列表 = [
    '雾隐', '雾隱', '伊贺', '伊賀', '甲贺', '甲賀', '柳生', '服部', '猿飞', '猿飛',
    '佐藤', '铃木', '鈴木', '高桥', '高橋', '田中', '伊藤', '渡边', '渡邊', '渡辺',
    '山本', '中村', '小林', '加藤', '吉田', '山田', '井上', '木村', '清水', '山崎',
    '森田', '池田', '桥本', '橋本', '石川', '前田', '藤原', '松本', '三浦', '中岛',
    '中島', '冈田', '岡田', '黑泽', '黒澤', '黑澤', '白石', '星野', '神谷', '风见',
    '風見', '绫波', '綾波', '御坂', '两仪', '兩儀', '远坂', '遠坂', '间桐', '間桐'
];
const 四字非复姓名词正则 = /(?:灵气|剑光|刀光|晨雾|夜色|灯光|雨声|风声|脚步|眼力|感觉|气息|玄铁|精石|矿材|屋内|门外|窗外|林间|山间|水面|火光|人群|全场|众人)/;
const 角色称谓核心词正则 = /(?:首领|头目|随从|护卫|侍卫|管事|掌柜|长老|执事|供奉|客卿|堂主|舵主|寨主|帮主|门主|宗主|峰主|坛主|香主|队长|统领|弟子|师兄|师姐|师弟|师妹|修士|散修|剑修|刀修|魔修|妖修|刀客|剑客|镖师|捕快|侍女|丫鬟)$/u;
const 角色称谓限定词正则 = /^(?:[一二三四五六七八九十老小大小高矮胖瘦黑白青灰红蓝紫黄绿金银铁铜玉木火水土风雷冰血毒邪魔妖鬼玄灵云山林河湖海江荒野外内前后左右东西南北上中下][\u4e00-\u9fa5]*|[\u4e00-\u9fa5]*(?:宗|门|派|帮|寨|堂|峰|谷|楼|阁|府|寺|观|城|镇|村|族|家|军|卫|院|坊|市|铺|营|队|宫|岛|山|岭|林|江|湖|海|河|原|荒|野|散修|魔修|妖修|剑修|刀修))/u;
const 是否像临场角色称谓 = (value: string): boolean => (
    /^[\u4e00-\u9fa5]{3,8}$/u.test(value)
    && 角色称谓核心词正则.test(value)
    && 角色称谓限定词正则.test(value)
);
const 是否像中文姓名 = (value: string): boolean => (
    /^[\u4e00-\u9fa5]{2,4}$/u.test(value)
    && (value.length < 4
        || 常见复姓列表.some(surname => value.startsWith(surname))
        || 常见日式二字姓氏列表.some(surname => value.startsWith(surname))
        || 额外常见姓氏.has(value[0]))
    && !四字非复姓名词正则.test(value)
    && (姓名含已知中文姓氏(value) || 额外常见姓氏.has(value[0]))
);

const 是否像日式四字姓名 = (value: string): boolean => (
    /^[\u4e00-\u9fa5]{4}$/u.test(value)
    && 常见日式二字姓氏列表.some(surname => value.startsWith(surname))
    && !四字非复姓名词正则.test(value)
);

const 是否可接受未知中文角色名 = (value: string): boolean => {
    if (!/^[\u4e00-\u9fa5]{2,6}$/u.test(value)) return false;
    if (四字非复姓名词正则.test(value)) return false;
    if (是否像临场角色称谓(value)) return true;
    if (是否像中文姓名(value)) return true;
    if (是否像日式四字姓名(value)) return true;
    if (value.length >= 2 && value.length <= 3) return true;
    return 姓名含已知中文姓氏(value);
};

export const 规范化正文发送者名 = (senderRaw: string): string => {
    const sender = (senderRaw || '')
        .replace(/[【】\[\]「」『』“”"']/g, '')
        .replace(/\s+/g, '')
        .trim();
    if (!sender) return '旁白';
    if (sender === '判定') return '【判定】';
    if (sender === 'NSFW判定') return '【NSFW判定】';
    return sender;
};

export const 是否特殊正文发送者 = (senderRaw: string): boolean => {
    const sender = 规范化正文发送者名(senderRaw);
    return sender === '旁白'
        || sender === '奖励'
        || sender === '【判定】'
        || sender === '【NSFW判定】'
        || 是否判定日志文本(senderRaw)
        || 是否判定日志文本(sender);
};

export const 是否疑似叙事短语标签 = (senderRaw: string): boolean => {
    const sender = 规范化正文发送者名(senderRaw);
    if (!sender || sender === '旁白') return false;
    if (结构或句子符号正则.test(sender)) return true;
    if (sender.length > 6) return true;
    if (泛称或非角色标签正则.test(sender)) return true;
    if (身体部位或物件标签正则.test(sender)) return true;
    if (明显叙事短语起始正则.test(sender)) return true;
    if (叙事动作词正则.test(sender)) return true;
    if (sender.length >= 3 && 明显正文片段正则.test(sender) && !是否像中文姓名(sender)) return true;
    return false;
};

export const 是否可信角色发送者 = (
    senderRaw: string,
    options?: { knownSpeakers?: string[]; allowUnknownName?: boolean; declaredNames?: Set<string> }
): boolean => {
    const sender = 规范化正文发送者名(senderRaw);
    if (!sender || 是否特殊正文发送者(sender)) return false;

    if (options?.declaredNames?.has(sender)) return true;

    if (是否疑似叙事短语标签(sender)) return false;

    const knownSpeakers = (options?.knownSpeakers || [])
        .map(item => 规范化正文发送者名(item))
        .filter(Boolean);
    if (knownSpeakers.some(item => item === sender)) return true;

    if (options?.declaredNames?.has(sender)) return true;

    if (/^[\u4e00-\u9fa5]{2,6}$/u.test(sender)) {
        return options?.allowUnknownName !== false && 是否可接受未知中文角色名(sender);
    }

    if (/^[A-Za-z][A-Za-z0-9_· -]{1,23}$/.test(sender)) {
        return options?.allowUnknownName !== false;
    }

    return false;
};

export const 是否可信正文标签发送者 = (
    senderRaw: string,
    options?: { knownSpeakers?: string[]; allowUnknownName?: boolean; declaredNames?: Set<string> }
): boolean => {
    const sender = 规范化正文发送者名(senderRaw);
    return 是否特殊正文发送者(sender) || 是否可信角色发送者(sender, options);
};

export const 构建已知说话人正则 = (knownSpeakers: string[]): RegExp | null => {
    const names = knownSpeakers
        .map(item => 规范化正文发送者名(item))
        .filter(item => item && 是否可信角色发送者(item, { allowUnknownName: true }))
        .sort((a, b) => b.length - a.length)
        .map(转义正则文本);
    return names.length > 0 ? new RegExp(`^(?:${names.join('|')})$`) : null;
};
