import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const 读源码 = (相对路径: string): string => readFileSync(resolve(__dirname, '..', 相对路径), 'utf8');

/**
 * 回归防护：开关联动世界书（P1-5）。
 * 重点锁两处「绕过剥离」的历史漏洞——它们都不会报错，只是静默让关闭修炼失效。
 */
describe('开关联动世界书接线', () => {
    it('模式包能力片段进入 worldExtraRequirement 时必须受修炼开关约束', () => {
        const 源码 = 读源码('hooks/useGame/worldGenerationWorkflow.ts');
        // 变异测试发现过：不加 启用修炼体系 && 前缀时，玩家关了修炼，
        // 题材包境界条目仍会经 worldExtraRequirement 溜进提示词
        expect(源码).toMatch(/\(启用修炼体系 && manualRealmPromptIsModePackageFragment\)/);
        expect(源码).not.toMatch(/^\s*manualRealmPromptIsModePackageFragment \? normalizedManualRealmPrompt : '',$/m);
    });

    it('规范化世界书条目必须保留 功能模块', () => {
        const 源码 = 读源码('utils/worldbook.ts');
        // 白名单式规范化会丢弃未声明字段；漏掉这行会让题包声明的联动静默消失
        expect(源码).toMatch(/功能模块:\s*规范化功能模块\(source\.功能模块 \?\? base\.功能模块\)/);
        expect(源码).toMatch(/const 规范化功能模块/);
    });

    it('扁平化世界书条目必须走联动过滤', () => {
        const 源码 = 读源码('utils/worldbook.ts');
        expect(源码).toMatch(/扁平化世界书条目 = \(\s*books: 世界书结构\[\],\s*config\?: Partial<游戏设置结构> \| null\s*\)/);
        expect(源码).toMatch(/\.filter\(\(entry\) => 世界书条目是否生效\(entry, config\)\)/);
    });

    it('桌面与移动向导都必须在写入存档前过滤', () => {
        const 桌面 = 读源码('components/features/NewGame/NewGameWizard.tsx');
        const 移动 = 读源码('components/features/NewGame/mobile/MobileNewGameWizard.tsx');
        for (const 源码 of [桌面, 移动]) {
            expect(源码).toMatch(/从模式世界书提取提示词\(modeWorldbooks, \{\s*启用修炼体系:/);
        }
    });

    it('世界书联动必须走与 PROMPT_FEATURE 同一真源，不能另写一套口径', () => {
        const 联动 = 读源码('utils/worldbookFeatureLinkage.ts');
        expect(联动).toMatch(/import \{ 功能模块是否启用 \} from '\.\/promptFeatureToggles'/);
        expect(联动).not.toMatch(/启用修炼体系 !== false/);
    });
});