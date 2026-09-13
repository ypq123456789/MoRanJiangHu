import { describe, expect, it } from 'vitest';
import { 修复本地存档谱系列表, 补全存档谱系元数据, 读取存档系列ID } from '../utils/saveLineage';
import { 投影存档谱系轻量视图 } from '../services/dbService';

describe('存档谱系补全', () => {
    it('云端导入存档已带父节点时，不因本地暂缺父节点而降级成根节点', () => {
        const save: any = {
            类型: 'auto',
            时间戳: 1779000003000,
            角色数据: { 姓名: '杨培强' },
            环境信息: { 具体地点: '武馆' },
            历史记录: [
                { role: 'user', content: '第一回合' },
                { role: 'assistant', structuredResponse: { logs: [] } },
                { role: 'user', content: '第二回合' },
                { role: 'assistant', structuredResponse: { logs: [] } }
            ],
            元数据: {
                存档哈希: 'cccccccccccccccc',
                存档系列ID: 'series-test',
                存档父节点哈希: 'bbbbbbbbbbbbbbbb',
                存档根节点哈希: 'aaaaaaaaaaaaaaaa',
                存档谱系深度: 2,
                存档分支输入: '继续修炼'
            }
        };

        const normalized = 补全存档谱系元数据(save, []);

        expect(normalized.元数据.存档父节点哈希).toBe('bbbbbbbbbbbbbbbb');
        expect(normalized.元数据.存档根节点哈希).toBe('aaaaaaaaaaaaaaaa');
        expect(normalized.元数据.存档谱系深度).toBe(2);
        expect(normalized.元数据.存档分支输入).toBe('继续修炼');
    });

    it('本地新谱系根节点即使带旧深度和旧回合数，也会从第0回合开始', () => {
        const save: any = {
            类型: 'auto',
            时间戳: 1779000003000,
            角色数据: { 姓名: '杨培强' },
            环境信息: { 具体地点: '武馆' },
            历史记录: [
                { role: 'user', content: '开局' },
                { role: 'assistant', structuredResponse: { logs: [] } },
                { role: 'user', content: '继续' },
                { role: 'assistant', structuredResponse: { logs: [] } }
            ],
            元数据: {
                存档哈希: 'aaaaaaaaaaaaaaaa',
                存档系列ID: 'series-root',
                存档谱系深度: 7,
                游戏回合数: 7,
                存档分支输入: '继续游玩'
            }
        };

        const normalized = 补全存档谱系元数据(save, []);

        expect(normalized.元数据.存档父节点哈希).toBe('');
        expect(normalized.元数据.存档根节点哈希).toBe('aaaaaaaaaaaaaaaa');
        expect(normalized.元数据.存档谱系深度).toBe(0);
        expect(normalized.元数据.游戏回合数).toBe(0);
        expect(normalized.元数据.存档分支输入).toBe('开局');
    });

    it('本地旧坏谱系存在多个回合同 series 时，每个根都独立成树，不再强行串到 primary', () => {
        const root: any = {
            id: 1,
            类型: 'auto',
            时间戳: 1779000000000,
            角色数据: { 姓名: '杨培强' },
            环境信息: { 具体地点: '山门' },
            历史记录: [{ role: 'assistant', structuredResponse: { logs: [] } }],
            元数据: {
                存档哈希: 'aaaaaaaaaaaaaaaa',
                存档系列ID: 'series-broken',
                存档根节点哈希: 'aaaaaaaaaaaaaaaa',
                存档谱系版本: 1,
                存档谱系深度: 0,
                游戏回合数: 0,
                存档分支输入: '开局'
            }
        };
        const middleRoot: any = {
            id: 2,
            类型: 'auto',
            时间戳: 1779000005000,
            角色数据: { 姓名: '杨培强' },
            环境信息: { 具体地点: '藏经阁' },
            历史记录: [
                { role: 'assistant', structuredResponse: { logs: [] } },
                { role: 'assistant', structuredResponse: { logs: [] } }
            ],
            元数据: {
                存档哈希: 'bbbbbbbbbbbbbbbb',
                存档系列ID: 'series-broken',
                存档根节点哈希: 'bbbbbbbbbbbbbbbb',
                存档父节点哈希: '',
                存档谱系版本: 1,
                存档谱系深度: 5,
                游戏回合数: 5,
                存档分支输入: '继续游玩'
            }
        };

        const repaired = 修复本地存档谱系列表([middleRoot, root]);
        const original = repaired.saves.find((item: any) => item.id === 1) as any;
        const orphan = repaired.saves.find((item: any) => item.id === 2) as any;

        expect(repaired.changed).toBe(true);
        // 第一棵：保留原根
        expect(original.元数据.存档根节点哈希).toBe('aaaaaaaaaaaaaaaa');
        expect(original.元数据.存档父节点哈希).toBe('');
        expect(original.元数据.存档谱系深度).toBe(0);
        expect(original.元数据.游戏回合数).toBe(0);
        // 第二棵：自己独立成根（不再被串到第一棵末尾）
        expect(orphan.元数据.存档根节点哈希).toBe('bbbbbbbbbbbbbbbb');
        expect(orphan.元数据.存档父节点哈希).toBe('');
        expect(orphan.元数据.存档谱系深度).toBe(0);
        // 显式回合数（云端下传但本地历史不足以重算）应被尊重
        expect(orphan.元数据.游戏回合数).toBe(5);
    });

    it('新存档当前地点变化时，会继承已有父节点系列并连续接上', () => {
        const root: any = {
            id: 1,
            类型: 'manual',
            时间戳: 1779000000000,
            游戏初始时间: '1:01:01:08:00',
            角色数据: { 姓名: '杨培强' },
            环境信息: { 具体地点: '培强院' },
            历史记录: [
                { role: 'assistant', structuredResponse: { logs: [] } },
                { role: 'user', content: '出门去英道' }
            ],
            元数据: {
                存档哈希: 'aaaaaaaaaaaaaaaa',
                存档系列ID: 'series-stable-root',
                存档根节点哈希: 'aaaaaaaaaaaaaaaa',
                存档父节点哈希: '',
                存档谱系版本: 1,
                存档谱系深度: 0,
                游戏回合数: 0,
                存档分支输入: '开局'
            }
        };
        const next: any = {
            类型: 'auto',
            时间戳: 1779000005000,
            游戏初始时间: '1:01:01:08:00',
            角色数据: { 姓名: '杨培强' },
            环境信息: { 具体地点: '英道' },
            历史记录: [
                { role: 'assistant', structuredResponse: { logs: [] } },
                { role: 'user', content: '出门去英道' },
                { role: 'assistant', structuredResponse: { logs: [] } },
                { role: 'user', content: '继续前行' }
            ],
            元数据: {
                存档哈希: 'bbbbbbbbbbbbbbbb',
                游戏回合数: 1
            }
        };

        const normalized = 补全存档谱系元数据(next, [root]);

        expect(normalized.元数据).toEqual(expect.objectContaining({
            存档系列ID: 'series-stable-root',
            存档根节点哈希: 'aaaaaaaaaaaaaaaa',
            存档父节点哈希: 'aaaaaaaaaaaaaaaa',
            存档谱系深度: 1,
            存档分支输入: '继续前行'
        }));
    });

    it('本地只下载到缺父节点的半截谱系时，会保留原始回合并降级为本地根节点', () => {
        const childOnly: any = {
            id: 2,
            类型: 'auto',
            时间戳: 1779000005000,
            角色数据: { 姓名: '杨培强' },
            环境信息: { 具体地点: '藏经阁' },
            历史记录: [
                { role: 'assistant', structuredResponse: { logs: [] } },
                { role: 'assistant', structuredResponse: { logs: [] } }
            ],
            元数据: {
                存档哈希: 'bbbbbbbbbbbbbbbb',
                存档系列ID: 'series-incomplete',
                存档根节点哈希: 'aaaaaaaaaaaaaaaa',
                存档父节点哈希: 'aaaaaaaaaaaaaaaa',
                存档谱系版本: 1,
                存档谱系深度: 1,
                游戏回合数: 1,
                存档分支输入: '继续游玩'
            }
        };

        const repaired = 修复本地存档谱系列表([childOnly]);

        expect(repaired.changed).toBe(true);
        expect(repaired.saves[0].元数据).toEqual(expect.objectContaining({
            存档根节点哈希: 'bbbbbbbbbbbbbbbb',
            存档父节点哈希: '',
            存档谱系深度: 0,
            游戏回合数: 1
        }));
    });

    it('同一系列里出现多个第0回合根节点时，会保留在同一谱系并交给时间树排序', () => {
        const firstRoot: any = {
            id: 1,
            类型: 'auto',
            时间戳: 1779000000000,
            角色数据: { 姓名: '杨培强' },
            历史记录: [],
            元数据: {
                存档哈希: 'aaaaaaaaaaaaaaaa',
                存档系列ID: 'series-collided',
                存档根节点哈希: 'aaaaaaaaaaaaaaaa',
                存档父节点哈希: '',
                存档谱系版本: 1,
                存档谱系深度: 0,
                游戏回合数: 0,
                存档分支输入: '开局'
            }
        };
        const secondRoot: any = {
            id: 2,
            类型: 'auto',
            时间戳: 1779000100000,
            角色数据: { 姓名: '杨培强' },
            历史记录: [],
            元数据: {
                存档哈希: 'bbbbbbbbbbbbbbbb',
                存档系列ID: 'series-collided',
                存档根节点哈希: 'bbbbbbbbbbbbbbbb',
                存档父节点哈希: '',
                存档谱系版本: 1,
                存档谱系深度: 0,
                游戏回合数: 0,
                存档分支输入: '开局'
            }
        };

        const repaired = 修复本地存档谱系列表([secondRoot, firstRoot]);

        // 玩家反馈一/二：两个本是不同档（不同存档哈希），不应被画到同一条时间树。
        // 新行为：每个根各自独立保留各自的 seriesId/rootHash/游戏回合数，绝不互相改写根哈希。
        const first = repaired.saves.find((item: any) => item.id === 1) as any;
        const second = repaired.saves.find((item: any) => item.id === 2) as any;
        expect(first.元数据.存档系列ID).toBe('series-collided');
        expect(second.元数据.存档系列ID).toBe('series-collided');
        expect(first.元数据.存档根节点哈希).toBe('aaaaaaaaaaaaaaaa');
        expect(second.元数据.存档根节点哈希).toBe('bbbbbbbbbbbbbbbb');
        expect(repaired.saves.map((item: any) => item.元数据.游戏回合数)).toEqual([0, 0]);
    });

    it('本地已有可信第0回合根节点时，会把同根缺父节点接回连续谱系', () => {
        const root: any = {
            id: 1,
            类型: 'auto',
            时间戳: 1779000000000,
            角色数据: { 姓名: '杨培强' },
            历史记录: [],
            元数据: {
                存档哈希: 'aaaaaaaaaaaaaaaa',
                存档系列ID: 'series-missing-parent',
                存档根节点哈希: 'aaaaaaaaaaaaaaaa',
                存档父节点哈希: '',
                存档谱系版本: 1,
                存档谱系深度: 0,
                游戏回合数: 0,
                存档分支输入: '开局'
            }
        };
        const orphan: any = {
            id: 2,
            类型: 'auto',
            时间戳: 1779000100000,
            角色数据: { 姓名: '杨培强' },
            历史记录: [],
            元数据: {
                存档哈希: 'bbbbbbbbbbbbbbbb',
                存档系列ID: 'series-missing-parent',
                存档根节点哈希: 'aaaaaaaaaaaaaaaa',
                存档父节点哈希: 'missing-parent-hash',
                存档谱系版本: 1,
                存档谱系深度: 17,
                游戏回合数: 17,
                存档分支输入: '继续游玩'
            }
        };

        const repaired = 修复本地存档谱系列表([orphan, root]);
        const child = repaired.saves.find((item: any) => item.id === 2) as any;

        expect(repaired.changed).toBe(true);
        expect(child.元数据).toEqual(expect.objectContaining({
            存档根节点哈希: 'aaaaaaaaaaaaaaaa',
            存档父节点哈希: 'aaaaaaaaaaaaaaaa',
            存档谱系深度: 1,
            游戏回合数: 17
        }));
    });

    // [回归] 玩家反馈：同名"陆凡"等极常见角色名多次开局时，旧版本会把所有开局归到同一 seriesId
    // 进而被串到同一条时间树。原因是 读取首条历史签名 / 读取存档系列ID 只看 history[0]，
    // 而 history[0] 是固定系统占位"系统: 正在生成开场内容..."，两次开局该位完全一致。
    it('同角色名多次开局：必须根据 AI 首条回复区分出独立 seriesId', () => {
        const buildOpening = (openingAiContent: string) => ({
            id: 1,
            类型: 'auto',
            时间戳: 1779000000000,
            角色数据: { 姓名: '陆凡' },
            游戏初始时间: '永昌三年·春',
            环境信息: { 具体地点: '破庙' },
            历史记录: [
                { role: 'system', content: '系统: 正在生成开场内容...' },
                { role: 'assistant', content: openingAiContent, structuredResponse: { logs: [] } }
            ],
            元数据: {}
        });

        const openingA = 读取存档系列ID(buildOpening('春雷初动，你从破庙残瓦下醒来。') as any);
        const openingB = 读取存档系列ID(buildOpening('暴雨如注，你被人追杀至荒山古寺。') as any);
        const openingC = 读取存档系列ID(buildOpening('雪夜孤灯，你正在研读一卷泛黄手札。') as any);

        expect(openingA).not.toBe(openingB);
        expect(openingA).not.toBe(openingC);
        expect(openingB).not.toBe(openingC);
    });

    // [回归] 玩家反馈：同名同 initialTime 但首条 AI 内容不同的两个旧存档，
    // 经过 启动旧存档谱系迁移 后必须保留各自的 seriesId/rootHash，绝不互相串线。
    it('迁移同名开局时：两次开局的 AI 首条内容不同则各自保留独立根，不互相继承', async () => {
        const buildLegacyOpening = (id: number, hash: string, openingAiContent: string, ts: number) => ({
            id,
            类型: 'auto',
            时间戳: ts,
            角色数据: { 姓名: '陆凡' },
            游戏初始时间: '永昌三年·春',
            环境信息: { 具体地点: '破庙' },
            历史记录: [
                { role: 'system', content: '系统: 正在生成开场内容...' },
                { role: 'assistant', content: openingAiContent, structuredResponse: { logs: [] } }
            ],
            元数据: {
                存档哈希: hash
            }
        });

        const saveA = buildLegacyOpening(1, 'aaaaaaaaaaaaaaaa', '春雷初动，你从破庙残瓦下醒来。', 1779000000000);
        const saveB = buildLegacyOpening(2, 'bbbbbbbbbbbbbbbb', '暴雨如注，你被人追杀至荒山古寺。', 1779000005000);

        // 模拟 启动旧存档谱系迁移 的实际流程：先逐条 补全存档谱系元数据（按 id 升序），
        // 再统一 修复本地存档谱系列表。修复前 saveB 会通过 是同一开局候选 继承 saveA 的 seriesId。
        const candidates: any[] = [];
        const normalizedA = 补全存档谱系元数据(saveA as any, candidates) as any;
        candidates.push(normalizedA);
        const normalizedB = 补全存档谱系元数据(saveB as any, candidates) as any;
        candidates.push(normalizedB);

        const repaired = 修复本地存档谱系列表([normalizedA, normalizedB] as any);

        const a = repaired.saves.find((item: any) => item.id === 1) as any;
        const b = repaired.saves.find((item: any) => item.id === 2) as any;
        expect(a.元数据.存档系列ID).not.toBe(b.元数据.存档系列ID);
        expect(a.元数据.存档根节点哈希).toBe('aaaaaaaaaaaaaaaa');
        expect(b.元数据.存档根节点哈希).toBe('bbbbbbbbbbbbbbbb');
        expect(a.元数据.存档父节点哈希).toBe('');
        expect(b.元数据.存档父节点哈希).toBe('');
        expect(a.元数据.存档谱系深度).toBe(0);
        expect(b.元数据.存档谱系深度).toBe(0);
    });

    // [回归] 同一开局内连续多次自动存档应继续被串到同一棵（正向路径必须仍然成立）。
    it('同一开局后续自动存档：与开局根共享 seriesId 且父节点指向根', async () => {
        const openingRoot = {
            id: 1,
            类型: 'auto',
            时间戳: 1779000000000,
            角色数据: { 姓名: '陆凡' },
            游戏初始时间: '永昌三年·春',
            环境信息: { 具体地点: '破庙' },
            历史记录: [
                { role: 'system', content: '系统: 正在生成开场内容...' },
                { role: 'assistant', content: '春雷初动，你从破庙残瓦下醒来。', structuredResponse: { logs: [] } }
            ],
            元数据: { 存档哈希: 'aaaaaaaaaaaaaaaa' }
        };
        const laterAuto = {
            id: 2,
            类型: 'auto',
            时间戳: 1779000050000,
            角色数据: { 姓名: '陆凡' },
            游戏初始时间: '永昌三年·春',
            环境信息: { 具体地点: '破庙' },
            历史记录: [
                { role: 'system', content: '系统: 正在生成开场内容...' },
                { role: 'assistant', content: '春雷初动，你从破庙残瓦下醒来。', structuredResponse: { logs: [] } },
                { role: 'user', content: '出门看看' },
                { role: 'assistant', content: '你推开破庙木门。', structuredResponse: { logs: [] } }
            ],
            元数据: { 存档哈希: 'bbbbbbbbbbbbbbbb' }
        };

        // 同样按真实迁移流程跑：先 补全 后 修复
        const candidates: any[] = [];
        const root = 补全存档谱系元数据(openingRoot as any, candidates) as any;
        candidates.push(root);
        const child = 补全存档谱系元数据(laterAuto as any, candidates) as any;

        const repaired = 修复本地存档谱系列表([root, child] as any);
        const rootFinal = repaired.saves.find((item: any) => item.id === 1) as any;
        const childFinal = repaired.saves.find((item: any) => item.id === 2) as any;
        expect(rootFinal.元数据.存档系列ID).toBe(childFinal.元数据.存档系列ID);
        expect(childFinal.元数据.存档父节点哈希).toBe('aaaaaaaaaaaaaaaa');
        expect(childFinal.元数据.存档根节点哈希).toBe('aaaaaaaaaaaaaaaa');
        expect(rootFinal.元数据.存档谱系深度).toBe(0);
        expect(childFinal.元数据.存档谱系深度).toBe(1);
    });

    // [回归] CodeRabbit 评审指出：是系统占位消息 的内容兜底对"任何 role"都执行，
    // 若某条真实 assistant 开场回复恰好以"系统："开头，会被误判为系统占位而跳过，
    // 导致首条真实对话签名错位、seriesId 错乱。修复后明确的 assistant 回复即使以
    // "系统："开头也绝不按内容兜底，仍作为真实首条历史参与 seriesId 区分。
    it('首条 assistant 回复即便以"系统："开头也不被误判为占位，仍参与 seriesId 区分', () => {
        const buildOpening = (openingAiContent: string) => ({
            id: 1,
            类型: 'auto',
            时间戳: 1779000000000,
            角色数据: { 姓名: '陆凡' },
            游戏初始时间: '永昌三年·春',
            环境信息: { 具体地点: '破庙' },
            历史记录: [
                { role: 'system', content: '系统: 正在生成开场内容...' },
                { role: 'assistant', content: openingAiContent, structuredResponse: { logs: [] } }
            ],
            元数据: {}
        });
        const a = 读取存档系列ID(buildOpening('系统：你从破庙中缓缓睁开双眼。') as any);
        const b = 读取存档系列ID(buildOpening('系统：一道惊雷劈开夜幕。') as any);
        const c = 读取存档系列ID(buildOpening('春雷初动，你从破庙残瓦下醒来。') as any);
        expect(a).not.toBe(b);
        expect(a).not.toBe(c);
        expect(b).not.toBe(c);
    });

    // [回归] v1.0.665 玩家反馈：存档节点突然不再合并（每个新存档都变成独立根、回合数归零）。
    // 根因：候选集来自 dbService.投影存档谱系轻量视图（只保留 history[0] 与首条 user 输入），
    // 而 读取首条历史签名 取的是"首条非系统消息"——完整存档里是 history[1] 的开场 assistant
    // 回复，轻量视图里却退化成首条玩家输入，两边签名永远不等 → 是同一开局候选 恒 false。
    // 本用例必须使用"真实投影函数"构造候选，才能覆盖这条曾经完全没被测试的路径。
    it('完整存档（真实轻量视图候选）必须继承系列并挂到上一版存档之下', () => {
        const 系统占位 = { role: 'system', content: '系统: 正在生成开场内容...' };
        const 开场回复 = { role: 'assistant', content: '【旁白】乱星海的浪涛拍击礁石……', structuredResponse: { 正文: '乱星海的浪涛拍击礁石' } };
        const 首条玩家输入 = { role: 'user', content: '我要前往乱星海寻找天星城' };
        const history: any[] = [系统占位, 开场回复, 首条玩家输入];
        for (let i = 0; i < 118; i += 1) {
            history.push({ role: 'assistant', content: `第 ${i + 1} 回合正文`, structuredResponse: { 正文: `第 ${i + 1} 回合` } });
            history.push({ role: 'user', content: `第 ${i + 1} 回合玩家输入` });
        }
        const 上一条存档: any = {
            id: 290,
            类型: 'auto',
            时间戳: 1789301570000,
            元数据: {
                存档哈希: 'b7700cd681e85341',
                存档系列ID: 'series-ea80a0cee595ab13',
                存档根节点哈希: 'b7700cd681e85341',
                存档父节点哈希: '',
                存档谱系深度: 0,
                存档分支输入: '开局',
                存档谱系版本: 1,
                游戏回合数: 97,
                自动存档节点ID: 'turn:97|time:123:11:16:10:00|loc:天星城/外海岛链/乱星海'
            },
            游戏初始时间: '123:10:00:00:00',
            角色数据: { 姓名: '何夫锐' },
            环境信息: { 大地点: '乱星海', 中地点: '外海岛链', 小地点: '天星城', 具体地点: '天星城·坊市' },
            历史记录: history.slice(0, 238)
        };
        const 轻量候选 = 投影存档谱系轻量视图(上一条存档, 290);

        // 新存档由 创建存档数据 产出：元数据里没有 存档系列ID/根节点哈希，
        // 存档哈希 由 清洗导入存档 已经算好（此处用固定值模拟）。
        const 新存档: any = {
            时间戳: 1789301571660,
            类型: 'auto',
            元数据: {
                历史记录条数: 240,
                游戏回合数: 98,
                存档哈希: 'c1a1b2c3d4e5f607',
                自动存档节点ID: 'turn:98|time:123:11:16:14:15|loc:外海狂暴水域高空航道（飞遁返程中）/天星城/外海岛链/乱星海'
            },
            游戏初始时间: '123:10:00:00:00',
            角色数据: { 姓名: '何夫锐' },
            环境信息: { 大地点: '乱星海', 中地点: '外海岛链', 小地点: '天星城', 具体地点: '外海狂暴水域高空航道（飞遁返程中）' },
            历史记录: history.slice(0, 240)
        };

        const out: any = 补全存档谱系元数据(新存档, [轻量候选 as any]);

        expect(out.元数据.存档系列ID).toBe('series-ea80a0cee595ab13');
        expect(out.元数据.存档父节点哈希).toBe('b7700cd681e85341');
        expect(out.元数据.存档根节点哈希).toBe('b7700cd681e85341');
        expect(out.元数据.存档谱系深度).toBe(1);
        expect(out.元数据.存档分支输入).toBe('第 118 回合玩家输入');
    });

    // [回归] 投影会裁掉 timestamp/gameTime 并把 content 截断到 256，因此 seriesId 的 seed
    // 绝不能内嵌原始历史对象，也绝不能包含"当前地点"（每回合都变）。否则同一开局的完整存档
    // 与轻量视图会算出两个 seriesId，选择存档父节点 的 seriesId 过滤必然落空。
    it('完整存档与其轻量视图投影必须算出同一个 seriesId', () => {
        const buildSave = (openingAiContent: string) => {
            const 系统占位 = { role: 'system', content: '系统: 正在生成开场内容...', timestamp: 1 };
            const 开场回复 = { role: 'assistant', content: openingAiContent, structuredResponse: { 正文: openingAiContent }, timestamp: 2 };
            const 首条玩家输入 = { role: 'user', content: '出门看看', timestamp: 3 };
            const history: any[] = [系统占位, 开场回复, 首条玩家输入];
            for (let i = 0; i < 5; i += 1) {
                history.push({ role: 'assistant', content: `第 ${i + 1} 回合正文`, timestamp: 10 + i * 2 });
                history.push({ role: 'user', content: `第 ${i + 1} 回合玩家输入`, timestamp: 11 + i * 2 });
            }
            return {
                id: 1,
                类型: 'auto' as const,
                时间戳: 1779000000000,
                角色数据: { 姓名: '何夫锐' },
                游戏初始时间: '123:10:00:00:00',
                // 故意让当前地点与投影来源不同：seriesId 不得受当前地点影响
                环境信息: { 大地点: '乱星海', 中地点: '外海岛链', 小地点: '天星城', 具体地点: '外海狂暴水域' },
                历史记录: history,
                元数据: {}
            };
        };

        const fullA = buildSave('【旁白】乱星海的浪涛拍击礁石，远处天星城灯火明灭。');
        const viewA = 投影存档谱系轻量视图(fullA as any, 1);
        const fullB = buildSave('【旁白】暴雨如注，你被追杀至荒山古寺。');

        expect(读取存档系列ID(viewA as any)).toBe(读取存档系列ID(fullA as any));
        expect(读取存档系列ID(fullB as any)).not.toBe(读取存档系列ID(fullA as any));
    });

    // [回归] 修复投影后仍必须保留"同名同初始时间、不同开场"的区分能力：
    // 若两次开局的开场 AI 回复不同，绝不能因为退化匹配而错误并到同一棵时间树。
    it('开场内容不同的轻量视图候选不得被误并到同一系列', () => {
        const buildSave = (openingAiContent: string, 当前地点: string) => {
            const history: any[] = [
                { role: 'system', content: '系统: 正在生成开场内容...' },
                { role: 'assistant', content: openingAiContent, structuredResponse: { 正文: openingAiContent } },
                { role: 'user', content: '我要出发', },
                { role: 'assistant', content: '你踏上旅程。', structuredResponse: { 正文: '你踏上旅程。' } }
            ];
            return {
                id: 1,
                类型: 'auto' as const,
                时间戳: 1779000000000,
                角色数据: { 姓名: '陆凡' },
                游戏初始时间: '永昌三年·春',
                环境信息: { 具体地点: 当前地点 },
                历史记录: history,
                元数据: {}
            };
        };

        const 旧开局候选 = 投影存档谱系轻量视图(buildSave('春雷初动，你从破庙残瓦下醒来。', '破庙') as any, 1);
        const 新开局存档: any = {
            ...buildSave('暴雨如注，你被人追杀至荒山古寺。', '古寺'),
            元数据: { 存档哈希: 'dddddddddddddddd', 历史记录条数: 4, 游戏回合数: 1 }
        };

        const out: any = 补全存档谱系元数据(新开局存档, [旧开局候选 as any]);

        expect(out.元数据.存档父节点哈希).toBe('');
        expect(out.元数据.存档谱系深度).toBe(0);
        expect(out.元数据.存档系列ID).not.toBe(读取存档系列ID(旧开局候选 as any));
    });
});

