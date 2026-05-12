import React, { useMemo, useState } from 'react';
import { 角色技艺 } from '../../../models/character';
import { NPC结构 } from '../../../models/social';
import { 功法结构 } from '../../../models/kungfu';

// ─── 等级系统（复用） ─────────────────────────────────────────────────────

const 技艺等级序列 = ['未入门', '入门', '初窥', '小成', '大成', '登堂', '入室', '圆满', '宗师', '大宗师'];

const 获取等级索引 = (level: string): number => {
    const idx = 技艺等级序列.indexOf(level);
    return idx >= 0 ? idx : 0;
};

const 获取等级颜色 = (level: string): string => {
    const idx = 获取等级索引(level);
    if (idx <= 0) return 'text-gray-500';
    if (idx <= 2) return 'text-gray-300';
    if (idx <= 4) return 'text-emerald-300';
    if (idx <= 6) return 'text-cyan-300';
    if (idx <= 8) return 'text-wuxia-gold';
    return 'text-purple-300';
};

const 技艺图标映射: Record<string, string> = {
    '炼器': '🔨', '炼丹': '🧪', '医术': '💊', '阵法': '🔮',
    '符箓': '📜', '机关': '⚙️', '采集': '🌿', '鉴定': '🔍',
};

// ─── Props ───────────────────────────────────────────────────────────────

interface Props {
    技艺列表: 角色技艺[];
    社交列表?: NPC结构[];
    典籍列表?: 功法结构[];
    onClose: () => void;
}

// ─── 主组件 ───────────────────────────────────────────────────────────────

const MobileSkillsPanel: React.FC<Props> = ({ 技艺列表, 社交列表, onClose }) => {
    const safeSkills = Array.isArray(技艺列表) ? 技艺列表 : [];
    const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

    const sortedSkills = useMemo(() => {
        return [...safeSkills].sort((a, b) => {
            const levelDiff = 获取等级索引(b.等级) - 获取等级索引(a.等级);
            if (levelDiff !== 0) return levelDiff;
            return (b.熟练度 || 0) - (a.熟练度 || 0);
        });
    }, [safeSkills]);

    // 查找可学习的 NPC
    const findTeachers = (skillName: string) => {
        if (!社交列表 || !Array.isArray(社交列表)) return [];
        const skill = safeSkills.find(s => s.名称 === skillName);
        if (!skill) return [];
        const currentLevel = 获取等级索引(skill.等级);

        return 社交列表.filter(npc => {
            if (!npc?.技艺 || !Array.isArray(npc.技艺)) return false;
            const npcSkill = npc.技艺.find((s: any) => s.名称 === skillName);
            return npcSkill && 获取等级索引(npcSkill.等级) > currentLevel;
        }).map(npc => ({
            姓名: npc.姓名 || '未知',
            等级: (npc.技艺 as any[])?.find((s: any) => s.名称 === skillName)?.等级 || '未知',
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[210] flex items-center justify-center p-3 md:hidden animate-fadeIn">
            <div className="w-full max-w-[620px] h-[86vh] rounded-2xl border border-wuxia-gold/30 bg-ink-black/95 shadow-[0_0_65px_rgba(0,0,0,0.88)] overflow-hidden flex flex-col">
                {/* 顶栏 */}
                <div className="h-12 shrink-0 px-4 border-b border-gray-800/60 bg-black/45 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="text-wuxia-gold font-serif font-bold text-base tracking-[0.24em]">技艺</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-wuxia-gold/30 text-wuxia-gold/70">
                            {safeSkills.length} 项
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-wuxia-red hover:border-wuxia-red transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 技艺列表 */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-2">
                    {sortedSkills.map((skill) => {
                        const isExpanded = expandedSkill === skill.名称;
                        const progress = skill.熟练度 || 0;
                        const icon = 技艺图标映射[skill.名称] || '📖';
                        const teachers = isExpanded ? findTeachers(skill.名称) : [];

                        return (
                            <div key={skill.名称} className="rounded-xl border border-gray-800/50 bg-black/30 overflow-hidden">
                                <button
                                    onClick={() => setExpandedSkill(isExpanded ? null : skill.名称)}
                                    className="w-full text-left p-3 flex items-center gap-3"
                                >
                                    <span className="text-xl shrink-0">{icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <span className="font-serif text-sm text-gray-100">{skill.名称}</span>
                                            <span className={`text-[11px] font-serif ${获取等级颜色(skill.等级)}`}>
                                                {skill.等级}
                                            </span>
                                        </div>
                                        <div className="mt-1.5 h-1 rounded-full bg-black/60 border border-white/5 overflow-hidden">
                                            <div
                                                className="h-full bg-wuxia-gold/50 transition-all"
                                                style={{ width: `${Math.min(progress, 100)}%` }}
                                            />
                                        </div>
                                        <div className="mt-1 text-[10px] text-gray-500 font-mono">
                                            熟练度 {progress}/100
                                        </div>
                                    </div>
                                    <svg
                                        className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {isExpanded && (
                                    <div className="px-3 pb-3 space-y-2 border-t border-gray-800/30 pt-2 animate-fadeIn">
                                        {skill.描述 && (
                                            <p className="text-[11px] text-gray-400 italic leading-relaxed">{skill.描述}</p>
                                        )}

                                        {/* 学习途径 */}
                                        <div className="space-y-1.5">
                                            <div className="text-[10px] text-wuxia-gold/70 font-serif tracking-widest">提升途径</div>

                                            {teachers.length > 0 && (
                                                <div className="rounded border border-emerald-800/40 bg-emerald-950/10 p-2">
                                                    <div className="text-[10px] text-emerald-300 mb-1">👤 可拜师学习</div>
                                                    {teachers.map((t, i) => (
                                                        <div key={i} className="text-[11px] text-gray-300 ml-4">
                                                            {t.姓名}（{t.等级}）
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="rounded border border-gray-800/40 bg-gray-950/10 p-2">
                                                <div className="text-[10px] text-gray-400">🔄 熟能生巧</div>
                                                <div className="text-[11px] text-gray-500 mt-0.5">
                                                    日常使用可积累熟练度，达到 100 可突破等级
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {sortedSkills.length === 0 && (
                        <div className="text-center text-gray-600 text-sm py-10 font-serif border border-dashed border-gray-800 rounded-xl">
                            尚无技艺记录
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MobileSkillsPanel;
