import { describe, expect, it } from 'vitest';
import { 获取世界观生成系统提示词 } from '../prompts/runtime/worldGeneration';
import { 世界变量结构参考提示词 } from '../prompts/runtime/worldDataSchema';
import { 构建地图更新用户提示词 } from '../hooks/useGame/mapUpdateWorkflow';

describe('地图层级命名提示词', () => {
    it('世界基底生成阶段就要求城镇用真实地名、据点归入场所层', () => {
        const prompt = 获取世界观生成系统提示词({ 生成世界基底: true } as any, null);
        expect(prompt).toContain('【地图层级与名称必须严格对应（硬性规则）】');
        expect(prompt).toContain('扬州');
        expect(prompt).toContain('城镇层禁止写');
        expect(prompt).toContain('父级ID 必须指向层级正好高一级的已有节点');
        expect(prompt).toContain('生成后逐节点自检');
    });

    it('世界数据参考对世界演化同样生效', () => {
        expect(世界变量结构参考提示词).toContain('【地图层级与名称必须严格对应（硬性规则）】');
        expect(世界变量结构参考提示词).toContain('华山派');
        expect(世界变量结构参考提示词).toContain('不能直接作为地图节点名称');
    });

    it('旧档重建与自动增量更新都带命名契约，且不再把中地点说成大洲', () => {
        const params = {
            mode: 'memory_regenerate' as const,
            环境: { 大地点: '九州', 中地点: '临安府', 小地点: '钱塘码头区' },
            世界: { 地图层级: [{ ID: 'DT-001', 名称: '九州', 层级: '大地点', 父级ID: '' }] },
            社交: [],
        };
        const rebuild = 构建地图更新用户提示词(params);
        expect(rebuild).toContain('【地图层级与名称必须严格对应（硬性规则）】');
        expect(rebuild).toContain('旧档重建同样按新口径命名');
        expect(rebuild).not.toContain('中地点=大洲/区域');

        const incremental = 构建地图更新用户提示词({ ...params, mode: 'auto_incremental' });
        expect(incremental).toContain('小地点（界面显示：城镇）');
        expect(incremental).toContain('城镇层禁止写');
        expect(incremental).toContain('命名自检');
        expect(incremental).toContain('水浪帮大营');
    });
});
