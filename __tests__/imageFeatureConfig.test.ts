import { describe, expect, it } from 'vitest';
import { 解析文生图功能配置 } from '../utils/imageFeatureConfig';
import type { 接口设置结构 } from '../types';

const 构造接口设置 = (override: Record<string, unknown>): 接口设置结构 => ({
    功能模型占位: override as any
}) as unknown as 接口设置结构;

describe('解析文生图功能配置', () => {
    // [回归] 玩家反馈：把"文生图总开关"关掉后仍一直报生图失败。
    // 旧实现把 总开关 OR 上 NPC/物品/场景自动任务开关，导致关掉总开关但
    // 子开关还在时 总开关 仍为 true、自动生图照常触发并失败。
    it('关掉文生图总开关但 NPC 子开关仍在时：总开关必须为 false，NPC开关也为 false', () => {
        const apiConfig = 构造接口设置({
            文生图功能启用: false,
            NPC生图启用: true,
            物品自动生图启用: true,
            自动场景生图启用: true
        });
        const config = 解析文生图功能配置(apiConfig);
        expect(config.总开关).toBe(false);
        expect(config.NPC开关).toBe(false);
        expect(config.物品开关).toBe(false);
        expect(config.场景开关).toBe(false);
    });

    it('开启文生图总开关且 NPC 子开关也开启时：总开关/NPC开关都为 true', () => {
        const apiConfig = 构造接口设置({
            文生图功能启用: true,
            NPC生图启用: true
        });
        const config = 解析文生图功能配置(apiConfig);
        expect(config.总开关).toBe(true);
        expect(config.NPC开关).toBe(true);
    });

    it('开启文生图总开关但 NPC 子开关关闭时：总开关 true，NPC开关 false', () => {
        const apiConfig = 构造接口设置({
            文生图功能启用: true,
            NPC生图启用: false
        });
        const config = 解析文生图功能配置(apiConfig);
        expect(config.总开关).toBe(true);
        expect(config.NPC开关).toBe(false);
    });

    it('所有开关全关时：所有判断位都为 false', () => {
        const apiConfig = 构造接口设置({
            文生图功能启用: false,
            NPC生图启用: false,
            物品自动生图启用: false,
            自动场景生图启用: false
        });
        const config = 解析文生图功能配置(apiConfig);
        expect(config.总开关).toBe(false);
        expect(config.NPC开关).toBe(false);
        expect(config.物品开关).toBe(false);
        expect(config.场景开关).toBe(false);
    });

    it('apiConfig 为空或缺失功能模型占位时：总开关与所有子开关都为 false', () => {
        expect(解析文生图功能配置(null).总开关).toBe(false);
        expect(解析文生图功能配置(undefined).总开关).toBe(false);
        expect(解析文生图功能配置({} as any).总开关).toBe(false);
        expect(解析文生图功能配置(构造接口设置({})).总开关).toBe(false);
    });
});
