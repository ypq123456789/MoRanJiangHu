import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ModeRuntimeProfile } from '../models/system';
import { 获取题材模式配置, 题材模式顺序 } from '../utils/topicModeProfiles';
import { 构建官方模式运行时配置, 规范化模式运行时配置, 渲染模式运行时配置世界书内容 } from '../utils/modeRuntimeProfile';
import { 是否自定义模式运行时配置, 解析生效题材配置 } from '../utils/effectiveTopicProfile';
import { 获取题材界面文案, 获取题材资源文案, 获取题材档案文案 } from '../utils/resourceLabels';
import { 格式化能力类别 } from '../utils/abilityCategoryLabels';
import { 获取题材关系侧重选项, 获取题材开局配置文案 } from '../utils/openingConfig';
import { 构建题材模式提示词 } from '../prompts/runtime/openingConfig';
import { buildRealmExtraPromptForDiy, buildWorldContextForDiy } from '../components/features/NewGame/NewGameDiyTools';

const 构建红楼运行时配置 = (extra?: Record<string, any>): ModeRuntimeProfile => {
    const base = {
        identity: {
            modeId: '红楼梦同人',
            displayName: '红楼梦同人模式包',
            baseMode: '武侠',
            isFandomIp: true
        },
        economy: {
            marketName: '当铺牙行',
            marketVerb: '典当或转卖',
            primaryCurrency: '日常交易使用制钱、碎银、银两与金锭。',
            exchangeRules: '底层货币=制钱，中层货币=银两，上层货币=金锭。',
            bannedKeywords: ['灵石', '破境丹', '飞剑法宝']
        },
        organization: {
            organizationName: '门第',
            memberName: '府中人',
            contributionName: '体面',
            organizationAliases: ['门第', '世家', '府邸', '商号'],
            rankNames: ['门外', '依附', '入府', '近前', '掌事', '当家']
        },
        ability: {
            primaryAxis: '族望、门第声望、家宅权柄与才情文名',
            skillPool: ['才情', '应酬', '观人', '手腕', '理事', '谋局'],
            combatResolution: '多数冲突先按身份、礼法、证据与人物意志结算。'
        },
        items: {
            initialItemPool: ['月钱袋', '名帖', '钥匙串'],
            rewardItemPool: ['银钱月例', '衣料首饰', '名帖荐书']
        },
        map: {
            mapPrompt: '地图按天下—省府—州县—府邸—院落—房舍六层组织。'
        },
        npc: {
            defaultIdentityPool: ['老爷', '太太', '奶奶', '姑娘', '丫鬟', '管家']
        }
    };
    const merged: Record<string, any> = { ...base, ...extra };
    for (const key of ['identity', 'economy', 'organization', 'ability', 'items', 'map', 'npc'] as const) {
        if (extra?.[key]) merged[key] = { ...base[key], ...extra[key] };
    }
    return 规范化模式运行时配置(merged, '武侠');
};

describe('官方模式零回归', () => {
    it('无 runtime 时生效配置与官方配置逐字段一致', () => {
        for (const mode of 题材模式顺序) {
            const official = 获取题材模式配置(mode);
            const effective = 解析生效题材配置(mode, null);
            for (const key of Object.keys(official) as Array<keyof typeof official>) {
                expect(effective[key], `${mode}.${String(key)}`).toEqual(official[key]);
            }
            expect(effective.usesCustomRuntime).toBe(false);
        }
    });

    it('官方生成的 runtime 不触发自定义覆盖', () => {
        for (const mode of 题材模式顺序) {
            const officialRuntime = 构建官方模式运行时配置(mode);
            expect(是否自定义模式运行时配置(officialRuntime, mode)).toBe(false);
            const official = 获取题材模式配置(mode);
            const effective = 解析生效题材配置(mode, officialRuntime);
            expect(effective.label).toBe(official.label);
            expect(effective.auctionName).toBe(official.auctionName);
            expect(effective.worldSizeLabel).toBe(official.worldSizeLabel);
            const 官方界面 = 获取题材界面文案(mode, null);
            const 生效界面 = 获取题材界面文案(mode, officialRuntime);
            expect(生效界面).toEqual(官方界面);
        }
    });

    it('官方身份 runtime 即使携带 uiLabels 也不覆盖资源文案', () => {
        const runtime = {
            ...构建官方模式运行时配置('武侠'),
            uiLabels: { 资源: { 能量: '心气' } }
        } as ModeRuntimeProfile;
        expect(是否自定义模式运行时配置(runtime, '武侠')).toBe(false);
        expect(获取题材资源文案('武侠', runtime)).toEqual(获取题材资源文案('武侠', null));
    });
});

