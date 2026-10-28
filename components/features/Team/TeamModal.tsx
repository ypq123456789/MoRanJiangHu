import React, { useState } from 'react';
import { OpeningConfig, 角色数据结构, NPC结构 } from '../../../types';
import { 获取题材界面文案, 获取题材资源文案 } from '../../../utils/resourceLabels';
import { 获取图片展示地址, 获取图片资源文本地址 } from '../../../utils/imageAssets';
import { IconHeart, IconSwords, IconUsers, IconYinYang } from '../../ui/Icons';

interface Props {
    character: 角色数据结构;
    teammates: NPC结构[];
    openingConfig?: OpeningConfig;
    onClose: () => void;
}

const TeamModal: React.FC<Props> = ({ character, teammates, openingConfig, onClose }) => {
    const [imageViewer, setImageViewer] = useState<{ src: string; title: string } | null>(null);
    const activeTeammates = React.useMemo(() => {
        const playerName = String(character?.姓名 || '').trim();
        const seen = new Set<string>();
        return (Array.isArray(teammates) ? teammates : [])
            .filter(n => n?.是否队友 === true)
            .filter(n => n?.是否玩家本人 !== true)
            .filter(n => {
                const name = String(n?.姓名 || '').trim();
                return name && name !== playerName && name !== '主角';
            })
            .filter(n => {
                const key = String(n?.id || n?.姓名 || '').trim();
                if (!key) return true;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }, [character?.姓名, teammates]);
    const 资源文案 = 获取题材资源文案(openingConfig?.题材模式, openingConfig?.modeRuntimeProfile);
    const 界面文案 = 获取题材界面文案(openingConfig?.题材模式, openingConfig?.modeRuntimeProfile);
    const playerTabId = '__player__';
    // 默认选中主角，队友仍按 NPC 列表展示。
    const [selectedTab, setSelectedTab] = useState<string>(playerTabId);

    const 规范化资源展示 = (current: unknown, max: unknown) => {
        const cur = Number(current);
        const maxValue = Number(max);
        const safeCur = Number.isFinite(cur) ? Math.max(0, Math.ceil(cur)) : 0;
        const safeMax = Math.max(1, Number.isFinite(maxValue) ? Math.ceil(maxValue) : 0, safeCur);
        return { current: Math.min(safeCur, safeMax), max: safeMax };
    };
    const 读取数值 = (value: unknown, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.ceil(parsed) : fallback;
    };
    const 部位列表 = ['头部', '胸部', '腹部', '左手', '右手', '左腿', '右腿'];
    const 聚合部位血量 = (source: any) => {
        const current = 部位列表.reduce((sum, part) => sum + Math.max(0, 读取数值(source?.[`${part}当前血量`])), 0);
        const max = 部位列表.reduce((sum, part) => sum + Math.max(0, 读取数值(source?.[`${part}最大血量`])), 0);
        return max > 0 ? { current: Math.min(current, max), max } : null;
    };
    const 读取资源展示 = (source: any, currentKeys: string[], maxKeys: string[], options?: { allowBodyParts?: boolean }) => {
        const rawCurrent = currentKeys.map(key => source?.[key]).find(value => Number.isFinite(Number(value)));
        const rawMax = maxKeys.map(key => source?.[key]).find(value => Number.isFinite(Number(value)));
        const normalized = 规范化资源展示(rawCurrent, rawMax);
        if (options?.allowBodyParts && (!Number.isFinite(Number(rawMax)) || Number(rawMax) <= 1)) {
            return 聚合部位血量(source) || normalized;
        }
        return normalized;
    };
    const 提取图片历史 = (person: any): any[] => {
        const archive = person?.图片档案 && typeof person.图片档案 === 'object' ? person.图片档案 : {};
        const history = Array.isArray(archive?.生图历史) ? archive.生图历史 : [];
        const recent = archive?.最近生图结果 || person?.最近生图结果;
        return [...history, recent].filter(Boolean);
    };
    const 提取人物头像 = (person: any): string => {
        const archive = person?.图片档案 && typeof person.图片档案 === 'object' ? person.图片档案 : {};
        const history = 提取图片历史(person);
        const selectedAvatarId = typeof archive?.已选头像图片ID === 'string' ? archive.已选头像图片ID.trim() : '';
        const selected = selectedAvatarId ? history.find((item) => item?.id === selectedAvatarId) : null;
        const avatarRecord = selected || history.find((item) => item?.构图 === '头像' && item?.状态 === 'success' && 获取图片展示地址(item));
        const portraitRecord = history.find((item) => item?.构图 === '立绘' && item?.图片用途 !== '背景' && item?.状态 === 'success' && 获取图片展示地址(item));
        return 获取图片展示地址(avatarRecord) || 获取图片展示地址(portraitRecord) || 获取图片资源文本地址(person?.头像图片URL) || 获取图片资源文本地址(person?.立绘图片URL);
    };
    const AvatarBox: React.FC<{ person: any; title: string; className?: string; fallbackClassName?: string }> = ({ person, title, className = 'h-20 w-20 rounded-2xl', fallbackClassName = 'text-3xl' }) => {
        const imageSrc = 提取人物头像(person);
        const firstChar = String(person?.姓名 || title || '人').trim().slice(0, 1) || '人';
        return (
            <button
                type="button"
                disabled={!imageSrc}
                onClick={() => imageSrc && setImageViewer({ src: imageSrc, title })}
                className={`${className} flex shrink-0 items-center justify-center overflow-hidden border-2 border-wuxia-gold/40 bg-wuxia-gold/10 font-bold text-wuxia-gold shadow-[0_0_20px_rgba(0,0,0,0.5)] transition hover:border-wuxia-gold/70 disabled:cursor-default disabled:hover:border-wuxia-gold/40`}
                title={imageSrc ? '查看头像' : '头像占位'}
            >
                {imageSrc ? <img src={imageSrc} alt="头像" className="h-full w-full object-cover object-top" /> : <span className={fallbackClassName}>{firstChar}</span>}
            </button>
        );
    };

    const pad2 = (n: number) => `${Math.trunc(n)}`.padStart(2, '0');
    const 规范化时间串 = (raw: string): string => {
        const match = raw.trim().match(/^(\d{1,6}):(\d{1,2}):(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
        if (!match) return '';
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const hour = Number(match[4]);
        const minute = Number(match[5]);
        if (![year, month, day, hour, minute].every(Number.isFinite)) return '';
        if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
        return `${Math.trunc(year)}:${pad2(month)}:${pad2(day)}:${pad2(hour)}:${pad2(minute)}`;
    };

    const 解析更新时间文本 = (raw: unknown): string => {
        if (typeof raw === 'string') return 规范化时间串(raw) || raw.trim();
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
        const data = raw as Record<string, unknown>;
        const year = Number(data.年 ?? data.year);
        const month = Number(data.月 ?? data.month);
        const day = Number(data.日 ?? data.day);
        const hour = Number(data.时 ?? data.hour ?? 0);
        const minute = Number(data.分 ?? data.minute ?? 0);
        if (![year, month, day, hour, minute].every(Number.isFinite)) return '';
        if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
        return `${Math.trunc(year)}:${pad2(month)}:${pad2(day)}:${pad2(hour)}:${pad2(minute)}`;
    };

    const 读取队员最后更新时间 = (npc: NPC结构): string => {
        const candidates: unknown[] = [
            npc.上次更新时间,
            (npc as any)?.最后更新时间,
            (npc as any)?.更新时间,
            (npc as any)?.队伍战斗状态?.上次更新时间,
            (npc as any)?.队伍战斗状态?.最后更新时间,
            (npc as any)?.战斗状态?.上次更新时间,
            (npc as any)?.战斗状态?.最后更新时间
        ];
        for (const candidate of candidates) {
            const parsed = 解析更新时间文本(candidate);
            if (parsed) return parsed;
        }
        return '';
    };

    const 解析装备名称 = (raw?: string, items?: any[]): string => {
        const v = (raw || '').trim();
        if (!v || v === '无') return v || '无';
        if (!/^Item\d+$/i.test(v) || !Array.isArray(items)) return v;
        const found = items.find((it: any) => it?.ID === v || it?.id === v);
        return found?.名称 || found?.name || v;
    };
    const EquipItem: React.FC<{ label: string; value?: string; highlight?: boolean }> = ({ label, value, highlight }) => {
        const displayValue = 解析装备名称(value, (character as any).物品列表);
        return (
            <div className={`flex justify-between items-center text-sm border-b border-wuxia-gold/10 py-2.5 last:border-0 hover:bg-wuxia-gold/5 px-2 -mx-2 rounded transition-colors ${highlight ? 'hover:bg-pink-900/10' : ''}`}>
                <span className={`text-gray-400 font-serif ${highlight ? 'text-pink-400/80 tracking-widest' : ''}`}>{label}</span>
                <span className={`${displayValue && displayValue !== '无' ? 'text-gray-200 font-serif' : 'text-gray-600 italic'}`}>{displayValue || '无'}</span>
            </div>
        );
    };

    const renderPlayerDetail = () => {
        const hp = 读取资源展示(character, 资源文案.气血当前字段, 资源文案.气血最大字段, { allowBodyParts: true });
        const sp = 读取资源展示(character, 资源文案.精力当前字段, 资源文案.精力最大字段);
        const qi = 读取资源展示(character, 资源文案.能量当前字段, 资源文案.能量最大字段);
        const 基础属性 = [
            ['力', 读取数值((character as any).力量)],
            ['敏', 读取数值((character as any).敏捷)],
            ['体', 读取数值((character as any).体质)],
            ['根', 读取数值((character as any).根骨)],
            ['悟', 读取数值((character as any).悟性)],
            ['福', 读取数值((character as any).福源)],
            ['境层', 读取数值((character as any).境界层级, 1)],
            ['攻', 读取数值((character as any).攻击力)],
            ['防', 读取数值((character as any).防御力)]
        ];
        const hpPct = Math.max(0, Math.min(100, (hp.current / hp.max) * 100));
        const spPct = Math.max(0, Math.min(100, (sp.current / sp.max) * 100));
        const qiPct = Math.max(0, Math.min(100, (qi.current / qi.max) * 100));

        return (
            <div className="flex h-full flex-col animate-fadeIn relative z-10">
                <div className="mb-6 flex items-start justify-between border-b border-wuxia-gold/10 pb-6">
                    <div className="flex items-center gap-5">
                        <AvatarBox person={character} title={`${character.姓名 || '主角'}头像`} />
                        <div>
                            <div className="mb-2 flex items-center gap-3">
                                <span className="text-3xl font-bold tracking-wider text-gray-100 drop-shadow-md">{character.姓名 || '主角'}</span>
                                <span className="rounded-full border border-wuxia-gold/30 bg-wuxia-gold/15 px-3 py-1 text-xs text-wuxia-gold">队长</span>
                                <span className="rounded border border-wuxia-gold/30 bg-wuxia-gold/20 px-2 py-0.5 text-[10px] text-wuxia-gold">{character.境界 || '境界不明'}</span>
                            </div>
                            <div className="text-xs text-gray-500 font-mono">{character.称号 || character.出身背景?.名称 || 界面文案.标题.队员未变化}</div>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-6 overflow-y-auto custom-scrollbar pb-6 md:grid-cols-2">
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-wuxia-gold/10 bg-gradient-to-br from-black/60 to-black/30 p-5 shadow-inner">
                            <div className="mb-4 flex items-center gap-2 border-b border-wuxia-gold/10 pb-2">
                                <IconHeart size={14} className="text-wuxia-gold/60" />
                                <div className="text-sm font-bold tracking-widest text-wuxia-gold/80">{资源文案.分组标题}</div>
                            </div>
                            <div className="space-y-4">
                                {[
                                    [资源文案.气血, hp.current, hp.max, hpPct, 'from-red-600 to-red-400'],
                                    [资源文案.精力, sp.current, sp.max, spPct, 'from-teal-600 to-teal-400'],
                                    [资源文案.能量, qi.current, qi.max, qiPct, 'from-indigo-600 to-indigo-400']
                                ].map(([label, cur, max, pct, color]) => (
                                    <div key={String(label)}>
                                        <div className="mb-1 flex justify-between text-xs font-mono">
                                            <span className="font-serif tracking-widest text-wuxia-gold/80">{label}</span>
                                            <span className="text-gray-300">{cur} / {max}</span>
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full border border-white/5 bg-black">
                                            <div className={`h-full bg-gradient-to-r ${color}`} style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-2xl border border-wuxia-gold/10 bg-gradient-to-br from-black/60 to-black/30 p-5 shadow-inner">
                            <div className="mb-4 flex items-center gap-2 border-b border-wuxia-gold/10 pb-2">
                                <IconSwords size={14} className="text-wuxia-gold/60" />
                                <div className="text-sm font-bold tracking-widest text-wuxia-gold/80">{界面文案.标题.基础属性}</div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                {基础属性.map(([label, value]) => (
                                    <div key={label} className="flex flex-col items-center justify-center rounded-xl border border-wuxia-gold/10 bg-black/50 p-3">
                                        <span className="mb-1 text-xs tracking-widest text-wuxia-gold/50">{label}</span>
                                        <span className="font-mono text-xl font-bold text-gray-100">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-wuxia-gold/10 bg-black/40 p-5">
                            <div className="mb-4 flex items-center gap-2 border-b border-wuxia-gold/10 pb-2">
                                <span className="h-1.5 w-1.5 rotate-45 bg-wuxia-gold/50" />
                                <div className="text-sm font-bold tracking-widest text-wuxia-gold/80">{界面文案.标题.武器装备}</div>
                            </div>
                            <div className="px-1">
                                <EquipItem label="主手兵刃" value={(character as any).装备?.武器 || (character as any).装备?.主武器} />
                                <EquipItem label="防护衣甲" value={(character as any).装备?.防具 || (character as any).装备?.服装} />
                                <EquipItem label="随身配饰" value={(character as any).装备?.饰品} />
                            </div>
                        </div>
                        <div className="rounded-2xl border border-wuxia-gold/10 bg-black/40 p-5">
                            <div className="mb-4 flex items-center gap-2 border-b border-wuxia-gold/10 pb-2">
                                <span className="h-1.5 w-1.5 rotate-45 bg-gray-500" />
                                <div className="text-sm font-bold tracking-widest text-gray-400">{界面文案.标题.随身物品}</div>
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                                {Array.isArray((character as any).物品列表) && (character as any).物品列表.length > 0 ? (
                                    (character as any).物品列表.slice(0, 18).map((item: any, i: number) => (
                                        <span key={`${item?.ID || item?.名称 || i}`} className="rounded border border-gray-700 bg-black/60 px-3 py-1.5 text-xs text-gray-300">
                                            {typeof item === 'string' ? item : item?.名称 || '未命名物品'}
                                        </span>
                                    ))
                                ) : (
                                    <div className="w-full rounded-xl border-2 border-dashed border-gray-800 py-6 text-center">
                                        <span className="text-xs italic tracking-widest text-gray-600">{界面文案.标题.随身物品空状态}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderTeammateDetail = (npc: NPC结构) => {
        const hp = 读取资源展示(npc, 资源文案.气血当前字段, 资源文案.气血最大字段, { allowBodyParts: true });
        const sp = 读取资源展示(npc, 资源文案.精力当前字段, 资源文案.精力最大字段);
        const qi = 读取资源展示(npc, 资源文案.能量当前字段, 资源文案.能量最大字段);
        const safeHpMax = hp.max;
        const safeHpCur = hp.current;
        const safeSpMax = sp.max;
        const safeSpCur = sp.current;
        const safeQiMax = qi.max;
        const safeQiCur = qi.current;
        const hpPct = Math.max(0, Math.min(100, (safeHpCur / safeHpMax) * 100));
        const spPct = Math.max(0, Math.min(100, (safeSpCur / safeSpMax) * 100));
        const qiPct = Math.max(0, Math.min(100, (safeQiCur / safeQiMax) * 100));
        const lastUpdate = 读取队员最后更新时间(npc);
        const 基础属性 = [
            ['力', 读取数值((npc as any).力量)],
            ['敏', 读取数值((npc as any).敏捷)],
            ['体', 读取数值((npc as any).体质)],
            ['根', 读取数值((npc as any).根骨)],
            ['悟', 读取数值((npc as any).悟性)],
            ['福', 读取数值((npc as any).福源)],
            ['境层', 读取数值((npc as any).境界层级, 1)],
            ['攻', 读取数值(npc.攻击力)],
            ['防', 读取数值(npc.防御力)]
        ];
        
        const isFemale = npc.性别 === '女';
        const themeBorder = isFemale ? 'border-pink-900/40' : 'border-blue-900/40';
        const themeBg = isFemale ? 'bg-pink-900/10' : 'bg-blue-900/10';
        const themeText = isFemale ? 'text-pink-400' : 'text-blue-400';

        return (
            <div className="flex flex-col h-full animate-fadeIn relative z-10">
                {/* 头部信息 */}
                <div className="flex items-start justify-between border-b border-wuxia-gold/10 pb-6 mb-6">
                    <div className="flex items-center gap-5">
                        <AvatarBox person={npc} title={`${npc.姓名}头像`} className={`h-20 w-20 rounded-2xl ${themeBorder} ${themeBg} ${themeText}`} />
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-3xl text-gray-100 font-serif font-bold tracking-wider drop-shadow-md">{npc.姓名}</span>
                                <span className="px-3 py-1 bg-black/40 border border-gray-600 text-gray-300 text-xs rounded-full font-serif shadow-sm tracking-widest">{npc.身份 || '流莺'}</span>
                                <span className="text-[10px] bg-wuxia-gold/20 text-wuxia-gold px-2 py-0.5 rounded border border-wuxia-gold/30">{npc.境界 || '境界不明'}</span>
                            </div>
                            <div className="text-xs text-gray-500 font-mono">
                                {lastUpdate ? `${界面文案.标题.队员时间标记}：${lastUpdate}` : 界面文案.标题.队员未变化}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto custom-scrollbar pb-6">
                    {/* 左侧：状态与属性 */}
                    <div className="space-y-6">
                        <div className="bg-gradient-to-br from-black/60 to-black/30 border border-wuxia-gold/10 rounded-2xl p-5 shadow-inner">
                            <div className="flex items-center gap-2 mb-4 border-b border-wuxia-gold/10 pb-2">
                                <IconHeart size={14} className="text-wuxia-gold/60" />
                                <div className="text-sm text-wuxia-gold/80 font-serif tracking-widest font-bold">{资源文案.分组标题}</div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-xs mb-1 font-mono">
                                        <span className="text-red-400 font-serif tracking-widest">{资源文案.气血}</span>
                                        <span className="text-gray-300">{safeHpCur} / {safeHpMax}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-black border border-white/5 overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_5px_rgba(220,38,38,0.5)]" style={{width: `${hpPct}%`}}></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1 font-mono">
                                        <span className="text-teal-400 font-serif tracking-widest">{资源文案.精力}</span>
                                        <span className="text-gray-300">{safeSpCur} / {safeSpMax}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-black border border-white/5 overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-teal-600 to-teal-400 shadow-[0_0_5px_rgba(45,212,191,0.5)]" style={{width: `${spPct}%`}}></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1 font-mono">
                                        <span className="text-indigo-400 font-serif tracking-widest">{资源文案.能量}</span>
                                        <span className="text-gray-300">{safeQiCur} / {safeQiMax}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-black border border-white/5 overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 shadow-[0_0_5px_rgba(99,102,241,0.5)]" style={{width: `${qiPct}%`}}></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-black/60 to-black/30 border border-wuxia-gold/10 rounded-2xl p-5 shadow-inner">
                            <div className="flex items-center gap-2 mb-4 border-b border-wuxia-gold/10 pb-2">
                                <IconSwords size={14} className="text-wuxia-gold/60" />
                                <div className="text-sm text-wuxia-gold/80 font-serif tracking-widest font-bold">{界面文案.标题.基础属性}</div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                {基础属性.map(([label, value]) => (
                                    <div key={label} className="bg-black/50 border border-wuxia-gold/10 rounded-xl p-3 flex flex-col items-center justify-center hover:border-wuxia-gold/30 transition-colors">
                                        <span className="text-xs text-wuxia-gold/50 font-serif tracking-widest mb-1">{label}</span>
                                        <span className="text-xl font-mono font-bold text-gray-100">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 右侧：着装与背包 */}
                    <div className="space-y-6">
                        <div className="bg-black/40 border border-wuxia-gold/10 rounded-2xl p-5 relative overflow-hidden">
                            <div className="absolute right-0 top-0 text-[100px] text-wuxia-gold opacity-[0.02] select-none pointer-events-none transform translate-x-4 -translate-y-4 font-serif">
                                兵
                            </div>
                            <div className="flex items-center gap-2 mb-4 border-b border-wuxia-gold/10 pb-2">
                                <span className="w-1.5 h-1.5 rotate-45 bg-wuxia-gold/50"></span>
                                <div className="text-sm text-wuxia-gold/80 font-serif tracking-widest font-bold">{界面文案.标题.武器装备}</div>
                            </div>
                            <div className="px-1 relative z-10">
                                <EquipItem label="主手兵刃" value={npc.当前装备?.主武器} />
                                <EquipItem label="副手持物" value={npc.当前装备?.副武器} />
                                <EquipItem label="随身配饰" value={npc.当前装备?.饰品} />
                            </div>
                        </div>

                        {isFemale && (
                            <div className="bg-pink-950/10 border border-pink-900/20 rounded-2xl p-5 shadow-inner hover:border-pink-900/40 transition-colors">
                                <div className="flex items-center gap-2 mb-4 border-b border-pink-900/20 pb-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500/70"></span>
                                    <div className="text-sm text-pink-400/90 font-serif tracking-widest font-bold">{界面文案.标题.服饰装备}</div>
                                </div>
                                <div className="px-1 relative z-10">
                                    <EquipItem label="外装罗裙" value={npc.当前装备?.服装} highlight />
                                    <EquipItem label="贴身亵衣" value={npc.当前装备?.内衣} highlight />
                                    <EquipItem label="贴身亵裤" value={npc.当前装备?.内裤} highlight />
                                    <EquipItem label="足下罗袜" value={npc.当前装备?.袜饰} highlight />
                                    <EquipItem label="足下绣鞋" value={npc.当前装备?.鞋履} highlight />
                                </div>
                            </div>
                        )}

                        <div className="bg-black/40 border border-wuxia-gold/10 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-4 border-b border-wuxia-gold/10 pb-2">
                                <span className="w-1.5 h-1.5 rotate-45 bg-gray-500"></span>
                                <div className="text-sm text-gray-400 font-serif tracking-widest font-bold">{界面文案.标题.随身物品}</div>
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                                {npc.背包 && npc.背包.length > 0 ? (
                                    npc.背包.map((item, i) => (
                                        <span key={i} className="text-xs bg-gradient-to-b from-black/60 to-black/80 border border-gray-700 hover:border-wuxia-gold/40 hover:text-wuxia-gold transition-colors px-3 py-1.5 rounded shadow-sm text-gray-300 font-serif">
                                            {typeof item === 'string' ? item : item?.名称 || '未命名物品'}
                                        </span>
                                    ))
                                ) : (
                                    <div className="w-full text-center py-6 border-2 border-dashed border-gray-800 rounded-xl">
                                        <span className="text-xs text-gray-600 italic font-serif tracking-widest">{界面文案.标题.随身物品空状态}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fadeIn">
            {/* 标准黑金修仙武侠主题大窗口 */}
            <div className="bg-ink-black/95 w-full max-w-7xl max-h-[90vh] h-[90vh] flex flex-col rounded-2xl border border-wuxia-gold/20 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 relative overflow-hidden">
                
                {/* 装饰类背景层 */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-ink-wash/5 bg-cover bg-center opacity-30 mix-blend-luminosity filter blur-sm"></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-wuxia-gold/5 via-transparent to-black"></div>
                </div>

                {/* 顶栏 */}
                <div className="h-14 shrink-0 border-b border-wuxia-gold/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-6 relative z-50">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-wuxia-gold animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>
                        <h3 className="text-wuxia-gold font-serif font-bold text-xl tracking-[0.4em] drop-shadow-md">
                            {界面文案.标题.队伍}
                            <span className="text-[10px] text-wuxia-gold/50 ml-2 font-mono tracking-widest border border-wuxia-gold/20 px-2 py-0.5 rounded-full">TEAM ROSTER</span>
                        </h3>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-400 hover:bg-red-400/10 transition-all hover:rotate-90"
                        title="关闭"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 主体布局：侧边栏 + 右侧详情 */}
                <div className="flex-1 flex overflow-hidden relative z-10">
                    
                    {/* 侧边栏：编队列表 */}
                    <div className="w-64 shrink-0 border-r border-wuxia-gold/10 bg-black/40 backdrop-blur-sm flex flex-col relative z-10 overflow-hidden">
                        <div className="p-4 border-b border-wuxia-gold/10 bg-black/60 shadow-md">
                            <div className="text-[10px] text-wuxia-gold/50 tracking-[0.3em] font-serif uppercase mb-2 flex items-center gap-2">
                                <span className="w-1 h-3 bg-wuxia-gold/50 rounded-full"></span>{界面文案.标题.队伍成员} ({activeTeammates.length + 1})
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                            <button
                                type="button"
                                onClick={() => setSelectedTab(playerTabId)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 relative overflow-hidden group ${
                                    selectedTab === playerTabId
                                        ? 'border-wuxia-gold/40 bg-gradient-to-r from-wuxia-gold/10 to-transparent shadow-[0_0_15px_rgba(212,175,55,0.1)]'
                                        : 'border-transparent bg-black/20 hover:bg-white/5 hover:border-white/10'
                                }`}
                            >
                                {selectedTab === playerTabId && <div className="absolute left-0 top-0 bottom-0 w-1 bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>}
                                <AvatarBox person={character} title={`${character.姓名 || '主角'}头像`} className="h-10 w-10 rounded-full" fallbackClassName="text-sm" />
                                <div className="min-w-0 flex-1 text-left">
                                    <div className={`truncate font-bold ${selectedTab === playerTabId ? 'text-wuxia-gold' : 'text-gray-200'}`}>{character.姓名 || '主角'}</div>
                                    <div className="mt-0.5 truncate text-[10px] tracking-widest text-gray-500">队长 · {character.境界 || '境界不明'}</div>
                                </div>
                            </button>

                            {/* 队员列表 */}
                            {activeTeammates.map(npc => (
                                <button
                                    key={npc.id}
                                    onClick={() => setSelectedTab(npc.id)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 relative overflow-hidden group ${
                                        selectedTab === npc.id
                                            ? 'border-wuxia-gold/40 bg-gradient-to-r from-wuxia-gold/10 to-transparent shadow-[0_0_15px_rgba(212,175,55,0.1)]'
                                            : 'border-transparent bg-black/20 hover:bg-white/5 hover:border-white/10'
                                    }`}
                                >
                                    {selectedTab === npc.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-wuxia-gold shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>}
                                    <AvatarBox person={npc} title={`${npc.姓名}头像`} className={`h-10 w-10 rounded-full ${npc.性别 === '女' ? 'border-pink-900/50 text-pink-400' : 'border-blue-900/50 text-blue-400'}`} fallbackClassName="text-sm" />
                                    <div className="text-left flex-1 min-w-0">
                                        <div className={`font-serif font-bold truncate ${selectedTab === npc.id ? 'text-wuxia-gold' : 'text-gray-200'}`}>{npc.姓名}</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5 truncate tracking-widest">{npc.身份 || '追随者'}</div>
                                    </div>
                                </button>
                            ))}
                            
                            {activeTeammates.length === 0 && (
                                <div className="text-center py-6 text-gray-600 text-[10px] italic font-serif tracking-widest border border-dashed border-gray-800 rounded-lg m-2">
                                    {界面文案.标题.队伍空状态}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右侧：详细内容面板 */}
                    <div className="flex-1 p-8 overflow-hidden relative">
                        {/* 装饰背图 */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 -translate-x-12 opacity-5 pointer-events-none filter blur-sm">
                            <IconYinYang size={300} className="text-wuxia-gold" />
                        </div>
                        
                        <div className="h-full relative z-10 w-full max-w-4xl mx-auto">
                            {(() => {
                                if (selectedTab === playerTabId) return renderPlayerDetail();
                                const selectedNpc = activeTeammates.find(n => n.id === selectedTab);
                                if (!selectedNpc) return (
                                    <div className="flex flex-col items-center justify-center h-full text-wuxia-gold/40 font-serif">
                                        <IconUsers size={64} className="mb-4" />
                                        <span className="text-xl tracking-widest">{界面文案.标题.队员选择提示}</span>
                                    </div>
                                );
                                return renderTeammateDetail(selectedNpc);
                            })()}
                        </div>
                    </div>

                </div>
            </div>
            {imageViewer && (
                <div className="fixed inset-0 z-[260] flex items-center justify-end bg-black/85 pr-8 backdrop-blur-sm" onClick={() => setImageViewer(null)}>
                    <div className="relative max-h-[88vh] max-w-[85vw]" onClick={(event) => event.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => setImageViewer(null)}
                            className="absolute right-2 top-2 z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-red-600 text-xl font-black text-white shadow-[0_0_18px_rgba(220,38,38,0.75)] transition hover:scale-110 hover:bg-red-500"
                            title="关闭"
                        >
                            ×
                        </button>
                        <img src={imageViewer.src} alt={imageViewer.title} className="max-h-[88vh] max-w-[85vw] object-contain shadow-2xl" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeamModal;
