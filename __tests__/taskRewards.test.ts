import { describe, expect, it } from 'vitest';
import { 结算已完成任务奖励 } from '../utils/taskRewards';

const 创建奖励状态 = () => ({
    角色: {
        姓名: '陈砾',
        金钱: { 金元宝: 0, 银子: 0, 铜钱: 0 },
        物品列表: [],
        技艺: [{ 名称: '急救', 等级: '未入门', 熟练度: 0, 描述: '' }],
        可分配属性点: 0,
        门派贡献: 120
    },
    环境: { 时间: '0001:01:01:08:00' },
    玩家门派: {
        ID: 'camp_001',
        名称: '铁栅安全点',
        玩家职位: '营地成员',
        玩家贡献: 120,
        累计贡献: 1500,
        任务列表: [],
        兑换列表: [],
        重要成员: []
    },
    任务列表: [
        {
            标题: '守住第一夜',
            描述: '确认水源、药品和夜间警戒。',
            类型: '主线',
            发布人: '值班组长',
            发布地点: '铁栅安全点',
            推荐境界: '新手求生',
            当前状态: '已完成',
            目标列表: [{ 描述: '完成清点', 当前进度: 1, 总需进度: 1, 完成状态: true }],
            奖励描述: ['组织信用 +80', '净水包 x1', '急救熟练度 +8', '可分配属性点 +1']
        }
    ]
});

describe('任务完成奖励结算', () => {
    it('把非物品奖励落实到状态；物品奖励只记录到账，不由本地生成背包物品', () => {
        const response: any = { logs: [{ sender: '旁白', text: '值班组长点头确认你完成了清点。' }], tavern_commands: [] };
        const result = 结算已完成任务奖励({
            response,
            state: 创建奖励状态()
        });

        expect(result.changed).toBe(true);
        expect(result.state.玩家门派.玩家贡献).toBe(200);
        expect(result.state.玩家门派.累计贡献).toBe(1580);
        expect(result.state.角色.门派贡献).toBe(200);
        expect(result.state.角色.可分配属性点).toBe(1);
        expect(result.state.角色.技艺.find((item: any) => item.名称 === '急救')?.熟练度).toBe(8);
        expect(result.state.角色.物品列表).toEqual([]);
        expect(result.state.任务列表[0].奖励已发放).toBe(true);
        expect(result.state.任务列表[0].奖励发放人).toBe('值班组长');
        expect(result.state.任务列表[0].奖励到账记录).toContain('净水包 x1');
        expect(response.logs.some((log: any) => log.sender === '奖励' && log.text.includes('【任务完成】'))).toBe(true);
        expect(response.logs.some((log: any) => log.sender === '奖励' && log.text.includes('【奖励到账】') && log.text.includes('净水包 x1'))).toBe(true);
        expect(response.logs.some((log: any) => log.sender === '奖励' && log.text.includes('背包物品必须由AI变量命令写入'))).toBe(true);
    });

    it('已经发放过奖励的任务不会重复发放', () => {
        const state = 创建奖励状态();
        state.任务列表[0].奖励已发放 = true;
        state.任务列表[0].奖励到账记录 = ['组织信用 +80'];
        const response: any = { logs: [], tavern_commands: [] };
        const result = 结算已完成任务奖励({
            response,
            state
        });

        expect(result.changed).toBe(false);
        expect(result.state.玩家门派.玩家贡献).toBe(120);
        expect(result.state.玩家门派.累计贡献).toBe(1500);
        expect(result.state.角色.物品列表).toEqual([]);
        expect(response.logs).toEqual([]);
    });

    it('支持无限流奖励点和支线剧情结算到底层货币字段', () => {
        const state = 创建奖励状态();
        state.任务列表[0].标题 = '完成第一次主神任务';
        state.任务列表[0].奖励描述 = ['奖励点 +1000', 'D级支线剧情 +1', 'C级支线剧情 +1', '队伍信用 +30'];
        const response: any = { logs: [], tavern_commands: [] };
        const result = 结算已完成任务奖励({
            response,
            state
        });

        expect(result.changed).toBe(true);
        expect(result.state.角色.金钱.铜钱).toBe(1000);
        expect(result.state.角色.金钱.银子).toBe(1);
        expect(result.state.角色.金钱.金元宝).toBe(1);
        expect(result.state.角色.金钱.baseAmount).toBe(102000);
        expect(result.state.玩家门派.玩家贡献).toBe(150);
        expect(response.logs.some((log: any) => log.text.includes('奖励点 +1000') && log.text.includes('D级支线剧情 +1'))).toBe(true);
    });

    it('显式单币种 currencySystem 可以把文本奖励折算进 baseAmount', () => {
        const state = 创建奖励状态();
        state.任务列表[0].标题 = '完成同城委托';
        state.任务列表[0].奖励描述 = ['获得 500 ¥', '信用点 +300'];
        const response: any = { logs: [], tavern_commands: [] };
        const result = 结算已完成任务奖励({
            response,
            state,
            runtimeProfile: {
                economy: {
                    currencySystem: {
                        id: 'modern-credit',
                        name: '现代信用货币',
                        baseUnitId: 'credit',
                        formatStyle: 'single',
                        units: [
                            { id: 'credit', name: '信用点', symbol: '¥', baseRate: 1, order: 1, aliases: ['现金', '额度'] }
                        ]
                    }
                }
            } as any
        });

        expect(result.changed).toBe(true);
        expect(result.state.角色.金钱.baseAmount).toBe(800);
        expect(result.state.任务列表[0].奖励到账记录).toEqual(expect.arrayContaining(['¥ +500', '信用点 +300']));
    });

    it('显式多层 currencySystem 可以按 baseRate 折算货币奖励', () => {
        const state = 创建奖励状态();
        state.任务列表[0].标题 = '完成坊市委托';
        state.任务列表[0].奖励描述 = ['获得 2 银', '获得 1 金'];
        const response: any = { logs: [], tavern_commands: [] };
        const result = 结算已完成任务奖励({
            response,
            state,
            runtimeProfile: {
                economy: {
                    currencySystem: {
                        id: 'ancient-money',
                        name: '古代钱制',
                        baseUnitId: 'copper',
                        formatStyle: 'compound',
                        units: [
                            { id: 'gold', name: '金', baseRate: 10000, order: 3, aliases: ['金叶子'] },
                            { id: 'silver', name: '银', baseRate: 100, order: 2, aliases: ['银锭'] },
                            { id: 'copper', name: '铜', baseRate: 1, order: 1, aliases: ['铜板'] }
                        ]
                    }
                }
            } as any
        });

        expect(result.changed).toBe(true);
        expect(result.state.角色.金钱.baseAmount).toBe(10200);
        expect(result.state.任务列表[0].奖励到账记录).toEqual(expect.arrayContaining(['银 +2', '金 +1']));
    });
});
