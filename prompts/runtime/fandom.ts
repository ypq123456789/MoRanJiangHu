import type { OpeningConfig } from '../../types';

type 境界映射项 = {
    level: number;
    label: string;
};

type 境界映射母板 = {
    strategy: '原著优先' | '现体系回退';
    mapping: 境界映射项[];
    source: 'realm_prompt' | 'world_prompt' | 'default';
};

type 境界区块集合 = {
    境界映射母板: string;
    九阶命名与能力边界: string;
    九阶命名提示词: string;
    能力边界提示词: string;
    境界差距口径: string;
    终点文案: string;
    阶段推进表: string;
    大境突破表: string;
    武侠硬边界: string;
    分段映射提示词: string;
    文案规则提示词: string;
};

export type 同人运行时提示词包 = {
    enabled: boolean;
    同人设定摘要: string;
    世界观创建补丁: string;
    开局任务补丁: string;
    开局COT补丁: string;
    主剧情COT补丁: string;
    剧情规划补丁: string;
    女主规划补丁: string;
    女主思考补丁: string;
    世界演变补丁: string;
    境界母板补丁: string;
    变量校准补丁: string;
    境界映射母板: 境界映射母板;
    境界区块集合: 境界区块集合;
};

const 默认境界映射: 境界映射项[] = [
    { level: 1, label: '开脉境初期' },
    { level: 2, label: '开脉境中期' },
    { level: 3, label: '开脉境后期' },
    { level: 4, label: '开脉境圆满' },
    { level: 5, label: '聚息境初期' },
    { level: 6, label: '聚息境中期' },
    { level: 7, label: '聚息境后期' },
    { level: 8, label: '聚息境圆满' },
    { level: 9, label: '归元境初期' },
    { level: 10, label: '归元境中期' },
    { level: 11, label: '归元境后期' },
    { level: 12, label: '归元境圆满' },
    { level: 13, label: '御劲境初期' },
    { level: 14, label: '御劲境中期' },
    { level: 15, label: '御劲境后期' },
    { level: 16, label: '御劲境圆满' },
    { level: 17, label: '化罡境初期' },
    { level: 18, label: '化罡境中期' },
    { level: 19, label: '化罡境后期' },
    { level: 20, label: '化罡境圆满' },
    { level: 21, label: '通玄境初期' },
    { level: 22, label: '通玄境中期' },
    { level: 24, label: '通玄境圆满' },
    { level: 27, label: '神照境' },
    { level: 33, label: '返真境' },
    { level: 43, label: '天人境' }
];

export const 默认累计境界映射数值列表 = 默认境界映射.map((item) => item.level);
export const 默认累计境界阶段推进跳转列表 = [
    '1→2', '2→3', '3→4',
    '5→6', '6→7', '7→8',
    '9→10', '10→11', '11→12',
    '13→14', '14→15', '15→16',
    '17→18', '18→19', '19→20',
    '21→22', '22→24'
] as const;
export const 默认累计境界大境突破跳转列表 = [
    '4→5',
    '8→9',
    '12→13',
    '16→17',
    '20→21',
    '24→27',
    '27→33',
    '33→43'
] as const;

const 读取同人配置 = (openingConfig?: OpeningConfig | null) => {
    const fandom = openingConfig?.同人融合;
    const title = typeof fandom?.作品名 === 'string' ? fandom.作品名.trim() : '';
    if (!fandom?.enabled || !title) return null;
    return {
        title,
        sourceType: fandom.来源类型,
        fusionStrength: fandom.融合强度,
        keepCanonicalCharacters: fandom.保留原著角色 === true,
        parallelCanonPolicy: '平行线贴原著'
    };
};

const 规范化境界标签 = (value: unknown): string => (
    typeof value === 'string'
        ? value
            .trim()
            .replace(/[：:=]/g, '')
            .replace(/\s+/g, '')
            .replace(/[()（）【】\[\]<>]/g, '')
            .toLowerCase()
        : ''
);

const 构建默认境界母板 = (): 境界映射母板 => ({
    strategy: '现体系回退',
    mapping: 默认境界映射,
    source: 'default'
});

const 提取境界体系正文 = (source: string): string => {
    const normalized = typeof source === 'string' ? source.trim() : '';
    if (!normalized) return '';
    const tagMatch = normalized.match(/<\s*境界体系\s*>([\s\S]*?)(?:<\s*\/\s*境界体系\s*>|$)/i);
    return (tagMatch?.[1] || normalized).trim();
};