describe('自定义 runtime 派生换源', () => {
    const runtime = 构建红楼运行时配置();

    it('识别为自定义 runtime', () => {
        expect(是否自定义模式运行时配置(runtime, '武侠')).toBe(true);
    });

    it('生效题材配置换源到 runtime 字段', () => {
        const effective = 解析生效题材配置('武侠', runtime);
        expect(effective.label).toBe('红楼梦同人模式包');
        expect(effective.auctionName).toBe('当铺牙行');
        expect(effective.marketVerb).toBe('典当或转卖');
        expect(effective.currencyPrompt).toContain('制钱');
        expect(effective.mapPrompt).toContain('府邸');
        expect(effective.skillNames).toEqual(['才情', '应酬', '观人', '手腕', '理事', '谋局']);
        expect(effective.presetItemKeywords).toEqual(['月钱袋', '名帖', '钥匙串']);
        expect(effective.promptLines.join('')).not.toContain('武侠/江湖为核心题材');
        expect(effective.usesCustomRuntime).toBe(true);
    });

    it('动态单币种接管题材提示词并压制旧三层换算', () => {
        const dynamicRuntime = 构建红楼运行时配置({
            economy: {
                exchangeRules: '三层货币：制钱、银两、金锭。',
                currencySystem: {
                    id: 'cash',
                    name: '现银',
                    baseUnitId: 'cash-yuan',
                    units: [{
                        id: 'cash-yuan',
                        name: '银元',
                        symbol: '元',
                        aliases: [],
                        baseRate: 1,
                        order: 0
                    }]
                }
            }
        });

        const prompt = 构建题材模式提示词({ 题材模式: '武侠', modeRuntimeProfile: dynamicRuntime } as any);
        const runtimeWorldbook = 渲染模式运行时配置世界书内容(dynamicRuntime);
        expect(prompt).toContain('仅使用“银元”');
        expect(prompt).not.toContain('制钱、银两、金锭');
        expect(runtimeWorldbook).toContain('动态货币体系：现银');
        expect(runtimeWorldbook).not.toContain('上层=');
        expect(runtimeWorldbook).not.toContain('中层=');
        expect(runtimeWorldbook).not.toContain('底层=');
    });

    it('界面文案组织段按 runtime 派生', () => {
        const 界面 = 获取题材界面文案('武侠', runtime);
        expect(界面.组织.组织入口).toBe('门第');
        expect(界面.组织.成员名录).toBe('府中人名录');
        expect(界面.组织.贡献).toBe('体面');
        expect(界面.组织.组织实力).toBe('门第实力');
        expect(界面.组织.成员计量).toBe('府中人');
        expect(界面.菜单.sect).toBe('门第');
        expect(界面.菜单.auctionHouse).toBe('当铺牙行');
    });

    it('开局配置文案与关系侧重换源', () => {
        const copy = 获取题材开局配置文案('武侠', runtime);
        expect(copy.organizationTitle).toBe('开局生成门第');
        expect(copy.memberTitle).toBe('开局生成府中人');
        const 关系选项 = 获取题材关系侧重选项('武侠', runtime);
        const 师门项 = 关系选项.find((item) => item.value === '师门');
        expect(师门项?.label).toBe('门第');
    });

    it('外部题材尚未同步时以自定义 runtime 的 baseMode 作为官方回退', () => {
        const xianxiaRuntime = 规范化模式运行时配置({
            identity: { modeId: 'custom-xianxia', displayName: '自定义仙途', baseMode: '仙侠' },
            economy: { marketName: '云海坊市' }
        }, '仙侠');

        const effective = 解析生效题材配置('武侠', xianxiaRuntime);
        expect(effective.label).toBe('自定义仙途');
        expect(effective.group).toBe(获取题材模式配置('仙侠').group);
        expect(effective.currencyPrompt).toBe(获取题材模式配置('仙侠').currencyPrompt);
        expect(格式化能力类别('招式', '武侠', xianxiaRuntime)).toBe('术式');
        expect(获取题材资源文案('武侠', xianxiaRuntime).能量).toBe(获取题材资源文案('仙侠').能量);
        expect(获取题材档案文案('武侠', xianxiaRuntime).档案题头).toBe(获取题材档案文案('仙侠').档案题头);
        expect(获取题材开局配置文案('武侠', xianxiaRuntime).intro).toBe(获取题材开局配置文案('仙侠').intro);
    });
});

