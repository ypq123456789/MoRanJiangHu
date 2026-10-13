import React, { useMemo, useState } from 'react';
import type { 接口设置结构, OpeningConfig, RealmDiyDraft, RealmDiyRow, RealmDiySystem, WorldGenConfig, WorldMapDiyDraft, WorldMapDiyFeature, WorldMapDiyNode, 角色数据结构 } from '../../../types';
import { generateFandomRealmData, generateWorldData } from '../../../services/ai/text';
import { 获取主剧情接口配置, 接口配置是否可用 } from '../../../utils/apiConfig';
import {
    buildRealmPromptFromDraft,
    buildWorldMapLayersFromDraft,
    buildWorldMapPromptFromDraft,
    normalizeRealmDraft,
    normalizeWorldMapDraft,
} from '../../../utils/newGameDiy';
import DiyMapEditor from './DiyMapEditor';
import { 是否自定义模式运行时配置, 解析生效题材配置 } from '../../../utils/effectiveTopicProfile';
import { 解析当前题材修炼默认值 } from '../../../utils/modeCultivationDefault';

type Props = {
    worldConfig: WorldGenConfig;
    charData?: 角色数据结构;
    openingConfig?: OpeningConfig;
    apiConfig?: 接口设置结构;
    onChange: React.Dispatch<React.SetStateAction<WorldGenConfig>>;
    compact?: boolean;
};

const nextId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const addRealmSystem = (draft: RealmDiyDraft, name = ''): RealmDiyDraft => {
    const normalized = normalizeRealmDraft(draft);
    return normalizeRealmDraft({
        ...normalized,
        systems: [...(normalized.systems || []), {
            id: nextId('realm_system'),
            name: name.trim() || `能力体系${(normalized.systems?.length || 0) + 1}`,
            description: '',
            energyType: '',
            role: 'primary_or_secondary',
            rows: [{ id: nextId('realm'), name: '', level: 1, power: '', breakthrough: '', parameters: '', description: '' }]
        }]
    });
};

export const updateRealmSystem = (draft: RealmDiyDraft, systemId: string, patch: Partial<RealmDiySystem>): RealmDiyDraft => {
    const normalized = normalizeRealmDraft(draft);
    return normalizeRealmDraft({
        ...normalized,
        systems: (normalized.systems || []).map((system) => system.id === systemId ? { ...system, ...patch, id: system.id } : system)
    });
};

export const removeRealmSystem = (draft: RealmDiyDraft, systemId: string): RealmDiyDraft => {
    const normalized = normalizeRealmDraft(draft);
    if ((normalized.systems?.length || 0) <= 1) return normalized;
    return normalizeRealmDraft({
        ...normalized,
        systems: (normalized.systems || []).filter((system) => system.id !== systemId)
    });
};

const panelClass = 'rounded-2xl border border-wuxia-gold/20 bg-black/25 p-4';
const inputClass = 'w-full rounded border border-gray-700 bg-black/50 px-2 py-2 text-xs text-white outline-none focus:border-wuxia-gold';
const textAreaClass = `${inputClass} min-h-[72px] resize-y`;
const smallButtonClass = 'rounded border border-wuxia-gold/25 bg-wuxia-gold/10 px-3 py-1.5 text-xs text-wuxia-gold hover:bg-wuxia-gold/20 disabled:opacity-50';

const 获取DIY题材模式 = (worldConfig: WorldGenConfig, openingConfig?: OpeningConfig): string => (
    openingConfig?.题材模式
    || worldConfig.modeRuntimeProfile?.identity?.baseMode
    || '未指定'
);

const 斗气题材关键词 = ['斗破', '斗气', '异火', '炼药师', '银宗', '斗者', '斗师', '斗灵', '斗王', '斗皇', '斗宗', '斗尊', '斗圣', '斗帝'];
const 通用修仙禁词 = ['元婴', '化神', '渡劫', '金丹', '筑基'];

