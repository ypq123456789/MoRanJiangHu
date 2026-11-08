import { describe, expect, it, vi } from 'vitest';
import { 执行响应命令处理 } from '../hooks/useGame/responseCommandProcessor';
import {
    规范化环境信息,
    规范化社交列表,
    规范化角色物品容器映射
} from '../hooks/useGame/stateTransforms';
import { 净化主角姓名命令, 提取可保护的主角姓名 } from '../utils/protagonistNameGuard';

const 构建角色 = (姓名: string) => 规范化角色物品容器映射({
    姓名,
    性别: '男',
    装备: {},
    物品列表: []
});

const 构建依赖 = () => ({
    规范化环境信息,
    规范化社交列表,
    规范化世界状态: (raw?: any) => raw || { 地图层级: [] },
    规范化战斗状态: (raw?: any) => raw || {},
    规范化门派状态: (raw?: any) => raw || {},
    规范化剧情状态: (raw?: any) => raw || {},
    规范化剧情规划状态: (raw?: any) => raw || {},
    规范化女主剧情规划状态: (raw?: any) => raw,
    规范化同人剧情规划状态: (raw?: any) => raw,
    规范化同人女主剧情规划状态: (raw?: any) => raw,
    规范化角色物品容器映射,
    战斗结束自动清空: (battle: any) => battle,
    设置角色: vi.fn(),
    设置环境: vi.fn(),
    设置社交: vi.fn(),
    设置世界: vi.fn(),
    设置战斗: vi.fn(),
    设置玩家门派: vi.fn(),
    设置任务列表: vi.fn(),
    设置约定列表: vi.fn(),
    设置剧情: vi.fn(),
    设置剧情规划: vi.fn(),
    设置女主剧情规划: vi.fn(),
    设置同人剧情规划: vi.fn(),
    设置同人女主剧情规划: vi.fn(),
    境界配置: undefined
} as any);

const 执行命令并取姓名 = (姓名: string, commands: any[]) => {
    const state = {
        角色: 构建角色(姓名),
        环境: 规范化环境信息({ 时间: '1:01:01:08:00', 大地点: '青云州' }),
        社交: [],
        世界: { 地图层级: [] } as any,
        战斗: {} as any,
        玩家门派: { ID: '青云宗', 名称: '青云宗' } as any,
        任务列表: [],
        约定列表: [],
        剧情: {} as any,
        剧情规划: {} as any
    };
    const result = 执行响应命令处理(
        { logs: [], tavern_commands: commands } as any,
        state as any,
        构建依赖(),
        undefined,
        { applyState: false }
    );
    return result.角色?.姓名;
};

describe('主角姓名保护工具', () => {
    it('占位名不算可保护姓名，正式姓名才保护', () => {
        expect(提取可保护的主角姓名({ 姓名: '陆凡' })).toBe('陆凡');
        expect(提取可保护的主角姓名({ 姓名: '未命名' })).toBe('');
        expect(提取可保护的主角姓名({ 姓名: '未知角色' })).toBe('');
        expect(提取可保护的主角姓名({ 姓名: '' })).toBe('');
        expect(提取可保护的主角姓名(null)).toBe('');
    });

    it('当前姓名可信时，改名命令被丢弃', () => {
        const cmd = { action: 'set', key: '角色.姓名', value: '凭空出现的名字' };
        expect(净化主角姓名命令(cmd, { 姓名: '陆凡' })).toBeNull();
        expect(净化主角姓名命令({ action: 'delete', key: '角色.姓名' }, { 姓名: '陆凡' })).toBeNull();
        expect(净化主角姓名命令({ action: 'set', key: '角色.姓名', value: '未命名' }, { 姓名: '陆凡' })).toBeNull();
    });

    it('仅大小写/空格差异视为同一姓名，保留原始显示', () => {
        const result = 净化主角姓名命令({ action: 'set', key: '角色.姓名', value: "o'connor" }, { 姓名: "O'Connor" });
        expect(result?.value).toBe("O'Connor");
    });

    it('整对象覆盖时强制带回当前姓名', () => {
        const result = 净化主角姓名命令(
            { action: 'set', key: '角色', value: { 姓名: '另一个人', 性别: '男' } },
            { 姓名: '陆凡' }
        );
        expect(result?.value?.姓名).toBe('陆凡');
        expect(result?.value?.性别).toBe('男');
    });

    it('开局占位名允许 AI 补一个正式姓名', () => {
        const cmd = { action: 'set', key: '角色.姓名', value: '墨衣客' };
        expect(净化主角姓名命令(cmd, { 姓名: '未命名' })).toEqual(cmd);
    });
});

describe('主角姓名保护接入命令处理', () => {
    it('群像剧情里 AI 改写主角姓名不会落库', () => {
        expect(执行命令并取姓名('陆凡', [
            { action: 'set', key: '角色.姓名', value: '沈青崖' }
        ])).toBe('陆凡');
    });

    it('整对象覆盖漏写姓名时保留原姓名', () => {
        expect(执行命令并取姓名('陆凡', [
            { action: 'set', key: '角色', value: { 性别: '男', 称号: '少侠' } }
        ])).toBe('陆凡');
    });

    it('同一姓名的空格/大小写变体不改变显示', () => {
        expect(执行命令并取姓名('陆凡', [
            { action: 'set', key: '角色.姓名', value: ' 陆凡 ' }
        ])).toBe('陆凡');
    });

    it('当前是占位名时仍允许 AI 落真实姓名（开局兼容）', () => {
        expect(执行命令并取姓名('未命名', [
            { action: 'set', key: '角色.姓名', value: '墨衣客' }
        ])).toBe('墨衣客');
    });
});
