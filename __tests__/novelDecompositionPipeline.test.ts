import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as textAIService from '../services/ai/text';
import { 从原始文本提取章节, 解析小说拆分分段 } from '../services/novelDecompositionPipeline';
import { 创建空小说拆分数据集 } from '../services/novelDecompositionStore';
import type { 小说拆分分段结构 } from '../types';

vi.mock('../services/ai/text', () => ({
    generateNovelDecomposition: vi.fn()
}));

const 创建分段 = (patch: Partial<小说拆分分段结构>): 小说拆分分段结构 => ({
    id: patch.id || `segment-${patch.组号 || 1}`,
    数据集ID: 'dataset-novel-pipeline',
    组号: patch.组号 || 1,
    标题: patch.标题 || '测试分段',
    章节范围: patch.章节范围 || '第1章',
    章节标题: patch.章节标题 || ['第1章'],
    是否开局组: patch.是否开局组 ?? false,
    起始章序号: patch.起始章序号 || 1,
    结束章序号: patch.结束章序号 || 1,
    启用注入: patch.启用注入 ?? true,
    原文内容: patch.原文内容 || '测试原文',
    字数: patch.字数 || 4,
    原文摘要: patch.原文摘要 || '',
    本组概括: patch.本组概括 || '',
    开局已成立事实: patch.开局已成立事实 || [],
    前组延续事实: patch.前组延续事实 || [],
    本组结束状态: patch.本组结束状态 || [],
    给下一组参考: patch.给下一组参考 || [],
    原著硬约束: patch.原著硬约束 || [],
    可提前铺垫: patch.可提前铺垫 || [],
    关键事件: patch.关键事件 || [],
    角色推进: patch.角色推进 || [],
    登场角色: patch.登场角色 || [],
    角色档案: patch.角色档案 || [],
    势力档案: patch.势力档案 || [],
    地图地点档案: patch.地图地点档案 || [],
    物品档案: patch.物品档案 || [],
    世界观规则: patch.世界观规则 || [],
    世界边界规则: patch.世界边界规则 || [],
    人物关系: patch.人物关系 || [],
    势力关系: patch.势力关系 || [],
    伏笔线索: patch.伏笔线索 || [],
    回收点: patch.回收点 || [],
    章节节奏: patch.章节节奏 || [],
    时间线: patch.时间线 || [],
    时间线起点: patch.时间线起点 || '0001:01:01:00:00',
    时间线终点: patch.时间线终点 || '0001:01:01:00:00',
    处理状态: patch.处理状态 || '待处理',
    最近错误: patch.最近错误 || '',
    createdAt: patch.createdAt || 1,
    updatedAt: patch.updatedAt || 1
});

