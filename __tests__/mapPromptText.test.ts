import { describe, expect, it } from 'vitest';
import { 构建地图地点树文本, 构建地图上下文提示词 } from '../utils/mapPromptText';

const 世界 = {
    地图层级: [
        { ID: 'DT-001', 名称: '沧溟神州', 层级: '寰宇', 父级ID: '', 描述: '整个世界' },
        { ID: 'DT-002', 名称: '江南水郡', 层级: '大地点', 父级ID: 'DT-001', 描述: '水网密布', 控制势力: '盐铁商盟' },
        { ID: 'DT-003', 名称: '临安府', 层级: '中地点', 父级ID: '江南水郡', 描述: '江南首府' },
        { ID: 'DT-004', 名称: '钱塘码头区', 层级: '小地点', 父级ID: 'DT-003', 描述: '水运枢纽' },
        { ID: 'DT-005', 名称: '水狼帮大营', 层级: '区地点', 父级ID: 'DT-004', 描述: '帮会据点', 控制势力: '水狼帮' },
        { ID: 'DT-006', 名称: '地下密室', 层级: '子地点', 父级ID: 'DT-005', 描述: '藏货' },
    ],
} as any;

describe('地图提示词上下文', () => {
    it('输出真实父子树而不是扁平链，父级ID 可以写名称', () => {
        const text = 构建地图地点树文本(世界);
        expect(text).toContain('[寰宇·界域] 沧溟神州');
        expect(text).toContain('[大地点·大陆] 江南水郡');
        expect(text).toContain('控制:盐铁商盟');
        expect(text).toContain('└ [子地点·房间] 地下密室');
        expect(text.indexOf('江南水郡')).toBeLessThan(text.indexOf('临安府'));
        expect(text).not.toContain(' > [');
    });

    it('把当前地点链、人物落点与剧情使用规则一起注入', () => {
        const text = 构建地图上下文提示词(
            世界,
            { 大地点: '江南水郡', 中地点: '临安府', 小地点: '钱塘码头区', 具体地点: '水狼帮大营' },
            [{ 姓名: '杨培强', 是否在场: true, 位置路径: '临安府 > 钱塘码头区 > 水狼帮大营' }]
        );
        expect(text).toContain('【地图地点树（权威数据；写剧情只能引用这里已有的地点名称）】');
        expect(text).toContain('【当前地点链】江南水郡 > 临安府 > 钱塘码头区 > 水狼帮大营');
        expect(text).toContain('- 杨培强｜在场｜位置：临安府 > 钱塘码头区 > 水狼帮大营');
        expect(text).toContain('叙事核心');
        expect(text).toContain('城镇层只写城镇专名');
    });

    it('节点超限时如实告知，不暗示未列出的地点可以引用', () => {
        const text = 构建地图地点树文本(世界, { 最大节点数: 3 });
        expect(text).toContain('另有');
        expect(text).toContain('不要臆造它们的名称');
    });
});
