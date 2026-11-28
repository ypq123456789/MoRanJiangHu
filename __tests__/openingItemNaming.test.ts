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

        const 补建物品 = role.物品列表.find((item: any) => item.ID === role.装备.主武器);
        expect(补建物品).toBeTruthy();
        expect(补建物品?.名称).toBe('主武器');
        expect(补建物品?.描述).not.toMatch(/补建|模型|引用/);
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
        expect(物品?.名称).toBe('内衬');
        expect(物品?.描述).not.toMatch(/补建|模型|引用/);
    });

    it('读档时还原两件衣物的普通说明，保留原 ID、耐久、词条和正常描述', () => {
        const description = '由「内衬」装备栏引用自动补建（模型未在物品列表写入该装备）。';
        const role = 规范化角色物品容器映射({
            装备: { 内衬: 'shirt', 腿部: 'pants' },
            物品列表: [
                { ID: 'shirt', 名称: '粗布衬衣', 类型: '防具', 描述: description },
                { ID: 'pants', 名称: '青布长裤', 类型: '防具', 描述: description, 当前耐久: 9, 最大耐久: 15, 词条列表: [{ 属性: '敏捷', 数值: 2 }] },
                { ID: 'token', 名称: '旧铜牌', 类型: '杂物', 描述: '背面刻着“工坊自动补建登记”。' }
            ]
        } as any);
        expect(role.装备).toMatchObject({ 内衬: 'shirt', 腿部: 'pants' });
        expect(role.物品列表.find((item) => item.ID === 'pants')).toMatchObject({
            名称: '青布长裤', 当前耐久: 9, 最大耐久: 15, 词条列表: [{ 属性: '敏捷', 数值: 2 }]
        });
        for (const item of role.物品列表.filter((item) => ['shirt', 'pants'].includes(item.ID))) {
            expect(item.描述).toBeTruthy();
            expect(item.描述).not.toMatch(/补建|模型|引用/);
        }
        expect(role.物品列表.find((item) => item.ID === 'token')?.描述).toBe('背面刻着“工坊自动补建登记”。');
    });

    it.each(['青布长裤', 'Item007'])('正式物品晚于装备引用 %s 落地时，替换同一件临时装备并保持稳定', (reference) => {
        const options = { 补建缺失装备引用: true };
        const initial = 规范化角色物品容器映射({ 装备: { 腿部: reference } } as any, options);
        const pants = { ID: 'Item007', 名称: '青布长裤', 类型: '防具', 描述: '裤脚留着手缝的针脚。', 当前耐久: 12, 最大耐久: 17 };
        const next = 规范化角色物品容器映射({ ...initial, 物品列表: [...initial.物品列表, pants] }, options);
        expect(next.装备.腿部).toBe('Item007');
        expect(next.物品列表.filter(item => item.当前装备部位 === '腿部' || item.名称 === '青布长裤' || item.ID === initial.装备.腿部)).toEqual([
            expect.objectContaining(pants)
        ]);
        expect(规范化角色物品容器映射(next).物品列表).toEqual(next.物品列表);
    });

    it('变量整表覆盖只留下正式物品时，旧装备 ID 仍能定位原件', () => {
        const options = { 补建缺失装备引用: true };
        const initial = 规范化角色物品容器映射({ 装备: { 内衬: '粗布衬衣' } } as any, options);
        const shirt = { ID: 'shirt', 名称: '粗布衬衣', 类型: '防具', 描述: '袖边有补丁。' };
        const next = 规范化角色物品容器映射({ ...initial, 物品列表: [shirt] }, options);
        expect(next.装备.内衬).toBe('shirt');
        expect(next.物品列表).toEqual([expect.objectContaining(shirt)]);
    });

    it('多个同名正式条目缺乏确切 ID 时保留各自属性和原有装备引用', () => {
        const options = { 补建缺失装备引用: true };
        const initial = 规范化角色物品容器映射({ 装备: { 腿部: '青布长裤' } } as any, options);
        const items = ['甲', '乙'].map(id => ({ ID: id, 名称: '青布长裤', 类型: '防具', 描述: id }));
        const next = 规范化角色物品容器映射({ ...initial, 物品列表: [...initial.物品列表, ...items] }, options);
        expect(next.物品列表.map(item => item.ID)).toEqual([initial.装备.腿部, '甲', '乙']);
        expect(next.装备.腿部).toBe(initial.装备.腿部);
    });

    it('出身已提供衣物说明时，穿戴的衣物承接原文且只发一件', () => {
        const role = 规范化角色物品容器映射({
            出身背景: { 名称: '裁缝学徒', 初始物品: [{ 名称: '粗布衬衣', 类型: '防具', 描述: '左袖缝有主人手绣的记号。' }] },
            装备: { 内衬: '粗布衬衣' }
        } as any, { 补建缺失装备引用: true });
        const items = role.物品列表.filter(item => item.名称 === '粗布衬衣');
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ ID: role.装备.内衬, 描述: '左袖缝有主人手绣的记号。' });
    });
});
