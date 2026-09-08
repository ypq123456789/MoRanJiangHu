import { describe, expect, it, vi } from 'vitest';
import { 执行响应命令处理 } from '../hooks/useGame/responseCommandProcessor';
import { 保护开局生成门派状态 } from '../hooks/useGame/storyState';
import { 修补并回写开局主角角色 } from '../hooks/useGame/openingStoryWorkflow';
import { 修补开局角色姓名占位 } from '../utils/openingProtagonistName';
import {
    规范化环境信息,
    规范化社交列表,
    规范化角色物品容器映射
} from '../hooks/useGame/stateTransforms';

/**
 * 玩家反馈三集成测试：开局 tavern_commands 把主角姓名写成「未命名」占位符时，
 * 修补并回写逻辑必须保证：
 *   1. 前端角色状态（store）最终持有玩家姓名（即使该回合存在 tavern_commands）；
 *   2. 自动存档所用的角色对象（工作流后续传给 performAutoSave 的同一个对象）
 *      也持有玩家姓名；
 *   3. 不覆盖 AI 给出的具体名字。
 *
 * 复现的真实机制（与 openingStoryWorkflow.ts 中 2142-2193 行一致）：
 *   - 执行响应命令处理（applyState 默认开启）应用 tavern_commands 时会先把含占位姓名的
 *     角色写入 store；
 *   - 开局门派保护（保护开局生成门派状态）在门派被 AI 清空时会重建一个新的 角色 对象
 *     （引用断裂），此时对返回对象做的原地姓名修补不会再传导到已写入 store 的旧角色；
 *   - 因此修补后必须无条件再次写回角色状态，否则界面残留「未命名」而自动存档却是玩家名
 *     （玩家看到的正是存档树/存档名里的主角名变成「未命名」）。
 */
