import type { GameResponse, TavernCommand, 世界数据结构, 环境信息结构, 接口设置结构, 世界书结构, 记忆系统结构 } from '../../types';
import type { 当前可用接口结构 } from '../../utils/apiConfig';
import { 获取地图生成接口配置, 获取地图自动更新接口配置, 接口配置是否可用 } from '../../utils/apiConfig';
import { 获取内置世界书槽位内容 } from '../../utils/worldbook';
import { 地图重生成系统提示词 } from '../../prompts/runtime/mapRegenerate';
import { 地图重生成COT提示词 } from '../../prompts/runtime/mapRegenerateCot';
import { 地图层级命名契约, 地图层级命名自检 } from '../../prompts/runtime/mapLayerNaming';
import { readRoomExits } from '../../utils/roomConnections';
import { getRoomSlots } from '../../utils/roomFloorplan';
import { 查找地图分支缺口 } from '../../utils/mapBranchCoverage';
import { 地点路径匹配分支 } from '../../utils/locationTree';
import { applyStateCommand } from '../../utils/stateHelpers';
import { 请求模型文本, 规范化文本补全消息链 } from '../../services/ai/chatCompletionClient';
import { recordDiagnosticLog, type DiagnosticLogLevel } from '../../services/diagnosticLog';
import { 获取繁体输出指令 } from '../../utils/traditionalChinese';
import { 执行带完整性校验的请求 } from './streamIntegrity';

export type 地图更新模式 = 'memory_regenerate' | 'auto_incremental';

export type 地图更新进度 = {
    phase: 'start' | 'done' | 'error' | 'skipped' | 'cancelled';
    text?: string;
    rawText?: string;
    commandTexts?: string[];
};

export type 地图更新执行结果 = {
    ok: boolean;
    phase: 'done' | 'error' | 'skipped';
    commands: TavernCommand[];
    rawText: string;
    statusText: string;
    newLayers?: any[];
};

type 地图更新请求参数 = {
    mode: 地图更新模式;
    apiSettings: 接口设置结构;
    环境: 环境信息结构;
    世界: 世界数据结构;
    社交?: any[];
    角色?: any;
    gameConfig?: any;
    记忆系统?: 记忆系统结构;
    worldbooks?: 世界书结构[];
    currentResponse?: GameResponse;
    stateBase?: {
        环境?: 环境信息结构;
        世界?: 世界数据结构;
        社交?: any[];
        角色?: any;
    };
    signal?: AbortSignal;
    onDelta?: (delta: string, accumulated: string) => void;
    /** 省次数模式：复用主剧情请求里已经带回的本阶段原始输出。 */
    prefetchedRawText?: string;
};

const 地图层级顺序 = ['寰宇', '大地点', '中地点', '小地点', '区地点', '子地点'] as const;
const 地图层级集合 = new Set<string>(地图层级顺序);
const 整图路径 = /^(?:gameState\.)?世界\.地图层级$/;
const 地图更新请求超时毫秒 = 120_000;

const 取文本 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function 检查开局地图结构(nodes: any[], env?: Partial<环境信息结构>): string {
    const roots = nodes.filter(node => node?.层级 === '寰宇');
    if (roots.length !== 1 || roots[0].父级ID) return '开局种子地图须有且仅有一个无父级的寰宇根节点。';
    if (nodes.some(node => !取文本(node?.ID) || !取文本(node?.名称))) return '开局种子地图包含缺少 ID 或地名的节点。';
    const byId = new Map(nodes.map(node => [node.ID, node]));
    if (byId.size !== nodes.length) return '开局种子地图存在重复的地点 ID。';
    for (const node of nodes) {
        if (node === roots[0]) continue;
        const level = 地图层级顺序.indexOf(node.层级);
        if (level < 1 || byId.get(node.父级ID)?.层级 !== 地图层级顺序[level - 1]) {
            return '开局种子地图中「' + node.名称 + '」缺少对应层级的直接父地点。';
        }
    }
    const anchors = [env?.大地点, env?.中地点, env?.小地点, env?.具体地点].map(取文本)
        .filter(name => name && !/^(未知|不明|待定|无|未指定)(?:地点)?$/u.test(name));
    // 上面的层级检查保证每条父链都在六层内终止，可以直接核对玩家的完整位置。
    if (anchors.length && !nodes.some(node => {
        const names: string[] = [];
        for (let cursor = node; cursor; cursor = byId.get(cursor.父级ID)) names.unshift(cursor.名称);
        return anchors.every(anchor => 地点路径匹配分支(anchor, names));
    })) return '开局种子地图中没有与当前位置一致的完整路径：' + anchors.join(' > ');
    return '';
}

