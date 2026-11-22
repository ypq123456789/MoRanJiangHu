import { describe, expect, it } from 'vitest';
import { 创意工坊模块列表, type 创意工坊模块条目 } from '../data/creativeWorkshopModules';
import {
    buildCreativeWorkshopContentFingerprint,
    buildCreativeWorkshopLogicalKey,
    filterCreativeWorkshopDuplicates,
    filterCreativeWorkshopLogicalDuplicates,
    isOfficialCreativeWorkshopDuplicate,
    normalizeCreativeWorkshopTitle
} from '../utils/creativeWorkshopDedupe';

const cloneOfficialAsCommunity = (entry: 创意工坊模块条目): 创意工坊模块条目 => ({
    ...JSON.parse(JSON.stringify(entry)),
    id: `cloud-copy-${entry.id}`,
    source: 'cloud',
    contributor: '玩家贡献',
    createdAt: '2026-05-29T00:00:00.000Z',
    updatedAt: '2026-05-29T00:00:00.000Z',
    downloadUrl: '/api/workshop/modules?action=download&id=cloud-copy'
});

describe('创意工坊官方重复内容拦截', () => {
    it('用内容指纹识别官方模板被换来源重复贡献', () => {
        const official = 创意工坊模块列表[0];
        const communityCopy = cloneOfficialAsCommunity(official);

        expect(buildCreativeWorkshopContentFingerprint(communityCopy)).toBe(buildCreativeWorkshopContentFingerprint(official));
        expect(isOfficialCreativeWorkshopDuplicate(communityCopy, 创意工坊模块列表)).toBe(true);
    });

    it('列表合并时保留官方模板并过滤社区重复项', () => {
        const official = 创意工坊模块列表[0];
        const communityCopy = cloneOfficialAsCommunity(official);
        const entries = filterCreativeWorkshopDuplicates([official, communityCopy]);

        expect(entries).toHaveLength(1);
        expect(entries[0]).toBe(official);
    });

    it('玩家真正改过内容后不视为官方重复', () => {
        const official = 创意工坊模块列表[0];
        const changed = {
            ...cloneOfficialAsCommunity(official),
            description: `${official.description} 玩家新增了一条独立规则。`
        };

        expect(isOfficialCreativeWorkshopDuplicate(changed, 创意工坊模块列表)).toBe(false);
    });
});

const 创建模式包 = (params: {
    id: string;
    title: string;
    mode: string;
    source: 创意工坊模块条目['source'];
    updatedAt?: string;
}): 创意工坊模块条目 => ({
    id: params.id,
    type: 'topic',
    workshopKind: 'standard_module',
    formatVersion: 2,
    title: params.title,
    subtitle: `${params.mode} · 小说分解同人模式包`,
    description: `由《${params.title}》小说分解数据集生成的同人模式包。`,
    tags: [params.mode, '模式包'],
    payload: {
        schema: 'moranjianghu-creative-workshop-mode-package',
        version: 3,
        packagePart: 'mode_package',
        mode: params.mode,
        suiteId: params.id,
        suiteTitle: params.title,
        // 每次生成/发布都会变的部分：suiteId、时间戳、来源快照
        generatedAt: params.updatedAt || '',
        manualWorldPrompt: `${params.title} 的题材口径`
    },
    injectionPreview: [`完整模式包：${params.title}`, params.updatedAt || ''],
    source: params.source,
    createdAt: params.updatedAt,
    updatedAt: params.updatedAt
});

describe('模式包展示标题规范化', () => {
    it('标题已经写了题材前缀时不再重复拼接', () => {
        const entry = 创建模式包({ id: 'pkg-yaoji', title: '仙侠·缚妖姬', mode: '仙侠', source: 'cloud' });

        expect(normalizeCreativeWorkshopTitle(entry)).toBe('缚妖姬');
    });

    it('只写了题材片段的前缀（都市·青春版）也会收敛成「现代都市 · 青春版」', () => {
        const entry = 创建模式包({ id: 'pkg-youth', title: '都市·青春版', mode: '现代都市', source: 'cloud' });

        expect(normalizeCreativeWorkshopTitle(entry)).toBe('青春版');
    });

    it('标题里的普通分隔不会被误当成题材前缀', () => {
        const entry = 创建模式包({ id: 'pkg-zhuxian', title: '《诛仙》（校对版全本）作者：萧鼎同人模式包', mode: '仙侠', source: 'cloud' });

        expect(normalizeCreativeWorkshopTitle(entry)).toBe('《诛仙》（校对版全本）作者：萧鼎同人模式包');
    });

    it('没有分隔符的官方标题保持原样', () => {
        const entry = 创建模式包({ id: 'pkg-wuxia', title: '武侠模式包', mode: '武侠', source: 'builtin' });

        expect(normalizeCreativeWorkshopTitle(entry)).toBe('武侠模式包');
    });
});