describe('uiLabels 深覆盖', () => {
    const runtime = 构建红楼运行时配置({
        uiLabels: {
            菜单: { inventory: '随身箱笼', social: '金兰谱', 不存在的键: '应被忽略' },
            标题: { 背包: '随身箱笼', 基础属性: '闺阁根基' },
            组织: { 能力库: '家塾书房' },
            资源: { 分组标题: '身心气色', 能量: '心气' },
            档案: { 档案题头: '府中人物档案' },
            能力类别: { 招式: '才艺章法' },
            向导: { worldSizeLabel: '红楼版图', dynastyLabel: '本朝家国局势' }
        }
    });

    it('uiLabels 覆盖生效且非法键被剥离', () => {
        const 界面 = 获取题材界面文案('武侠', runtime);
        expect(界面.菜单.inventory).toBe('随身箱笼');
        expect(界面.菜单.social).toBe('金兰谱');
        expect((界面.菜单 as Record<string, string>)['不存在的键']).toBeUndefined();
        expect(界面.标题.背包).toBe('随身箱笼');
        expect(界面.标题.基础属性).toBe('闺阁根基');
        expect(界面.组织.能力库).toBe('家塾书房');
        expect(界面.组织.组织入口).toBe('门第');
        expect(界面.标题.装备).toBe(获取题材界面文案('武侠', null).标题.装备);
    });

    it('资源与档案文案覆盖生效', () => {
        const 资源 = 获取题材资源文案('武侠', runtime);
        expect(资源.分组标题).toBe('身心气色');
        expect(资源.能量).toBe('心气');
        expect(资源.气血).toBe('气血');
        expect(资源.能量当前字段).toEqual(['当前内力']);
        const 档案 = 获取题材档案文案('武侠', runtime);
        expect(档案.档案题头).toBe('府中人物档案');
        expect(档案.六维).toBe(获取题材档案文案('武侠', null).六维);
    });

    it('能力类别映射覆盖生效', () => {
        expect(格式化能力类别('招式', '武侠', runtime)).toBe('才艺章法');
        expect(格式化能力类别('招式', '武侠', null)).toBe('武技');
        expect(格式化能力类别('招式', '仙侠', null)).toBe('术式');
    });

    it('向导表单标签覆盖生效', () => {
        const effective = 解析生效题材配置('武侠', runtime);
        expect(effective.worldSizeLabel).toBe('红楼版图');
        expect(effective.dynastyLabel).toBe('本朝家国局势');
        expect(effective.densityLabel).toBe(获取题材模式配置('武侠').densityLabel);
    });
});

