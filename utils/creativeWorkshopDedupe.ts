import type { 创意工坊模块条目 } from '../data/creativeWorkshopModules';

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

const sortValue = (value: unknown): JsonLike => {
    if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(sortValue);
    }
    if (value && typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, JsonLike>>((acc, key) => {
            const raw = (value as Record<string, unknown>)[key];
            const sorted = sortValue(raw);
            if (sorted !== undefined && raw !== undefined && raw !== null) acc[key] = sorted;
            return acc;
        }, {});
    }
    return null;
};

const normalizeText = (value: unknown): string => String(value ?? '').trim().replace(/\s+/g, ' ');

const normalizeList = (value: unknown): string[] => Array.isArray(value)
    ? value.map(normalizeText).filter(Boolean)
    : [];

export const buildCreativeWorkshopContentFingerprint = (entry: Pick<创意工坊模块条目, 'type' | 'title' | 'subtitle' | 'description' | 'tags' | 'payload' | 'injectionPreview' | 'preset' | 'formatVersion' | 'workshopKind' | 'contentBlocks' | 'usagePrompt' | 'safetyNotes'>): string => {
    return JSON.stringify(sortValue({
        type: entry.type,
        formatVersion: entry.formatVersion || null,
        workshopKind: entry.workshopKind || null,
        title: normalizeText(entry.title),
        subtitle: normalizeText(entry.subtitle),
        description: normalizeText(entry.description),
        tags: normalizeList(entry.tags),
        payload: entry.payload || {},
        contentBlocks: entry.contentBlocks || [],
        usagePrompt: normalizeText(entry.usagePrompt),
        safetyNotes: normalizeList(entry.safetyNotes),
        injectionPreview: normalizeList(entry.injectionPreview),
        preset: entry.preset || null
    }));
};

export const isOfficialCreativeWorkshopDuplicate = (
    entry: Pick<创意工坊模块条目, 'type' | 'title' | 'subtitle' | 'description' | 'tags' | 'payload' | 'injectionPreview' | 'preset' | 'formatVersion' | 'workshopKind' | 'contentBlocks' | 'usagePrompt' | 'safetyNotes'>,
    officialEntries: Array<Pick<创意工坊模块条目, 'type' | 'title' | 'subtitle' | 'description' | 'tags' | 'payload' | 'injectionPreview' | 'preset' | 'formatVersion' | 'workshopKind' | 'contentBlocks' | 'usagePrompt' | 'safetyNotes'>>
): boolean => {
    const fingerprint = buildCreativeWorkshopContentFingerprint(entry);
    return officialEntries.some((official) => buildCreativeWorkshopContentFingerprint(official) === fingerprint);
};

export const filterCreativeWorkshopDuplicates = (entries: 创意工坊模块条目[]): 创意工坊模块条目[] => {
    const seen = new Set<string>();
    return entries.filter((entry) => {
        const fingerprint = buildCreativeWorkshopContentFingerprint(entry);
        if (seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
    });
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 读取模式包挂靠的题材（与「读取模块模式」同口径，但不做白名单过滤）。 */
export const readCreativeWorkshopMode = (entry: Pick<创意工坊模块条目, 'payload' | 'preset'>): string => {
    const raw = entry.preset?.openingConfig?.题材模式 ?? (entry.payload as any)?.mode ?? (entry.payload as any)?.value;
    return typeof raw === 'string' ? raw.trim() : '';
};

/**
 * 去掉标题里重复写过的题材前缀：题材「仙侠」+ 标题「仙侠·缚妖姬」→「缚妖姬」。
 * 只剥离「题材 + 分隔符」开头的情况，像「武侠模式包」这类没有分隔符的标题保持原样。
 */
export const normalizeCreativeWorkshopTitle = (entry: Pick<创意工坊模块条目, 'title' | 'payload' | 'preset'>): string => {
    const title = normalizeText(entry.title);
    const mode = readCreativeWorkshopMode(entry);
    if (!title || !mode) return title;
    const pattern = new RegExp(`^[【\\[]?${escapeRegExp(mode)}[】\\]]?\\s*[·•・\\-—–|｜/:：]\\s*`);
    const stripped = title.replace(pattern, '').trim();
    if (stripped && stripped !== title) return stripped;
    // 「现代都市」+「都市·青春版」这类只写了题材片段前缀的情况，也一并去掉
    const segmented = /^([^·•・\-—–|｜/:：]{2,})\s*[·•・\-—–|｜/:：]\s*(.+)$/.exec(title);
    if (segmented && mode.includes(segmented[1].trim())) {
        return segmented[2].trim() || title;
    }
    return title;
};

/**
 * 逻辑身份：同一题材下的同名模式包视为同一个作品。
 * 用于收敛「同一作品被反复生成/反复发布」造成的多条记录——这类副本的 payload 里
 * suiteId、时间戳、来源模块快照都不一样，内容指纹识别不出来。
 */
export const buildCreativeWorkshopLogicalKey = (entry: Pick<创意工坊模块条目, 'title' | 'payload' | 'preset'>): string => (
    `${readCreativeWorkshopMode(entry) || '通用'}|${normalizeCreativeWorkshopTitle(entry).replace(/\s+/g, '')}`
);

const logicalSourceRank = (entry: 创意工坊模块条目): number => {
    if (entry.source === 'local') return 3;
    if (entry.source === 'cloud') return 2;
    return 1;
};

const logicalUpdatedAt = (entry: 创意工坊模块条目): number => {
    const time = Date.parse(String(entry.updatedAt || entry.createdAt || ''));
    return Number.isFinite(time) ? time : 0;
};

/**
 * 模式包按逻辑身份去重，只保留一条：本地导入优先，其次社区最新，官方内置不参与（保持稳定键）。
 * 非模式包（酒馆预设 / 生图工作流 / 开局）不受影响。
 */
export const filterCreativeWorkshopLogicalDuplicates = (entries: 创意工坊模块条目[]): 创意工坊模块条目[] => {
    const participates = (entry: 创意工坊模块条目): boolean => entry.type === 'topic' && entry.source !== 'builtin';
    const best = new Map<string, 创意工坊模块条目>();
    entries.forEach((entry) => {
        if (!participates(entry)) return;
        const key = buildCreativeWorkshopLogicalKey(entry);
        const current = best.get(key);
        if (!current) {
            best.set(key, entry);
            return;
        }
        const rank = logicalSourceRank(entry);
        const currentRank = logicalSourceRank(current);
        if (rank > currentRank || (rank === currentRank && logicalUpdatedAt(entry) > logicalUpdatedAt(current))) {
            best.set(key, entry);
        }
    });
    return entries.filter((entry) => {
        if (!participates(entry)) return true;
        return best.get(buildCreativeWorkshopLogicalKey(entry)) === entry;
    });
};