const 提取标题区块 = (source: string, title: string): string => {
    const normalized = 提取境界体系正文(source);
    if (!normalized) return '';
    const blockMatch = normalized.match(new RegExp(`【${title}】([\\s\\S]*?)(?=\\n【|$)`));
    return (blockMatch?.[1] || '').trim();
};

const 读取境界映射母板 = (
    sourceText: string | undefined,
    sourceType: 'realm_prompt' | 'world_prompt'
): 境界映射母板 | undefined => {
    const source = 提取境界体系正文(typeof sourceText === 'string' ? sourceText : '');
    if (!source) return undefined;
    const blockMatch = source.match(/【境界映射母板】([\s\S]*?)(?=\n【|$)/);
    if (!blockMatch) return undefined;
    const block = blockMatch[1] || '';
    const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    const strategy = lines.some((line) => /使用策略[:：]\s*原著优先/.test(line))
        ? '原著优先'
        : '现体系回退';
    const mapping = lines
        .map((line) => {
            const matched = line.match(/^-?\s*(\d{1,2})\s*(?:=>|=|:|：)\s*(.+)$/);
            if (!matched) return null;
            const level = Number(matched[1]);
            const label = (matched[2] || '').trim();
            if (!Number.isFinite(level) || !label) return null;
            return { level, label } satisfies 境界映射项;
        })
        .filter((item): item is 境界映射项 => Boolean(item));
    if (mapping.length === 0) return undefined;
    return {
        strategy,
        mapping,
        source: sourceType
    };
};

const 读取境界母板优先级 = (params?: { realmPrompt?: string; worldPrompt?: string }): 境界映射母板 => (
    读取境界映射母板(params?.realmPrompt, 'realm_prompt')
    || 读取境界映射母板(params?.worldPrompt, 'world_prompt')
    || 构建默认境界母板()
);

const 构建境界母板展示文本 = (schema: 境界映射母板): string => [
    '【境界映射母板】',
    ...schema.mapping.map((item) => `${item.level} => ${item.label}`),
    '',
    '【九阶命名与能力边界】',
    ...默认累计境界九阶命名提示词.split('\n'),
    ...默认累计境界能力边界提示词.split('\n'),
    '【境界差距口径】',
    ...默认累计境界差距口径提示词.split('\n'),
    '【终点文案】',
    默认累计境界终点文案提示词,
    '【阶段推进表】',
    ...默认累计境界阶段推进提示词.split('\n'),
    '【大境突破表】',
    ...默认累计境界大境突破提示词.split('\n'),
    '【武侠硬边界】',
    ...默认累计境界武侠硬边界提示词.split('\n')
].join('\n');

export const 默认累计境界分段映射提示词 = [
    '- 凡人/普通人/未入境：正式映射值 `1` 之前的概念层，不占正式累计境界值。',
    '- 开脉境初期 / 中期 / 后期 / 圆满：`1 / 2 / 3 / 4`',
    '- 聚息境初期 / 中期 / 后期 / 圆满：`5 / 6 / 7 / 8`',
    '- 归元境初期 / 中期 / 后期 / 圆满：`9 / 10 / 11 / 12`',
    '- 御劲境初期 / 中期 / 后期 / 圆满：`13 / 14 / 15 / 16`',
    '- 化罡境初期 / 中期 / 后期 / 圆满：`17 / 18 / 19 / 20`',
    '- 通玄境初期 / 中期 / 圆满：`21 / 22 / 24`',
    '- 神照境：`27`',
    '- 返真境：`33`',
    '- 天人境：`43`'
].join('\n');

export const 默认累计境界九阶命名提示词 = [
    '- 九阶命名顺序固定：',
    '  - 开脉境（`1~4`）',
    '  - 聚息境（`5~8`）',
    '  - 归元境（`9~12`）',
    '  - 御劲境（`13~16`）',
    '  - 化罡境（`17~20`）',
    '  - 通玄境（`21 / 22 / 24`）',
    '  - 神照境（`27`）',
    '  - 返真境（`33`）',
    '  - 天人境（`43`）'
].join('\n');

export const 默认累计境界能力边界提示词 = [
    '- 境界能力边界：',
    '  - 开脉/聚息：强于常人，但仍明显受军阵、弓弩、围攻、地形压制',
    '  - 归元/御劲：成熟江湖好手到地方强者门槛，仍非刀枪不入',
    '  - 化罡/通玄：攻防转换成熟，可成大势力中坚，但依旧受伤势、资源、围攻、毒药、机关约束',
    '  - 神照/返真：一流上位到顶尖高手，短时高机动与压制感增强，但仍会疲、会伤、会死',
    '  - 天人：凡俗武道顶峰，能左右高端战局，但仍不是仙神，不能常态飞天、改天换地、起死回生'
].join('\n');

