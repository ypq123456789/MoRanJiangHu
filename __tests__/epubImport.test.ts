import { describe, expect, it } from 'vitest';
import { 修复EPUB相邻章节倒序, 构建EPUB章节标题, 是否跳过EPUB非正文资源 } from '../services/epubImport';

describe('epubImport', () => {
    it.each([
        ['附录·六朝地图', '六朝地图', 1],
        ['局部·晋国和昭南', '局部·晋国和昭南', 1],
        ['晋都·建康', '晋都·建康', 1],
        ['附录·六朝高手榜', '六朝高手榜（红色已殁，蓝色未确定）', 1],
        ['封底', '【未完待续】', 1]
    ])('跳过图片型非正文资源：%s', (title, text, imageCount) => {
        expect(是否跳过EPUB非正文资源({
            href: 'chapter1061.html',
            properties: '',
            title,
            chapterText: text,
            bookTitle: '六朝燕歌行',
            imageCount
        })).toBe(true);
    });

    it('不会因为正文中提到地图而跳过正常小说章节', () => {
        expect(是否跳过EPUB非正文资源({
            href: 'chapter940.html',
            properties: '',
            title: '第821章 佛有三身',
            chapterText: '程宗扬展开地图，众人围绕长安局势商议了许久。'.repeat(20),
            bookTitle: '六朝燕歌行',
            imageCount: 0
        })).toBe(false);
    });

    it('跳过带出版信息和本集简介的卷说明资源', () => {
        expect(是否跳过EPUB非正文资源({
            href: 'chapter3_0256.html',
            properties: '',
            title: '第99集·一朝登基',
            chapterText: `出版日期：2026-08-03\n【本集内容简介】\n${'这是一段卷册内容简介，不是小说正文章节。'.repeat(12)}`,
            bookTitle: '六朝燕歌行',
            imageCount: 0
        })).toBe(true);
    });

    it.each([
        ['（一）序幕篇', '【本集后记】\n这一部分是作者后记，不参与小说正文分解。'],
        ['（一）序幕篇', '【清羽散记】\n这一部分是创作杂记，不参与小说正文分解。'],
        ['（六）临安篇', `【正文拾遗】\n发布日期：2013-12-07\n${'这是后来补充的设定说明。'.repeat(20)}`],
        ['（六）临安篇', `【六朝闲谈】\n发布日期：2014-02-10\n${'这是作者与读者的隔空讨论。'.repeat(20)}`],
        ['六朝系列（共99集，832章）', '六朝系列（共99集，832章）\n作者：罗森\n版本：豪华精校版']
    ])('跳过 EPUB 书籍说明或后记资源：%s', (title, chapterText) => {
        expect(是否跳过EPUB非正文资源({
            href: 'chapter1_0001.html',
            properties: '',
            title,
            chapterText,
            bookTitle: '六朝燕歌行',
            imageCount: 0
        })).toBe(true);
    });

    it('保留数字两侧带空格的原著章节标题，不添加导入序号', () => {
        expect(构建EPUB章节标题('第 819 章 · 瓦砾齐鸣', 938)).toBe('第 819 章 · 瓦砾齐鸣');
    });

    it('修复 EPUB 中相邻两章标题恰好互换的 spine 顺序', () => {
        const chapters = [
            { 标题: '第762章·群鲛', 内容: 'chapter-762', 序号: 1, href: '0186.html' },
            { 标题: '第764章·命数', 内容: 'chapter-764', 序号: 2, href: '0187.html' },
            { 标题: '第763章·仙谕', 内容: 'chapter-763', 序号: 3, href: '0188.html' },
            { 标题: '第765章·空诏', 内容: 'chapter-765', 序号: 4, href: '0189.html' }
        ];

        expect(修复EPUB相邻章节倒序(chapters).map((chapter) => chapter.标题)).toEqual([
            '第762章·群鲛',
            '第763章·仙谕',
            '第764章·命数',
            '第765章·空诏'
        ]);
    });
});
