import { describe, expect, it } from 'vitest';
import { 创建空小说拆分数据集, 创建小说拆分任务 } from '../services/novelDecompositionStore';
import { 修复小说拆分数据集EPUB章节 } from '../services/novelDecompositionEpubRepair';
import type { 小说拆分章节结构, 小说拆分分段结构 } from '../models/novelDecomposition';

const 章节 = (id: string, 序号: number, 标题: string, 内容: string): 小说拆分章节结构 => ({
    id, 数据集ID: 'dataset-repair', 序号, 标题, 内容, 字数: 内容.length, createdAt: 1, updatedAt: 1
});

const 分段 = (id: string, status: 小说拆分分段结构['处理状态']): 小说拆分分段结构 => ({
    id, 数据集ID: 'dataset-repair', 组号: id === 'segment-1' ? 1 : 2, 标题: '旧标题', 章节范围: '旧范围',
    章节标题: [], 是否开局组: id === 'segment-1', 起始章序号: id === 'segment-1' ? 1 : 3, 结束章序号: id === 'segment-1' ? 2 : 3,
    启用注入: true, 原文内容: '', 字数: 0, 原文摘要: '', 本组概括: status === '已完成' ? '保留的概括' : '',
    开局已成立事实: [], 前组延续事实: [], 本组结束状态: [], 给下一组参考: [], 原著硬约束: [], 可提前铺垫: [],
    关键事件: [], 角色推进: [], 登场角色: [], 角色档案: [], 势力档案: [], 地图地点档案: [], 物品档案: [],
    世界观规则: [], 世界边界规则: [], 人物关系: [], 势力关系: [], 伏笔线索: [], 回收点: [], 章节节奏: [], 时间线: [],
    时间线起点: '', 时间线终点: '', 处理状态: status, 最近错误: status === '失败' ? '旧错误' : '', createdAt: 1, updatedAt: 1
});

