import { describe, expect, it } from 'vitest';
import { 规范化角色物品容器映射 } from '../hooks/useGame/stateTransforms';

describe('开局物品与装备引用', () => {
    it('背景资产接管时不会冲掉装备栏正在引用的物品', () => {
        const role = 规范化角色物品容器映射({
            姓名: '杨培强',
            // 出身背景定义了必投资产 → 会触发「替换物品列表」分支
            出身背景: { 名称: '旁支子弟', 初始物品: [{ 名称: '家族令牌', 类型: '杂物' }] },
            装备: { 主武器: 'Item001', 胸部: 'Item002' },
            物品列表: [
                {
                    ID: 'Item001',
                    名称: '凡铁短刃',
                    类型: '武器',
                    品质: '凡品',
                    描述: '坊市寻常打铁铺所制凡铁短刃。',
                    当前耐久: 50,
                    最大耐久: 50
                },
                {
                    ID: 'Item002',
                    名称: '粗布短打内衬',
                    类型: '防具',
                    品质: '凡品',
                    描述: '浆洗干净的粗布短打内衬。',
                    当前耐久: 30,
                    最大耐久: 30
                }
            ]
        } as any, { 补建缺失装备引用: true });

        const names = role.物品列表.map((item: any) => String(item?.名称 || ''));
        expect(names).toContain('凡铁短刃');
        expect(names).toContain('粗布短打内衬');
        // 被保留的物品不应再退化成「按引用名补建」的空壳
        expect(names).not.toContain('主武器（补建）');
        expect(names).not.toContain('胸部（补建）');
    });

    it('补建装备时引用值是 ID 形态，不把 ID 当物品名', () => {
        const role = 规范化角色物品容器映射({
            姓名: '杨培强',
            装备: { 主武器: 'Item001' },
            物品列表: []
        } as any, { 补建缺失装备引用: true });

        const 补建物品 = role.物品列表.find((item: any) => String(item?.描述 || '').includes('自动补建'));
        expect(补建物品).toBeTruthy();
        expect(String(补建物品?.名称)).toBe('主武器（补建）');
        expect(String(补建物品?.名称)).not.toMatch(/^Item\d+$/);
    });

    it('历史存档里名为物品 ID 的补建装备会被改成可读名', () => {
        const role = 规范化角色物品容器映射({
            姓名: '杨培强',
            装备: { 内衬: 'itm_equip_glnsl0' },
            物品列表: [
                {
                    ID: 'itm_equip_glnsl0',
                    名称: 'itm_equip_okoer3',
                    类型: '防具',
                    描述: '由「内衬」装备栏引用自动补建（模型未在物品列表写入该装备）。',
                    当前装备部位: '内衬'
                }
            ]
        } as any, { 补建缺失装备引用: true });

        const 物品 = role.物品列表.find((item: any) => item?.ID === 'itm_equip_glnsl0');
        expect(物品).toBeTruthy();
        expect(String(物品?.名称)).toBe('内衬（补建）');
    });
});
