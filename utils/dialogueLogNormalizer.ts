import type { GameLog } from '../types';

import { 是否可信角色发送者, 规范化正文发送者名 } from './dialogueSpeakerGuard';
import { 是否判定日志文本 } from './judgmentFormat';

type NormalizeOptions = {
    knownSpeakers?: string[];
};

const 引号对白正则 = /[“"「『]([\s\S]{1,1200}?)[”"」』]/g;
const 开头引号正则 = /^[“"「『]/;
const 结尾引号正则 = /[”"」』]$/;
const 说话尾迹正则 = /(?:说|说道|道|问|问道|喊|喊道|喝|喝道|答|答道|回|回道|唤|唤道|骂|骂道|笑|笑道|叹|叹道|吩咐|提醒|解释|应|应道|接|接道|开口|继续|补充|又道)\s*[：:]?\s*$/;
const 语气修饰尾迹正则 = /(?:轻声|低声|沉声|冷声|温声|柔声|厉声|朗声|小声|淡淡|缓缓|忽然|忽地|笑着|苦笑着|皱眉|抬眼|侧首|回头|点头|摇头|叹息|压低声音)\s*$/;
const 动作修饰尾迹正则 = /(?:点点头|摇摇头|点点|摇摇|皱了皱眉|皱了皱|皱眉|抬头|低头|回头|转头|转身|侧首|抬眼|垂眼|看着|望着|盯着|瞥向|注视|沉默片刻|轻咳一声|冷笑一声|苦笑一声|笑了笑|叹了口气|压低声音|放低声音)\s*$/;
const 泛称说话人正则 = /^(?:他|她|它|你|我|这人|那人|有人|众人|众弟子|众门人|众侍从|众士卒|众人齐声|众弟子齐声|众门人齐声|众侍从齐声|众士卒齐声|对方|男子|女子|少年|少女|老人|老者|汉子|侍女|侍从|弟子|门人|店小二)$/;
const 非单一说话人正则 = /^(?:旁白|判定|NSFW判定|系统|众人|众弟子|众门人|众侍从|众士卒|众人齐声|众弟子齐声|众门人齐声|众侍从齐声|众士卒齐声|所有人|全场|人群|群声|齐声|同门|弟子们|门人们)$/;
const 语气词说话人正则 = /^(?:轻声|低声|沉声|冷声|温声|柔声|厉声|朗声|小声|淡淡|缓缓|忽然|忽地|笑着|苦笑着)$/;
const 非人名短语说话人正则 = /^(?:随着|伴随|当他|当她|当你|当我|如果|若是|只是|这是|那是|这个|那个|这种|那种|此时|这时|随后|然后|接着|同时|终于|突然|忽然|仍然|已经|开始|继续|所有|全场|一切|空气|雨声|风声|灯光|夜色|晨光|脚步|声音)/;
const 拟声词正则 = /^(?:啊+|呀+|唔+|嗯+|呃+|哼+|哈+|呵+|嘿+|咳+|轰+|砰+|啪+|咚+|铛+|嗡+|哗+|唰+|嗖+|吱+|喀+|咔+|沙+|呼+|呜+|嗷+|嘶+|噗+|扑通+|哗啦+|咔嚓+|轰隆+|咳咳+|哈哈+|呵呵+|嘿嘿+|呜呜+)[。！？!?…~～—-]*$/;
const Judge标签残留正则 = /(?:<|&lt;)\s*\/?\s*judge\s*(?:>|&gt;)/i;
const Judge数值残留正则 = /^判定值\s*[+\-]?\d+(?:\.\d+)?\s*\/\s*难度\s*[+\-]?\d+(?:\.\d+)?/m;
const 完整判定文本特征正则 = /判定值|结果\s*[=:：]|[｜|]/;
const 指节泛白套话正则 = /(?:[左右双两]?(?:手|手指|指尖|手背|拳头)?[^。！？!?；;\n]{0,12})?指节(?:处|间|上)?[^。！？!?；;\n]{0,18}(?:泛|透|发|浮|呈|显|露|沁|泛起|透出|发出)[^。！？!?；;\n]{0,12}(?:白|苍白|灰白|惨白|青白|失血色|没有血色)[^。！？!?；;\n]{0,12}/gu;

const 转义正则文本 = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const 清理说话人 = (value: string): string => {
    let text = (value || '')
        .replace(/[（(][^）)]{1,16}[）)]/g, '')
        .replace(/[【】\[\]「」『』“”"']/g, '')
        .trim();
    const special = 规范化正文发送者名(text);
    if (special === '奖励') return special;

    text = text.split(/[，,、；;。！？!?\s]/).filter(Boolean).pop() || text;
    for (let i = 0; i < 3; i += 1) {
        text = text
            .replace(说话尾迹正则, '')
            .replace(语气修饰尾迹正则, '')
            .replace(动作修饰尾迹正则, '')
            .trim();
    }
    text = text
        .replace(/^(?:那|这)(?=[\u4e00-\u9fff]{2,})/, '')
        .replace(/正$/, '')
        .replace(/[的盯看望瞥注点摇]$/, '')
        .trim();
    if (!text || text.length > 12) return '';
    if (/[：:，,。！？!?；;\n]/.test(text)) return '';
    if (非单一说话人正则.test(text) || 泛称说话人正则.test(text) || 语气词说话人正则.test(text) || 非人名短语说话人正则.test(text)) return '';
    if (!是否可信角色发送者(text, { allowUnknownName: true })) return '';
    return text;
};

const 清理正文套话 = (value: string): string => (
    (value || '')
        .replace(指节泛白套话正则, '手指收紧')
        .replace(/([。！？!?；;])\1+/g, '$1')
        .replace(/([。！？!?；;])([”」』])/g, '$1$2')
        .replace(/([”」』])([。！？!?；;])\2+/g, '$1$2')
);

const 拆分过长旁白段落 = (sender: string, value: string): string => {
    const text = 清理正文套话(value).trim();
    if (sender !== '旁白' || text.length < 220 || /\n\s*\n/.test(text)) return text;
    const units = text.match(/[^。！？!?；;\n]+[。！？!?；;]?|\n+/g) || [text];
    const paragraphs: string[] = [];
    let current = '';
    units.forEach((unit) => {
        const piece = unit.trim();
        if (!piece) return;
        if (current && current.length + piece.length > 150) {
            paragraphs.push(current);
            current = piece;
            return;
        }
        current = current ? `${current}${piece}` : piece;
    });
    if (current) paragraphs.push(current);
    return paragraphs.length > 1 ? paragraphs.join('\n\n') : text;
};

const 取最近句段 = (text: string): string => {
    const source = (text || '').slice(-96);
    const parts = source.split(/[。！？!?；;\n]/);
    return (parts[parts.length - 1] || source).trim();
};

const 推断说话人 = (prefix: string, knownSpeakers: string[]): string => {
    const recent = 取最近句段(prefix);
    const normalizedKnown = knownSpeakers
        .map(item => (item || '').trim())
        .filter(item => item.length > 0)
        .sort((a, b) => b.length - a.length);

    let matchedName = '';
    let matchedIndex = -1;
    for (const speaker of normalizedKnown) {
        const index = recent.lastIndexOf(speaker);
        if (index >= 0 && index >= matchedIndex) {
            matchedName = speaker;
            matchedIndex = index;
        }
    }
    if (matchedName) return matchedName;

    const withoutTailCue = recent.replace(/[^，,。！？!?；;\n]{0,12}(?:说|说道|道|问|问道|喊|喊道|喝|喝道|答|答道|回|回道|唤|唤道|骂|骂道|笑|笑道|叹|叹道|吩咐|提醒|解释|应|应道|接|接道|开口|继续|补充|又道)\s*[：:]?\s*$/, '');
    const possibleActionSegments = withoutTailCue.split(/[，,、\s]/).map(item => item.trim()).filter(Boolean).reverse();
    for (const segment of possibleActionSegments) {
        const actionNameMatch = segment.match(/^([\u4e00-\u9fff]{2,4})(?=正(?:在)?|已|也|还|仍|负手|收剑|抬|回|点|看|盯|望|站|坐|走|停|俯|侧|拱|抱|伸|皱|沉|笑|低|上前|退|转|放|握|按|举|落|扬|垂|敛|挑|拔|收|推|扶|拂|掠|倚|跪|躬|作|朝|向|对|把|将|眼神|声音|语气)/);
        const actionName = 清理说话人(actionNameMatch?.[1] || '');
        if (actionName) return actionName;
    }

    const voiceCueMatch = recent.match(/(?:^|[，,、\s])([\u4e00-\u9fff]{2,4})(?:的)?(?:声音|语气|嗓音|声线|眼神|目光|视线)[^。！？!?；;\n]{0,50}$/);
    const voiceCueSpeaker = 清理说话人(voiceCueMatch?.[1] || '');
    if (voiceCueSpeaker) return voiceCueSpeaker;

    const explicitMatch = recent.match(/([A-Za-z0-9_\u4e00-\u9fff·]{1,14})[^，,。！？!?；;\n]{0,10}(?:说|说道|道|问|问道|喊|喊道|喝|喝道|答|答道|回|回道|唤|唤道|骂|骂道|笑|笑道|叹|叹道|吩咐|提醒|解释|应|应道|接|接道|开口|继续|补充|又道)\s*[：:]?\s*$/);
    const cleaned = 清理说话人(explicitMatch?.[1] || '');
    if (cleaned) return cleaned;

    const namedCueMatch = recent.match(/([\u4e00-\u9fff]{2,4})[^。！？!?；;\n]{0,40}(?:说|说道|道|问|问道|喊|喊道|喝|喝道|答|答道|回|回道|唤|唤道|骂|骂道|笑|笑道|叹|叹道|吩咐|提醒|解释|应|应道|接|接道|开口|继续|补充|又道)\s*[：:]?\s*$/);
    const namedCueSpeaker = 清理说话人(namedCueMatch?.[1] || '');
    if (namedCueSpeaker) return namedCueSpeaker;

    const genericMatch = recent.match(/(?:^|[，,、\s])((?:他|她|你|我|有人|众人|对方|男子|女子|少年|少女|老人|老者|汉子|侍女|侍从|弟子|门人|店小二))[^，,。！？!?；;\n]{0,10}(?:说|说道|道|问|问道|喊|喊道|喝|喝道|答|答道|回|回道|唤|唤道|骂|骂道|笑|笑道|叹|叹道|吩咐|提醒|解释|应|应道|接|接道|开口|继续|补充|又道)\s*[：:]?\s*$/);
    return 清理说话人(genericMatch?.[1] || '');
};

const 推断后置信息说话人 = (suffix: string, knownSpeakers: string[]): string => {
    const source = (suffix || '').slice(0, 120);
    const normalizedKnown = knownSpeakers
        .map(item => (item || '').trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
    for (const speaker of normalizedKnown) {
        const escaped = 转义正则文本(speaker);
        if (new RegExp(`^\\s*${escaped}[\\s\\S]{0,60}(?:说|说道|道|问|问道|喊|喊道|喝|喝道|答|答道|回|回道|唤|唤道|骂|骂道|笑|笑道|叹|叹道|吩咐|提醒|解释|应|应道|接|接道|开口|继续|补充|又道|盯着|看着|望着|瞥向|注视|眼神|目光|视线|声音|语气)`).test(source)) {
            return speaker;
        }
    }
    const match = source.match(/^\s*([\u4e00-\u9fff]{2,4})[^。！？!?；;\n]{0,60}(?:说|说道|道|问|问道|喊|喊道|喝|喝道|答|答道|回|回道|唤|唤道|骂|骂道|笑|笑道|叹|叹道|吩咐|提醒|解释|应|应道|接|接道|开口|继续|补充|又道|盯着|看着|望着|瞥向|注视|眼神|目光|视线|声音|语气)/);
    return 清理说话人(match?.[1] || '');
};

const 是否像说话引导 = (prefix: string, speaker: string): boolean => {
    const recent = 取最近句段(prefix);
    if (说话尾迹正则.test(recent)) return true;
    if (!speaker) return false;
    const escaped = 转义正则文本(speaker);
    if (new RegExp(`${escaped}[\\s\\S]{0,60}(?:声音|语气|嗓音|声线|眼神|目光|视线|盯着|看着|望着|瞥向|注视|冷厉|压低|沉下|放缓)`).test(recent)) return true;
    return new RegExp(`${escaped}[\\s\\S]{0,18}(?:说|说道|道|问|问道|喊|喊道|喝|喝道|答|答道|回|回道|唤|唤道|骂|骂道|笑|笑道|叹|叹道|吩咐|提醒|解释|应|应道|接|接道|开口|继续|补充|又道)\\s*[：:]?\\s*$`).test(recent);
};

const 移除尾部说话引导 = (text: string, speaker: string): string => {
    const source = text || '';
    const punctuationIndex = Math.max(
        source.lastIndexOf('，'),
        source.lastIndexOf(','),
        source.lastIndexOf('、'),
        source.lastIndexOf('\n')
    );
    const tail = source.slice(punctuationIndex + 1).trim();
    if (说话尾迹正则.test(tail)) {
        return (punctuationIndex >= 0 ? source.slice(0, punctuationIndex) : '').trim();
    }
    return source
        .replace(/(?:说|说道|道|问|问道|喊|喊道|喝|喝道|答|答道|回|回道|唤|唤道|骂|骂道|笑|笑道|叹|叹道|吩咐|提醒|解释|应|应道|接|接道|开口|继续|补充|又道)\s*[：:]?\s*$/, '')
        .trim();
};

const 合并相邻同发送者 = (logs: GameLog[]): GameLog[] => {
    const merged: GameLog[] = [];
    logs.forEach((item) => {
        const sender = (item?.sender || '旁白').trim() || '旁白';
        const text = 拆分过长旁白段落(sender, item?.text || '');
        if (!text) return;
        const previous = merged[merged.length - 1];
        if (previous && previous.sender === sender) {
            previous.text = `${previous.text}\n${text}`.trim();
            return;
        }
        merged.push({ sender, text });
    });
    return merged;
};

const 查找首段闭合引号位置 = (text: string): number => {
    const source = (text || '').trim();
    if (!source) return -1;
    const open = source[0];
    const close = open === '“' ? '”'
        : open === '「' ? '」'
            : open === '『' ? '』'
                : open === '"' ? '"'
                    : '';
    if (!close) return -1;
    return source.indexOf(close, 1);
};

const 是完整引号对白 = (text: string): boolean => {
    const source = (text || '').trim();
    return Boolean(source && 开头引号正则.test(source) && 结尾引号正则.test(source) && 查找首段闭合引号位置(source) === source.length - 1);
};

const 剥离外层引号 = (text: string): string => {
    const source = (text || '').trim();
    if (!是完整引号对白(source)) return source;
    return source.slice(1, -1).trim();
};

const 是否无效角色对白 = (sender: string, text: string): boolean => {
    const normalizedSender = 清理说话人(sender);
    if (!normalizedSender || 非单一说话人正则.test(normalizedSender) || 泛称说话人正则.test(normalizedSender)) return true;
    const speech = 剥离外层引号(text);
    if (!speech || 拟声词正则.test(speech)) return true;
    if (/^(?:众人|众弟子|众门人|众侍从|众士卒|所有人|全场|人群).{0,8}(?:齐声|一起|同时)/.test(speech)) return true;
    return false;
};

const 是否有效角色说话人 = (sender: string): boolean => {
    const normalizedSender = 清理说话人(sender);
    return Boolean(normalizedSender && !非单一说话人正则.test(normalizedSender) && !泛称说话人正则.test(normalizedSender));
};

const 含有引号对白 = (text: string): boolean => {
    const source = (text || '').trim();
    if (!source) return false;
    return /[“"「『][^”"」』\n]{1,500}[”"」』]/.test(source);
};

const 是否Judge残留文本 = (text: string): boolean => {
    const source = (text || '').trim();
    if (!source) return false;
    return Judge标签残留正则.test(source) || Judge数值残留正则.test(source);
};

const 是否像引号对白内容 = (text: string): boolean => {
    const source = (text || '').trim();
    if (!source || source.length < 2 || source.length > 1200) return false;
    if (是否Judge残留文本(source) || 拟声词正则.test(source)) return false;
    if (/^[\u4e00-\u9fffA-Za-z0-9·\s_-]{1,16}$/.test(source) && !/[我你咱？！!?]/.test(source)) return false;
    return /[我你咱]|[？?！!]|(?:吧|吗|呢|啊|呀|嘛|呗|啦|喂|哼|嗯|唔|哦|行|好|滚|停|走|快|慢着|且慢|别|不要|可以|应该|必须|如果|这是|这个|那个|第一|第二|第三)/.test(source);
};

const 人物动作动词正则 = /^(?:将|把|给|向|对|朝|走|站|坐|停|回|转|看|望|抬|低|点|摇|皱|叹|笑|冷笑|苦笑|轻笑|沉|伸|握|按|收|拔|举|放|推|扶|拂|敛|挑|倒|取|递|开口|提醒|解释|说道|说|道|问|答)/;
const 无标签言语引导正则 = /^(.{1,32}?)(?:说|说道|道|问|问道|喊|喊道|喝|喝道|答|答道|回|回道|唤|唤道|骂|骂道|笑|笑道|叹|叹道|吩咐|提醒|解释|应|应道|接|接道|开口|继续|补充|又道)\s*[：:，,]\s*(.{2,500})$/;
const 方括号说话人行正则 = /^【\s*([A-Za-z0-9_\u4e00-\u9fff·]{1,16})\s*】\s*(.{1,800})$/;
const 裸冒号说话人行正则 = /^([A-Za-z][A-Za-z0-9_· -]{1,23}|[\u4e00-\u9fff]{2,4})(?:[（(][^）)\n]{1,16}[）)])?\s*[:：]\s*(.{1,800})$/u;
const 裸冒号非对白标签集合 = new Set([
    '地点', '时间', '天气', '任务', '命令', '短期记忆', '中期记忆', '长期记忆', '即时记忆',
    '剧情规划', '变量规划', '正文', '行动选项', '动态世界', '触发对象', '对象', '判定值',
    '难度', '胜方', '败方', '差值', '伤害值', '消耗', '剩余', '后果', '发现度',
    '基础', '环境', '状态', '幸运', '装备', '结果', '奖励', '获得', '失去'
]);
const XML对白标签名黑名单 = new Set([
    '正文', 'thinking', 'think', 'judge', '变量规划', '剧情规划', '行动选项', '动态世界',
    't_input', 't_var_plan', 't_plan', 't_state', 't_branch', 't_precheck', 't_logcheck',
    't_var', 't_npc', 't_cmd', 't_audit', 't_fix', 't_mem', 't_opts'
]);
const XML对白标签正则 = /(?:<|&lt;)\s*([A-Za-z0-9_\u4e00-\u9fff·]{1,16})\s*(?:>|&gt;)([\s\S]{1,1800}?)(?:<|&lt;)\s*\/\s*\1\s*(?:>|&gt;)/g;
const 可疑方括号无引号旁白标签正则 = /(?:的|了|着|过|他|她|它|你|我|这|那|带来|摇|低头|抬头|转身|眼力|细雨|雨声|风声|灯光|夜色|青石|空气)/;
const 口语起始正则 = /^(?:我|我们|咱|咱们|你|你们|这事|那就|既然|今天|明天|昨天|前天|刚才|之前|现在|眼下|先|别|不要|必须|可以|应该|不是|恐怕|看来|听我|放心|等等|走|快|慢着|且慢|好|嗯|不行|没错|自然|当然|只要)/;
const 叙事动作特征正则 = /(?:走到|来到|回到|站在|坐在|望向|看向|拿起|放下|推开|打开|穿过|掠过|落在|映在|吹过|响起|传来|升起|落下|归鞘|倒了|喝了|吃了|伸手|抬手|皱眉|点头|摇头|叹息|沉默|停下|转身)/;
const 口语证据正则 = /[我你咱]|[？?！!]|(?:吧|吗|呢|啊|呀|嘛|呗|啦|喂|哼|嗯|唔|哦|行|好|滚|停|走|快|慢着|且慢)[。！？!?…~～]*$/;

const 提取动作行说话人 = (line: string): string => {
    const text = (line || '').trim();
    for (let length = 4; length >= 2; length -= 1) {
        const name = text.slice(0, length);
        const rest = text.slice(length);
        if (!/^[\u4e00-\u9fff]{2,4}$/.test(name)) continue;
        if (/[冷苦轻]$/.test(name) && /^笑/.test(rest)) continue;
        if (人物动作动词正则.test(rest)) {
            const cleaned = 清理说话人(name);
            if (cleaned) return cleaned;
        }
    }
    return '';
};

const 是否像无标签口语 = (line: string): boolean => {
    const text = (line || '').trim();
    if (text.length < 6 || text.length > 220) return false;
    if (含有引号对白(text) || 是否Judge残留文本(text)) return false;
    if (拟声词正则.test(text)) return false;
    if (!口语证据正则.test(text)) return false;
    if (叙事动作特征正则.test(text) && !/[我你咱]/.test(text)) return false;
    return 口语起始正则.test(text) || /[？?！!]$/.test(text) || /(?:吧|吗|呢|啊|罢|了)$/.test(text);
};

const 取引号闭合符 = (char: string): string => {
    if (char === '“') return '”';
    if (char === '「') return '」';
    if (char === '『') return '』';
    if (char === '"') return '"';
    return '';
};

const 是否英文数字 = (char: string): boolean => /[A-Za-z0-9]/.test(char);

const 上一个非空字符 = (text: string): string => {
    for (let index = text.length - 1; index >= 0; index -= 1) {
        const char = text[index];
        if (!/\s/.test(char)) return char;
    }
    return '';
};

const 下一个非空字符 = (text: string, startIndex: number): string => {
    for (let index = startIndex; index < text.length; index += 1) {
        const char = text[index];
        if (!/\s/.test(char)) return char;
    }
    return '';
};

const 引号未闭合 = (text: string): boolean => {
    const stack: string[] = [];
    const source = text || '';
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        const expectedClose = stack[stack.length - 1];
        if (expectedClose && char === expectedClose) {
            stack.pop();
            continue;
        }
        if (char === '"' && source[index - 1] === '\\') continue;
        const close = 取引号闭合符(char);
        if (close) {
            if (char === '"' && expectedClose === '"') stack.pop();
            else stack.push(close);
        }
    }
    return stack.length > 0;
};

const 压平引号内换行 = (text: string): string => {
    const source = (text || '').replace(/\r\n/g, '\n');
    const stack: string[] = [];
    let output = '';
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        const expectedClose = stack[stack.length - 1];
        if (expectedClose && char === expectedClose) {
            stack.pop();
            output += char;
            continue;
        }
        if (char === '"' && source[index - 1] === '\\') {
            output += char;
            continue;
        }
        const close = 取引号闭合符(char);
        if (close) {
            if (char === '"' && expectedClose === '"') stack.pop();
            else stack.push(close);
            output += char;
            continue;
        }
        if (stack.length > 0 && char === '\n') {
            const previous = 上一个非空字符(output);
            const next = 下一个非空字符(source, index + 1);
            if (是否英文数字(previous) && 是否英文数字(next) && !/\s$/.test(output)) output += ' ';
            continue;
        }
        output += char;
    }
    return output;
};

const 保护引号换行日志 = (logs: GameLog[] | undefined): GameLog[] => {
    const sourceLogs = Array.isArray(logs) ? logs : [];
    const result: GameLog[] = [];
    let pending: GameLog | null = null;

    sourceLogs.forEach((item) => {
        const rawSender = (item?.sender || '旁白').trim() || '旁白';
        const rawText = typeof item?.text === 'string' ? item.text : String(item?.text ?? '');
        const text = 压平引号内换行(rawText);
        if (!text.trim()) return;

        if (pending) {
            const joiner = pending.text && text ? '' : '';
            pending.text = 压平引号内换行(`${pending.text}${joiner}${text}`);
            if (!引号未闭合(pending.text)) {
                result.push(pending);
                pending = null;
            }
            return;
        }

        if (引号未闭合(text)) {
            pending = { sender: rawSender, text };
            return;
        }

        result.push({ sender: rawSender, text });
    });

    if (pending) result.push(pending);
    return result;
};

const 拆分旁白夹杂无标签对白 = (log: GameLog): GameLog[] => {
    const source = typeof log?.text === 'string' ? log.text.replace(/\r\n/g, '\n') : '';
    if (!source || !source.includes('\n')) return [log];

    const result: GameLog[] = [];
    for (const rawLine of source.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;

        const bracketSpeaker = line.match(方括号说话人行正则);
        const bracketSpeakerName = (bracketSpeaker?.[1] || '').trim();
        if (bracketSpeaker && bracketSpeakerName) {
            const rawSpeech = (bracketSpeaker[2] || '').trim();
            const hasQuotedSpeech = 开头引号正则.test(rawSpeech);
            const speech = 剥离外层引号(rawSpeech);
            if (
                speech
                && bracketSpeakerName.length <= (hasQuotedSpeech ? 12 : 4)
                && (hasQuotedSpeech || !可疑方括号无引号旁白标签正则.test(bracketSpeakerName))
                && !非单一说话人正则.test(bracketSpeakerName)
                && !泛称说话人正则.test(bracketSpeakerName)
                && !拟声词正则.test(speech)
            ) {
                result.push({ sender: bracketSpeakerName, text: speech });
                continue;
            }
        }
        // Only explicit bracketed speakers are treated as character lines.
        // All other forms (colon labels, implied/guided lines, or unlabeled speech)
        // are considered narration.
        result.push({ sender: '旁白', text: line });
    }

    return result.length > 1 ? 合并相邻同发送者(result) : [log];
};

const 解码轻量HTML实体 = (value: string): string => (
    (value || '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
);

const 是否可渲染XML对白标签 = (rawName: string, speech: string): string => {
    const name = (rawName || '').trim();
    if (!name || XML对白标签名黑名单.has(name) || 裸冒号非对白标签集合.has(name)) return '';
    const speaker = 清理说话人(name);
    if (!speaker || 非单一说话人正则.test(speaker) || 泛称说话人正则.test(speaker)) return '';
    const text = 解码轻量HTML实体(speech).trim();
    if (!text || 是否Judge残留文本(text) || 拟声词正则.test(text)) return '';
    return speaker;
};

const 拆分XML标签对白 = (log: GameLog): GameLog[] => {
    const source = typeof log?.text === 'string' ? log.text : '';
    if (!source || !/(?:<|&lt;)\s*[A-Za-z0-9_\u4e00-\u9fff·]{1,16}\s*(?:>|&gt;)/.test(source)) return [log];

    const parts: GameLog[] = [];
    let cursor = 0;
    let matched = false;
    let match: RegExpExecArray | null = null;
    XML对白标签正则.lastIndex = 0;

    while ((match = XML对白标签正则.exec(source)) !== null) {
        const rawName = match[1] || '';
        const rawSpeech = match[2] || '';
        const speaker = 是否可渲染XML对白标签(rawName, rawSpeech);
        if (!speaker) continue;

        const before = source.slice(cursor, match.index).trim();
        if (before) parts.push({ sender: '旁白', text: 解码轻量HTML实体(before) });
        parts.push({ sender: speaker, text: 解码轻量HTML实体(rawSpeech).trim() });
        cursor = XML对白标签正则.lastIndex;
        matched = true;
    }

    if (!matched) return [log];
    const after = source.slice(cursor).trim();
    if (after) parts.push({ sender: '旁白', text: 解码轻量HTML实体(after) });
    return 合并相邻同发送者(parts);
};

export const 规范化可渲染对白日志 = (logs: GameLog[] | undefined): GameLog[] => {
    const normalized = 保护引号换行日志(logs).flatMap((item) => {
        const rawSender = (item?.sender || '旁白').trim() || '旁白';
        const rawText = typeof item?.text === 'string' ? item.text.trim() : String(item?.text ?? '').trim();
        const text = 拆分过长旁白段落(rawSender === '旁白' ? '旁白' : 清理说话人(rawSender) || '旁白', rawText);
        if (是否Judge残留文本(text)) return [];
        if (是否判定日志文本(rawSender) || 是否判定日志文本(text)) {
            if (是否判定日志文本(rawSender) && !完整判定文本特征正则.test(text)) return [];
            return [{ sender: rawSender, text }];
        }
        const sender = 清理说话人(rawSender) || '旁白';
        if (!text) return [];
        if (sender === '旁白') {
            return 拆分XML标签对白({ sender, text })
                .flatMap((part) => part.sender === '旁白' ? 拆分旁白夹杂对白(part, []) : [part])
                .flatMap((part) => part.sender === '旁白' ? 拆分旁白夹杂无标签对白(part) : [part]);
        }
        if (sender === '奖励') return [{ sender, text }];
        if (/^(【)?(?:判定|NSFW判定|先机|瞄准|接战|对撞|对抗|防御|化解|伤害|态势|反击|反馈|消耗|洞察|衰退)(】)?$/.test(sender)) {
            return [{ sender, text }];
        }
        if (是完整引号对白(text)) {
            return 是否无效角色对白(sender, text) ? [{ sender: '旁白', text }] : [{ sender, text }];
        }

        const closingIndex = 开头引号正则.test(text) ? 查找首段闭合引号位置(text) : -1;
        if (closingIndex > 0) {
            const quoted = text.slice(0, closingIndex + 1).trim();
            const rest = text.slice(closingIndex + 1).trim();
            const parts: GameLog[] = [];
            if (quoted && !是否无效角色对白(sender, quoted)) parts.push({ sender, text: quoted });
            else if (quoted) parts.push({ sender: '旁白', text: quoted });
            if (rest) parts.push({ sender: '旁白', text: rest });
            return parts;
        }

        if (是否有效角色说话人(sender) && 含有引号对白(text)) {
            return [{ sender, text }];
        }

        if (是否有效角色说话人(sender)) {
            return [{ sender, text }];
        }

        return [{ sender: '旁白', text }];
    });
    return 合并相邻同发送者(normalized);
};

const 拆分旁白夹杂对白 = (log: GameLog, knownSpeakers: string[]): GameLog[] => {
    const source = typeof log?.text === 'string' ? log.text : '';
    if (!source || !/[“"「『]/.test(source)) return [log];

    const parts: GameLog[] = [];
    let cursor = 0;
    let lastSpeaker = '';
    let match: RegExpExecArray | null = null;
    引号对白正则.lastIndex = 0;

    while ((match = 引号对白正则.exec(source)) !== null) {
        const quoteStart = match.index;
        const quoteEnd = 引号对白正则.lastIndex;
        const speech = (match[1] || '').trim();
        const prefix = source.slice(0, quoteStart);
        // Only accept explicit bracketed speaker immediately before the quote.
        const prefixSegment = source.slice(Math.max(0, quoteStart - 40), quoteStart);
        const bracketMatch = prefixSegment.match(/【\s*([^】【]{1,16})\s*】\s*$/);
        if (!speech || !bracketMatch) continue;
        const speaker = 清理说话人(bracketMatch[1] || '');
        if (!speaker) continue;
        const bracketStart = quoteStart - prefixSegment.length + (bracketMatch.index ?? 0);
        const before = 移除尾部说话引导(source.slice(cursor, bracketStart), speaker);
        if (before.trim()) parts.push({ sender: '旁白', text: before.trim() });
        parts.push({ sender: speaker, text: speech });
        lastSpeaker = speaker;
        cursor = quoteEnd;
    }

    if (parts.length === 0) return [log];
    const after = source.slice(cursor).trim();
    if (after) parts.push({ sender: '旁白', text: after });
    return 合并相邻同发送者(parts);
};

export const 规范化对白日志 = (
    logs: GameLog[] | undefined,
    options?: NormalizeOptions
): GameLog[] => {
    const knownSpeakers = Array.from(new Set((options?.knownSpeakers || []).map(item => (item || '').trim()).filter(Boolean)));
    const normalized = 保护引号换行日志(logs)
        .flatMap((item) => {
            const rawSender = (item?.sender || '旁白').trim() || '旁白';
            const text = 拆分过长旁白段落(rawSender, typeof item?.text === 'string' ? item.text : String(item?.text ?? ''));
            if (是否判定日志文本(rawSender) || 是否判定日志文本(text)) return [{ sender: rawSender, text }];
            if (rawSender === '奖励') return [{ sender: rawSender, text }];
            const sender = rawSender === '旁白' ? '旁白' : (清理说话人(rawSender) || '旁白');
            const log = { sender, text };
            if (sender !== '旁白') return [log];
            return 拆分旁白夹杂对白(log, knownSpeakers)
                .flatMap((part) => part.sender === '旁白' ? 拆分旁白夹杂无标签对白(part) : [part]);
        });
    return 合并相邻同发送者(normalized);
};