describe('novelDecompositionPipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('叙事残句不会被识别为卷标题并污染后续章节标题', () => {
        const chapters = 从原始文本提取章节(创建空小说拆分数据集({
            id: 'dataset-heading-pollution',
            原始文本: [
                '第一部分：命运。就是命运。毁灭也好，反击也罢，最终是命运。智能生物的命运。｜天石',
                '这是上一段正文。',
                '',
                '第311章 青葡',
                '这是青葡章节正文。'
            ].join('\n')
        }));

        expect(chapters.map((chapter) => chapter.标题)).toContain('第311章 青葡');
        expect(chapters.every((chapter) => !chapter.标题.includes('命运。就是命运'))).toBe(true);
    });

    it('以“话一”开头的叙事句不会被误识别成“第一话”章节标题', () => {
        const chapters = 从原始文本提取章节(创建空小说拆分数据集({
            id: 'dataset-dialogue-prefix',
            原始文本: [
                '第822章 一枕黄粱',
                '程宗扬本能地找人分享喜悦。',
                '话一出口，才想起吕处女还在自闭呢。',
                '程宗扬抬起头，不由一怔。',
                '',
                '第823章 羽化登仙',
                '下一章正文。'
            ].join('\n')
        }));

        expect(chapters).toHaveLength(2);
        expect(chapters[0].标题).toBe('第822章 一枕黄粱');
        expect(chapters[0].内容).toContain('话一出口，才想起吕处女还在自闭呢。');
        expect(chapters[1].标题).toBe('第823章 羽化登仙');
    });

    it('补齐关键事件缺失的最早和最迟开始时间，避免长任务停在同一分段', async () => {
        vi.mocked(textAIService.generateNovelDecomposition).mockResolvedValueOnce({
            groupNumber: 43,
            chapterRange: '谈仙论道-山河大印肖负青天',
            chapterTitles: ['谈仙论道', '山河大印肖负青天'],
            isOpeningGroup: false,
            summary: '青霞门清算之战爆发，局势进入新的转折。',
            openingFacts: [],
            continuationFacts: [],
            endStates: ['青霞门清算结束'],
            nextGroupReferences: [],
            hardConstraints: [],
            foreshadowing: [],
            appearingCharacters: ['叶凡'],
            characterProfiles: [],
            factionProfiles: [],
            locationProfiles: [],
            itemProfiles: [],
            worldRules: [],
            worldBoundaryRules: [],
            characterRelations: [],
            factionRelations: [],
            foreshadowingThreads: [],
            payoffPoints: [],
            chapterRhythm: [],
            timelineStart: '0001:02:12:00:00',
            timelineEnd: '0001:02:13:00:00',
            keyEvents: [{
                事件名: '青霞门清算之战',
                事件说明: '叶凡卷入青霞门清算。',
                开始时间: '0001:02:12:08:00',
                最早开始时间: '',
                最迟开始时间: '',
                结束时间: '0001:02:12:12:00',
                前置条件: ['清算开启'],
                触发条件: ['双方冲突爆发'],
                阻断条件: [],
                事件结果: ['清算告一段落'],
                对下一组影响: [],
                信息可见性: { 谁知道: ['叶凡'], 谁不知道: [], 是否仅读者视角可见: false }
            }],
            characterProgressions: [],
            rawText: ''
        });

        const segment = await 解析小说拆分分段({
            dataset: 创建空小说拆分数据集({
                id: 'dataset-novel-pipeline',
                默认时间线起点: '0001:01:01:00:00'
            }),
            segment: 创建分段({
                组号: 43,
                标题: '谈仙论道 ~ 山河大印肖负青天',
                章节范围: '谈仙论道-山河大印肖负青天'
            }),
            segmentIndex: 42,
            previousTimelineEnd: '0001:02:12:00:00',
            apiConfig: { apiKey: 'test-key' } as any
        });

        expect(segment.处理状态).toBe('已完成');
        expect(segment.关键事件[0]).toMatchObject({
            事件名: '青霞门清算之战',
            开始时间: '0001:02:12:08:00',
            最早开始时间: '0001:02:12:08:00',
            最迟开始时间: '0001:02:12:08:00',
            结束时间: '0001:02:12:12:00'
        });
    });

    it('补漏请求把上一次校验错误转成定向结构纠错要求', async () => {
        vi.mocked(textAIService.generateNovelDecomposition).mockResolvedValueOnce({
            groupNumber: 1,
            chapterRange: '第一章',
            chapterTitles: ['第一章'],
            isOpeningGroup: true,
            summary: '完成纠错。',
            openingFacts: [], continuationFacts: [], endStates: [], nextGroupReferences: [],
            hardConstraints: [], foreshadowing: [], keyEvents: [], characterProgressions: [],
            appearingCharacters: [], characterProfiles: [], factionProfiles: [], locationProfiles: [], itemProfiles: [],
            worldRules: [], worldBoundaryRules: [], characterRelations: [], factionRelations: [],
            foreshadowingThreads: [], payoffPoints: [], chapterRhythm: [],
            timelineStart: '0001:01:01:00:00', timelineEnd: '0001:01:01:01:00', rawText: ''
        });

        await 解析小说拆分分段({
            dataset: 创建空小说拆分数据集({ id: 'dataset-correction' }),
            segment: 创建分段({ id: 'segment-correction', 组号: 1 }),
            segmentIndex: 0,
            apiConfig: { apiKey: 'test-key' } as any,
            retryCorrection: '原著硬约束 #1 缺少信息可见性标注'
        } as any);

        expect(vi.mocked(textAIService.generateNovelDecomposition).mock.calls[0][0].extraPrompt).toContain('上一次失败原因');
        expect(vi.mocked(textAIService.generateNovelDecomposition).mock.calls[0][0].extraPrompt).toContain('谁知道');
        expect(vi.mocked(textAIService.generateNovelDecomposition).mock.calls[0][0].extraPrompt).toContain('不能拼进“内容”');
    });

    it('按真实时间顺序比较四位和五位年份，避免误判两万年早于六千五百年', async () => {
        vi.mocked(textAIService.generateNovelDecomposition).mockResolvedValueOnce({
            groupNumber: 44,
            chapterRange: '一个轮回-两万岁',
            chapterTitles: ['一个轮回', '两万岁'],
            isOpeningGroup: false,
            summary: '叶凡从六千五百年推进到两万年。',
            openingFacts: [],
            continuationFacts: [],
            endStates: ['时代推进到两万年'],
            nextGroupReferences: [],
            hardConstraints: [],
            foreshadowing: [],
            appearingCharacters: ['叶凡'],
            characterProfiles: [],
            factionProfiles: [],
            locationProfiles: [],
            itemProfiles: [],
            worldRules: [],
            worldBoundaryRules: [],
            characterRelations: [],
            factionRelations: [],
            foreshadowingThreads: [],
            payoffPoints: [],
            chapterRhythm: [],
            timelineStart: '6500:01:01:00:00',
            timelineEnd: '20000:01:01:00:00',
            keyEvents: [],
            characterProgressions: [],
            rawText: ''
        });

        const segment = await 解析小说拆分分段({
            dataset: 创建空小说拆分数据集({
                id: 'dataset-novel-pipeline',
                默认时间线起点: '0001:01:01:00:00'
            }),
            segment: 创建分段({
                组号: 44,
                标题: '一个轮回 ~ 两万岁',
                章节范围: '一个轮回-两万岁'
            }),
            segmentIndex: 43,
            previousTimelineEnd: '6500:01:01:00:00',
            apiConfig: { apiKey: 'test-key' } as any
        });

        expect(segment.处理状态).toBe('已完成');
        expect(segment.时间线起点).toBe('6500:01:01:00:00');
        expect(segment.时间线终点).toBe('20000:01:01:00:00');
    });
});