export const 默认累计境界文案规则提示词 = [
    '- 凡人/普通人/未入境：可直接作为叙事文案使用，但不写成正式累计境界值。',
    '- 开脉至化罡：默认采用 `X境初期 / 中期 / 后期 / 圆满` 四段写法。',
    '- 通玄境：默认采用 `通玄境初期 / 中期 / 圆满` 三段收束写法。',
    '- 神照以上：`神照境 / 返真境 / 天人境`'
].join('\n');

export const 默认累计境界差距口径提示词 = [
    '- 凡人/普通人/未入境对正式入境者：若无伏击、军械、毒药、机关、地利或人数优势，默认属于明显劣势甚至断层劣势。',
    '- 累计境界差值统一按以下层次体现：',
    '  - 小差距：`1~2`，体现稳定性、细节和爆发窗口优势',
    '  - 明显差距：`3~5`，低位方需要地利、克制或奇策来弥补',
    '  - 压制差距：`6~9`，正面硬拼通常进入稳弱势',
    '  - 断层差距：`10+`，攻防、续航、掌控力会出现明显代差',
    '- 参考口径：',
    '  - 开脉境中期（`2`）对开脉境圆满（`4`），属小差距中的上段',
    '  - 化罡境圆满（`20`）对通玄境初期（`21`），差值虽为 `1`，但已跨大境，气机质量与掌控力会出现断层感',
    '  - 神照境（`27`）对返真境（`33`），属压制差距中的高段，取胜前提需要极强外部条件'
].join('\n');

export const 默认累计境界终点文案提示词 = '- 当前境界文案位于本段终点写法：`开脉境圆满 / 聚息境圆满 / 归元境圆满 / 御劲境圆满 / 化罡境圆满 / 通玄境圆满 / 神照境 / 返真境 / 天人境`';

export const 默认累计境界阶段推进提示词 = [
    '- 阶段推进统一采用以下跳转表：',
    '  - 开脉境：`1→2→3→4`',
    '  - 聚息境：`5→6→7→8`',
    '  - 归元境：`9→10→11→12`',
    '  - 御劲境：`13→14→15→16`',
    '  - 化罡境：`17→18→19→20`',
    '  - 通玄境：`21→22→24`'
].join('\n');

export const 默认累计境界大境突破提示词 = [
    '- 大境突破统一采用以下跳转表：',
    '  - `4→5`',
    '  - `8→9`',
    '  - `12→13`',
    '  - `16→17`',
    '  - `20→21`',
    '  - `24→27`',
    '  - `27→33`',
    '  - `33→43`'
].join('\n');

export const 默认累计境界武侠硬边界提示词 = [
    '- 武侠边界维持在凡俗武道体系内，不进入常态御空飞行、法术轰击或起死回生叙事。',
    '- 8~9 阶可短时高机动，但必须消耗精力与内力并受地形限制。',
    '- 重伤、精力 <=20%、内力 <=15% 时，高机动压制只作为短暂爆发使用，并持续受伤势与资源约束。'
].join('\n');

export const 默认累计境界速查提示词 = '凡人/普通人/未入境=正式映射值1之前的概念层；开脉=1~4；聚息=5~8；归元=9~12；御劲=13~16；化罡=17~20；通玄初/中/圆满=21/22/24；神照/返真/天人=27/33/43。';

