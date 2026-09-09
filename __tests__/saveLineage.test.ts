import { describe, expect, it } from 'vitest';
import { 修复本地存档谱系列表, 补全存档谱系元数据, 读取存档系列ID } from '../utils/saveLineage';

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
});