export const needsCustomRealmGuardForDiy = (worldConfig: WorldGenConfig, _openingConfig?: OpeningConfig): boolean => {
    const text = [
        worldConfig.worldName,
        worldConfig.dynastySetting,
        worldConfig.tianjiaoSetting,
        worldConfig.worldExtraRequirement,
        worldConfig.manualRealmPrompt
    ].join('\n');
    return 斗气题材关键词.some((keyword) => text.includes(keyword));
};

export const containsDisallowedRealmTermsForDiy = (
    text: string,
    openingConfig?: OpeningConfig,
    worldConfig?: WorldGenConfig
): boolean => {
    if (openingConfig?.题材模式 === '仙侠' && !(worldConfig && needsCustomRealmGuardForDiy(worldConfig, openingConfig))) {
        return false;
    }
    return 通用修仙禁词.some((keyword) => text.includes(keyword));
};

export const buildWorldContextForDiy = (worldConfig: WorldGenConfig, openingConfig?: OpeningConfig): string => {
    const topicMode = 获取DIY题材模式(worldConfig, openingConfig);
    const runtimeProfile = openingConfig?.modeRuntimeProfile || worldConfig.modeRuntimeProfile;
    const effective = 解析生效题材配置(openingConfig?.题材模式, runtimeProfile);
    const usesCustomRuntime = Boolean(runtimeProfile && 是否自定义模式运行时配置(runtimeProfile, openingConfig?.题材模式));
    const realmInstruction = needsCustomRealmGuardForDiy(worldConfig, openingConfig)
        ? '当前检测到斗气/斗破类关键词：不要回退成元婴、化神、渡劫等默认修仙命名，境界与世界观应贴合斗气、斗技、异火、血脉、炼药师等作品风格。'
        : usesCustomRuntime
            ? `当前存档使用「${effective.label}」模式包：世界观、组织、经济与能力体系必须贴合该模式包口径，不要套用基底题材的默认门派/境界模板。`
            : topicMode === '仙侠'
                ? '仙侠题材应优先使用练气、筑基、金丹、元婴、化神、渡劫等修真口径；不得改写成斗气、斗者、斗师、斗王等斗气体系。'
                : '请优先根据玩家填写的作品、题材、世界名称和关键词生成专属世界观，不要套用与当前题材无关的默认境界体系。';
    return [
        `当前题材：${usesCustomRuntime ? effective.label : topicMode}`,
        `世界名称：${worldConfig.worldName || '未命名世界'}`,
        `${effective.worldSizeLabel}：${worldConfig.worldSize}`,
        `${effective.densityPromptLabel}：${worldConfig.sectDensity}`,
        `${effective.dynastyLabel}：${worldConfig.dynastySetting || '待生成'}`,
        `${effective.tianjiaoLabel}：${worldConfig.tianjiaoSetting || '待生成'}`,
        usesCustomRuntime ? `模式包能力口径：${runtimeProfile?.ability?.primaryAxis || '模式包设定'}` : '',
        worldConfig.worldExtraRequirement ? `玩家额外要求：${worldConfig.worldExtraRequirement}` : '',
        realmInstruction
    ].filter(Boolean).join('\n');
};