describe('opening 主角姓名修补与角色写回（tavern_commands 路径）', () => {
    const 玩家角色 = () => 规范化角色物品容器映射({
        姓名: '陆凡',
        性别: '男',
        装备: {},
        物品列表: [],
        所属门派ID: '青云宗',
        门派职位: '掌门'
    });

    const 构建响应命令处理依赖 = (store: Record<string, any>, setters: Record<string, ReturnType<typeof vi.fn>>) => ({
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
        设置角色: setters.设置角色,
        设置环境: setters.设置环境,
        设置社交: setters.设置社交,
        设置世界: setters.设置世界,
        设置战斗: setters.设置战斗,
        设置玩家门派: setters.设置玩家门派,
        设置任务列表: setters.设置任务列表,
        设置约定列表: setters.设置约定列表,
        设置剧情: setters.设置剧情,
        设置剧情规划: setters.设置剧情规划,
        设置女主剧情规划: setters.设置女主剧情规划,
        设置同人剧情规划: setters.设置同人剧情规划,
        设置同人女主剧情规划: setters.设置同人女主剧情规划,
        境界配置: undefined
    } as any);

    const 构建前端store = () => {
        const store: Record<string, any> = {};
        const setters: Record<string, ReturnType<typeof vi.fn>> = {
            设置角色: vi.fn((value: any) => { store.角色 = value; }),
            设置环境: vi.fn((value: any) => { store.环境 = value; }),
            设置社交: vi.fn((value: any) => { store.社交 = value; }),
            设置世界: vi.fn((value: any) => { store.世界 = value; }),
            设置战斗: vi.fn((value: any) => { store.战斗 = value; }),
            设置玩家门派: vi.fn((value: any) => { store.玩家门派 = value; }),
            设置任务列表: vi.fn((value: any) => { store.任务列表 = value; }),
            设置约定列表: vi.fn((value: any) => { store.约定列表 = value; }),
            设置剧情: vi.fn((value: any) => { store.剧情 = value; }),
            设置剧情规划: vi.fn((value: any) => { store.剧情规划 = value; }),
            设置女主剧情规划: vi.fn((value: any) => { store.女主剧情规划 = value; }),
            设置同人剧情规划: vi.fn((value: any) => { store.同人剧情规划 = value; }),
            设置同人女主剧情规划: vi.fn((value: any) => { store.同人女主剧情规划 = value; })
        };
        return { store, setters };
    };

    const 执行命令并得到开局状态 = (response: any, base: any, store: Record<string, any>, setters: Record<string, ReturnType<typeof vi.fn>>) => (
        执行响应命令处理(
            response,
            {
                角色: 玩家角色(),
                环境: 规范化环境信息({ 时间: '1:01:01:08:00', 大地点: '青云州', 具体地点: '青云宗前庭' }),
                社交: [],
                世界: { 地图层级: [] } as any,
                战斗: {} as any,
                玩家门派: { ID: '青云宗', 名称: '青云宗', 玩家职位: '掌门' },
                任务列表: [],
                约定列表: [],
                剧情: {} as any,
                剧情规划: {} as any
            } as any,
            构建响应命令处理依赖(store, setters),
            base,
            { applyState: true }
        )
    );

    it('占位姓名 + tavern_commands：修补后无条件写回，界面与自动存档都拿到玩家姓名', () => {
        const { store, setters } = 构建前端store();
        const base = {
            角色: 玩家角色(),
            环境: 规范化环境信息({ 时间: '1:01:01:08:00', 大地点: '青云州' }),
            社交: [],
            世界: { 地图层级: [] } as any,
            战斗: {} as any,
            玩家门派: { ID: '青云宗', 名称: '青云宗', 玩家职位: '掌门' },
            任务列表: [],
            约定列表: [],
            剧情: {} as any,
            剧情规划: {} as any
        };
        const responseWithNameOverwrite = {
            logs: [{ sender: '旁白', text: '你踏入青云宗前庭。' }],
            tavern_commands: [
                { action: 'set' as const, key: '角色.姓名', value: '未命名' }
            ]
        };

        // —— 第一步：与工作流 2142 行一致，applyState 默认开启地执行 tavern_commands ——
        const openingAfterCommands = 执行命令并得到开局状态(responseWithNameOverwrite, base, store, setters);
        // 命令处理确实把占位姓名写进了前端 store（这正是需要后续矫正的缺口前提）
        expect(store.角色?.姓名).toBe('未命名');
        expect(openingAfterCommands.角色?.姓名).toBe('未命名');

        // —— 第二步：模拟 AI 把门派清空（无门派标识），触发真实的开局门派保护重建角色 ——
        const sectClearedState = {
            ...openingAfterCommands,
            玩家门派: { ID: '' }
        };
        const protectedState = 保护开局生成门派状态(
            sectClearedState as any,
            { 玩家门派: base.玩家门派, 角色: base.角色 } as any,
            { 开局生成门派: true, 配置约束启用: true } as any
        );
        // 角色对象被重建（引用断裂）：原地修补无法再传导给已写入 store 的旧对象
        expect(protectedState.角色).not.toBe(store.角色);
        expect(protectedState.角色?.姓名).toBe('未命名');

        // —— 第三步：工作流现在执行的 seam：修补姓名 + 无条件写回前端角色状态 ——
        const depsForSeam = {
            设置角色: setters.设置角色,
            规范化角色物品容器映射
        };
        const stateForAutoSave = 修补并回写开局主角角色(
            protectedState,
            base.角色,
            depsForSeam as any,
            { 启用饱腹口渴系统: false }
        );

        // 界面状态（store）：必须已是玩家姓名，而不是「未命名」
        expect(stateForAutoSave.角色?.姓名).toBe('陆凡');
        expect(store.角色?.姓名).toBe('陆凡');
        expect(setters.设置角色).toHaveBeenCalled();
        // 写回用的是门派保护重建后的角色对象（保留门派归属）
        expect(store.角色?.所属门派ID).toBe('青云宗');
        // 自动存档：工作流随后把修补后的同一个 openingStateAfterCommands.角色 传给
        // performAutoSave（即 stateForAutoSave.角色，仍是门派保护重建后被原地修补的对象）
        expect(stateForAutoSave.角色).toBe(protectedState.角色);
        expect(stateForAutoSave.角色?.姓名).toBe('陆凡');
    });

    it('有 tavern_commands 但 AI 姓名具体时绝不覆盖（兜底而非抹平）', () => {
        const { store, setters } = 构建前端store();
        const base = {
            角色: 玩家角色(),
            环境: 规范化环境信息({ 时间: '1:01:01:08:00', 大地点: '青云州' }),
            社交: [],
            世界: { 地图层级: [] } as any,
            战斗: {} as any,
            玩家门派: { ID: '青云宗', 名称: '青云宗', 玩家职位: '掌门' },
            任务列表: [],
            约定列表: [],
            剧情: {} as any,
            剧情规划: {} as any
        };
        const response = {
            logs: [],
            tavern_commands: [
                { action: 'set' as const, key: '角色.姓名', value: '墨衣客' }
            ]
        };
        const openingAfterCommands = 执行命令并得到开局状态(response, base, store, setters);
        expect(openingAfterCommands.角色?.姓名).toBe('墨衣客');
        expect(store.角色?.姓名).toBe('墨衣客');

        const patched = 修补并回写开局主角角色(
            openingAfterCommands,
            base.角色,
            { 设置角色: setters.设置角色, 规范化角色物品容器映射 } as any,
            { 启用饱腹口渴系统: false }
        );
        expect(patched.角色?.姓名).toBe('墨衣客');
        expect(store.角色?.姓名).toBe('墨衣客');
    });

    it('修补辅助函数：仅占位符会被替换，具体姓名原样保留', () => {
        const base = 玩家角色();
        const cases: Array<[string, boolean]> = [
            ['未命名', true],
            ['未知角色', true],
            ['', true],
            ['Unnamed', true],
            ['墨衣客', false],
            ['陆凡', false]
        ];
        for (const [aiName, shouldPatch] of cases) {
            const role: any = { 姓名: aiName };
            修补开局角色姓名占位(role, base);
            expect(role.姓名).toBe(shouldPatch ? '陆凡' : aiName);
        }
    });
});
