import { describe, expect, it, vi } from 'vitest';
import { 执行响应命令处理, 响应命令处理状态 } from '../hooks/useGame/responseCommandProcessor';
import { 规范化社交列表 } from '../hooks/useGame/stateTransforms';
import { 创建手动NPC工作流 } from '../hooks/useGame/manualNpcWorkflow';

/**
 * 回归：新角色进不了角色资料库 / 关系网。
 *
 * 玩家实测反馈（v1.0.689 之后）：
 *  - 开新档依旧无法新增角色；
 *  - 后台 NPC 管理里手动新增也不行（旧存档同样不行）；
 *  - 旧存档里 AI 新增角色正常。
 *
 * 两个独立缺陷，同在「姓名规范化是否丢弃整条记录」这一层：
 *  1. 手动新增的默认占位名 `新NPC<n>` 含数字 → 被判「格式非法且非占位名」→ 整条丢弃；
 *  2. 新档开局 AI 常用代称命名（青衣女子 / 白衣少女 / 老掌柜），这类名字要「稳定 ID + 实质档案」
 *     才保留，而 AI 的 push 社交 通常不写 id，标准化后是 npc_<下标>（不稳定）→ 整条丢弃。
 */

const 构建基础状态 = (): 响应命令处理状态 => ({
    角色: { 姓名: '杨培强' } as any,
    环境: {} as any,
    社交: [],
    世界: {} as any,
    战斗: {} as any,
    玩家门派: {} as any,
    任务列表: [],
    约定列表: [],
    剧情: {} as any,
    剧情规划: {} as any
});

const deps = {
    规范化环境信息: (value?: any) => value || {},
    规范化社交列表,
    规范化世界状态: (value?: any) => value || {},
    规范化战斗状态: (value?: any) => value || {},
    规范化门派状态: (value?: any) => value || {},
    规范化剧情状态: (value?: any) => value || {},
    规范化剧情规划状态: (value?: any) => value || {},
    规范化女主剧情规划状态: (value?: any) => value,
    规范化同人剧情规划状态: (value?: any) => value,
    规范化同人女主剧情规划状态: (value?: any) => value,
    规范化角色物品容器映射: (value?: any) => value || {},
    战斗结束自动清空: (value?: any) => value || {}
};

const 新NPC值 = (姓名: string, extra: Record<string, any> = {}) => ({
    姓名,
    性别: '女',
    年龄: 18,
    身份: '青城派弟子',
    境界: '炼气',
    是否主要角色: true,
    好感度: 0,
    关系状态: '陌生',
    简介: '本回合登场人物',
    ...extra
});

const 建手动工作流 = (initial: any[]) => {
    const state = { social: initial };
    const workflow = 创建手动NPC工作流({
        获取环境: () => ({}),
        环境时间转标准串: () => '未时',
        规范化社交列表,
        设置社交: (updater: any) => {
            state.social = typeof updater === 'function' ? updater(state.social) : updater;
        },
        执行社交自动存档: () => {},
        保存图片资源: async (dataUrl: string) => dataUrl
    });
    return { state, workflow };
};

describe('缺陷一：后台手动新增 NPC 必须真正落库', () => {
    it('空列表下用默认占位名新增，记录必须出现', () => {
        const { state, workflow } = 建手动工作流([]);
        workflow.createNpcManually({ 姓名: '新NPC1', 身份: '待编辑', 简介: '' } as any);
        expect(state.social.map((npc: any) => npc?.姓名)).toEqual(['新NPC1']);
    });

    it('已有角色时新增，不能把新记录吞掉', () => {
        const { state, workflow } = 建手动工作流([
            { id: 'npc_existing', 姓名: '沈青娥', 性别: '女', 年龄: 22, 境界: '炼气', 身份: '青城派弟子', 是否主要角色: true, 简介: '已有角色' }
        ]);
        workflow.createNpcManually({ 姓名: '新NPC2', 身份: '待编辑', 简介: '' } as any);
        expect(state.social.map((npc: any) => npc?.姓名)).toEqual(['沈青娥', '新NPC2']);
    });

    it('连续手动新增多条，全部保留', () => {
        const { state, workflow } = 建手动工作流([]);
        workflow.createNpcManually({ 姓名: '新NPC1', 身份: '待编辑', 简介: '' } as any);
        workflow.createNpcManually({ 姓名: '新NPC2', 身份: '待编辑', 简介: '' } as any);
        expect(state.social.map((npc: any) => npc?.姓名)).toEqual(['新NPC1', '新NPC2']);
    });

    it('手动新增后可用真实姓名改写并保留', () => {
        const { state, workflow } = 建手动工作流([]);
        workflow.createNpcManually({ 姓名: '新NPC1', 身份: '待编辑', 简介: '' } as any);
        const created = state.social[0];
        workflow.updateNpcManually(created.id, { ...created, 姓名: '柳如烟' } as any);
        expect(state.social.map((npc: any) => npc?.姓名)).toEqual(['柳如烟']);
    });

    it('默认占位名被识别为占位，允许 AI 后续用真名替换', () => {
        const state = 构建基础状态();
        state.社交 = [
            { id: 'npc_manual_1', 姓名: '新NPC1', 性别: '女', 身份: '待编辑', 简介: '手动建档' }
        ] as any;
        const result = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '柳如烟收剑入鞘。' }],
            tavern_commands: [{ action: 'set', key: 'gameState.社交[0].姓名', value: '柳如烟' }]
        } as any, state, deps, undefined, { applyState: false });
        expect(result.社交.map((npc: any) => npc?.姓名)).toEqual(['柳如烟']);
    });
});