export const buildRealmExtraPromptForDiy = (worldConfig: WorldGenConfig, openingConfig?: OpeningConfig): string => {
    const topicMode = 获取DIY题材模式(worldConfig, openingConfig);
    const runtimeProfile = openingConfig?.modeRuntimeProfile || worldConfig.modeRuntimeProfile;
    const effective = 解析生效题材配置(openingConfig?.题材模式, runtimeProfile);
    const usesCustomRuntime = Boolean(runtimeProfile && 是否自定义模式运行时配置(runtimeProfile, openingConfig?.题材模式));
    const 模式包境界名 = (runtimeProfile?.ability?.realmConfig?.levelNames || []).filter(Boolean);
    const realmInstruction = needsCustomRealmGuardForDiy(worldConfig, openingConfig)
        ? '请生成符合斗气/斗破类作品代入感的境界体系，使用斗气、斗技、异火、血脉、炼药师等语义扩展，不得回退成元婴、化神这类默认修仙命名。'
        : usesCustomRuntime
            ? `当前存档使用自定义模式包：成长主轴为「${runtimeProfile?.ability?.primaryAxis || '模式包设定'}」${模式包境界名.length > 0 ? `，既有阶段命名为：${模式包境界名.join('、')}` : ''}；境界体系必须承接该口径，不要回退成基底题材的默认境界命名。`
            : topicMode === '仙侠'
                ? '仙侠题材应优先使用修真境界，如练气、筑基、金丹、元婴、化神、炼虚、合体、渡劫；不得生成斗者、斗师、斗王、斗皇、斗宗、斗尊等斗气体系。'
                : '请生成符合本作品/题材代入感的境界体系，优先使用玩家提供的题材关键词，不要回退成无关作品模板。';
    return [
        `当前题材：${usesCustomRuntime ? effective.label : topicMode}`,
        `世界名称：${worldConfig.worldName || '未命名世界'}`,
        `题材关键词：${worldConfig.dynastySetting || ''}；${worldConfig.tianjiaoSetting || ''}；${worldConfig.worldExtraRequirement || ''}`,
        realmInstruction,
        '输出必须是完整 <境界体系>，并通过游戏现有境界体系校验。'
    ].filter(Boolean).join('\n');
};

const patchRealmRow = (row: RealmDiyRow): RealmDiyRow => ({
    ...row,
    power: row.power || `${row.name || '该境界'}阶段的战力定位，可由世界观约束细化`,
    breakthrough: row.breakthrough || `需要修为积累、心境稳定、资源或机缘满足后突破`,
    parameters: row.parameters || `寿元、内力/灵力上限、感知范围和身体承载力随层级递增`,
    description: row.description || `${row.name || '该境界'}代表修行者从上一层级完成质变后的稳定阶段，具体表现由本局世界观和题材决定。`
});

const patchMapNode = (node: WorldMapDiyNode): WorldMapDiyNode => ({
    ...node,
    description: node.description || `${node.name || '该地点'}是本局可长期抵达的${node.layer}，后续剧情、势力和任务可围绕此处展开。`,
    narrativeCore: node.narrativeCore || (node.scaleFields as any)?.narrativeCore || `${node.name || '该区域'}存在可长期发酵的矛盾、资源压力或人物关系，可由 AI 继续补完为故事钩子。`,
    scaleFields: {
        ...(node.scaleFields || {}),
        narrativeCore: node.narrativeCore || (node.scaleFields as any)?.narrativeCore || `${node.name || '该区域'}存在可长期发酵的矛盾、资源压力或人物关系，可由 AI 继续补完为故事钩子。`,
    },
    climate: node.climate || '气候由地形、纬度和世界观设定共同决定',
    population: node.population || ((node.layer === '小地点' || node.layer === '区地点') ? '人口规模按城镇/建筑定位估算' : '人口分布按区域层级估算'),
    culture: node.culture || '风土人情可由 AI 根据题材补完',
    transport: node.transport || '道路、水路、山道或传送路径按地点层级补完'
});

const patchMapFeature = (feature: WorldMapDiyFeature): WorldMapDiyFeature => ({
    ...feature,
    description: feature.description || `${feature.name || '该地理要素'}会影响周边气候、交通、贸易、势力活动和随机事件生成。`,
    fields: {
        ...(feature.fields || {}),
        类型: feature.fields?.类型 || (feature.type === 'road' ? '官道/商路' : feature.type === 'river' ? '河流' : ''),
        通行难度: feature.fields?.通行难度 || (feature.type === 'mountain' ? '较难通行' : '普通'),
        旅行速度: feature.fields?.旅行速度 || (feature.type === 'portal' ? '极快但需条件' : '普通'),
        安全性: feature.fields?.安全性 || '随剧情局势变化',
        当前状态: feature.fields?.当前状态 || '畅通',
        分叉结构: feature.fields?.分叉结构 || ((feature.type === 'river' || feature.type === 'road' || feature.type === 'waterway') ? '可按支流/支路拆成多条同组线路，并在说明中标明汇入或分叉关系' : ''),
    },
});

