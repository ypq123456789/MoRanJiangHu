import { describe, expect, it } from 'vitest';
import {
    解析题材包修炼默认值,
    解析当前题材修炼默认值,
    应用题材包修炼默认值,
    标记修炼开关已手动设置
} from '../utils/modeCultivationDefault';
import { 构建官方模式运行时配置 } from '../utils/modeRuntimeProfile';
import type { ModeRuntimeProfile } from '../models/system';

const 官方包 = 构建官方模式运行时配置('灵气复苏');

const 自定义包 = (usesCultivation: boolean, modeId = 'pack-modern-no-cultivation'): ModeRuntimeProfile => ({
    ...构建官方模式运行时配置('灵气复苏'),
    identity: {
        modeId,
        displayName: '现代写实包',
        baseMode: '灵气复苏',
        isModern: true,
        usesCultivation,
        isApocalypse: false,
        isSurvival: false,
        isFandomIp: false
    }
});

describe('题材包修炼默认值解析', () => {
    it('自定义包声明关闭时返回 false', () => {
        expect(解析题材包修炼默认值('灵气复苏', 自定义包(false))).toBe(false);
    });

    it('自定义包声明开启时返回 true', () => {
        expect(解析题材包修炼默认值('灵气复苏', 自定义包(true))).toBe(true);
    });

    it('官方包不提供默认值，避免意外改变官方题材的新存档行为', () => {
        expect(解析题材包修炼默认值('灵气复苏', 官方包)).toBeUndefined();
    });

    it('缺失 runtime 时不提供默认值', () => {
        expect(解析题材包修炼默认值('灵气复苏', null)).toBeUndefined();
        expect(解析题材包修炼默认值(null, undefined)).toBeUndefined();
    });

    it('usesCultivation 非布尔时按未声明处理', () => {
        const 坏包 = { ...自定义包(true), identity: { ...自定义包(true).identity, usesCultivation: undefined as any } };
        expect(解析题材包修炼默认值('灵气复苏', 坏包)).toBeUndefined();
    });

    it('从 openingConfig 优先读取 runtime', () => {
        const 包 = 自定义包(false);
        expect(解析当前题材修炼默认值(
            { 题材模式: '灵气复苏', modeRuntimeProfile: 包 } as any,
            { modeRuntimeProfile: 自定义包(true, 'other-pack') } as any
        )).toBe(false);
    });

    it('openingConfig 无 runtime 时回退 worldConfig', () => {
        expect(解析当前题材修炼默认值(undefined, { modeRuntimeProfile: 自定义包(false) } as any)).toBe(false);
    });
});

describe('题材包修炼默认值落地', () => {
    it('未手动设置过时写入题材包默认值', () => {
        const 结果 = 应用题材包修炼默认值({ 启用修炼体系: true }, false);
        expect(结果.启用修炼体系).toBe(false);
    });

    it('玩家手动改过后，题材包不得覆盖', () => {
        const 结果 = 应用题材包修炼默认值({ 启用修炼体系: true, 启用修炼体系已手动设置: true }, false);
        expect(结果.启用修炼体系).toBe(true);
    });

    it('无默认值时保持原样', () => {
        const 原值 = { 启用修炼体系: false } as { 启用修炼体系: boolean; 启用修炼体系已手动设置?: boolean };
        expect(应用题材包修炼默认值(原值, undefined)).toBe(原值);
    });

    it('空 gameConfig 也能落地', () => {
        const 结果 = 应用题材包修炼默认值(
            null as { 启用修炼体系?: boolean; 启用修炼体系已手动设置?: boolean } | undefined,
            true
        );
        expect(结果.启用修炼体系).toBe(true);
    });

    it('标记手动设置', () => {
        const 结果 = 标记修炼开关已手动设置({ 启用修炼体系: false });
        expect(结果.启用修炼体系已手动设置).toBe(true);
    });
});