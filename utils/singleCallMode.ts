/**
 * 省次数模式：把原本分散在多个阶段的模型请求合并进主剧情的这一次请求。
 *
 * 设计约束：
 * 1. 只做「协议文本生成 + 原始文本分节」两件纯函数工作，不碰任何状态与网络请求。
 * 2. 分节解析失败时返回空字符串，调用方据此降级回原有独立请求，保证功能不退化。
 * 3. 主剧情解析前必须先调用 `提取省次数分节().storyText` 剥离附加块，
 *    避免分节里的 `<命令>` / `<说明>` 被当成主剧情协议内容。
 */
export type 省次数环节 = 'polish' | 'variable' | 'world' | 'planning' | 'map';

export const 省次数环节顺序: 省次数环节[] = ['polish', 'variable', 'world', 'planning', 'map'];

/** 附加块里每个分节使用的标签名。标签名保持中文，和项目其余协议风格一致。 */
export const 省次数分节标签: Record<省次数环节, string> = {
    polish: '润色正文',
    variable: '变量校准',
    world: '世界演变',
    planning: '规划分析',
    map: '地图更新'
};

const 环节输出要求: Record<省次数环节, string> = {
    polish: [
        '<润色正文>：把主剧情 <正文> 里的故事重新润色一遍，输出 <thinking>...</thinking><正文>...</正文>。',
        '不得新增剧情事件、不得改写判定结果，必须完整保留所有【角色名】对白行。'
    ].join(''),
    variable: [
        '<变量校准>：输出 <thinking>...</thinking><说明>...</说明><命令>...</命令>。',
        '<说明> 每行以 "- " 开头；<命令> 每行用 `set 路径 = 值` / `add 路径 = 值` / `push 路径 = 值` / `delete 路径` 体例，只写本回合最终变化，禁止整组重写社交列表。'
    ].join(''),
    world: [
        '<世界演变>：输出 <命令>...</命令> 或 <动态世界>...</动态世界>，命令用 `set 路径 = 值` 体例。',
        '只写本回合确实成立的动态世界变化；没有变化就保留空标签对。'
    ].join(''),
    planning: [
        '<规划分析>：输出 <说明>...</说明><命令>...</命令>，命令用 `set 路径 = 值` 体例。',
        '只写确实需要修补的剧情/女主规划路径；无需更新时 <命令> 留空并在 <说明> 写明无需更新。'
    ].join(''),
    map: [
        '<地图更新>：输出地图增量命令，每行 `set 世界.地图层级 = ...` 或 `push 世界.地图层级 = ...`。',
        '没有地点变化时保留空标签对。'
    ].join('')
};

const 环节示例: Record<省次数环节, string> = {
    polish: '<润色正文>\n<thinking>...</thinking>\n<正文>\n【旁白】...\n</正文>\n</润色正文>',
    variable: '<变量校准>\n<thinking>...</thinking>\n<说明>\n- 本回合确认了...\n</说明>\n<命令>\nset 角色.气血 = 80\n</命令>\n</变量校准>',
    world: '<世界演变>\n<命令>\nset 世界.局势 = ...\n</命令>\n</世界演变>',
    planning: '<规划分析>\n<说明>\n- 无需更新\n</说明>\n<命令>\n</命令>\n</规划分析>',
    map: '<地图更新>\n</地图更新>'
};

/**
 * 生成注入到主剧情消息链末尾的附加输出协议。
 * @param 启用环节 由现有各阶段开关计算得出，未启用的环节不会要求模型输出。
 */
export const 构建省次数附加输出协议 = (
    启用环节: 省次数环节[],
    /** 润色环节的生效设置：用户自定义提示词 + 字数/人称/对白等运行时硬约束，避免合并后设置失效。 */
    润色补充指令 = '',
    /** 变量环节的校准规则（含用户自定义资源公式等），独立请求原本会注入，合并后必须补上。 */
    变量补充规则 = ''
): string => {
    const 有效环节 = 省次数环节顺序.filter(item => 启用环节.includes(item));
    if (有效环节.length === 0) return '';

    const 环节名称: Record<省次数环节, string> = {
        polish: '文章优化',
        variable: '变量生成',
        world: '动态世界',
        planning: '规划分析',
        map: '地图更新'
    };
    return [
        '【省次数模式 · 单次请求附加输出】',
        '本回合只允许这一次模型请求。请先按游戏既有协议完整输出主剧情响应（<正文>、<短期记忆>、<命令>、<行动选项>、<动态世界> 等），然后在整个响应最末尾追加一个 <省次数附加> 块，一次性给出下列环节的结果。',
        '',
        '本次启用的环节：' + 有效环节.map(item => 环节名称[item]).join('、') + '。',
        '',
        '<省次数附加>',
        ...有效环节.map(item => 环节示例[item]),
        '</省次数附加>',
        '',
        '各分节要求：',
        ...有效环节.map((item, index) => {
            const 补充 = item === 'polish' && 润色补充指令.trim()
                ? `\n【本回合生效的润色设置 · 必须遵守】\n${润色补充指令.trim()}`
                : item === 'variable' && 变量补充规则.trim()
                    ? `\n【本回合生效的变量校准规则 · 必须遵守】\n${变量补充规则.trim()}`
                    : '';
            return `${index + 1}. ${环节输出要求[item]}${补充}`;
        }),
        '',
        '硬性要求：',
        '1. <省次数附加> 必须是整个响应的最后一块，主剧情协议块全部结束后才开始。',
        '2. 只输出本次启用的分节，每个分节只出现一次；不要输出未列出的分节。',
        '3. 分节内直接写原生协议内容，不要写「这是变量环节」之类说明文字，不要使用 Markdown 代码块。',
        '4. 分节里的 <命令> 与主剧情 <命令> 用途不同，不要重复主剧情已给出的命令。',
        '5. 故事正文只写进主剧情 <正文>；如果启用了润色分节，那一份必须是润色后的完整正文副本，不得写成摘要。',
        '6. 某环节没有结果时保留该分节的空标签对（开标签紧跟闭标签），不要省略整个分节。',
        '7. 不要输出省次数附加协议本身的说明或复述。'
    ].join('\n');
};