const NewGameDiyTools: React.FC<Props> = ({ worldConfig, charData, openingConfig, apiConfig, onChange, compact = false }) => {
    const [realmOpen, setRealmOpen] = useState(false);
    const [mapOpen, setMapOpen] = useState(false);
    const [selectedRealmSystemId, setSelectedRealmSystemId] = useState('');
    const [aiStatus, setAiStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
    const realmDraft = useMemo(() => normalizeRealmDraft(worldConfig.realmDiyDraft), [worldConfig.realmDiyDraft]);
    const mapDraft = useMemo(() => normalizeWorldMapDraft(worldConfig.mapDiyDraft), [worldConfig.mapDiyDraft]);

    const currentApi = useMemo(() => apiConfig ? 获取主剧情接口配置(apiConfig) : null, [apiConfig]);
    const aiAvailable = 接口配置是否可用(currentApi);

    const selectedRealmSystem = realmDraft.systems?.find((system) => system.id === selectedRealmSystemId) || realmDraft.systems?.[0];
    const selectedRealmRows = selectedRealmSystem?.rows || [];
    const isLastPrimaryEligibleRealmSystem = selectedRealmSystem?.role !== 'secondary_only'
        && (realmDraft.systems || []).filter((system) => system.role !== 'secondary_only').length <= 1;

    const updateRealmDraft = (draft: RealmDiyDraft) => {
        onChange(prev => ({ ...prev, realmDiyDraft: normalizeRealmDraft(draft) }));
    };

    const updateRealmRows = (rows: RealmDiyRow[]) => {
        if (!selectedRealmSystem) return;
        updateRealmDraft(updateRealmSystem(realmDraft, selectedRealmSystem.id, { rows }));
    };

    const updateMapDraft = (draft: WorldMapDiyDraft) => {
        onChange(prev => ({ ...prev, mapDiyDraft: { ...normalizeWorldMapDraft(draft), updatedAt: Date.now() } }));
    };

    const applyRealmPrompt = () => {
        const normalized = normalizeRealmDraft(worldConfig.realmDiyDraft);
        onChange(prev => ({
            ...prev,
            realmDiyDraft: normalized,
            manualRealmPrompt: buildRealmPromptFromDraft(normalized)
        }));
    };

    const applyMapPrompt = () => {
        const normalized = normalizeWorldMapDraft(worldConfig.mapDiyDraft);
        const prompt = buildWorldMapPromptFromDraft(normalized);
        onChange(prev => ({
            ...prev,
            mapDiyDraft: { ...normalized, enabled: true },
            worldExtraRequirement: [prev.worldExtraRequirement.trim(), prompt].filter(Boolean).join('\n\n')
        }));
    };

    const runMapAiAssist = async (
        target: { kind: 'node'; id: string } | { kind: 'feature'; id: string },
        action: 'complete' | 'polish' | 'check'
    ) => {
        if (!接口配置是否可用(currentApi)) {
            setAiStatus({ type: 'error', message: '请先在设置中配置可用的主剧情 API。' });
            return;
        }
        const normalized = normalizeWorldMapDraft(worldConfig.mapDiyDraft);
        const object = target.kind === 'node'
            ? normalized.nodes.find((node) => node.id === target.id)
            : (normalized.features || []).find((feature) => feature.id === target.id);
        if (!object) {
            setAiStatus({ type: 'error', message: '未找到当前选中的地图对象。' });
            return;
        }
        const actionLabel = action === 'complete' ? '补完字段' : action === 'polish' ? '润色扩写' : '逻辑检查';
        setAiStatus({ type: 'loading', message: `正在对「${object.name || '未命名对象'}」进行${actionLabel}...` });
        try {
            const mapContext = buildWorldMapPromptFromDraft(normalized);
            const prompt = [
                `你是游戏开局 DIY 地图设定助手。当前操作：${actionLabel}。`,
                `目标类型：${target.kind === 'node' ? '区域/地点层级' : '连接型地理要素'}`,
                `目标对象JSON：${JSON.stringify(object)}`,
                `全局地图草稿：\n${mapContext}`,
                action === 'check'
                    ? '请只输出简短逻辑检查建议，指出层级、父级、地理关系、交通、水文、叙事核心或设定矛盾，不要改写原对象。'
                    : '请输出一段可直接写入该对象“描述”的中文设定文本，补足地理、文明、交通、资源、风险、区域核心矛盾和剧情用途，避免输出 JSON。'
            ].join('\n\n');
            const result = await generateWorldData(
                prompt,
                charData || {},
                currentApi,
                undefined,
                `【DIY地图${actionLabel}】请保持简洁，聚焦当前对象。`,
                undefined,
                { openingConfig }
            );
            const content = (result || '').trim();
            if (!content) throw new Error('AI 输出为空');
            if (action === 'check') {
                setAiStatus({ type: 'success', message: content.slice(0, 900) });
                return;
            }
            if (target.kind === 'node') {
                updateMapDraft({
                    ...normalized,
                    nodes: normalized.nodes.map((node) => node.id === target.id
                        ? { ...(action === 'complete' ? patchMapNode(node) : node), description: content }
                        : node
                    )
                });
            } else {
                updateMapDraft({
                    ...normalized,
                    features: (normalized.features || []).map((feature) => feature.id === target.id
                        ? { ...patchMapFeature(feature), description: content }
                        : feature
                    )
                });
            }
            setAiStatus({ type: 'success', message: `${actionLabel}完成，已写入当前地图对象。` });
        } catch (error: any) {
            setAiStatus({ type: 'error', message: `地图 AI 辅助失败：${error?.message || '未知错误'}` });
        }
    };

    const generateWorldPromptWithAI = async () => {
        if (!接口配置是否可用(currentApi)) {
            setAiStatus({ type: 'error', message: '请先在设置中配置 API 地址、密钥和主剧情模型。' });
            return;
        }
        setAiStatus({ type: 'loading', message: '正在生成世界观提示词...' });
        try {
            const hasCustomRealmGuard = needsCustomRealmGuardForDiy(worldConfig, openingConfig);
            // 题材包声明关闭修炼时，DIY 预览也必须跟着关，否则玩家在这里预览到的
            // 仍是带境界提示词的世界观，与实际开局结果不一致（曾硬编码为 true）。
            const 启用修炼体系 = 解析当前题材修炼默认值(openingConfig, worldConfig) ?? true;
            const guardedExtraPrompt = [
                worldConfig.worldExtraRequirement,
                hasCustomRealmGuard
                    ? `【硬性禁用】本局是斗气/宗门类题材，世界观与境界命名禁止出现：${通用修仙禁词.join('、')}。必须改用斗气、斗技、丹药、异火、宗门等作品风格术语。`
                    : ''
            ].filter(Boolean).join('\n\n');
            let prompt = await generateWorldData(
                buildWorldContextForDiy(worldConfig, openingConfig),
                charData || {},
                currentApi,
                undefined,
                guardedExtraPrompt,
                undefined,
                { 启用修炼体系, openingConfig }
            );
            if (hasCustomRealmGuard && containsDisallowedRealmTermsForDiy(prompt, openingConfig, worldConfig)) {
                setAiStatus({ type: 'loading', message: '世界观初稿含通用修仙词，正在按题材重写...' });
                prompt = await generateWorldData(
                    buildWorldContextForDiy(worldConfig, openingConfig),
                    charData || {},
                    currentApi,
                    undefined,
                    `${guardedExtraPrompt}\n\n上一次输出仍包含 ${通用修仙禁词.join('、')} 等通用修仙词。请完整重写为斗气大陆/宗门/斗技/丹药/异火风格，不得出现这些禁词。`,
                    undefined,
                    { 启用修炼体系, openingConfig }
                );
            }
            if (hasCustomRealmGuard && containsDisallowedRealmTermsForDiy(prompt, openingConfig, worldConfig)) {
                throw new Error(`AI 输出仍包含不适合本题材的通用修仙词：${通用修仙禁词.filter((keyword) => prompt.includes(keyword)).join('、')}`);
            }
            onChange(prev => ({ ...prev, manualWorldPrompt: prompt }));
            setAiStatus({ type: 'success', message: '已生成世界观提示词，并写入手动世界观。' });
        } catch (error: any) {
            setAiStatus({ type: 'error', message: `世界观生成失败：${error?.message || '未知错误'}` });
        }
    };

    const generateRealmPromptWithAI = async () => {
        if (!接口配置是否可用(currentApi)) {
            setAiStatus({ type: 'error', message: '请先在设置中配置 API 地址、密钥和主剧情模型。' });
            return;
        }
        setAiStatus({ type: 'loading', message: '正在生成境界体系提示词...' });
        try {
            const hasCustomRealmGuard = needsCustomRealmGuardForDiy(worldConfig, openingConfig);
            let prompt = await generateFandomRealmData(
                { openingConfig },
                currentApi,
                undefined,
                buildRealmExtraPromptForDiy(worldConfig, openingConfig)
            );
            if (hasCustomRealmGuard && containsDisallowedRealmTermsForDiy(prompt, openingConfig, worldConfig)) {
                setAiStatus({ type: 'loading', message: '境界初稿含通用修仙词，正在按题材重写...' });
                prompt = await generateFandomRealmData(
                    { openingConfig },
                    currentApi,
                    undefined,
                    `${buildRealmExtraPromptForDiy(worldConfig, openingConfig)}\n\n上一次输出仍包含 ${通用修仙禁词.join('、')} 等通用修仙词。请完整重写为斗气大陆/宗门/斗技/丹药/异火风格，不得出现这些禁词。`
                );
            }
            if (hasCustomRealmGuard && containsDisallowedRealmTermsForDiy(prompt, openingConfig, worldConfig)) {
                throw new Error(`AI 输出仍包含不适合本题材的通用修仙词：${通用修仙禁词.filter((keyword) => prompt.includes(keyword)).join('、')}`);
            }
            onChange(prev => ({ ...prev, manualRealmPrompt: prompt }));
            setAiStatus({ type: 'success', message: '已生成境界体系，并写入手动境界提示词。' });
        } catch (error: any) {
            setAiStatus({ type: 'error', message: `境界生成失败：${error?.message || '未知错误'}` });
        }
    };

    const importReferenceImage = (file?: File) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            onChange(prev => ({
                ...prev,
                mapDiyDraft: {
                    ...normalizeWorldMapDraft(prev.mapDiyDraft),
                    referenceImage: typeof reader.result === 'string' ? reader.result : '',
                    updatedAt: Date.now()
                }
            }));
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className={`${panelClass} space-y-3`}>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="text-sm font-bold text-wuxia-cyan">DIY 辅助</div>
                    <div className="text-[11px] leading-5 text-gray-500">
                        用表单或内置 AI 先保存世界观、境界草稿和地图草稿，再回写到现有开局提示词流程。
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className={smallButtonClass} onClick={() => void generateWorldPromptWithAI()} disabled={!aiAvailable || aiStatus.type === 'loading'}>
                        AI 生成世界观
                    </button>
                    <button type="button" className={smallButtonClass} onClick={() => void generateRealmPromptWithAI()} disabled={!aiAvailable || aiStatus.type === 'loading'}>
                        AI 生成境界
                    </button>
                    <button type="button" className={smallButtonClass} onClick={() => setRealmOpen(prev => !prev)}>
                        {realmOpen ? '收起境界 DIY' : '境界 DIY'}
                    </button>
                    <button type="button" className={smallButtonClass} onClick={() => setMapOpen(prev => !prev)}>
                        {mapOpen ? '收起地图 DIY' : '世界地图 DIY'}
                    </button>
                </div>
            </div>
            {aiStatus.message && (
                <div className={`rounded-lg border px-3 py-2 text-xs ${
                    aiStatus.type === 'error'
                        ? 'border-red-400/30 bg-red-950/20 text-red-200'
                        : aiStatus.type === 'success'
                            ? 'border-emerald-400/30 bg-emerald-950/20 text-emerald-200'
                            : 'border-wuxia-cyan/25 bg-wuxia-cyan/10 text-wuxia-cyan'
                }`}>
                    {aiStatus.message}
                </div>
            )}
            {!aiAvailable && (
                <div className="text-[11px] leading-5 text-amber-200/80">
                    AI 辅助会复用主剧情接口；当前未检测到可用 API 配置，仍可先手动填写或使用表单草稿。
                </div>
            )}

            {realmOpen && (
                <div className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <div className="text-xs font-bold text-wuxia-gold">多能力体系 DIY</div>
                            <div className="mt-1 text-[11px] text-gray-400">每套体系独立命名，共用战力档位；角色可选择主体系并兼修副体系。</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={smallButtonClass}
                                onClick={() => {
                                    const next = addRealmSystem(realmDraft);
                                    updateRealmDraft(next);
                                    setSelectedRealmSystemId(next.systems?.[next.systems.length - 1]?.id || '');
                                }}
                            >
                                新增体系
                            </button>
                            <button
                                type="button"
                                className={smallButtonClass}
                                onClick={() => updateRealmRows(selectedRealmRows.map(patchRealmRow))}
                            >
                                AI 补完空项
                            </button>
                            <button
                                type="button"
                                className={smallButtonClass}
                                onClick={() => updateRealmRows([...selectedRealmRows, {
                                    id: nextId('realm'),
                                    name: '',
                                    level: selectedRealmRows.length + 1,
                                    power: '',
                                    breakthrough: '',
                                    parameters: '',
                                    description: ''
                                }])}
                            >
                                新增境界
                            </button>
                            <button type="button" className={smallButtonClass} onClick={applyRealmPrompt}>写入境界提示词</button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(realmDraft.systems || []).map((system) => (
                            <button
                                key={system.id}
                                type="button"
                                className={`${smallButtonClass} ${selectedRealmSystem?.id === system.id ? 'border-wuxia-cyan/60 bg-wuxia-cyan/15 text-wuxia-cyan' : ''}`}
                                onClick={() => setSelectedRealmSystemId(system.id)}
                            >
                                {system.name}
                            </button>
                        ))}
                    </div>
                    {selectedRealmSystem && (
                        <div className="grid grid-cols-1 gap-2 rounded-xl border border-wuxia-gold/15 bg-amber-50/5 p-3 md:grid-cols-2">
                            <input
                                className={inputClass}
                                value={selectedRealmSystem.name}
                                placeholder="体系名称，如武者、道士、法师"
                                onChange={(event) => updateRealmDraft(updateRealmSystem(realmDraft, selectedRealmSystem.id, { name: event.target.value }))}
                            />
                            <input
                                className={inputClass}
                                value={selectedRealmSystem.energyType}
                                placeholder="能量类型，如气血、法力、神术"
                                onChange={(event) => updateRealmDraft(updateRealmSystem(realmDraft, selectedRealmSystem.id, { energyType: event.target.value }))}
                            />
                            <select
                                className={inputClass}
                                value={selectedRealmSystem.role}
                                onChange={(event) => updateRealmDraft(updateRealmSystem(realmDraft, selectedRealmSystem.id, { role: event.target.value as RealmDiySystem['role'] }))}
                            >
                                <option value="primary_or_secondary">可作为主体系或副体系</option>
                                <option value="primary_only">仅主体系</option>
                                <option value="secondary_only" disabled={isLastPrimaryEligibleRealmSystem}>仅副体系</option>
                            </select>
                            <button
                                type="button"
                                className={`${smallButtonClass} border-red-400/30 text-red-300`}
                                disabled={(realmDraft.systems?.length || 0) <= 1}
                                onClick={() => {
                                    const next = removeRealmSystem(realmDraft, selectedRealmSystem.id);
                                    updateRealmDraft(next);
                                    setSelectedRealmSystemId(next.systems?.[0]?.id || '');
                                }}
                            >
                                删除当前体系
                            </button>
                            <textarea
                                className={`${textAreaClass} md:col-span-2`}
                                value={selectedRealmSystem.description}
                                placeholder="体系定位、擅长方向、资源代价与克制关系"
                                onChange={(event) => updateRealmDraft(updateRealmSystem(realmDraft, selectedRealmSystem.id, { description: event.target.value }))}
                            />
                        </div>
                    )}
                    <div className="space-y-3">
                        {selectedRealmRows.map((row, index) => (
                            <div key={row.id} className="rounded-xl border border-gray-800 bg-black/30 p-3 space-y-2">
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_90px_auto]">
                                    <input className={inputClass} value={row.name} placeholder="境界名称" onChange={e => updateRealmRows(selectedRealmRows.map(item => item.id === row.id ? { ...item, name: e.target.value } : item))} />
                                    <input className={inputClass} type="number" min={1} value={row.level} title="共通战力档位" onChange={e => updateRealmRows(selectedRealmRows.map(item => item.id === row.id ? { ...item, level: Number(e.target.value) || index + 1 } : item))} />
                                    <button type="button" className={smallButtonClass} onClick={() => updateRealmRows(selectedRealmRows.filter(item => item.id !== row.id))} disabled={selectedRealmRows.length <= 1}>删除</button>
                                </div>
                                <div className={`grid grid-cols-1 gap-2 ${compact ? '' : 'md:grid-cols-3'}`}>
                                    <input className={inputClass} value={row.power} placeholder="战力定位" onChange={e => updateRealmRows(selectedRealmRows.map(item => item.id === row.id ? { ...item, power: e.target.value } : item))} />
                                    <input className={inputClass} value={row.breakthrough} placeholder="突破条件" onChange={e => updateRealmRows(selectedRealmRows.map(item => item.id === row.id ? { ...item, breakthrough: e.target.value } : item))} />
                                    <input className={inputClass} value={row.parameters} placeholder="寿元/内力/灵力等参数" onChange={e => updateRealmRows(selectedRealmRows.map(item => item.id === row.id ? { ...item, parameters: e.target.value } : item))} />
                                </div>
                                <textarea className={textAreaClass} value={row.description} placeholder="可选描述；留空可点 AI 补完空项" onChange={e => updateRealmRows(selectedRealmRows.map(item => item.id === row.id ? { ...item, description: e.target.value } : item))} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {mapOpen && (
                <div className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <div className="text-xs font-bold text-wuxia-gold">世界地图 DIY 画布</div>
                            <div className="mt-1 text-[11px] leading-5 text-gray-400">
                                绘制区域、点位、山脉、水路和道路；开启后会在开局时转化为 AI 可读取的地图层级。
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={smallButtonClass} onClick={() => updateMapDraft({
                                ...mapDraft,
                                enabled: true,
                                nodes: mapDraft.nodes.map(patchMapNode),
                                features: (mapDraft.features || []).map(patchMapFeature)
                            })}>补完空项</button>
                            <button type="button" className={smallButtonClass} onClick={applyMapPrompt}>写入世界观要求</button>
                        </div>
                    </div>
                    <DiyMapEditor
                        draft={mapDraft}
                        compact={compact}
                        aiAvailable={aiAvailable}
                        aiBusy={aiStatus.type === 'loading'}
                        aiMessage={aiStatus.message}
                        onChange={updateMapDraft}
                        onImportReferenceImage={importReferenceImage}
                        onAiAssist={runMapAiAssist}
                    />
                    <div className="text-[11px] text-gray-500">当前可生成 {buildWorldMapLayersFromDraft({ ...mapDraft, enabled: true }).length} 个正式地图层级节点；道路、河流和山脉会写入相关地点描述。</div>
                </div>
            )}
        </div>
    );
};

export default NewGameDiyTools;