describe('模式包按作品去重', () => {
    it('同一作品被重复发布的多个云端副本只保留最新一条', () => {
        const older = 创建模式包({
            id: 'CWM-TOPIC-20260804231216-5N231B4I',
            title: '《六朝清羽记》同人模式包',
            mode: '武侠',
            source: 'cloud',
            updatedAt: '2026-08-04T15:12:16.771Z'
        });
        const newer = 创建模式包({
            id: 'CWM-TOPIC-20260805080709-216N1453',
            title: '《六朝清羽记》同人模式包',
            mode: '武侠',
            source: 'cloud',
            updatedAt: '2026-08-05T00:07:09.647Z'
        });

        // 内容指纹认不出来（payload 里的 suiteId / 时间戳不同），逻辑身份能认出来
        expect(buildCreativeWorkshopContentFingerprint(older)).not.toBe(buildCreativeWorkshopContentFingerprint(newer));
        expect(buildCreativeWorkshopLogicalKey(older)).toBe(buildCreativeWorkshopLogicalKey(newer));

        const deduped = filterCreativeWorkshopLogicalDuplicates([older, newer]);

        expect(deduped).toHaveLength(1);
        expect(deduped[0].id).toBe(newer.id);
    });

    it('标题带题材前缀与不带前缀的同名包视为同一个作品', () => {
        const prefixed = 创建模式包({ id: 'pkg-a', title: '仙侠·缚妖姬', mode: '仙侠', source: 'cloud' });
        const plain = 创建模式包({ id: 'pkg-b', title: '缚妖姬', mode: '仙侠', source: 'cloud' });

        const deduped = filterCreativeWorkshopLogicalDuplicates([prefixed, plain]);

        expect(deduped).toHaveLength(1);
    });

    it('本地导入优先于社区副本，避免用户自己改过的包被顶掉', () => {
        const cloud = 创建模式包({
            id: 'CWM-TOPIC-20260918015129-5O6O3O4K',
            title: '《诛仙》同人模式包',
            mode: '仙侠',
            source: 'cloud',
            updatedAt: '2026-09-17T17:51:29.293Z'
        });
        const local = 创建模式包({
            id: 'local-novel-dataset-zhuxian-mode-package',
            title: '《诛仙》同人模式包',
            mode: '仙侠',
            source: 'local',
            updatedAt: '2026-09-01T00:00:00.000Z'
        });

        const deduped = filterCreativeWorkshopLogicalDuplicates([cloud, local]);

        expect(deduped).toHaveLength(1);
        expect(deduped[0].source).toBe('local');
    });

    it('不同作品、不同题材不会被合并', () => {
        const entries = [
            创建模式包({ id: 'pkg-1', title: '缚妖姬', mode: '仙侠', source: 'cloud' }),
            创建模式包({ id: 'pkg-2', title: '缚妖姬', mode: '现代都市', source: 'cloud' }),
            创建模式包({ id: 'pkg-3', title: '太阴界', mode: '仙侠', source: 'cloud' })
        ];

        expect(filterCreativeWorkshopLogicalDuplicates(entries)).toHaveLength(3);
    });

    it('官方内置模式包不参与逻辑去重，保持原有稳定键', () => {
        const builtinA = 创建模式包({ id: 'mode-package-武侠', title: '武侠模式包', mode: '武侠', source: 'builtin' });
        const builtinB = 创建模式包({ id: 'mode-package-武侠-copy', title: '武侠模式包', mode: '武侠', source: 'builtin' });

        expect(filterCreativeWorkshopLogicalDuplicates([builtinA, builtinB])).toHaveLength(2);
    });
});