describe('本地存档谱系自愈（v1.0.665 写坏的"异常根续档"）', () => {
    const 默认开场 = '【旁白】乱星海的浪涛拍击礁石，远处天星城灯火明灭。';

    const 构建存档 = (options: {
        id: number;
        时间戳: number;
        回合数: number;
        元数据: Record<string, unknown>;
        开场内容?: string;
    }) => {
        const 开场内容 = options.开场内容 || 默认开场;
        const history: any[] = [
            { role: 'system', content: '系统: 正在生成开场内容...' },
            { role: 'assistant', content: 开场内容, structuredResponse: { 正文: 开场内容 } }
        ];
        for (let i = 0; i < options.回合数; i += 1) {
            history.push({ role: 'assistant', content: `第 ${i + 1} 回合正文`, structuredResponse: { 正文: `第 ${i + 1} 回合` } });
            history.push({ role: 'user', content: `第 ${i + 1} 回合玩家输入` });
        }
        return {
            id: options.id,
            类型: 'auto' as const,
            时间戳: options.时间戳,
            角色数据: { 姓名: '何夫锐' },
            游戏初始时间: '123:10:00:00:00',
            环境信息: { 大地点: '乱星海', 具体地点: '天星城·坊市' },
            历史记录: history,
            元数据: options.元数据
        };
    };

    // 完整链：开局根(0 回合) → 正常续档(50 回合) → 被写坏的根续档(98、110 回合)。
    // 被写坏的两个节点元数据里 游戏回合数 已被清 0、父哈希空、深度 0，但历史记录条数
    // 远大于开局（198 / 222 条）。修复后必须串成 0 → 1 → 2 → 3 深度的一条线。
    const 构建玩家数据 = () => {
        const 开局根 = 构建存档({
            id: 1,
            时间戳: 1779000000000,
            回合数: 0,
            元数据: {
                存档哈希: 'root000000000001',
                存档系列ID: 'series-chain',
                存档根节点哈希: 'root000000000001',
                存档父节点哈希: '',
                存档谱系深度: 0,
                游戏回合数: 0,
                存档分支输入: '开局',
                存档谱系版本: 1
            }
        });
        const 正常续档 = 构建存档({
            id: 2,
            时间戳: 1779000100000,
            回合数: 50,
            元数据: {
                存档哈希: 'mid0000000000002',
                存档系列ID: 'series-chain',
                存档根节点哈希: 'root000000000001',
                存档父节点哈希: 'root000000000001',
                存档谱系深度: 1,
                游戏回合数: 50,
                存档分支输入: '继续游玩',
                存档谱系版本: 1
            }
        });
        const 写坏A = 构建存档({
            id: 3,
            时间戳: 1779000200000,
            回合数: 98,
            元数据: {
                存档哈希: 'brokenA000000003',
                存档系列ID: 'series-brokenA',
                存档根节点哈希: 'brokenA000000003',
                存档父节点哈希: '',
                存档谱系深度: 0,
                游戏回合数: 0,
                存档分支输入: '开局',
                存档谱系版本: 1
            }
        });
        const 写坏B = 构建存档({
            id: 4,
            时间戳: 1779000300000,
            回合数: 110,
            元数据: {
                存档哈希: 'brokenB000000004',
                存档系列ID: 'series-brokenB',
                存档根节点哈希: 'brokenB000000004',
                存档父节点哈希: '',
                存档谱系深度: 0,
                游戏回合数: 0,
                存档分支输入: '开局',
                存档谱系版本: 1
            }
        });
        return [开局根, 正常续档, 写坏A, 写坏B].map((save, index) => 投影存档谱系轻量视图(save as any, index + 1));
    };

    it('被写坏的根续档必须重新挂回同一开局链，并恢复回合数', () => {
        const views = 构建玩家数据();
        const repaired = 修复本地存档谱系列表(views as any);

        // 必须报告 changed：否则 校正并写回本地存档谱系 会跳过落库，自愈只在内存里生效。
        expect(repaired.changed).toBe(true);

        const 取 = (id: number) => repaired.saves.find((item: any) => item.id === id) as any;
        const 开局根 = 取(1);
        const 正常续档 = 取(2);
        const 写坏A = 取(3);
        const 写坏B = 取(4);

        // 真实开局根不受影响，仍是 0 深度根节点
        expect(开局根.元数据.存档父节点哈希).toBe('');
        expect(开局根.元数据.存档谱系深度).toBe(0);
        expect(开局根.元数据.存档系列ID).toBe('series-chain');
        expect(开局根.元数据.存档分支输入).toBe('开局');

        // 正常续档保持原样
        expect(正常续档.元数据.存档父节点哈希).toBe('root000000000001');
        expect(正常续档.元数据.存档谱系深度).toBe(1);

        // 写坏A：挂到 50 回合的正常续档之下，并入 series-chain，回合数从 0 恢复为 98
        expect(写坏A.元数据.存档系列ID).toBe('series-chain');
        expect(写坏A.元数据.存档父节点哈希).toBe('mid0000000000002');
        expect(写坏A.元数据.存档根节点哈希).toBe('root000000000001');
        expect(写坏A.元数据.存档谱系深度).toBe(2);
        expect(写坏A.元数据.游戏回合数).toBe(98);
        expect(写坏A.元数据.存档分支输入).not.toBe('开局');

        // 写坏B：挂到写坏A之下，深度继续递增
        expect(写坏B.元数据.存档系列ID).toBe('series-chain');
        expect(写坏B.元数据.存档父节点哈希).toBe('brokenA000000003');
        expect(写坏B.元数据.存档根节点哈希).toBe('root000000000001');
        expect(写坏B.元数据.存档谱系深度).toBe(3);
        expect(写坏B.元数据.游戏回合数).toBe(110);
    });

    it('已挂接到写坏节点的后续存档必须同步切换系列与深度（防二次断裂）', () => {
        // 修复上线后新建的续档会挂在"写坏的根"之下：它本身元数据正确（深度 1、回合数正常），
        // 但父节点被自愈改换系列后，它必须跟着切换，否则会被再次拆成独立根。
        const views = 构建玩家数据();
        const 后续存档 = 投影存档谱系轻量视图(构建存档({
            id: 5,
            时间戳: 1779000400000,
            回合数: 104,
            元数据: {
                存档哈希: 'followUp00000005',
                存档系列ID: 'series-brokenA',
                存档根节点哈希: 'brokenA000000003',
                存档父节点哈希: 'brokenA000000003',
                存档谱系深度: 1,
                游戏回合数: 104,
                存档分支输入: '继续游玩',
                存档谱系版本: 1
            }
        }) as any, 5);

        const repaired = 修复本地存档谱系列表([...views, 后续存档] as any);
        expect(repaired.changed).toBe(true);

        const 取 = (id: number) => repaired.saves.find((item: any) => item.id === id) as any;
        const 写坏A = 取(3);
        const 后续 = 取(5);

        expect(写坏A.元数据.存档系列ID).toBe('series-chain');
        expect(后续.元数据.存档系列ID).toBe('series-chain');
        expect(后续.元数据.存档根节点哈希).toBe('root000000000001');
        expect(后续.元数据.存档父节点哈希).toBe('brokenA000000003');
        expect(后续.元数据.存档谱系深度).toBe(3);
        expect(后续.元数据.游戏回合数).toBe(104);
    });

    it('真实开局档（短历史、0 回合根）绝不被误判为异常根续档', () => {
        const 开局A = 投影存档谱系轻量视图(构建存档({
            id: 1,
            时间戳: 1779000000000,
            回合数: 0,
            元数据: {
                存档哈希: 'openA00000000001',
                存档系列ID: 'series-openA',
                存档根节点哈希: 'openA00000000001',
                存档父节点哈希: '',
                存档谱系深度: 0,
                游戏回合数: 0,
                存档分支输入: '开局',
                存档谱系版本: 1
            }
        }) as any, 1);
        const 开局B = 投影存档谱系轻量视图(构建存档({
            id: 2,
            时间戳: 1779000005000,
            回合数: 0,
            元数据: {
                存档哈希: 'openB00000000002',
                存档系列ID: 'series-openB',
                存档根节点哈希: 'openB00000000002',
                存档父节点哈希: '',
                存档谱系深度: 0,
                游戏回合数: 0,
                存档分支输入: '开局',
                存档谱系版本: 1
            }
        }) as any, 2);

        const repaired = 修复本地存档谱系列表([开局A, 开局B] as any);

        const 取 = (id: number) => repaired.saves.find((item: any) => item.id === id) as any;
        expect(取(1).元数据.存档父节点哈希).toBe('');
        expect(取(1).元数据.存档系列ID).toBe('series-openA');
        expect(取(2).元数据.存档父节点哈希).toBe('');
        expect(取(2).元数据.存档系列ID).toBe('series-openB');
    });

    // [回归] CodeRabbit P2：自愈选父节点必须与 选择存档父节点 保持同一约束——父节点保存时间
    // 不得晚于子节点。玩家读回较早存档后走另一条分支时，分支档历史更短但保存更晚；
    // 若只按"历史更短"选父，就会把更晚的分支档当成父节点，写出倒序且跨分支的父子关系，
    // 导致时间树、祖先同步与"删除整棵树"作用到错误分支。
    it('较晚保存的分支档不得被选为自愈父节点', () => {
        const T0 = 1779000000000;
        const 开局根 = 投影存档谱系轻量视图(构建存档({
            id: 1,
            时间戳: T0,
            回合数: 0,
            元数据: {
                存档哈希: 'root000000000001',
                存档系列ID: 'series-branch',
                存档根节点哈希: 'root000000000001',
                存档父节点哈希: '',
                存档谱系深度: 0,
                游戏回合数: 0,
                存档分支输入: '开局',
                存档谱系版本: 1
            }
        }) as any, 1);
        const 二十回合档 = 投影存档谱系轻量视图(构建存档({
            id: 2,
            时间戳: T0 + 1000,
            回合数: 20,
            元数据: {
                存档哈希: 'mid20turn00000002',
                存档系列ID: 'series-branch',
                存档根节点哈希: 'root000000000001',
                存档父节点哈希: 'root000000000001',
                存档谱系深度: 1,
                游戏回合数: 20,
                存档分支输入: '继续游玩',
                存档谱系版本: 1
            }
        }) as any, 2);
        // 被写坏的根续档：30 回合、保存于 T0+2000
        const 三十回合坏根 = 投影存档谱系轻量视图(构建存档({
            id: 3,
            时间戳: T0 + 2000,
            回合数: 30,
            元数据: {
                存档哈希: 'broken30turn000003',
                存档系列ID: 'series-broken30',
                存档根节点哈希: 'broken30turn000003',
                存档父节点哈希: '',
                存档谱系深度: 0,
                游戏回合数: 0,
                存档分支输入: '开局',
                存档谱系版本: 1
            }
        }) as any, 3);
        // 玩家随后读回 20 回合档、又玩 5 回合后保存的分支档：历史更短(25)但保存更晚(T0+3000)
        const 二十五回合分支 = 投影存档谱系轻量视图(构建存档({
            id: 4,
            时间戳: T0 + 3000,
            回合数: 25,
            元数据: {
                存档哈希: 'branch25turn000004',
                存档系列ID: 'series-branch',
                存档根节点哈希: 'root000000000001',
                存档父节点哈希: 'mid20turn00000002',
                存档谱系深度: 2,
                游戏回合数: 25,
                存档分支输入: '继续游玩',
                存档谱系版本: 1
            }
        }) as any, 4);

        const repaired = 修复本地存档谱系列表([开局根, 二十回合档, 三十回合坏根, 二十五回合分支] as any);
        const 取 = (id: number) => repaired.saves.find((item: any) => item.id === id) as any;

        // 坏根必须挂到更早保存的 20 回合档之下，而不是更晚保存的 25 回合分支档
        expect(取(3).元数据.存档父节点哈希).toBe('mid20turn00000002');
        expect(取(3).元数据.存档父节点哈希).not.toBe('branch25turn000004');
        expect(取(3).元数据.存档系列ID).toBe('series-branch');
        expect(取(3).元数据.游戏回合数).toBe(30);
        // 深度必须落在 20 回合档之下（既有写入器对分支兄弟按"前一兄弟深度+1"递增，故只断言关系）
        expect(取(3).元数据.存档谱系深度).toBeGreaterThan(取(2).元数据.存档谱系深度);

        // 分支档自身不受影响（仍是 20 回合档的子节点）
        expect(取(4).元数据.存档父节点哈希).toBe('mid20turn00000002');
        expect(取(4).元数据.游戏回合数).toBe(25);
    });
});