describe('novelDecompositionEpubRepair', () => {
    it('清除地图和误拆叙事章节，同时保留能对齐的已完成分段与任务记录', () => {
        const beforeText = '程宗扬本能地找人分享喜悦。';
        const afterText = '程宗扬抬起头，不由一怔。';
        const mapText = '六朝地图';
        const dataset = 创建空小说拆分数据集({
            id: 'dataset-repair',
            来源类型: 'epub',
            每批章数: 5,
            分段模式: 'n_chapters',
            章节列表: [
                章节('old-before', 1, '第822章 一枕黄粱', beforeText),
                章节('old-false-heading', 2, '话一出口，才想起吕处女还在自闭呢。', afterText),
                章节('old-map', 3, '第823章 附录·六朝地图', mapText)
            ],
            分段列表: [分段('segment-1', '已完成'), 分段('segment-2', '失败')]
        });
        const task = 创建小说拆分任务({ 数据集ID: dataset.id, 总分段数: 2 });
        task.已完成分段ID列表 = ['segment-1'];
        task.失败分段ID列表 = ['segment-2'];
        const imported = [{
            标题: '第822章·一枕黄粱',
            内容: `${beforeText}\n话一出口，才想起吕处女还在自闭呢。\n${afterText}`,
            序号: 1,
            href: 'chapter.xhtml'
        }];

        const result = 修复小说拆分数据集EPUB章节({ dataset, tasks: [task], importedChapters: imported });

        expect(result.dataset.章节列表).toHaveLength(1);
        expect(result.dataset.章节列表[0].标题).toBe('第822章·一枕黄粱');
        expect(result.dataset.分段列表).toHaveLength(1);
        expect(result.dataset.分段列表[0]).toMatchObject({
            id: 'segment-1',
            处理状态: '已完成',
            本组概括: '保留的概括',
            起始章序号: 1,
            结束章序号: 1
        });
        expect(result.tasks[0].已完成分段ID列表).toEqual(['segment-1']);
        expect(result.tasks[0].失败分段ID列表).toEqual([]);
        expect(result.tasks[0].进度).toMatchObject({ 总分段数: 1, 已完成分段数: 1, 失败分段数: 0 });
        expect(result.summary).toMatchObject({ preservedCompletedSegments: 1, removedChapters: 2 });
    });

    it('多个旧分段合并到同一 EPUB 章节时全部重新排队，避免沿用边界已失效的结果', () => {
        const firstText = '程宗扬进入太泉古阵，发现四周景象已经改变。';
        const falseHeadingText = '话一出口，才想起吕处女还在自闭呢。';
        const lastText = '众人离开古阵以后，重新核对了各自的经历。';
        const dataset = 创建空小说拆分数据集({
            id: 'dataset-repair',
            来源类型: 'epub',
            每批章数: 2,
            分段模式: 'n_chapters',
            章节列表: [
                章节('old-first', 1, '第822章 一枕黄粱', firstText),
                章节('old-false-heading', 2, falseHeadingText, falseHeadingText),
                章节('old-last', 3, '第823章 重返人间', lastText)
            ],
            分段列表: [分段('segment-1', '已完成'), 分段('segment-2', '已完成')]
        });
        dataset.分段列表[1].本组概括 = '另一份已完成概括';
        const task = 创建小说拆分任务({ 数据集ID: dataset.id, 总分段数: 2 });
        task.已完成分段ID列表 = ['segment-1', 'segment-2'];

        const result = 修复小说拆分数据集EPUB章节({
            dataset,
            tasks: [task],
            importedChapters: [{
                标题: '第822章 一枕黄粱',
                内容: `${firstText}\n${falseHeadingText}\n${lastText}`,
                序号: 1,
                href: 'chapter3_0253.html'
            }]
        });

        expect(result.dataset.分段列表).toHaveLength(1);
        expect(result.dataset.分段列表[0]).toMatchObject({
            处理状态: '待处理',
            本组概括: '',
            起始章序号: 1,
            结束章序号: 1
        });
        expect(result.tasks[0].已完成分段ID列表).toEqual([]);
        expect(result.tasks[0].进度).toMatchObject({ 总分段数: 1, 已完成分段数: 0 });
        expect(result.summary).toMatchObject({ preservedCompletedSegments: 0, requeuedSegments: 1 });
    });

    it('新增章节按原位置分段补跑，不跨过已保留分段生成重叠范围', () => {
        const firstText = '第一章原有正文内容足够用于稳定匹配。';
        const secondText = '第二章原有正文内容足够用于稳定匹配。';
        const dataset = 创建空小说拆分数据集({
            id: 'dataset-repair',
            来源类型: 'epub',
            每批章数: 2,
            分段模式: 'n_chapters',
            章节列表: [
                章节('old-first', 1, '第1章', firstText),
                章节('old-second', 2, '第2章', secondText)
            ],
            分段列表: [分段('segment-1', '已完成'),分段('segment-2', '已完成')]
        });
        dataset.分段列表[0].起始章序号 = 1;
        dataset.分段列表[0].结束章序号 = 1;
        dataset.分段列表[1].起始章序号 = 2;
        dataset.分段列表[1].结束章序号 = 2;
        const task = 创建小说拆分任务({ 数据集ID: dataset.id, 总分段数: 2 });
        task.已完成分段ID列表 = ['segment-1', 'segment-2'];

        const result = 修复小说拆分数据集EPUB章节({
            dataset,
            tasks: [task],
            importedChapters: [
                { 标题: '第1章', 内容: firstText, 序号: 1, href: '1.html' },
                { 标题: '第2章 新增', 内容: '第一处新增正文内容。', 序号: 2, href: 'new-1.html' },
                { 标题: '第3章', 内容: secondText, 序号: 3, href: '2.html' },
                { 标题: '第4章 新增', 内容: '第二处新增正文内容。', 序号: 4, href: 'new-2.html' }
            ]
        });

        expect(result.dataset.分段列表.map((segment) => ({
            status: segment.处理状态,
            start: segment.起始章序号,
            end: segment.结束章序号
        }))).toEqual([
            { status: '已完成', start: 1, end: 1 },
            { status: '待处理', start: 2, end: 2 },
            { status: '已完成', start: 3, end: 3 },
            { status: '待处理', start: 4, end: 4 }
        ]);
    });
});