describe('功法类别展示贯通', () => {
    it('桌面功法筛选、列表和详情都使用运行时类别文案，同时保留原始类型作为筛选 key', () => {
        const source = fs.readFileSync(path.join(process.cwd(), 'components/features/Kungfu/KungfuModal.tsx'), 'utf8');
        expect(source).toContain('{格式化能力类别(cat, topicMode as 题材模式类型 | undefined, runtimeProfile)}');
        expect(source).toContain('{格式化能力类别(skill.类型, topicMode as 题材模式类型 | undefined, runtimeProfile)}');
        expect(source).toContain('{格式化能力类别(skill.类型, topicMode as 题材模式类型 | undefined, runtimeProfile)[0] || \'武\'}');
        expect(source).toContain('onClick={() => setActiveFilter(cat)}');
        expect(source).toContain('safeSkills.filter(s => s.类型 === activeFilter)');
    });
});

describe('创意工坊运行时 JSON 形状校验', () => {
    it('境界配置只接受 JSON 对象', () => {
        const source = fs.readFileSync(path.join(process.cwd(), 'components/features/Workshop/CreativeWorkshopModal.tsx'), 'utf8');
        const realmEditorStart = source.indexOf("if (fieldType === 'realmConfig')");
        const realmEditorSource = source.slice(realmEditorStart, realmEditorStart + 1200);
        expect(realmEditorSource).toContain('expectedShape="object"');
    });
});

describe('prompt 泄漏修复', () => {
    it('题材模式提示词在自定义 runtime 下不注入官方武侠词', () => {
        const runtime = 构建红楼运行时配置();
        const prompt = 构建题材模式提示词({ 题材模式: '武侠', modeRuntimeProfile: runtime } as any);
        expect(prompt).toContain('当铺牙行');
        expect(prompt).not.toContain('天下拍卖行');
        expect(prompt).not.toContain('本存档以武侠/江湖为核心题材');
    });

    it('无 runtime 时官方提示词保持原样', () => {
        const prompt = 构建题材模式提示词({ 题材模式: '武侠' } as any);
        expect(prompt).toContain('武侠');
    });

    it('运行时 prompt 行保留部分填写的组织与能力口径', () => {
        const runtime = 构建红楼运行时配置();
        runtime.organization.contributionName = '';
        runtime.ability.combatResolution = '';
        const effective = 解析生效题材配置('武侠', runtime);
        expect(effective.promptLines).toContain('组织口径：门第 / 府中人');
        expect(effective.promptLines).toContain('能力口径：族望、门第声望、家宅权柄与才情文名');
    });

    it('DIY 世界与境界提示词都使用自定义模式展示名', () => {
        const runtime = 构建红楼运行时配置();
        runtime.ability.primaryAxis = '';
        const worldConfig = {
            worldName: '神京红楼',
            worldSize: '中型',
            sectDensity: '适中',
            dynastySetting: '本朝',
            tianjiaoSetting: '声名手腕',
            modeRuntimeProfile: runtime
        } as any;
        const openingConfig = { 题材模式: '武侠', modeRuntimeProfile: runtime } as any;
        expect(buildWorldContextForDiy(worldConfig, openingConfig)).toContain('当前题材：红楼梦同人模式包');
        expect(buildWorldContextForDiy(worldConfig, openingConfig)).toContain('模式包能力口径：模式包设定');
        expect(buildRealmExtraPromptForDiy(worldConfig, openingConfig)).toContain('当前题材：红楼梦同人模式包');
    });
});