const 清理映射区块正文 = (block: string, schema: 境界映射母板): string => {
    const lines = (block || '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => Boolean(line) && !/^使用策略[:：]/.test(line));
    return lines.length > 0
        ? lines.join('\n')
        : schema.mapping.map((item) => `${item.level} => ${item.label}`).join('\n');
};

const 拆分九阶命名与能力边界正文 = (block: string): { 九阶命名提示词: string; 能力边界提示词: string } => {
    const normalized = (block || '').trim();
    if (!normalized) {
        return {
            九阶命名提示词: 默认累计境界九阶命名提示词,
            能力边界提示词: 默认累计境界能力边界提示词
        };
    }
    const lines = normalized
        .split('\n')
        .map((line) => line.trimEnd())
        .filter(Boolean);
    const abilityIndex = lines.findIndex((line) => line.trim().startsWith('- 境界能力边界'));
    if (abilityIndex <= 0) {
        return {
            九阶命名提示词: normalized,
            能力边界提示词: 默认累计境界能力边界提示词
        };
    }
    return {
        九阶命名提示词: lines.slice(0, abilityIndex).join('\n').trim(),
        能力边界提示词: lines.slice(abilityIndex).join('\n').trim()
    };
};

const 构建境界分段映射提示词 = (schema: 境界映射母板): string => {
    const 获取标签 = (level: number): string => schema.mapping.find((item) => item.level === level)?.label || `累计值${level}`;
    const sections = [
        { levels: [1, 2, 3, 4] as const },
        { levels: [5, 6, 7, 8] as const },
        { levels: [9, 10, 11, 12] as const },
        { levels: [13, 14, 15, 16] as const },
        { levels: [17, 18, 19, 20] as const },
        { levels: [21, 22, 24] as const },
        { levels: [27] as const },
        { levels: [33] as const },
        { levels: [43] as const }
    ];

    return sections.map((section) => {
        if (section.levels.length === 1) {
            const level = section.levels[0];
            return `- ${获取标签(level)}：\`${level}\``;
        }
        const labels = section.levels.map((level) => 获取标签(level)).join(' / ');
        const values = section.levels.map((level) => String(level)).join(' / ');
        return `- ${labels}：\`${values}\``;
    }).join('\n');
};

const 构建境界文案规则提示词 = (): string => [
    '- `角色.境界`、`社交[i].境界`、`战斗.敌方[i].境界` 等正式文案统一直接取自当前存档【境界映射母板】对应值。',
    '- 同段推进、破境、校准与展示时，优先参照【境界映射母板】、【终点文案】、【阶段推进表】与【大境突破表】，不要回写默认武侠术语。'
].join('\n');

const 构建默认境界区块集合 = (schema: 境界映射母板): 境界区块集合 => {
    const 九阶命名与能力边界 = [默认累计境界九阶命名提示词, 默认累计境界能力边界提示词].join('\n');
    return {
        境界映射母板: schema.mapping.map((item) => `${item.level} => ${item.label}`).join('\n'),
        九阶命名与能力边界,
        九阶命名提示词: 默认累计境界九阶命名提示词,
        能力边界提示词: 默认累计境界能力边界提示词,
        境界差距口径: 默认累计境界差距口径提示词,
        终点文案: 默认累计境界终点文案提示词,
        阶段推进表: 默认累计境界阶段推进提示词,
        大境突破表: 默认累计境界大境突破提示词,
        武侠硬边界: 默认累计境界武侠硬边界提示词,
        分段映射提示词: 构建境界分段映射提示词(schema),
        文案规则提示词: 构建境界文案规则提示词()
    };
};

const 读取境界区块集合 = (
    sourceText: string | undefined,
    schema: 境界映射母板
): 境界区块集合 | undefined => {
    const source = 提取境界体系正文(typeof sourceText === 'string' ? sourceText : '');
    if (!source) return undefined;
    const mappingBlock = 提取标题区块(source, '境界映射母板');
    const nineAndAbilityBlock = 提取标题区块(source, '九阶命名与能力边界');
    const diffBlock = 提取标题区块(source, '境界差距口径');
    const endpointBlock = 提取标题区块(source, '终点文案');
    const stageBlock = 提取标题区块(source, '阶段推进表');
    const breakthroughBlock = 提取标题区块(source, '大境突破表');
    const hardLimitBlock = 提取标题区块(source, '武侠硬边界');
    if (!mappingBlock && !nineAndAbilityBlock && !diffBlock && !endpointBlock && !stageBlock && !breakthroughBlock && !hardLimitBlock) {
        return undefined;
    }
    const split = 拆分九阶命名与能力边界正文(nineAndAbilityBlock);
    return {
        境界映射母板: 清理映射区块正文(mappingBlock, schema),
        九阶命名与能力边界: nineAndAbilityBlock.trim() || [默认累计境界九阶命名提示词, 默认累计境界能力边界提示词].join('\n'),
        九阶命名提示词: split.九阶命名提示词,
        能力边界提示词: split.能力边界提示词,
        境界差距口径: diffBlock.trim() || 默认累计境界差距口径提示词,
        终点文案: endpointBlock.trim() || 默认累计境界终点文案提示词,
        阶段推进表: stageBlock.trim() || 默认累计境界阶段推进提示词,
        大境突破表: breakthroughBlock.trim() || 默认累计境界大境突破提示词,
        武侠硬边界: hardLimitBlock.trim() || 默认累计境界武侠硬边界提示词,
        分段映射提示词: 构建境界分段映射提示词(schema),
        文案规则提示词: 构建境界文案规则提示词()
    };
};

const 读取境界区块优先级 = (params?: { realmPrompt?: string; worldPrompt?: string }, schema?: 境界映射母板): 境界区块集合 => {
    const effectiveSchema = schema || 读取境界母板优先级(params);
    return 读取境界区块集合(params?.realmPrompt, effectiveSchema)
        || 读取境界区块集合(params?.worldPrompt, effectiveSchema)
        || 构建默认境界区块集合(effectiveSchema);
};

const 构建境界区块文本 = (blocks: 境界区块集合): string => [
    '【境界映射母板】',
    blocks.境界映射母板,
    '',
    '【九阶命名与能力边界】',
    blocks.九阶命名与能力边界,
    '',
    '【境界差距口径】',
    blocks.境界差距口径,
    '',
    '【终点文案】',
    blocks.终点文案,
    '',
    '【阶段推进表】',
    blocks.阶段推进表,
    '',
    '【大境突破表】',
    blocks.大境突破表,
    '',
    '【武侠硬边界】',
    blocks.武侠硬边界
].join('\n');

export const 默认境界母板提示词 = 构建境界母板展示文本(构建默认境界母板());

export const 校验境界体系提示词完整性 = (content: string): {
    ok: boolean;
    normalizedText: string;
    missingSections: string[];
    missingMappings: number[];
    missingSubMarkers: string[];
    missingStageJumps: string[];
    missingBreakthroughJumps: string[];
} => {
    const normalizedText = 提取境界体系正文(content);
    const requiredSections = [
        '境界映射母板',
        '九阶命名与能力边界',
        '境界差距口径',
        '阶段推进表',
        '大境突破表',
        '终点文案',
        '武侠硬边界'
    ];
    const missingSections = requiredSections.filter((section) => !normalizedText.includes(`【${section}】`));
    const schema = 读取境界映射母板(normalizedText, 'realm_prompt');
    const mappedLevels = new Set((schema?.mapping || []).map((item) => item.level));
    const missingMappings = 默认累计境界映射数值列表.filter((level) => !mappedLevels.has(level));
    const nineAndAbilityBlock = 提取标题区块(normalizedText, '九阶命名与能力边界');
    const missingSubMarkers = [
        nineAndAbilityBlock.includes('九阶命名顺序固定') ? '' : '九阶命名顺序固定',
        nineAndAbilityBlock.includes('境界能力边界') ? '' : '境界能力边界'
    ].filter(Boolean);
    const stageBlock = 提取标题区块(normalizedText, '阶段推进表');
    const breakthroughBlock = 提取标题区块(normalizedText, '大境突破表');
    const missingStageJumps = 默认累计境界阶段推进跳转列表.filter((jump) => !stageBlock.includes(jump));
    const missingBreakthroughJumps = 默认累计境界大境突破跳转列表.filter((jump) => !breakthroughBlock.includes(jump));

    return {
        ok: normalizedText.length > 0
            && missingSections.length === 0
            && missingMappings.length === 0
            && missingSubMarkers.length === 0
            && missingStageJumps.length === 0
            && missingBreakthroughJumps.length === 0,
        normalizedText,
        missingSections,
        missingMappings,
        missingSubMarkers,
        missingStageJumps,
        missingBreakthroughJumps
    };
};

const 构建同人世界观模板 = (params: ReturnType<typeof 读取同人配置>): string => {
    const keepRoleRule = params.keepCanonicalCharacters
        ? '可直接保留原著角色、原著势力与其时间线位置，但要校验是否符合原著时期、立场、已知关系与性格边界。'
        : '禁止把原著角色实体直接落入世界母本；只继承原著母题、势力结构、审美、冲突机制与时代质感。';
    const strengthRule = params.fusionStrength === '显性同台'
        ? '允许原著角色与原著势力显性同台，但仍以平行线贴原著为默认基线。'
        : params.fusionStrength === '中度混编'
            ? '允许原著势力、设定与关键矛盾显性进入原创母本，但剧情推进仍先承接原著秩序，再决定偏转。'
            : '只允许吸收原著世界母题、气质与结构逻辑，不直接把原著人物关系链完整平移。';

    return [
        '【同人世界观模板】',
        `- 参考作品：${params.title}（${params.sourceType}）。`,
        `- 同人策略：${params.parallelCanonPolicy}。世界先贴原著，再允许偏转，不把结果写成完全脱离原著的二创空壳。`,
        `- 融合强度：${params.fusionStrength}。${strengthRule}`,
        `- 角色保留策略：${keepRoleRule}`,
        '- 生成出来的 world_prompt 必须显式写出以下锚点，并保持段内信息可直接被后续主剧情/规划/世界演变复用：',
        '  - 【同人基线】原著来源、时间线锚点、原著主要势力与地理承接、角色保留策略、偏转原则。',
        '  - 【原著融入原则】哪些部分严格贴原著，哪些部分允许平行线偏转，偏转触发条件是什么。',
        '  - 【原著力量常识】只做简述：说明原著力量边界、高手稀缺度、不同势力/年龄段的大致梯度，以及高端战力为何稀缺。',
        '  - 若当前存档已先生成独立境界体系，world_prompt 的力量概述、术语口径与强弱断层必须跟随该体系，只做概述，不回退默认现体系。',
        '  - world_prompt 只负责提供原著世界的力量常识与武力上限，不在本阶段展开逐层境界映射、阶段推进表或大境突破表。',
        '  - 同人 world_prompt 的境界段必须保持概述级，不得写完整境界母板、`数值 => 文案` 对照、逐层子阶段列表、阶段推进表或大境突破表。',
        '  - 若模型开始展开“原著完整境界百科”，应主动收束回概述，保留给独立境界体系提示词生成。',
        '  - 具体同人境界体系会在下一次独立请求中单独生成；此阶段不要把世界观写成境界百科。',
        '- 你生成的是长期世界母本，不是粉丝百科、角色列表或剧情梗概。'
    ].join('\n');
};

export const 构建同人运行时提示词包 = (params: {
    openingConfig?: OpeningConfig | null;
    worldPrompt?: string;
    realmPrompt?: string;
}): 同人运行时提示词包 => {
    const fandom = 读取同人配置(params.openingConfig);
    const realmSchema = 读取境界母板优先级({
        realmPrompt: params.realmPrompt,
        worldPrompt: params.worldPrompt
    });
    const realmBlocks = 读取境界区块优先级({
        realmPrompt: params.realmPrompt,
        worldPrompt: params.worldPrompt
    }, realmSchema);
    const realmPromptText = 构建境界区块文本(realmBlocks);

    if (!fandom) {
        return {
            enabled: false,
            同人设定摘要: '',
            世界观创建补丁: '',
            开局任务补丁: '',
            开局COT补丁: '',
            主剧情COT补丁: '',
            剧情规划补丁: '',
            女主规划补丁: '',
            女主思考补丁: '',
            世界演变补丁: '',
            境界母板补丁: realmPromptText,
            变量校准补丁: '',
            境界映射母板: realmSchema,
            境界区块集合: realmBlocks
        };
    }

    const 保留原著角色文本 = fandom.keepCanonicalCharacters
        ? '保留原著角色：启用。原著角色出场时，必须校验身份、时期、已知关系、性格边界与 OOC 风险。'
        : '保留原著角色：关闭。只保留原著母题与结构，不直接落原著角色实体。';
    const 融合强度文本 = fandom.fusionStrength === '显性同台'
        ? '显性同台：允许原著角色/势力同台，但仍先做原著时期与逻辑审计。'
        : fandom.fusionStrength === '中度混编'
            ? '中度混编：允许原著势力和关键矛盾进入，但叙事推进仍先贴原著秩序。'
            : '轻度映射：只借世界母题、气质与结构，不直接平移原著角色链。';
    const 同人设定摘要 = [
        '【同人设定摘要】',
        `- 当前存档同人模式：启用（${fandom.title} / ${fandom.sourceType}）。`,
        `- 默认策略：${fandom.parallelCanonPolicy}。先承接原著时期、关系网、事件顺位与世界常识，再决定偏转。`,
        `- 融合强度：${fandom.fusionStrength}。${融合强度文本}`,
        `- ${保留原著角色文本}`,
        realmSchema.source === 'realm_prompt'
            ? '- 当前独立境界体系提示词已记录专属境界映射母板；后续正文、NPC、规划、校准都按该母板执行。'
            : realmSchema.source === 'world_prompt'
                ? '- 当前独立境界体系提示词缺失，但 world_prompt 仍含旧版境界映射母板；本回合临时沿用旧存档映射。'
                : '- 当前未记录可解析的专属境界体系提示词；本回合先按默认现体系回退。'
    ].join('\n');

    return {
        enabled: true,
        同人设定摘要,
        世界观创建补丁: 构建同人世界观模板(fandom),
        开局任务补丁: [
            '【同人开局任务补丁】',
            '- 第一幕必须先核对原著时期、地点气质、人物关系常识与当前切入点是否贴原著；不通过就先修正再生成。',
            '- 若上下文已注入小说分解的 `【当前章节内容】`，必须逐项对照开场地点、时间锚点、人物出场顺位、关系基调、首个事件与信息披露顺序；未对齐前，不得开始写正文。',
            '- 若保留原著角色，原著角色出场前必须校验：是否该在这个时期出现、是否认识当前人物、是否会以这种口吻和动机行动、是否存在 OOC 风险。',
            '- 若不保留原著角色，第一幕禁止直接落原著角色实体，只能保留同题材母题、势力影子或结构承接。',
            '- 开局剧情先写“原著基线下的当下时刻”，再写偏转，不要一上来就强行改写原作大事件。',
            '- 同人开局的社交初始化优先当前章/第一章已正式登场的重要角色；若当前章没有足够证据证明主角此刻就有稳定关系网，可以留空，不为了满足数量乱造关系。',
            '- 凡是新增 `社交[]`、`玩家门派.重要成员[]`、或 `战斗.敌方[]` 对象，`姓名/名字` 字段必须明确填写；缺失姓名的对象视为非法。',
            realmPromptText
        ].join('\n\n'),
        开局COT补丁: [
            '【同人开局COT补丁】',
            '- 专门增加一轮“当前章节内容对照”：逐项校对开场地点、出场人物顺位、关系基调、第一波事件、信息披露顺序与禁止抢跑边界。',
            '- 社交初始化优先当前章/第一章已正式登场的重要角色；证据不足时允许留空，不为凑数量乱造关系。',
            '- 凡新增 `社交[]`、`玩家门派.重要成员[]`、或 `战斗.敌方[]` 对象，都要明确写出 `姓名/名字`；缺失姓名视为非法对象。',
            '- 收尾时明确说明：本回合哪些地方严格承接原著，哪些地方只是允许后续偏转。'
        ].join('\n'),
        主剧情COT补丁: [
            '【同人主剧情COT补丁】',
            '- Step0：先复核本回合是否仍处于原著允许的时间线与世界常识中，再决定推进尺度。',
            '- Step3：逐 NPC 审计其是否原著角色；若是，必须校验人设、关系边界、说话方式、行为动机与 OOC 风险。',
            '- Step4：剧情、任务、约定与世界事件要先承接原著已存在的矛盾、势力格局和事件顺位，再决定偏转。',
            '- Step5：若插入群像镜头，优先让原著矛盾与原著势力逻辑自然融入，不凭空改写原著秩序。',
            '- Step6：推进正文前先说明“本回合原著融入点 / 偏转依据 / 未改写的原著基线”。',
            '- Step9：命令落地时，凡涉及原著角色、原著事件、原著势力的新增或改动，都要能说明其不违背当前同人基线。'
        ].join('\n'),
        剧情规划补丁: [
            '【同人剧情规划补丁】',
            '- 统一规划分析先看原著已有剧情节点、关系网、冲突链与事件顺位，再决定是否补承接、迁移、清理或延后。',
            '- 若本回合命中原著角色或原著事件，补丁必须显式说明：本次是“延续原著”“平行线偏转”还是“只借结构不落实体”。',
            '- 不要为了填满规划池而硬造原创桥段；优先承接原著未完成矛盾、伏线与势力博弈。'
        ].join('\n'),
        女主规划补丁: [
            '【同人女主规划补丁】',
            '- 女主线先承接原著已有关系边界、情感顺位、人物立场与事件节点，再决定是否偏转。',
            '- 原著女性角色若被纳入女主规划，必须校验其原著身份、人设、关系边界与出场顺位，不允许为了推进而 OOC。',
            '- 非保留原著角色模式下，只吸收原著关系结构与情感母题，不直接把原著女性角色实体写进树里。'
        ].join('\n'),
        女主思考补丁: [
            '【同人女主思考补丁】',
            '- 思考时先回答：本回合女主推进是否贴原著、是否越过原著关系边界、是否提前改写原著关键节点。',
            '- 若当前推进只够形成铺垫、试探、并行偏转，就保持在该层，不强拔关系结论。'
        ].join('\n'),
        世界演变补丁: [
            '【同人世界演变补丁】',
            '- 后台世界推进先遵守原著势力逻辑、地理秩序、事件节奏与角色常识，不凭空生成与原著冲突的新秩序。',
            '- 保留原著角色时，可让原著角色/势力进入后台链路；不保留时，只继承原著母题和结构，不直接落原著实体。',
            '- 后台事件若会触碰原著关键节点，优先写成“逼近 / 发酵 / 伏动”，不要无依据提前改写原著结局。'
        ].join('\n'),
        境界母板补丁: realmPromptText,
        变量校准补丁: [
            '【同人变量生成补丁】',
            '- 校准时优先承认本存档同人设定与独立境界体系提示词里的境界映射母板，不要把原著术语自动修正回默认武侠术语。',
            '- 若原著角色、原著势力、原著时间线已在当前状态中成立，校准只做最小纠偏，不擅自抹掉同人设定。',
            '- 涉及境界、人设、关系与时间线的修正，先问“是否违背原著基线”，再问“是否违背默认项目口径”。'
        ].join('\n'),
        境界映射母板: realmSchema,
        境界区块集合: realmBlocks
    };
};

export const 应用境界体系区块替换 = (
    sourceText: string,
    bundle: Pick<同人运行时提示词包, 'enabled' | '境界区块集合'>
): string => {
    const source = typeof sourceText === 'string' ? sourceText : '';
    if (!source || bundle.enabled !== true) return source;

    const replacements: Array<[string, string]> = [
        [默认累计境界分段映射提示词, bundle.境界区块集合.分段映射提示词],
        [默认累计境界文案规则提示词, bundle.境界区块集合.文案规则提示词],
        [默认累计境界九阶命名提示词, bundle.境界区块集合.九阶命名提示词],
        [默认累计境界能力边界提示词, bundle.境界区块集合.能力边界提示词],
        [默认累计境界差距口径提示词, bundle.境界区块集合.境界差距口径],
        [默认累计境界终点文案提示词, bundle.境界区块集合.终点文案],
        [默认累计境界阶段推进提示词, bundle.境界区块集合.阶段推进表],
        [默认累计境界大境突破提示词, bundle.境界区块集合.大境突破表],
        [默认累计境界武侠硬边界提示词, bundle.境界区块集合.武侠硬边界]
    ];

    return replacements.reduce((text, [target, replacement]) => (
        target && replacement ? text.split(target).join(replacement) : text
    ), source);
};

const 默认解析境界映射值 = (realmRaw: unknown): number | undefined => {
    const realm = typeof realmRaw === 'string' ? realmRaw.trim() : '';
    if (!realm) return undefined;
    const matched = realm.match(/^开脉境\s*([一二三四五六七八九十\d]+)重$/);
    if (matched) {
        const raw = matched[1] || '';
        const chineseMap: Record<string, number> = {
            一: 1,
            二: 2,
            三: 3,
            四: 4,
            五: 5,
            六: 6,
            七: 7,
            八: 8,
            九: 9,
            十: 10
        };
        const numeric = /^\d+$/.test(raw) ? Number(raw) : chineseMap[raw];
        return Number.isFinite(numeric) ? numeric : undefined;
    }
    const normalized = 规范化境界标签(realm);
    const exact = 默认境界映射.find((item) => 规范化境界标签(item.label) === normalized);
    return exact?.level;
};

export const 解析境界映射值 = (
    realmRaw: unknown,
    options?: {
        worldPrompt?: string;
        realmPrompt?: string;
        openingConfig?: OpeningConfig | null;
    }
): number | undefined => {
    const realm = typeof realmRaw === 'string' ? realmRaw.trim() : '';
    if (!realm) return undefined;
    const normalized = 规范化境界标签(realm);
    if (!normalized) return undefined;

    const schema = 构建同人运行时提示词包({
        openingConfig: options?.openingConfig,
        worldPrompt: options?.worldPrompt,
        realmPrompt: options?.realmPrompt
    }).境界映射母板;

    const exact = schema.mapping.find((item) => 规范化境界标签(item.label) === normalized);
    if (exact) return exact.level;

    const partial = schema.mapping.find((item) => {
        const target = 规范化境界标签(item.label);
        return target && (normalized.includes(target) || target.includes(normalized));
    });
    if (partial) return partial.level;

    return 默认解析境界映射值(realm);
};