describe('缺陷二：新档开局 AI 用代称命名的新角色必须入档', () => {
    it.each(['青衣女子', '白衣少女', '老掌柜'])('正文提到、命令未带 id 的代称角色 %s 落库且获得稳定 id', (姓名) => {
        const state = 执行响应命令处理({
            logs: [{ sender: '旁白', text: `${姓名}立在檐下，衣袂被夜风吹起。` }],
            tavern_commands: [{ action: 'push', key: 'gameState.社交', value: 新NPC值(姓名) }]
        } as any, 构建基础状态(), deps, undefined, { applyState: false });
        expect(state.社交.map((npc: any) => npc?.姓名)).toEqual([姓名]);
        const id = state.社交[0]?.id;
        expect(typeof id).toBe('string');
        expect(id).not.toMatch(/^npc_\d+$/);
    });

    it('真名只在变量规划里也能落库（开局说明稿依据）', () => {
        const state = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '一名青衣女子立在檐下。' }],
            tavern_commands: [{ action: 'push', key: 'gameState.社交', value: 新NPC值('沈青娥') }],
            t_var_plan: '初始社交：沈青娥，青城派弟子，于客栈檐下登场。'
        } as any, 构建基础状态(), deps, undefined, { applyState: false });
        expect(state.社交.map((npc: any) => npc?.姓名)).toEqual(['沈青娥']);
    });

    it('一次性新增多个代称角色全部落库', () => {
        const state = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '两名女子立在檐下，一人执剑，一人捧药。' }],
            tavern_commands: [
                { action: 'push', key: 'gameState.社交', value: 新NPC值('青衣女子') },
                { action: 'push', key: 'gameState.社交', value: 新NPC值('白衣少女', { 身份: '药庐学徒' }) }
            ],
            t_var_plan: '初始社交：青衣女子（执剑）、白衣少女（捧药）。'
        } as any, 构建基础状态(), deps, undefined, { applyState: false });
        expect(state.社交.map((npc: any) => npc?.姓名)).toEqual(['青衣女子', '白衣少女']);
    });

    it('规范化可以连续多轮执行而不丢代称角色', () => {
        const state = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '青衣女子立在檐下。' }],
            tavern_commands: [{ action: 'push', key: 'gameState.社交', value: 新NPC值('青衣女子') }]
        } as any, 构建基础状态(), deps, undefined, { applyState: false });
        let social = state.社交;
        for (let round = 0; round < 5; round += 1) {
            social = 规范化社交列表(social, { 合并同名: false });
        }
        expect(social.map((npc: any) => npc?.姓名)).toEqual(['青衣女子']);
    });
});

describe('防幻觉底线不放松', () => {
    it('真名在正文、对白、变量规划里都找不到时仍拒绝', () => {
        const state = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '一名女子立在檐下，没有说话。' }],
            tavern_commands: [{ action: 'push', key: 'gameState.社交', value: 新NPC值('赵无双') }],
            t_var_plan: '初始社交：（尚未建档）'
        } as any, 构建基础状态(), deps, undefined, { applyState: false });
        expect(state.社交).toEqual([]);
    });

    it.each(['未命名NPC', '角色1', 'NPC3'])('占位名 %s 即使带完整档案和稳定 id 也不写入', (姓名) => {
        const state = 执行响应命令处理({
            logs: [{ sender: '旁白', text: `${姓名}出现。` }],
            tavern_commands: [{ action: 'push', key: 'gameState.社交', value: 新NPC值(姓名, { id: 'NPC-PLACEHOLDER' }) }]
        } as any, 构建基础状态(), deps, undefined, { applyState: false });
        expect(state.社交).toEqual([]);
    });

    it('姓名带叙事污染的代称仍拒绝', () => {
        const state = 执行响应命令处理({
            logs: [{ sender: '旁白', text: '女子低声说道什么。' }],
            tavern_commands: [{ action: 'push', key: 'gameState.社交', value: 新NPC值('女子低声说道') }],
            t_var_plan: '初始社交：女子低声说道。'
        } as any, 构建基础状态(), deps, undefined, { applyState: false });
        expect(state.社交).toEqual([]);
    });
});