describe('审计加固回归', () => {
    it('自定义判定：modeId 非官方值即为自定义（displayName 为空或与官方同名也能识别）', () => {
        const 空名包 = 规范化模式运行时配置({
            identity: { modeId: 'red-mansion', displayName: '', baseMode: '武侠' },
            economy: { marketName: '当铺牙行' }
        }, '武侠');
        expect(是否自定义模式运行时配置(空名包, '武侠')).toBe(true);
        const 同名包 = 规范化模式运行时配置({
            identity: { modeId: 'custom-wuxia-hardcore', displayName: '武侠世界', baseMode: '武侠' }
        }, '武侠');
        expect(是否自定义模式运行时配置(同名包, '武侠')).toBe(true);
    });

    it('自定义判定：官方 runtime 与存档模式暂时不配对时不误判为自定义', () => {
        const 官方仙侠 = 构建官方模式运行时配置('仙侠');
        expect(是否自定义模式运行时配置(官方仙侠, '武侠')).toBe(false);
    });

    it('官方 runtime 不改变关系侧重选项（与无 runtime 输出逐字节一致）', () => {
        for (const mode of 题材模式顺序) {
            const 官方 = 构建官方模式运行时配置(mode);
            expect(获取题材关系侧重选项(mode, 官方)).toEqual(获取题材关系侧重选项(mode));
        }
    });

    it('uiLabels 覆盖剥离原型继承键', () => {
        const runtime = 构建红楼运行时配置({
            uiLabels: { 菜单: { constructor: '异常文案', inventory: '随身箱笼' } }
        });
        const labels = 获取题材界面文案('武侠', runtime);
        expect((labels.菜单 as Record<string, string>).inventory).toBe('随身箱笼');
        expect(Object.prototype.hasOwnProperty.call(labels.菜单, 'constructor')).toBe(false);
    });

    it('密度选项覆盖：仅替换命中的官方选项文案', () => {
        const runtime = 构建红楼运行时配置({
            uiLabels: { 密度选项: { 适中: '适中 (数座府邸)' } }
        });
        const effective = 解析生效题材配置('武侠', runtime);
        const official = 获取题材模式配置('武侠');
        const 适中项 = effective.densityOptions.find((item) => item.value === '适中');
        expect(适中项?.label).toBe('适中 (数座府邸)');
        for (const item of effective.densityOptions) {
            if (item.value === '适中') continue;
            expect(item.label).toBe(official.densityOptions.find((o) => o.value === item.value)?.label);
        }
    });

    it('行情模板规范化：非法影响类型回落全部、数量截断', () => {
        const runtime = 规范化模式运行时配置({
            identity: { modeId: 'stress-pack', displayName: '压力包', baseMode: '武侠' },
            economy: {
                marketEventTemplates: Array.from({ length: 40 }, (_, i) => ({
                    标题: `模板${i}`,
                    描述: `描述${i}`,
                    影响类型: i === 0 ? '<script>' : '全部',
                    价格倍率: 1.1
                }))
            }
        }, '武侠');
        const templates = runtime.economy.marketEventTemplates || [];
        expect(templates.length).toBeLessThanOrEqual(24);
        expect(templates[0]?.影响类型).toBe('全部');
    });

    it('行情模板规范化保留拍卖行支持的影响类型', () => {
        const runtime = 规范化模式运行时配置({
            identity: { modeId: 'market-pack', displayName: '市场包', baseMode: '武侠' },
            economy: {
                marketEventTemplates: [
                    { 标题: '装备紧俏', 描述: '护具和兵刃行情上扬。', 影响类型: '装备', 价格倍率: 1.2 },
                    { 标题: '任务道具流通', 描述: '委托相关物件需求上升。', 影响类型: '任务道具', 价格倍率: 1.1 },
                    { 标题: '杂项清仓', 描述: '零碎物件折价流通。', 影响类型: '杂项', 价格倍率: 0.9 }
                ]
            }
        }, '武侠');
        expect(runtime.economy.marketEventTemplates?.map((item) => item.影响类型)).toEqual(['装备', '任务道具', '杂项']);
    });

    it('自定义包 promptBoundary 与开局提示词不再泄漏官方组织词', () => {
        const runtime = 构建红楼运行时配置();
        const effective = 解析生效题材配置('武侠', runtime);
        expect(effective.promptBoundary).not.toContain('门派');
        expect(effective.promptBoundary).toContain('门第');
        expect(effective.promptLines.join('\n')).not.toContain('官方基底');
    });

    it('官方模式 promptBoundary 保持原文', () => {
        for (const mode of 题材模式顺序) {
            expect(解析生效题材配置(mode, 构建官方模式运行时配置(mode)).promptBoundary)
                .toBe(获取题材模式配置(mode).promptBoundary);
        }
    });
});
