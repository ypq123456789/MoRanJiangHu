import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SectModal from '../components/features/Sect/SectModal';
import MobileSect from '../components/features/Sect/MobileSect';
import TeamModal from '../components/features/Team/TeamModal';
import MobileTeamModal from '../components/features/Team/MobileTeamModal';
import { 执行变量自动校准 } from '../hooks/useGame/variableCalibration';
import { 创建空门派状态, 创建开场基础状态, 创建开场命令基态, 规范化门派状态, 是否无门派标识, 保护开局生成门派状态, 同步角色与门派状态 } from '../hooks/useGame/storyState';
import { 开局变量生成附加提示词, 构建开局变量生成审计重点 } from '../prompts/runtime/openingVariableGenerationInit';

describe('门派状态规范化', () => {
    it('无门派语义不会补默认同门', () => {
        const normalized = 规范化门派状态({
            ID: 'none',
            名称: '无门无派',
            玩家职位: '无',
            重要成员: [{ 姓名: '误生成的师兄' }],
            任务列表: [{ 标题: '误生成的门派任务' }]
        });

        expect(normalized).toEqual(创建空门派状态());
    });

    it('明确无门派标识会压过模型虚构的门派名称', () => {
        const normalized = 规范化门派状态({
            ID: 'none',
            名称: '青云山庄',
            玩家职位: '无'
        });

        expect(normalized.ID).toBe('none');
        expect(normalized.名称).toBe('无门无派');
        expect(normalized.重要成员).toEqual([]);
    });

    it('有效门派不再本地补固定同门', () => {
        const normalized = 规范化门派状态({
            ID: 'sect_qingyun',
            名称: '青云山庄',
            玩家职位: '外门弟子'
        });

        expect(normalized.ID).toBe('sect_qingyun');
        expect(normalized.重要成员).toEqual([]);
        expect(normalized.任务列表).toEqual([]);
        expect(是否无门派标识(normalized.ID)).toBe(false);
    });

    it('有效门派 ID 或名称不会因为玩家职位暂为无而被判成未加入', () => {
        const normalized = 规范化门派状态({
            ID: 'sect_xuanmo',
            名称: '玄墨派',
            玩家职位: '无'
        });

        expect(normalized.ID).toBe('sect_xuanmo');
        expect(normalized.名称).toBe('玄墨派');
        expect(normalized.玩家职位).toBe('杂役弟子');
        expect(是否无门派标识(normalized.ID)).toBe(false);
    });

    it('只有角色所属门派被更新时会同步修复玩家门派状态', () => {
        const synced = 同步角色与门派状态({
            角色: {
                姓名: '沈墨',
                所属门派ID: '玄墨派',
                门派职位: '外门弟子',
                门派贡献: 120
            },
            玩家门派: 创建空门派状态()
        } as any);

        expect(synced.玩家门派.ID).toBe('玄墨派');
        expect(synced.玩家门派.玩家职位).toBe('外门弟子');
        expect(synced.角色.所属门派ID).toBe('玄墨派');
        expect(synced.角色.门派职位).toBe('外门弟子');
    });

    it('变量自动校准不会把半同步的已加入宗门清空', () => {
        const result = 执行变量自动校准({
            角色: {
                姓名: '沈墨',
                所属门派ID: '玄墨派',
                门派职位: '外门弟子',
                门派贡献: 120,
                当前精力: 10,
                最大精力: 10,
                当前内力: 0,
                最大内力: 0,
                当前饱腹: 0,
                最大饱腹: 0,
                当前口渴: 0,
                最大口渴: 0
            } as any,
            环境: {} as any,
            社交: [],
            世界: {} as any,
            战斗: {} as any,
            玩家门派: { ID: 'none', 名称: '无门无派', 玩家职位: '无' } as any,
            任务列表: [],
            约定列表: [],
            剧情: {} as any,
            剧情规划: {} as any
        }, {
            规范化环境信息: (value?: any) => value || {},
            规范化社交列表: (value?: any[]) => value || [],
            规范化世界状态: (value?: any) => value || {},
            规范化战斗状态: (value?: any) => value || {},
            规范化门派状态,
            规范化剧情状态: (value?: any) => value || {},
            规范化剧情规划状态: (value?: any) => value || {},
            规范化女主剧情规划状态: (value?: any) => value,
            规范化同人剧情规划状态: (value?: any) => value,
            规范化同人女主剧情规划状态: (value?: any) => value,
            规范化角色物品容器映射: (value?: any) => value || {}
        });

        expect(result.state.玩家门派.ID).toBe('玄墨派');
        expect(result.state.玩家门派.玩家职位).toBe('外门弟子');
        expect(result.state.角色.所属门派ID).toBe('玄墨派');
    });

    it('兼容小写和模式化组织字段，避免轮回小队读成无组织', () => {
        const normalized = 规范化门派状态({
            id: 'team-7',
            名称: '第七轮回小队',
            类型: '轮回小队',
            描述: '轮回者内部协作组织。',
            职位: '新人队长',
            资源: { 奖励点: 320, 物资: 350, 建设: 180 },
            商城: [{ 名称: '止血喷雾', 类型: '消耗品', 价格: 50 }],
            成员列表: [{ id: 'npc-ye-qing', 姓名: '叶青', 性别: '女', 身份: '正式队友' }]
        });

        expect(normalized.ID).toBe('team-7');
        expect(normalized.名称).toBe('第七轮回小队');
        expect(normalized.组织语义).toBe('轮回小队');
        expect(normalized.玩家职位).toBe('新人队长');
        expect(normalized.门派资金).toBe(320);
        expect(normalized.重要成员).toHaveLength(1);
        expect(normalized.重要成员[0]?.姓名).toBe('叶青');
        expect(normalized.兑换列表.some((item: any) => item?.物品名称 === '止血喷雾')).toBe(true);
    });

    it('家族门派不再本地套用固定同门姓氏', () => {
        const normalized = 规范化门派状态({
            ID: 'Org001',
            名称: '杨家堡',
            玩家职位: '少主'
        });

        expect(normalized.重要成员).toEqual([]);
        expect(normalized.名称).toBe('杨家堡');
    });

    it('已有少量门派成员时只保留明确成员', () => {
        const normalized = 规范化门派状态({
            ID: 'Org001',
            名称: '杨家堡',
            玩家职位: '少主',
            重要成员: [{ id: 'NPC002', 姓名: '杨承岳', 性别: '男', 年龄: 48, 身份: '堡主' }]
        });

        expect(normalized.重要成员).toHaveLength(1);
        expect(normalized.重要成员[0]?.姓名).toBe('杨承岳');
        expect(normalized.重要成员.some((member: any) => ['沈若嫣', '杨震', '陆明澈'].includes(member?.姓名))).toBe(false);
    });

    it('开局命令基态会保留已选择生成的门派并生成可用同门', () => {
        const openingBase = 创建开场基础状态(
            {
                姓名: '沈墨',
                所属门派ID: '玄墨派',
                门派职位: '外门弟子',
                门派贡献: 100
            } as any,
            {} as any,
            {
                初始关系模板: '师门牵引',
                关系侧重: ['师门'],
                开局切入偏好: '门派起手',
                开局生成门派: true,
                开局生成同门: true,
                同人融合: {
                    enabled: false,
                    作品名: '',
                    来源类型: '原创',
                    融合强度: '轻度',
                    保留原著角色: false,
                    启用角色替换: false,
                    替换目标角色名: '',
                    附加替换角色名列表: [],
                    附加角色替换规则列表: [],
                    启用附加小说: false,
                    附加小说数据集ID: ''
                }
            } as any
        );
        const commandBase = 创建开场命令基态(openingBase);

        expect(commandBase.玩家门派.名称).toBe('玄墨派');
        expect(commandBase.玩家门派.玩家职位).toBe('外门弟子');
        expect(commandBase.玩家门派.重要成员.length).toBeGreaterThanOrEqual(6);
        expect(commandBase.玩家门派.门派等级).toBeTruthy();
        expect(JSON.stringify(commandBase.玩家门派)).not.toMatch(/待AI|开局模板|请由AI/);
    });

    it('勾选开局生成门派时即使没有预填门派也会生成沉浸式门派数据', () => {
        const openingBase = 创建开场基础状态(
            {
                姓名: '陆行舟',
                出身背景: { 名称: '寒门孤身' },
                所属门派ID: 'none',
                门派职位: '无',
                门派贡献: 0
            } as any,
            {} as any,
            {
                题材模式: '仙侠',
                开局生成门派: true,
                开局生成同门: true
            } as any
        );

        expect(openingBase.玩家门派.名称).not.toMatch(/待AI|开局模板|无门无派/);
        expect(openingBase.玩家门派.玩家职位).toBe('杂役弟子');
        expect(openingBase.玩家门派.累计贡献).toBe(0);
        expect(openingBase.玩家门派.弟子总数).toBeGreaterThan(0);
        expect(openingBase.玩家门派.重要成员.length).toBeGreaterThanOrEqual(6);
        expect(openingBase.玩家门派.任务列表).toEqual([]);
        expect(openingBase.任务列表).toEqual([]);
        expect(JSON.stringify(openingBase.玩家门派)).not.toMatch(/待AI|请由AI|开局模板/);
        expect(JSON.stringify(openingBase.任务列表)).not.toMatch(/待AI|请由AI|开局模板|后山栈道|旧账未清|门中历练|问道初途|初入江湖/);
        expect(openingBase.角色.所属门派ID).toBe(openingBase.玩家门派.ID);
        expect(openingBase.角色.门派职位).toBe('杂役弟子');
    });

    it('无限流开局不再生成模板支线和大型轮回队', () => {
        const openingBase = 创建开场基础状态(
            {
                姓名: '张楚岚',
                出身背景: { 名称: '轮回新人' },
                所属门派ID: 'none',
                门派职位: '无',
                门派贡献: 0
            } as any,
            {} as any,
            {
                题材模式: '无限流',
                开局生成门派: true,
                开局生成同门: true
            } as any
        );

        expect(openingBase.玩家门派.组织语义).toBe('轮回小队');
        expect(openingBase.玩家门派.玩家职位).toBe('新人');
        expect(openingBase.玩家门派.弟子总数).toBe(2);
        expect(openingBase.玩家门派.重要成员).toHaveLength(2);
        expect(JSON.stringify(openingBase.玩家门派.藏经阁列表)).toContain('精神力扫描');
        expect(JSON.stringify(openingBase.玩家门派.藏经阁列表)).not.toMatch(/临时同盟精神力扫描|轮回小队精神力扫描|主神小队精神力扫描/);
        expect(openingBase.任务列表).toEqual([]);
        expect(JSON.stringify(openingBase.任务列表)).not.toMatch(/确认第一项主线任务|后山栈道|旧账未清|门中历练|支线剧情 x1|D级支线剧情/);
    });

    it('末日丧尸开局生成的是营地和幸存者成员而不是门派模板', () => {
        const openingBase = 创建开场基础状态(
            {
                姓名: '陈砾',
                出身背景: { 名称: '维修工' },
                所属门派ID: 'none',
                门派职位: '无',
                门派贡献: 0
            } as any,
            {} as any,
            {
                题材模式: '末日丧尸',
                开局生成门派: true,
                开局生成同门: true
            } as any
        );

        expect(openingBase.玩家门派.名称).toMatch(/营地|避难所|车队|安全点|哨站|救援站/);
        expect(openingBase.玩家门派.玩家职位).toBe('营地成员');
        expect(openingBase.玩家门派.组织语义).toBe('营地');
        expect(openingBase.玩家门派.藏经阁列表?.length).toBeGreaterThan(0);
        expect(JSON.stringify(openingBase.玩家门派.藏经阁列表)).toMatch(/感染|搜救|枪械|训练|防护/);
        expect(JSON.stringify(openingBase.玩家门派.藏经阁列表)).not.toMatch(/剑法|心法|身法|藏经阁|聚宝阁|弟子|宗门|门派|吐纳|丹田/);
        expect(openingBase.角色.功法列表).toEqual([]);
        expect(openingBase.玩家门派.兑换列表.length).toBeGreaterThan(0);
        expect(JSON.stringify(openingBase.玩家门派.兑换列表)).toMatch(/净水片|急救包|维修工具包/);
        expect(openingBase.玩家门派.重要成员.some((member: any) => /营地|物资|巡逻|医护|维修|哨兵|搜救|同行者/.test(member.身份))).toBe(true);
        expect(openingBase.任务列表).toEqual([]);
        expect(JSON.stringify(openingBase.任务列表)).not.toMatch(/守住第一夜|组织信用|急救熟练度|可分配属性点|净水包|门派任务|同门|弟子|藏经阁|山门|辟谷丹|回气丹|凝元丹|破境丹/);
    });

    it('现代都市开局生成的是现实组织和成员而不是门派模板', () => {
        const openingBase = 创建开场基础状态(
            {
                姓名: '周行',
                出身背景: { 名称: '普通职员' },
                所属门派ID: 'none',
                门派职位: '无',
                门派贡献: 0
            } as any,
            {} as any,
            {
                题材模式: '现代都市',
                开局生成门派: true,
                开局生成同门: true
            } as any
        );

        expect(openingBase.玩家门派.名称).toMatch(/公司|项目组|事务所|社区中心|门店|合作团队/);
        expect(openingBase.玩家门派.玩家职位).toBe('成员');
        expect(openingBase.玩家门派.组织语义).toBe('组织');
        expect(openingBase.玩家门派.藏经阁列表?.length).toBeGreaterThan(0);
        expect(JSON.stringify(openingBase.玩家门派.藏经阁列表)).toMatch(/培训|协调|设备|外勤|应急|资料/);
        expect(JSON.stringify(openingBase.玩家门派.藏经阁列表)).not.toMatch(/剑法|心法|身法|藏经阁|聚宝阁|弟子|宗门|门派|吐纳|丹田/);
        expect(openingBase.角色.功法列表).toEqual([]);
        expect(openingBase.玩家门派.兑换列表.length).toBeGreaterThan(0);
        expect(JSON.stringify(openingBase.玩家门派.兑换列表)).toMatch(/外勤工具包|便携急救包|资料调阅权限/);
        expect(openingBase.玩家门派.重要成员.some((member: any) => /负责人|同事|行政|技术|外勤|合作伙伴|社区|实习/.test(member.身份))).toBe(true);
        expect(openingBase.任务列表).toEqual([]);
        expect(JSON.stringify(openingBase.任务列表)).not.toMatch(/站稳第一步|组织信用|谈判熟练度|门派任务|同门|弟子|藏经阁|山门/);
    });

    it('关闭开局配置时保留题材技艺但不自动生成默认武侠门派', () => {
        const openingBase = 创建开场基础状态(
            {
                姓名: '林启',
                出身背景: { 名称: '都市新人' },
                所属门派ID: 'none',
                门派职位: '无',
                门派贡献: 0
            } as any,
            {} as any,
            {
                配置约束启用: false,
                题材模式: '现代都市',
                开局生成门派: true,
                开局生成同门: true
            } as any
        );

        expect(openingBase.玩家门派).toEqual(创建空门派状态());
        expect(openingBase.角色.所属门派ID).toBe('none');
        expect(JSON.stringify(openingBase.玩家门派)).not.toMatch(/归雁|山庄|剑派|武馆|聚宝阁/);
    });

    it('都市修仙开局组织不再落回武侠门派模板', () => {
        const openingBase = 创建开场基础状态(
            {
                姓名: '许衡',
                出身背景: { 名称: '灵潮见闻者' },
                所属门派ID: 'none',
                门派职位: '无',
                门派贡献: 0
            } as any,
            {} as any,
            {
                题材模式: '都市修仙',
                开局生成门派: true,
                开局生成同门: true
            } as any
        );

        expect(openingBase.玩家门派.组织语义).toBe('组织');
        expect(openingBase.玩家门派.名称).toMatch(/公司|项目组|事务所|社区中心|门店|合作团队/);
        expect(openingBase.玩家门派.玩家职位).toBe('成员');
        expect(JSON.stringify(openingBase.玩家门派)).not.toMatch(/归雁|山庄|剑派|武馆|辟谷丹|凝元丹|破境丹/);
        expect(openingBase.任务列表).toEqual([]);
        expect(JSON.stringify(openingBase.任务列表)).not.toMatch(/站稳第一步|组织信用|谈判熟练度|门派任务|同门|弟子|山门/);
    });

    it('末日组织会替换历史存档里的古风资料，但不再替换或生成兑换物品', () => {
        const normalized = 规范化门派状态({
            ID: 'camp_001',
            名称: '铁栅安全点',
            组织语义: '营地',
            玩家职位: '营地成员',
            藏经阁列表: [{ id: 'old', 名称: '入门剑法', 类型: '功法', 简介: '藏经阁典籍', 要求职位: '杂役弟子', 要求累计贡献: 0 }],
            兑换列表: [{ id: 'old_good', 物品名称: '辟谷丹', 类型: '丹药', 兑换价格: 30, 库存: 1, 要求职位: '杂役弟子' }]
        } as any);

        expect(JSON.stringify(normalized.藏经阁列表)).toMatch(/感染|搜救|枪械|训练|防护/);
        expect(JSON.stringify(normalized.藏经阁列表)).not.toMatch(/剑法|藏经阁|杂役弟子/);
        expect(normalized.兑换列表).toEqual([{ id: 'old_good', 物品名称: '辟谷丹', 类型: '丹药', 兑换价格: 30, 库存: 1, 要求职位: '杂役弟子' }]);
    });

    it('轮回小队不再把模型写入的兑换物品替换为本地主神商城商品', () => {
        const normalized = 规范化门派状态({
            ID: 'team_001',
            名称: '第七轮回小队',
            组织语义: '轮回小队',
            玩家职位: '新人',
            兑换列表: [{ id: 'old_good', 物品名称: '辟谷丹', 类型: '丹药', 兑换价格: 30, 库存: 1, 要求职位: '杂役弟子' }]
        } as any);

        expect(normalized.兑换列表).toEqual([{ id: 'old_good', 物品名称: '辟谷丹', 类型: '丹药', 兑换价格: 30, 库存: 1, 要求职位: '杂役弟子' }]);
    });

    it('营地面板按累计贡献显示职位，1500 累计贡献不再停留在营地成员', () => {
        const sectData: any = {
            ID: 'camp_001',
            名称: '铁栅安全点',
            组织语义: '营地',
            简介: '末日营地。',
            门规: ['外出结伴'],
            门派资金: 1200,
            门派物资: 600,
            建设度: 200,
            门派等级: '稳定营地',
            门派规模: '小型营地',
            弟子总数: 60,
            战力分布: { 后勤: 20, 巡逻: 15, 医疗维修: 8 },
            财富评级: '库存稳定',
            月俸规则: { 基础俸禄: 1, 贡献系数: 0, 规模系数: 0, 发放说明: '' },
            玩家职位: '营地成员',
            玩家贡献: 0,
            累计贡献: 1500,
            任务列表: [],
            兑换列表: [],
            藏经阁列表: [],
            重要成员: []
        };

        const desktopHtml = renderToStaticMarkup(React.createElement(SectModal, {
            sectData,
            onClose: () => undefined
        }));
        const mobileHtml = renderToStaticMarkup(React.createElement(MobileSect, {
            sectData,
            onClose: () => undefined
        }));

        expect(desktopHtml).toMatch(/身份[\s\S]{0,300}营地管理人员/);
        expect(mobileHtml).toMatch(/铁栅安全点[\s\S]{0,300}营地管理人员/);
    });

    it('宗门面板不会把有效组织 ID 但职位暂为无的存档显示成未加入', () => {
        const sectData: any = {
            ID: 'sect_xuanmo',
            名称: '玄墨派',
            简介: '隐于墨山的宗门。',
            门规: ['不可同门相残'],
            门派资金: 1200,
            门派物资: 350,
            建设度: 180,
            门派等级: '小型门派',
            门派规模: '小型',
            弟子总数: 18,
            战力分布: {},
            财富评级: '薄有积蓄',
            月俸规则: { 基础俸禄: 0, 贡献系数: 0, 规模系数: 0, 发放说明: '' },
            玩家职位: '无',
            玩家贡献: 0,
            累计贡献: 0,
            任务列表: [],
            兑换列表: [],
            藏经阁列表: [],
            重要成员: []
        };

        const desktopHtml = renderToStaticMarkup(React.createElement(SectModal, {
            sectData,
            onClose: () => undefined
        }));
        const mobileHtml = renderToStaticMarkup(React.createElement(MobileSect, {
            sectData,
            onClose: () => undefined
        }));

        expect(desktopHtml).toContain('玄墨派');
        expect(desktopHtml).not.toContain('尚未加入组织');
        expect(desktopHtml).toContain('聚宝阁');
        expect(desktopHtml).not.toContain('据点总览');
        expect(desktopHtml).not.toContain('营地成员');
        expect(desktopHtml).not.toContain('物资库');
        expect(mobileHtml).toContain('玄墨派');
        expect(mobileHtml).not.toContain('尚未加入组织');
        expect(mobileHtml).toContain('兑换');
        expect(mobileHtml).not.toContain('营地成员');
        expect(mobileHtml).not.toContain('物资库');
    });

    it('同门名录中的主角使用主角头像且主角标记不覆盖身份徽章', () => {
        const sectData: any = {
            ID: 'sect_yunxiu',
            名称: '云岫剑宗',
            简介: '山门初立。',
            门规: ['不可同门相残'],
            门派资金: 1000,
            门派物资: 500,
            建设度: 100,
            门派等级: '小型门派',
            门派规模: '小型',
            弟子总数: 3,
            玩家职位: '杂役弟子',
            玩家贡献: 0,
            累计贡献: 0,
            任务列表: [],
            兑换列表: [],
            藏经阁列表: [],
            重要成员: [
                { id: 'sect_member_player_yang', 姓名: '杨培强', 性别: '男', 年龄: 27, 境界: '炼气一层', 身份: '杂役弟子', 简介: '玩家本人。', 是否玩家本人: true },
                { id: 'sect_member_yuehe', 姓名: '俞月荷', 性别: '女', 年龄: 26, 境界: '炼气一层', 身份: '杂役弟子', 简介: '同入门弟子。' }
            ]
        };
        const playerProfile = { 姓名: '杨培强', 头像图片URL: 'https://img.example.com/player-avatar.png' };

        const desktopHtml = renderToStaticMarkup(React.createElement(SectModal, {
            sectData,
            playerProfile,
            initialTab: 'members',
            onClose: () => undefined
        } as any));
        const mobileHtml = renderToStaticMarkup(React.createElement(MobileSect, {
            sectData,
            playerProfile,
            initialTab: 'members',
            onClose: () => undefined
        } as any));

        expect(desktopHtml).toContain('https://img.example.com/player-avatar.png');
        expect(mobileHtml).toContain('https://img.example.com/player-avatar.png');
        expect(desktopHtml).not.toContain('absolute right-3 top-3');
        expect(mobileHtml).not.toContain('absolute right-3 top-3');
    });

    it('无限流面板用贡献决定进阶，不把新人队长显示成高阶身份', () => {
        const sectData: any = {
            ID: 'team_zero',
            名称: '零号临时同盟',
            组织语义: '轮回小队',
            简介: '在主神空间中临时组建的求生小队。',
            门规: ['活下去'],
            门派资金: 0,
            门派物资: 0,
            建设度: 0,
            门派等级: '精英轮回队',
            门派规模: '大型轮回队',
            弟子总数: 123,
            财富评级: '兑换储备稳定',
            月俸规则: { 基础俸禄: 120, 贡献系数: 0.08, 规模系数: 1.25, 发放说明: '' },
            玩家职位: '新人队长',
            玩家贡献: 0,
            累计贡献: 0,
            任务列表: [],
            兑换列表: [],
            藏经阁列表: [],
            重要成员: [
                { id: 'player', 姓名: '张楚岚', 性别: '男', 年龄: 22, 身份: '新人队长', 境界: '新人', 简介: '玩家本人。' },
                { id: 'npc-feng', 姓名: '冯宝宝', 性别: '女', 年龄: 20, 身份: '正式队友', 境界: '新人', 简介: '队友。' }
            ]
        };

        const desktopHtml = renderToStaticMarkup(React.createElement(SectModal, {
            sectData,
            onClose: () => undefined
        }));
        const mobileHtml = renderToStaticMarkup(React.createElement(MobileSect, {
            sectData,
            onClose: () => undefined
        }));

        expect(desktopHtml).toMatch(/身份[\s\S]{0,300}新人[\s\S]{0,80}队长/);
        expect(desktopHtml).toContain('临时轮回小队');
        expect(desktopHtml).toContain('双人小队');
        expect(desktopHtml).not.toContain('核心轮回者');
        expect(desktopHtml).not.toContain('123');
        expect(mobileHtml).toContain('新人 · 队长');
        expect(mobileHtml).toContain('双人小队');
        expect(mobileHtml).not.toContain('核心轮回者');
        expect(mobileHtml).not.toContain('123');
    });

    it('队伍界面不会把玩家本人重复列为队友', () => {
        const character: any = { 姓名: '张楚岚', 境界: '新人', 当前精力: 10, 最大精力: 10, 当前内力: 0, 最大内力: 0 };
        const teammates: any[] = [
            { id: 'self', 姓名: '张楚岚', 是否队友: true, 是否玩家本人: true, 性别: '男', 身份: '队长' },
            { id: 'self-dup', 姓名: '张楚岚', 是否队友: true, 性别: '男', 身份: '队长' },
            { id: 'npc-bao', 姓名: '冯宝宝', 是否队友: true, 性别: '女', 身份: '正式队友' }
        ];

        const desktopHtml = renderToStaticMarkup(React.createElement(TeamModal, {
            character,
            teammates,
            openingConfig: { 题材模式: '无限流' } as any,
            onClose: () => undefined
        }));
        const mobileHtml = renderToStaticMarkup(React.createElement(MobileTeamModal, {
            character,
            teammates,
            openingConfig: { 题材模式: '无限流' } as any,
            onClose: () => undefined
        }));

        expect(desktopHtml).toContain('小队成员 (2)');
        expect((desktopHtml.match(/冯宝宝/g) || []).length).toBe(1);
        expect(mobileHtml).toContain('1 人');
        expect((mobileHtml.match(/冯宝宝/g) || []).length).toBe(1);
    });

    it('开局门派会按当前门派生成入门功法，不再固定为青云剑法', () => {
        const openingBase = 创建开场基础状态(
            {
                姓名: '杨培强',
                所属门派ID: '杨家堡',
                门派职位: '少主',
                门派贡献: 500,
                当前内力: 30,
                最大内力: 30,
                境界: '开脉境三重',
                境界层级: 3,
                功法列表: []
            } as any,
            {} as any,
            {
                开局生成门派: true,
                开局生成同门: true
            } as any
        );

        expect(openingBase.玩家门派.名称).toBe('杨家堡');
        expect(openingBase.玩家门派.藏经阁列表.length).toBeGreaterThan(0);
        expect(openingBase.角色.功法列表.length).toBeGreaterThan(0);
        expect(JSON.stringify(openingBase.玩家门派.藏经阁列表)).toContain('杨家堡');
        expect(JSON.stringify(openingBase.玩家门派.藏经阁列表)).not.toContain('青云剑法');
        expect(openingBase.角色.功法列表[0].名称).not.toBe('青云剑法');
        expect(开局变量生成附加提示词).toContain('角色.功法列表');
        expect(开局变量生成附加提示词).toContain('根据第0回合正文、建档、门派、职位、贡献、境界、内力与出身因果生成');
        expect(开局变量生成附加提示词).toContain('不要依赖或复述本地固定兜底名称');
    });

    it('无门派但已有修炼事实时不再本地固定补功法，交给 AI 生成合理入门功法', () => {
        const openingBase = 创建开场基础状态(
            {
                姓名: '散修',
                所属门派ID: 'none',
                门派职位: '无',
                门派贡献: 0,
                当前内力: 12,
                最大内力: 12,
                境界: '开脉境一重',
                境界层级: 1,
                功法列表: []
            } as any,
            {} as any,
            {
                开局生成门派: false,
                开局生成同门: false
            } as any
        );

        expect(openingBase.玩家门派.名称).toBe('无门无派');
        expect(openingBase.角色.功法列表).toEqual([]);
        expect(开局变量生成附加提示词).toContain('无门派但已有境界、内力、家传、散修或江湖经历');
        expect(构建开局变量生成审计重点()).toContain('功法应由 AI 按当前门派/身份/贡献/境界/内力/出身生成');
        expect(构建开局变量生成审计重点()).toContain('不能用本地固定模板直接补齐');
    });

    it('明确凡人无门派时不开局补功法', () => {
        const openingBase = 创建开场基础状态(
            {
                姓名: '凡人',
                所属门派ID: 'none',
                门派职位: '无',
                门派贡献: 0,
                当前内力: 0,
                最大内力: 0,
                境界: '未入境',
                境界层级: 0,
                功法列表: []
            } as any,
            {} as any,
            {
                开局生成门派: false,
                开局生成同门: false
            } as any
        );

        expect(openingBase.角色.功法列表).toEqual([]);
    });

    it('开局生成门派不会被模型命令覆盖回无门无派', () => {
        const base = 创建开场命令基态(创建开场基础状态(
            {
                姓名: '沈墨',
                所属门派ID: '玄墨派',
                门派职位: '外门弟子',
                门派贡献: 100
            } as any,
            {} as any,
            {
                初始关系模板: '师门牵引',
                关系侧重: ['师门'],
                开局切入偏好: '门派起手',
                开局生成门派: true,
                开局生成同门: true
            } as any
        ));

        const protectedState = 保护开局生成门派状态({
            ...base,
            角色: { ...base.角色, 所属门派ID: 'none', 门派职位: '无', 门派贡献: 0 },
            玩家门派: { ID: 'none', 名称: '无门无派', 玩家职位: '无' }
        }, base, { 开局生成门派: true } as any);

        expect(protectedState.玩家门派.名称).toBe('玄墨派');
        expect(protectedState.玩家门派.重要成员.length).toBeGreaterThanOrEqual(6);
        expect(protectedState.角色.所属门派ID).toBe('玄墨派');
        expect(protectedState.角色.门派职位).toBe('外门弟子');
    });
});
