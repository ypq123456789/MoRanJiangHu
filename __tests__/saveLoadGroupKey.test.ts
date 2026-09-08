import { describe, expect, it } from 'vitest';
import { 读取存档本地分组键 } from '../utils/saveLoadGroupKey';

describe('读取存档本地分组键', () => {
    it('玩家使用同一角色名"陆凡"开了多档（不同存档哈希），不会按角色名合并到同一时间树', () => {
        const a = { id: 1, 角色数据: { 姓名: '陆凡' }, 元数据: { 存档哈希: 'aaaaaaaaaaaaaaaa' } } as any;
        const b = { id: 2, 角色数据: { 姓名: '陆凡' }, 元数据: { 存档哈希: 'bbbbbbbbbbbbbbbb' } } as any;
        const c = { id: 3, 角色数据: { 姓名: '陆凡' }, 元数据: { 存档哈希: 'cccccccccccccccc' } } as any;

        expect(读取存档本地分组键(a)).not.toBe(读取存档本地分组键(b));
        expect(读取存档本地分组键(b)).not.toBe(读取存档本地分组键(c));
        expect(读取存档本地分组键(a)).not.toBe(读取存档本地分组键(c));
    });

    it('带 存档系列ID 的新谱系存档优先使用 seriesId', () => {
        const save = { id: 1, 角色数据: { 姓名: '任何' }, 元数据: { 存档系列ID: 'series-abc', 存档哈希: 'aaa' } } as any;
        expect(读取存档本地分组键(save)).toBe('series-abc');
    });

    it('旧谱系存档退回 存档根节点哈希', () => {
        const save = { id: 1, 角色数据: { 姓名: '任何' }, 元数据: { 存档根节点哈希: 'root-hash-1', 存档哈希: 'aaa' } } as any;
        expect(读取存档本地分组键(save)).toBe('root-hash-1');
    });

    it('毫无谱系元数据的旧存档至少按 存档哈希 分组', () => {
        const save = { id: 1, 角色数据: { 姓名: '陆凡' }, 元数据: { 存档哈希: 'only-hash' } } as any;
        expect(读取存档本地分组键(save)).toBe('legacy-hash:only-hash');
    });

    it('连 存档哈希 都缺失的存档按 id 分组', () => {
        const save = { id: 42, 角色数据: { 姓名: '陆凡' }, 元数据: {} } as any;
        expect(读取存档本地分组键(save)).toBe('legacy-id:42');
    });
});
