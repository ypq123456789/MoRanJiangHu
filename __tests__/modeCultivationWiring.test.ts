import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const 读源码 = (相对路径: string): string => readFileSync(resolve(__dirname, '..', 相对路径), 'utf8');

/**
 * 回归防护：`identity.usesCultivation` 曾经是死字段——市场里可编辑，
 * 但只用于拼描述文本和选头像风格，从不进入提示词。这里锁死三处接线点，
 * 任何一处被拆掉都会失败。
 */
describe('题材包修炼开关接线', () => {
    it('开局流程必须把题材包默认值写入存档设置', () => {
        const 源码 = 读源码('hooks/useGame/sessionLifecycleWorkflow.ts');
        expect(源码).toMatch(/解析题材包修炼默认值/);
        // 写入点
        expect(源码).toMatch(/预设键值\.启用修炼体系\s*=/);
        // 快速重开必须跳过，否则会抹掉玩家中途的手动改动
        expect(源码).toMatch(/重开恢复基线[\s\S]{0,120}undefined[\s\S]{0,120}解析题材包修炼默认值/);
    });

    // CodeRabbit Major：设置游戏设置是 React setState，
    // 若只更新 state 而不给工作流传生效值，首次开局的修炼开关根本不生效
    it('必须把本次生效的设置传给世界生成工作流，不能只更新 state', () => {
        const 源码 = 读源码('hooks/useGame/sessionLifecycleWorkflow.ts');
        expect(源码).toMatch(/本次生效游戏设置 = 规范化游戏设置\(\{ \.\.\.基础设置, \.\.\.有效键值 \}\)/);
        expect(源码).toMatch(/gameConfig:\s*本次生效游戏设置/);
    });

    it('手动设置标记必须参与覆盖判断', () => {
        const 源码 = 读源码('hooks/useGame/sessionLifecycleWorkflow.ts');
        // 只匹配 `=== true`：变异测试发现写成 `!== true`（语义完全反过来）时也能通过 `===\s*true`，
        // 因此这里必须锚定完整的正向判定表达式。
        expect(源码).toMatch(/基础设置\?\.启用修炼体系已手动设置\s*===\s*true/);
        expect(源码).not.toMatch(/启用修炼体系已手动设置\s*!==\s*true/);
    });

    it('设置页开关必须打上手动标记', () => {
        const 源码 = 读源码('components/features/Settings/GameSettings.tsx');
        expect(源码).toMatch(/onChange=\{\(next\)\s*=>\s*实时应用更新\(\{\s*启用修炼体系:\s*next,\s*启用修炼体系已手动设置:\s*true\s*\}\)\}/);
    });

    // Codex P1：payload/preset 回退会取回未过滤的能力提示词
    it('向导不得在修炼关闭时走 payload/preset 的境界提示词回退', () => {
        const 桌面 = 读源码('components/features/NewGame/NewGameWizard.tsx');
        const 移动 = 读源码('components/features/NewGame/mobile/MobileNewGameWizard.tsx');
        for (const 源码 of [桌面, 移动]) {
            expect(源码).toMatch(/const realmPrompt = 题材修炼开启\s*\?/);
        }
    });

    it('DIY 工具不得硬编码启用修炼体系为 true', () => {
        const 源码 = 读源码('components/features/NewGame/NewGameDiyTools.tsx');
        expect(源码).not.toMatch(/\{\s*启用修炼体系:\s*true\s*,\s*openingConfig\s*\}/);
        expect(源码).toMatch(/解析当前题材修炼默认值/);
    });

    it('市场 UI 必须标注这是默认值而非生效开关', () => {
        const 源码 = 读源码('components/features/Workshop/CreativeWorkshopModal.tsx');
        expect(源码).toMatch(/label:\s*'启用修炼（仅作为新存档默认值）'/);
        expect(源码).toMatch(/path:\s*\['identity',\s*'usesCultivation'\].*placeholder:/);
    });

    it('规范化必须保留手动标记，否则读档后题材包会再次覆盖', () => {
        const 源码 = 读源码('utils/gameSettings.ts');
        expect(源码).toMatch(/启用修炼体系已手动设置:\s*source\.启用修炼体系已手动设置\s*===\s*true/);
    });
});