const 提取同名分节 = (source: string, tag: string): string => {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matched = Array.from(source.matchAll(new RegExp(`<\\s*${escaped}\\s*>([\\s\\S]*?)<\\s*\\/\\s*${escaped}\\s*>`, 'gi')));
    if (matched.length > 0) return matched[matched.length - 1][1].trim();
    return '';
};

export interface 省次数分节提取结果 {
    /** 剥离附加块后的主剧情原始文本，可直接交给 parseStoryRawText。 */
    storyText: string;
    /** 各环节的原生协议文本；空字符串表示该环节需要降级回独立请求。 */
    sections: Partial<Record<省次数环节, string>>;
}

/**
 * 从一次请求的完整原始输出里拆出主剧情文本和各环节分节。
 * 外层 <省次数附加> 缺失或截断时仍会尝试按分节标签逐个提取，最大化容错。
 */
export const 提取省次数分节 = (rawText: string): 省次数分节提取结果 => {
    const text = typeof rawText === 'string' ? rawText : '';
    const 外层闭合块 = Array.from(text.matchAll(/<\s*省次数附加\s*>([\s\S]*?)<\s*\/\s*省次数附加\s*>/gi));
    const scope = 外层闭合块.length > 0 ? 外层闭合块[外层闭合块.length - 1][1] : text;

    const sections: Partial<Record<省次数环节, string>> = {};
    for (const 环节 of 省次数环节顺序) {
        const value = 提取同名分节(scope, 省次数分节标签[环节]);
        if (value) sections[环节] = value;
    }

    let storyText = text.replace(/<\s*省次数附加\s*>[\s\S]*?<\s*\/\s*省次数附加\s*>/gi, '');
    if (/<\s*省次数附加\s*>/i.test(storyText)) {
        storyText = storyText.replace(/<\s*省次数附加\s*>[\s\S]*$/i, '');
    }
    // 模型忘记写外层包裹时，也要把散落的分节从主剧情文本里摘掉，避免污染 <命令>/<说明> 提取。
    for (const 环节 of 省次数环节顺序) {
        const tag = 省次数分节标签[环节];
        const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        storyText = storyText.replace(new RegExp(`<\\s*${escaped}\\s*>[\\s\\S]*?<\\s*\\/\\s*${escaped}\\s*>`, 'gi'), '');
        // 未闭合的分节（响应被截断）必须整段丢掉：解析器会给里面的 <命令> 补上闭合标签，
        // 否则分节命令会被当成主剧情命令写入状态。
        const 未闭合位置 = storyText.search(new RegExp(`<\\s*${escaped}\\s*>`, 'i'));
        if (未闭合位置 >= 0) storyText = storyText.slice(0, 未闭合位置);
    }
    return { storyText, sections };
};

/** 流式草稿过滤：只把主剧情 <正文> 部分透给界面，避免附加协议块在流式过程中闪现。 */
export const 过滤省次数流式草稿 = (accumulated: string): string => {
    const text = typeof accumulated === 'string' ? accumulated : '';
    const 正文块 = Array.from(text.matchAll(/<\s*正文\s*>([\s\S]*?)<\s*\/\s*正文\s*>/gi));
    if (正文块.length > 0) {
        return `<正文>\n${正文块[0][1]}\n</正文>`;
    }
    const 未闭合正文 = text.match(/<\s*正文\s*>([\s\S]*)$/i);
    if (未闭合正文 && !/<省次数附加/i.test(未闭合正文[1])) {
        return `<正文>\n${未闭合正文[1]}`;
    }
    const { storyText } = 提取省次数分节(text);
    return storyText;
};
