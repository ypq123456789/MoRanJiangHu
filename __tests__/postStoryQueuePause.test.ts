import { describe, expect, it } from 'vitest';
import { 构建待执行阶段摘要, 格式化待执行阶段说明, 需要展示后续步骤入口 } from '../utils/postStoryQueue';
import { 规范化游戏设置, 默认游戏设置 } from '../utils/gameSettings';

describe('正文后暂停后续步骤 · 阶段摘要', () => {
    it('按固定顺序输出，不随传入顺序变化', () => {
        expect(构建待执行阶段摘要({ 地图更新: true, 变量生成: true, 规划分析: true, 动态世界: true }))
            .toEqual(['变量生成', '动态世界', '规划分析', '地图更新']);
        expect(构建待执行阶段摘要({ 规划分析: true, 变量生成: true }))
            .toEqual(['变量生成', '规划分析']);
    });

    it('只把明确开启的阶段算进去，未提供配置时返回空', () => {
        expect(构建待执行阶段摘要({ 变量生成: false, 动态世界: true })).toEqual(['动态世界']);
        expect(构建待执行阶段摘要(undefined)).toEqual([]);
        expect(构建待执行阶段摘要(null)).toEqual([]);
    });

    it('没有可执行阶段时不展示入口，避免出现点了没反应的按钮', () => {
        expect(需要展示后续步骤入口([])).toBe(false);
        expect(需要展示后续步骤入口(undefined)).toBe(false);
        expect(需要展示后续步骤入口(['地图更新'])).toBe(true);
    });

    it('说明文案覆盖空列表', () => {
        expect(格式化待执行阶段说明(['变量生成', '地图更新'])).toBe('变量生成 / 地图更新');
        expect(格式化待执行阶段说明([])).toBe('当前没有需要执行的后续阶段');
    });
});

describe('正文后暂停后续步骤 · 设置开关', () => {
    it('默认关闭，老存档缺少该字段时也按关闭处理（保持全自动体验）', () => {
        expect(默认游戏设置.启用正文后暂停后续步骤).toBe(false);
        expect(规范化游戏设置({}).启用正文后暂停后续步骤).toBe(false);
        expect(规范化游戏设置({ 启用回合结束自动存档: true } as any).启用正文后暂停后续步骤).toBe(false);
    });

    it('显式开启后保留 true', () => {
        expect(规范化游戏设置({ 启用正文后暂停后续步骤: true } as any).启用正文后暂停后续步骤).toBe(true);
    });

    it('脏值（字符串/数字）不误开', () => {
        expect(规范化游戏设置({ 启用正文后暂停后续步骤: 'false' } as any).启用正文后暂停后续步骤).toBe(false);
        expect(规范化游戏设置({ 启用正文后暂停后续步骤: 0 } as any).启用正文后暂停后续步骤).toBe(false);
    });
});