const 创建地图更新诊断ID = (): string => (
    `map_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
);

const 读取接口主机 = (baseUrl?: unknown): string => {
    const text = 取文本(baseUrl);
    if (!text) return '';
    try {
        return new URL(text).host;
    } catch {
        return text.replace(/^https?:\/\//i, '').split('/')[0] || text.slice(0, 80);
    }
};

const 记录地图更新诊断 = (
    level: DiagnosticLogLevel,
    event: string,
    detail: Record<string, unknown> = {}
) => {
    recordDiagnosticLog(level, [`[地图更新] ${event}`, detail]);
};

const 规范化层级 = (value: unknown): string => {
    const text = 取文本(value);
    if (text === '具体地点') return '区地点';
    if (text === '室内' || text === '房间') return '子地点';
    return 地图层级集合.has(text) ? text : '区地点';
};

const 提取响应正文 = (response?: GameResponse): string => (
    (Array.isArray(response?.logs) ? response.logs : [])
        .map((log: any) => `${log?.sender || '旁白'}：${log?.text || ''}`.trim())
        .filter(Boolean)
        .join('\n')
        .trim()
);

const 限长文本 = (value: unknown, maxLength: number): string => {
    const text = 取文本(value);
    if (!text || text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
};

const 构建回忆库地图线索 = (memory?: Partial<记忆系统结构> | null): string => {
    const archives = Array.isArray(memory?.回忆档案) ? memory!.回忆档案 : [];
    const archiveText = archives
        .slice(-120)
        .map((item: any, index: number) => {
            const round = Number(item?.回合) || index + 1;
            const title = 取文本(item?.名称) || `回忆${round}`;
            const time = 取文本(item?.记录时间) || 取文本(item?.时间戳);
            const summary = 限长文本(item?.概括, 600);
            const body = 限长文本(item?.原文, 1800);
            return [
                `【${title}｜回合 ${round}${time ? `｜${time}` : ''}】`,
                summary ? `概括：${summary}` : '',
                body ? `原文：${body}` : ''
            ].filter(Boolean).join('\n');
        })
        .filter(Boolean)
        .join('\n\n');
    const longText = (Array.isArray(memory?.长期记忆) ? memory!.长期记忆 : [])
        .map((item) => 限长文本(item, 900))
        .filter(Boolean)
        .join('\n');
    const midText = (Array.isArray(memory?.中期记忆) ? memory!.中期记忆 : [])
        .slice(-80)
        .map((item) => 限长文本(item, 700))
        .filter(Boolean)
        .join('\n');
    const shortText = (Array.isArray(memory?.短期记忆) ? memory!.短期记忆 : [])
        .slice(-80)
        .map((item) => 限长文本(item, 500))
        .filter(Boolean)
        .join('\n');
    const immediateText = (Array.isArray(memory?.即时记忆) ? memory!.即时记忆 : [])
        .slice(-40)
        .map((item) => 限长文本(item, 900))
        .filter(Boolean)
        .join('\n');

    return [
        archiveText ? `【回忆档案】\n${archiveText}` : '',
        longText ? `【长期记忆】\n${longText}` : '',
        midText ? `【中期记忆】\n${midText}` : '',
        shortText ? `【短期记忆】\n${shortText}` : '',
        immediateText ? `【近期即时记忆】\n${immediateText}` : ''
    ].filter(Boolean).join('\n\n').trim();
};

export const 构建地图更新用户提示词 = (params: {
    mode: 地图更新模式;
    环境?: any;
    世界?: any;
    社交?: any[];
    角色?: any;
    gameConfig?: any;
    记忆系统?: 记忆系统结构;
    currentResponse?: GameResponse;
}): string => {
    const env = params.环境 || {};
    const world = params.世界 || {};
    const layers = Array.isArray(world?.地图层级) ? world.地图层级 : [];
    const isOpeningEmptyMap = params.mode === 'auto_incremental' && layers.length === 0;
    const gaps = 查找地图分支缺口(layers);
    const branchPrompt = gaps.length
        ? '待补的地域分支：' + gaps.join('、') + '。按世界题材和已知版图补到每处至少两个直接下级。只增补地理，不虚构人物经历。'
        : '';
    const currentLocation = [env?.大地点, env?.中地点, env?.小地点, env?.具体地点].map(取文本).filter(Boolean).join(' > ');
    const existingLayerInfo = layers.length > 0
        ? JSON.stringify(layers.map((layer: any, index: number) => ({
            索引: index,
            ID: 取文本(layer?.ID),
            名称: 取文本(layer?.名称),
            层级: 取文本(layer?.层级),
            父级ID: 取文本(layer?.父级ID),
            描述: 取文本(layer?.描述),
            ...(layer?.连通房间 ? { 连通房间: readRoomExits(layer.连通房间) } : {}),
            控制势力: 取文本(layer?.控制势力),
            势力影响: 取文本(layer?.势力影响),
            势力标签: Array.isArray(layer?.势力标签) ? layer.势力标签 : undefined
        })), null, 2)
        : '[]';
    const forceInfo = Array.isArray(world?.势力列表) && world.势力列表.length > 0
        ? JSON.stringify(world.势力列表.slice(0, 20).map((force: any) => ({
            ID: 取文本(force?.ID || force?.id),
            名称: 取文本(force?.名称),
            类型: 取文本(force?.类型),
            地盘归属: 取文本(force?.地盘归属),
            当前状态: 取文本(force?.当前状态),
            描述: 取文本(force?.描述)
        })).filter((force: any) => force.名称), null, 2)
        : '[]';
    const socialText = (Array.isArray(params.社交) ? params.社交 : [])
        .slice(0, 30)
        .map((npc: any) => {
            const name = 取文本(npc?.姓名) || 取文本(npc?.名称);
            if (!name) return '';
            const locationPath = 取文本(npc?.位置路径) || 取文本(npc?.当前位置);
            const present = npc?.是否在场 === true ? '在场' : '不在场';
            return `- ${name}｜${present}${locationPath ? `｜位置：${locationPath}` : ''}`;
        })
        .filter(Boolean)
        .join('\n') || '暂无';
    const body = 提取响应正文(params.currentResponse) || '暂无';
    const currentName = 取文本(params.角色?.姓名) || '主角';
    const traditionalChinesePrompt = 获取繁体输出指令(params.gameConfig);

    if (params.mode === 'memory_regenerate') {
        const memoryText = 构建回忆库地图线索(params.记忆系统);
        return [
            '你正在执行【旧存档地图适配】任务。旧存档里的旧地图坐标字段已经被清理，请只根据回忆库和当前状态重建新版六层地图树。',
            '',
            `当前地点：${currentLocation || '未知'}`,
            `当前主角：${currentName}`,
            `当前人物：\n${socialText}`,
            '',
            '【旧地图层级数据（仅供识别旧存档残留；不要保留、不要合并进新树）】',
            existingLayerInfo,
            '',
            '【已知势力版图】',
            forceInfo,
            '',
            '【回忆库内容】',
            memoryText || '暂无可用回忆。',
            '',
            '请从回忆库中提取所有可长期抵达或反复出现的地点，并重建完整地点层级树。要求：',
            '1. 根节点必须是 层级:"寰宇" 名称:"诸天万界"。',
            '2. 地图层级只能是：寰宇、大地点、中地点、小地点、区地点、子地点。',
            '3. 层级与名称必须严格对应（见下方契约）；旧档重建同样按新口径命名，不得沿用旧存档的错层名称。',
            '4. 全量重建时依据回忆库、当前状态和已知势力版图恢复原有地名与上下级。缺少分支的大区域可补充符合世界设定的城镇或地域，室内发现与剧情事件须有记录依据。',
            branchPrompt,
            '5. 不要生成坐标、道路、建筑列表、地图人物等旧字段。地图层级节点也不要写 `在场人物` 字段——人物显示由社交档案里的 NPC 位置（`当前位置`/`位置路径`/`具体地点`）驱动，与地图层级无关。',
            '6. 地点若能判断势力控制或势力影响，必须补充 控制势力 / 势力影响 / 势力标签；看不出势力时不要硬编。',
            '房间只登记曾在回忆或当前状态中明确出现的地点；仅在明确有门或通道直接相连时，用「连通房间」数组记录同一场所的对端房名。',
            '7. 只输出 JSON，格式为 {"地点树":[{"名称":"...","层级":"...","父级ID":"父级名称或ID","描述":"...","控制势力":"...","势力影响":"...","势力标签":["..."]}]}，不要输出命令，也不要输出 `在场人物`。',
            '',
            地图层级命名契约,
            `8. ${地图层级命名自检}`,
            traditionalChinesePrompt
        ].join('\n');
    }

    return [
        '你正在执行正文后的【地图自动更新】任务。只维护地图层级，不写正文，不维护世界事件、NPC后台行动、势力、规划或社交档案。',
        '',
        `当前地点：${currentLocation || '未知'}`,
        `当前主角：${currentName}`,
        '',
        '【本回合正文】',
        body,
        '',
        '【当前人物位置线索】',
        socialText,
        '',
        '【已有地图层级】',
        existingLayerInfo,
        '',
        '【已知势力版图】',
        forceInfo,
        '',
        '【自动更新规则】',
        branchPrompt,
        isOpeningEmptyMap
            ? '0. 开局种子地图任务：寰宇至少有两个大地点，每个大地点至少有两个中地点，每个中地点至少有两个小地点。同一批 push 必须补齐各处分支，沿当前地点继续登记正文明确出现的场所和房间。'
            : '',
        isOpeningEmptyMap
            ? '1. 开局种子地图不得输出“无”；若地点信息不足，也要用当前地点、正文里的仓库/营地/街区/房间线索补齐可用节点。'
            : '1. 正文里明确出现的可长期抵达地点（客栈、店铺、码头、府邸、山寨、房间、密室、山门、街道集市等）只要还没收录，就必须 push 对应层级的新节点；只有正文完全没有出现任何未收录地点时才允许输出“无”。',
        '2. 同一父地点下同层级、同名的地点只收录一次。不同客栈的同名房间各自建点；父地点重名时必须写父级 ID。',
        '3. 地图层级只能是：寰宇、大地点、中地点、小地点、区地点、子地点；名称必须与层级严格对应（见下方契约）。',
        '4. 区地点=建筑/据点/地标；子地点=建筑内房间。环境.具体地点不是层级名。',
        '5. 父级ID优先填写已有节点 ID；若只能确定父级名称，也可以填写父级名称，系统会自动解析。',
        '6. 地点必须尽量体现势力分布：若正文、当前位置、已知势力版图能判断控制方或影响方，push 对象里写入 控制势力 / 势力影响 / 势力标签；描述里也要用一句话说明势力痕迹。',
        '7. 禁止输出旧地图坐标字段：世界.地图、世界.建筑、世界.地图建筑、世界.地图道路、世界.地图人物。',
        '8. 同一个角色只能有一个最细叶子位置；不要把同一人同时写入多个层级。地图层级的显示由社交档案里 NPC 的 `当前位置`/`位置路径`/`具体地点` 字段驱动，地图层级节点本身不要写 `在场人物` 字段。',
        isOpeningEmptyMap ? '9. 开局空地图必须输出 push 命令，不得输出“无”。' : '9. 输出“无”前必须先逐句检查【本回合正文】：只要出现了正文明确写到、且【已有地图层级】里没有的场所或房间，就不得输出“无”。',
        '10. 只登记正文、当前地点或回忆明确出现的房间；尚未出现的空间保持未知，不为凑数虚构房间、暗门或通路。',
        '10.1 房间仅在剧情明确有门、楼梯、走廊直通同场所另一已知房间时，在一端的「连通房间」数组写对端原名；相邻或同属一栋建筑不代表能直达。新发现通路也是地图变化，即使没有新房间也应输出命令。已有房间按给定索引 set 世界.地图层级[i].连通房间 = ["已知房名","新对端房名"]，保留仍有效的旧通路；永久封死或确认不通时删除双方对应项。',
        '11. 若地图目前只到「区地点」一层都没有，不要一次性虚构大量房间：先补当前所在建筑，其余等玩家实际进入再展开。',
        '12. 若已有节点的名称与层级不匹配（例如城镇层写着「水浪帮大营」），不要复制错名；按下方契约改名或改挂到正确父级。',
        '',
        地图层级命名契约,
        `13. ${地图层级命名自检}`,
        traditionalChinesePrompt,
        '',
        isOpeningEmptyMap ? '【单条命令格式示例；开局按规则 0 输出完整种子图的全部节点】' : '【输出格式】',
        '<thinking>简短审计是否有新地点</thinking>',
        '<说明>- 写明新增/跳过原因</说明>',
        '<命令>',
        'push 世界.地图层级 = {"名称":"悦来客栈","层级":"区地点","父级ID":"DT-004","描述":"洛阳城内可住宿与打探消息的客栈，受本地帮会与商旅势力共同影响。","控制势力":"洛阳商会","势力影响":"商会收取保护费，本地帮会暗中巡看。","势力标签":["商会","帮会"]}',
        '</命令>'
    ].join('\n');
};

const 创建地图接口缺失结果 = (): 地图更新执行结果 => ({
    ok: false,
    phase: 'skipped',
    commands: [],
    rawText: '',
    statusText: '地图生成接口未配置可用模型'
});

const 解析JSON块 = (rawText: string): any => {
    let text = (rawText || '').trim();
    const thinkEnd = text.lastIndexOf('</思考>');
    if (thinkEnd >= 0) text = text.slice(thinkEnd + '</思考>'.length).trim();
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlock) text = codeBlock[1].trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        text = text.slice(firstBrace, lastBrace + 1);
    }
    return JSON.parse(text);
};

export const 解析地图重生成节点 = (rawText: string): any[] => {
    const parsed = 解析JSON块(rawText);
    return Array.isArray(parsed?.地点树) ? parsed.地点树 : [];
};

const 规范地图节点 = (node: any) => ({
    ID: 取文本(node?.ID || node?.id),
    名称: 取文本(node?.名称),
    层级: 规范化层级(node?.层级),
    父级ID: 取文本(node?.父级ID),
    描述: 取文本(node?.描述),
    控制势力: 取文本(node?.控制势力),
    势力影响: 取文本(node?.势力影响),
    ...(规范化层级(node?.层级) === '子地点' && Array.isArray(node?.连通房间) ? { 连通房间: readRoomExits(node.连通房间) } : {}),
    房间格序: Number.isSafeInteger(node?.房间格序) ? node.房间格序 as number : undefined,
    势力标签: Array.isArray(node?.势力标签) ? node.势力标签.map(取文本).filter(Boolean) : [],
    归属: { 大地点: '', 中地点: '', 小地点: '' }
});

type 地点节点 = ReturnType<typeof 规范地图节点>;

const 定位地图节点 = (rawNodes: any[], existing: any[], mode: 'push' | 'rebuild' | 'set', aliases = new Map<string, string>()) => {
    const incoming: 地点节点[] = rawNodes.map(raw => {
        const node = 规范地图节点(raw);
        if (mode !== 'set' || !raw) return node;
        const { 在场人物, ...fields } = raw;
        return { ...fields, ...node, 归属: raw.归属 || node.归属 };
    }).filter(node => node.名称);
    if (!incoming.length) return [];
    if (mode === 'rebuild' && !incoming.some(node => node.层级 === '寰宇')) {
        incoming.unshift(规范地图节点({ 名称: '诸天万界', 层级: '寰宇', 描述: '诸天万界交汇之地' }));
    }

    const oldNodes = existing.map(规范地图节点);
    const knownNodes = [...oldNodes];
    const existingIds = new Set(knownNodes.map(node => node.ID).filter(Boolean));
    const reservedIds = new Set([...existingIds, ...incoming.flatMap(node => [node.ID, node.父级ID])]);
    let sequence = 0;
    for (const id of existingIds) {
        const number = /^DT-(\d+)$/i.exec(id);
        if (number && Number.isSafeInteger(Number(number[1]))) sequence = Math.max(sequence, Number(number[1]));
    }
    const allocateId = () => {
        let id: string;
        do { id = `DT-${String(++sequence).padStart(3, '0')}`; } while (reservedIds.has(id));
        reservedIds.add(id);
        return id;
    };

    const resolveParent = (parent: string, level: string, oldData = false) => {
        if (!parent) return '';
        if (aliases.has(parent)) return aliases.get(parent)!;
        if (existingIds.has(parent)) return parent;
        const matches = knownNodes.filter(node => node.名称 === parent && node.ID);
        const parentLevel = 地图层级顺序[地图层级顺序.indexOf(level as typeof 地图层级顺序[number]) - 1];
        const adjacent = matches.filter(node => node.层级 === parentLevel);
        const ids = new Set((adjacent.length ? adjacent : matches).map(node => node.ID));
        if (ids.size > 1) {
            if (oldData) return parent;
            throw new Error(`地图父地点「${parent}」有多个同名地点，请指定父级ID。`);
        }
        return ids.values().next().value || parent;
    };
    const keyOf = (node: 地点节点) => JSON.stringify([node.父级ID, node.层级, node.名称]);
    const oldByKey = new Map(oldNodes.map(node => [keyOf({ ...node, 父级ID: resolveParent(node.父级ID, node.层级, true) }), node]));
    const assigned = new Map<string, 地点节点>();
    const claimedIds = new Set<string>();
    const kept = new Set<地点节点>();
    // 先给父层分配 ID，以便接受房间排在建筑前、父级用原始 ID 或地名表示的响应。
    for (const level of 地图层级顺序) {
        for (const node of incoming.filter(node => node.层级 === level)) {
            const rawId = node.ID;
            node.父级ID = resolveParent(node.父级ID, level);
            const key = keyOf(node);
            const sibling = assigned.get(key);
            let old = oldByKey.get(key);
            if (!old && mode !== 'push') {
                // 旧档地点可能没有父级。同层地名在新旧两张图都唯一时，沿用原 ID。
                const sameName = (candidate: 地点节点) => candidate.层级 === level && candidate.名称 === node.名称;
                const matches = oldNodes.filter(sameName);
                if (matches.length === 1 && incoming.filter(sameName).length === 1) old = matches[0];
            }
            if (sibling || (mode === 'push' && old)) {
                const id = sibling?.ID || old?.ID;
                if (rawId && id) aliases.set(rawId, id);
                continue;
            }
            const oldId = old?.ID;
            const suppliedId = /^DT-\d+$/i.test(rawId) && !existingIds.has(rawId) ? rawId : '';
            const preferred = oldId || suppliedId;
            node.ID = preferred && !claimedIds.has(preferred) ? preferred : allocateId();
            claimedIds.add(node.ID);
            if (rawId) aliases.set(rawId, node.ID);
            assigned.set(key, node);
            knownNodes.push(node);
            kept.add(node);
        }
    }
    const byVenue = (nodes: 地点节点[]) => {
        const groups = new Map<string, 地点节点[]>();
        for (const room of nodes.filter(n => n.层级 === '子地点')) {
            const parent = resolveParent(room.父级ID, room.层级, true);
            const siblings = groups.get(parent) || [];
            siblings.push(room);
            groups.set(parent, siblings);
        }
        return groups;
    };
    const oldRooms = byVenue(oldNodes);
    for (const [venue, rooms] of byVenue([...kept])) {
        const previous = oldRooms.get(venue) || [];
        const oldSlots = getRoomSlots(previous);
        // 全图重排也先占用旧房格，再给新房间分配显式或空闲格。
        const roomCandidates = mode === 'push' ? [...previous, ...rooms]
            : [...rooms.filter(room => oldSlots.has(room.ID)), ...rooms.filter(room => !oldSlots.has(room.ID))];
        const slots = getRoomSlots(roomCandidates.map(room => ({ ID: room.ID, 房间格序: oldSlots.get(room.ID) ?? room.房间格序 })));
        const oldById = new Map(previous.map(room => [room.ID, room]));
        const byRef = new Map(rooms.map(room => [room.名称, room]));
        const explicitExits = new Map(rooms.map(room => [room.ID, room.连通房间]));
        for (const room of rooms) byRef.set(room.ID, room);
        for (const room of rooms) {
            room.房间格序 = slots.get(room.ID);
            const oldExits = oldById.get(room.ID)?.连通房间;
            if (mode !== 'push' && room.连通房间 === undefined && oldExits) {
                room.连通房间 = oldExits.filter(ref => {
                    const peer = byRef.get(ref);
                    if (!peer) return false;
                    const incoming = explicitExits.get(peer.ID);
                    const previouslyReciprocal = oldById.get(peer.ID)?.连通房间?.some(exit => exit === room.ID || exit === room.名称);
                    // 对端明确撤销曾登记的这扇门时，不能从省略出口一侧的旧数据重新打开。
                    return !incoming || !previouslyReciprocal || incoming.some(exit =>
                        exit === room.ID || exit === room.名称 || aliases.get(exit) === room.ID);
                });
            }
        }
    }
    return incoming.filter(node => kept.has(node)).map(node => node.连通房间?.length
        ? { ...node, 连通房间: node.连通房间.map(ref => aliases.get(ref) || ref) }
        : node);
};

export const 构建地图层级替换结果 = (rawNodes: any[], currentWorld?: any): any[] =>
    定位地图节点(Array.isArray(rawNodes) ? rawNodes : [], Array.isArray(currentWorld?.地图层级) ? currentWorld.地图层级 : [], 'rebuild');

const 提取命令块 = (rawText: string): string => {
    const source = (rawText || '').trim();
    const withoutThinking = source
        .replace(/<\s*thinking\s*>[\s\S]*?<\s*\/\s*thinking\s*>/gi, '')
        .replace(/<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi, '')
        .trim();
    const match = withoutThinking.match(/<\s*命令\s*>([\s\S]*?)(?:<\s*\/\s*命令\s*>|$)/i);
    return (match?.[1] || withoutThinking).trim();
};

const 解析命令值 = (text: string): any => {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        const firstBrace = trimmed.indexOf('{');
        const lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
        }
        return trimmed;
    }
};

const 解析增量地图结果 = (rawText: string, currentWorld?: any): { commands: TavernCommand[]; recognized: boolean; layers: any[] } => {
    const block = 提取命令块(rawText);
    let existingLayers = Array.isArray(currentWorld?.地图层级) ? [...currentWorld.地图层级] : [];
    if (!block || /^无$/i.test(block.trim())) return { commands: [], recognized: block.trim() === '无', layers: existingLayers };
    const result: TavernCommand[] = [];
    const aliases = new Map<string, string>();
    let hadDuplicate = false;
    let pendingPushes: any[] = [];
    const flushPushes = () => {
        if (!pendingPushes.length) return;
        const nodes = 定位地图节点(pendingPushes, existingLayers, 'push', aliases);
        hadDuplicate ||= nodes.length < pendingPushes.length;
        result.push(...nodes.map(value => ({ action: 'push' as const, key: '世界.地图层级', value })));
        existingLayers.push(...nodes);
        pendingPushes = [];
    };
    block.split(/\n+/).forEach((line) => {
        const trimmed = line.trim().replace(/^[\-*]\s*/, '');
        if (!trimmed || /^无$/i.test(trimmed)) return;
        const match = trimmed.match(/^(push|set|add|delete)\s+(.+?)(?:\s*=\s*([\s\S]+))?$/i);
        if (!match) return;
        const key = (match[2] || '').trim();
        if (!/^世界\.地图层级(?:$|\s|\[|\.)/.test(key) && !/^gameState\.世界\.地图层级(?:$|\s|\[|\.)/.test(key)) return;
        const rawAction = match[1].toLowerCase() as TavernCommand['action'];
        const action = rawAction === 'add' && 整图路径.test(key) ? 'push' : rawAction;
        if (action !== 'push' && action !== 'set' && action !== 'delete') return;
        let value = action === 'delete' ? undefined : 解析命令值(match[3] || '');
        if (action === 'push' && 整图路径.test(key)) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return;
            if (取文本(value.名称)) pendingPushes.push(value);
            return;
        }
        flushPushes();
        if (action !== 'delete' && /地图层级(?:\[\d+\]|\.\d+)\.连通房间(?:\[\d+\]|\.\d+)?$/.test(key)) {
            const resolveExit = (ref: unknown) => typeof ref === 'string' ? aliases.get(ref.trim()) || ref : ref;
            value = Array.isArray(value) ? value.map(resolveExit) : resolveExit(value);
        }
        if (action === 'push' && (!/地图层级(?:\[\d+\]|\.\d+)\.连通房间$/.test(key) || !取文本(value))) return;
        if (整图路径.test(key)) {
            if (action === 'delete' || !Array.isArray(value) || !value.length || !value.every((node) => 取文本(node?.名称))) return;
            existingLayers = 定位地图节点(value, existingLayers, 'set', aliases);
            const retainedIds = new Set(existingLayers.map(node => node.ID));
            for (const [alias, id] of aliases) if (!retainedIds.has(id)) aliases.delete(alias);
            result.push({ action, key, value: existingLayers.slice() });
            return;
        }
        // 用同一命令执行器模拟改变树结构的索引指令，后续 push 分配 ID 和最终校验都读取更新后的层级。
        if (/地图层级(?:\[\d+\]|\.\d+)(?:\.(?:ID|名称|层级|父级ID|连通房间(?:\[\d+\]|\.\d+)?))?$/.test(key)) {
            const next = applyStateCommand(null, null, [], { 地图层级: existingLayers } as 世界数据结构,
                null, null, null, undefined, undefined, undefined, null, [], [], key, value, action);
            existingLayers = next.world.地图层级;
        }
        result.push({ action, key, value } as TavernCommand);
    });
    flushPushes();
    if (result.length === 0 && !hadDuplicate) {
        try {
            const rawNodes = 解析地图重生成节点(rawText);
            const newLayers = 构建地图层级替换结果(rawNodes, currentWorld);
            if (newLayers.length > 0) {
                return { commands: [{
                    action: 'set',
                    key: '世界.地图层级',
                    value: newLayers
                }], recognized: true, layers: newLayers };
            }
        } catch {
            // 非 JSON 地点树时保持命令解析结果为空。
        }
    }
    return { commands: result, recognized: result.length > 0 || hadDuplicate, layers: existingLayers };
};

export const 解析地图自动更新命令 = (rawText: string, currentWorld?: any): TavernCommand[] =>
    解析增量地图结果(rawText, currentWorld).commands;

export const 生成地图更新 = async (
    params: 地图更新请求参数
): Promise<地图更新执行结果> => {
    const diagnosticId = 创建地图更新诊断ID();
    const startedAt = Date.now();
    const api = params.mode === 'auto_incremental'
        ? 获取地图自动更新接口配置(params.apiSettings)
        : 获取地图生成接口配置(params.apiSettings);
    // 省次数模式下地图结果已经在主剧情那一次请求里带回来了，不需要独立地图接口可用。
    // 空字符串也算「已预取」：协议允许空分节表示本回合没有地点变化，采信它才能省掉这次请求。
    const 使用预取地图 = typeof params.prefetchedRawText === 'string';
    const 预取地图文本 = 使用预取地图 ? String(params.prefetchedRawText).trim() : '';
    const env = params.stateBase?.环境 || params.环境;
    const world = params.stateBase?.世界 || params.世界;
    const social = params.stateBase?.社交 || params.社交 || [];
    const role = params.stateBase?.角色 || params.角色;
    const layerCount = Array.isArray((world as any)?.地图层级) ? (world as any).地图层级.length : 0;
    const bodyTextLength = 提取响应正文(params.currentResponse).length;
    const currentLocation = [env?.大地点, env?.中地点, env?.小地点, env?.具体地点].map(取文本).filter(Boolean).join(' > ');
    const apiUsable = 接口配置是否可用(api) || 使用预取地图;
    const baseMeta = {
        diagnosticId,
        mode: params.mode,
        prefetched: 使用预取地图,
        model: 取文本((api as any)?.model),
        supplier: 取文本((api as any)?.供应商),
        baseUrlHost: 读取接口主机((api as any)?.baseUrl),
        apiUsable,
        timeoutMs: 地图更新请求超时毫秒,
        existingLayerCount: layerCount,
        socialCount: Array.isArray(social) ? social.length : 0,
        bodyTextLength,
        currentLocation: currentLocation || '未知'
    };
    记录地图更新诊断('info', 'stage-start', baseMeta);
    if (!apiUsable) {
        记录地图更新诊断('warn', 'interface-missing-skip', {
            ...baseMeta,
            elapsedMs: Date.now() - startedAt
        });
        return 创建地图接口缺失结果();
    }

    const userPrompt = 构建地图更新用户提示词({
        mode: params.mode,
        环境: env,
        世界: world,
        社交: social,
        角色: role,
        gameConfig: params.gameConfig,
        记忆系统: params.记忆系统,
        currentResponse: params.currentResponse
    });
    const cotPrompt = 获取内置世界书槽位内容({
        books: params.worldbooks,
        slotId: 'builtin_map_regenerate_cot',
        fallback: 地图重生成COT提示词
    });
    const systemPrompt = 获取内置世界书槽位内容({
        books: params.worldbooks,
        slotId: 'builtin_map_regenerate_system_prompt',
        fallback: 地图重生成系统提示词
    });

    const messages = 规范化文本补全消息链([
        { role: 'system', content: cotPrompt },
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ], { 保留System: true, 合并同角色: false });
    const shouldNonStream = params.gameConfig?.启用非流式输出
        || params.apiSettings.功能模型占位?.地图自动更新非流式输出 === true;
    记录地图更新诊断('info', 'request-start', {
        ...baseMeta,
        streaming: !shouldNonStream && Boolean(params.onDelta),
        nonStream: Boolean(shouldNonStream),
        messageCount: messages.length,
        userPromptLength: userPrompt.length,
        systemPromptLength: systemPrompt.length,
        cotPromptLength: cotPrompt.length
    });
    const requestController = new AbortController();
    const abortRequest = () => {
        try {
            requestController.abort(params.signal?.reason || new DOMException('Aborted', 'AbortError'));
        } catch {
            requestController.abort();
        }
    };
    if (params.signal?.aborted) abortRequest();
    params.signal?.addEventListener('abort', abortRequest, { once: true });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const rejectTimeoutRef: { current: ((reason?: any) => void) | null } = { current: null };
    const 重置为完整预算 = () => {
        // 降级非流式重试前重新计满：计时器从流式请求发起就开始走，
        // 流式阶段耗掉的 120 秒预算会让重试几乎必然超时。
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            timedOut = true;
            requestController.abort(new Error(`地图更新请求超过 ${Math.round(地图更新请求超时毫秒 / 1000)} 秒未返回`));
            rejectTimeoutRef.current?.(new Error(`地图更新请求超过 ${Math.round(地图更新请求超时毫秒 / 1000)} 秒未返回，已自动跳过本轮地图更新。`));
        }, 地图更新请求超时毫秒);
    };
    const timeoutPromise = new Promise<never>((_, reject) => {
        rejectTimeoutRef.current = reject;
        重置为完整预算();
    });

    let rawText = '';
    try {
        rawText = await Promise.race([
            使用预取地图
                ? Promise.resolve(预取地图文本)
                : (async () => {
                /**
                 * 地图命令块被截断后仍可能解析出**部分合法命令**，那样 `commands.length > 0`
                 * 会判定本轮「更新完成」，玩家看到的是「地图只更新了一半」。
                 * 这里用统一的流式完整性保护：收到结束标记就照常用，疑似被上游掐断则降级非流式重试一次。
                 */
                const 发起地图更新请求 = (streamOptions?: { stream?: boolean; onDelta?: (delta: string, accumulated: string) => void; onStreamEnd?: (info: any) => void }) => (
                    请求模型文本(api as 当前可用接口结构, messages, {
                        temperature: params.mode === 'auto_incremental' ? 0.35 : 0.7,
                        signal: requestController.signal,
                        streamOptions,
                        errorDetailLimit: Number.POSITIVE_INFINITY
                    })
                );
                const 完整性结果 = await 执行带完整性校验的请求({
                    功能名: params.mode === 'memory_regenerate' ? '地图重生成' : '地图更新',
                    强制非流式: shouldNonStream || !params.onDelta,
                    // 截断的命令块仍可能解析出部分合法命令，合并后 `commands.length > 0`
                    // 会把「只更新了一半」判定为成功。重试也失败时整体丢弃，本轮跳过地图更新。
                    重试失败处置: '抛出错误',
                    重试前重置超时: 重置为完整预算,
                    发起流式请求: (streamOptions) => 发起地图更新请求({
                        stream: true,
                        onDelta: params.onDelta,
                        onStreamEnd: streamOptions.onStreamEnd
                    }),
                    发起非流式请求: () => 发起地图更新请求(),
                    onFallback: (info) => {
                        记录地图更新诊断(info.重试失败 ? 'error' : 'warn', 'stream-truncated-fallback', {
                            ...baseMeta,
                            重试失败: Boolean(info.重试失败),
                            message: info.message || '',
                            sawDone: info.sawDone,
                            finishReason: info.finishReason,
                            accumulatedLength: info.accumulatedLength
                        });
                    }
                });
                rawText = 完整性结果.结果;
                记录地图更新诊断('info', 'request-success', {
                    ...baseMeta,
                    elapsedMs: Date.now() - startedAt,
                    rawTextLength: rawText.length,
                    已降级重试: 完整性结果.已降级重试
                });
                return rawText;
            })(),
            timeoutPromise
        ]);
    } catch (error: any) {
        if (params.signal?.aborted) {
            记录地图更新诊断('info', 'request-aborted', {
                ...baseMeta,
                elapsedMs: Date.now() - startedAt,
                message: error?.message || params.signal.reason?.message || ''
            });
            throw params.signal.reason || new DOMException('Aborted', 'AbortError');
        }
        if (timedOut) {
            记录地图更新诊断('warn', 'request-timeout-skip', {
                ...baseMeta,
                elapsedMs: Date.now() - startedAt,
                message: error?.message || ''
            });
            return {
                ok: false,
                phase: 'skipped',
                commands: [],
                rawText: '',
                statusText: error?.message || '地图更新请求超时，已自动跳过本轮地图更新。'
            };
        }
        记录地图更新诊断('error', 'request-error', {
            ...baseMeta,
            elapsedMs: Date.now() - startedAt,
            name: error?.name || typeof error,
            message: error?.message || ''
        });
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        params.signal?.removeEventListener('abort', abortRequest);
    }

    if (params.mode === 'memory_regenerate') {
        const rawNodes = 解析地图重生成节点(rawText);
        const newLayers = 构建地图层级替换结果(rawNodes, world);
        const gaps = 查找地图分支缺口(newLayers);
        if (gaps.length) {
            return { ok: false, phase: 'error', commands: [], rawText, statusText: '重建后仍缺少地域分支，已保留原地图：' + gaps.join('、') };
        }
        记录地图更新诊断('info', 'memory-regenerate-parsed', {
            ...baseMeta,
            elapsedMs: Date.now() - startedAt,
            rawNodeCount: rawNodes.length,
            newLayerCount: newLayers.length
        });
        return {
            ok: true,
            phase: newLayers.length > 0 ? 'done' : 'skipped',
            commands: [],
            rawText,
            statusText: newLayers.length > 0 ? `地图解析完成：已生成 ${newLayers.length} 个地点节点` : '地图解析完成：未生成有效节点',
            newLayers
        };
    }

    const { commands, recognized, layers } = 解析增量地图结果(rawText, world);
    if (!recognized && !(使用预取地图 && !rawText)) {
        return { ok: false, phase: 'error', commands: [], rawText, statusText: '地图更新响应没有有效地点树、地图命令或“无”标记，已保留原地图。' };
    }
    const fullTreeSyncCount = commands.length === 1
        && commands[0]?.action === 'set'
        && commands[0]?.key === '世界.地图层级'
        && Array.isArray(commands[0]?.value)
        ? commands[0].value.length
        : 0;
    记录地图更新诊断('info', 'auto-incremental-parsed', {
        ...baseMeta,
        elapsedMs: Date.now() - startedAt,
        rawTextLength: rawText.length,
        commandCount: commands.length,
        fullTreeSyncCount
    });
    const replacesTree = commands.some(cmd => cmd.action === 'set' && 整图路径.test(cmd.key));
    if (layerCount === 0) {
        const error = 检查开局地图结构(layers, env);
        if (error) return { ok: false, phase: 'error', commands: [], rawText, statusText: error };
    }
    const gaps = 查找地图分支缺口(layers, layerCount > 0 && !replacesTree ? world?.地图层级 : undefined);
    if (gaps.length) {
        return { ok: false, phase: 'error', commands: [], rawText, statusText: '地图仍有地域分支待补：' + gaps.join('、') };
    }
    return {
        ok: true,
        phase: 'done',
        commands,
        rawText,
        statusText: commands.length > 0
            ? (fullTreeSyncCount > 0
                ? `地图更新完成：已同步 ${fullTreeSyncCount} 个地点节点`
                : `地图更新完成：新增 ${commands.length} 条地图命令`)
            : '地图更新检查完成：本回合无需更新'
    };
};
