import React, { useMemo, useState } from 'react';
import { 角色技艺 } from '../../../models/character';
import { NPC结构 } from '../../../models/social';
import { 功法结构 } from '../../../models/kungfu';

// ─── 类型定义 ───────────────────────────────────────────────────────────────

interface Props {
    技艺列表: 角色技艺[];
    社交列表?: NPC结构[];
    典籍列表?: 功法结构[];
    onClose: () => void;
    onSkillUpdate?: (updatedSkills: 角色技艺[]) => void;
}

interface 学习来源 {
    类型: 'NPC' | '典籍' | '熟能生巧';
    名称: string;
    描述: string;
    条件?: string;
    预计提升?: string;
}

// ─── 等级系统 ───────────────────────────────────────────────────────────────

const 技艺等级序列 = ['未入门', '入门', '初窥', '小成', '大成', '登堂', '入室', '圆满', '宗师', '大宗师'];

const 获取等级索引 = (level: string): number => {
    const idx = 技艺等级序列.indexOf(level);
    return idx >= 0 ? idx : 0;
};

const 获取下一等级 = (level: string): string | null => {
    const idx = 获取等级索引(level);
    return idx < 技艺等级序列.length - 1 ? 技艺等级序列[idx + 1] : null;
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

const 获取等级背景 = (level: string): string => {
    const idx = 获取等级索引(level);
    if (idx <= 0) return 'border-gray-700/50 bg-gray-900/30';
    if (idx <= 2) return 'border-gray-600/50 bg-gray-800/30';
    if (idx <= 4) return 'border-emerald-700/40 bg-emerald-950/20';
    if (idx <= 6) return 'border-cyan-700/40 bg-cyan-950/20';
    if (idx <= 8) return 'border-wuxia-gold/30 bg-wuxia-gold/5';
    return 'border-purple-700/40 bg-purple-950/20';
};

// ─── 技艺图标 ───────────────────────────────────────────────────────────────

const 技艺图标映射: Record<string, string> = {
    '炼器': '🔨',
    '炼丹': '🧪',
    '医术': '💊',
    '阵法': '🔮',
    '符箓': '📜',
    '机关': '⚙️',
    '采集': '🌿',
    '鉴定': '🔍',
};

const 获取技艺图标 = (name: string): string => {
    return 技艺图标映射[name] || '📖';
};

// ─── 提升路径计算 ─────────────────────────────────────────────────────────

const 计算提升路径 = (skill: 角色技艺, npcs?: NPC结构[], books?: 功法结构[]): 学习来源[] => {
    const sources: 学习来源[] = [];
    const currentLevel = 获取等级索引(skill.等级);

    // 从 NPC 学习
    if (npcs) {
        npcs.forEach(npc => {
            if (!npc?.技艺 || !Array.isArray(npc.技艺)) return;
            const npcSkill = npc.技艺.find(s => s.名称 === skill.名称);
            if (npcSkill && 获取等级索引(npcSkill.等级) > currentLevel) {
                sources.push({
                    类型: 'NPC',
                    名称: npc.姓名 || '未知人物',
                    描述: `${npc.姓名}精通${skill.名称}（${npcSkill.等级}），可向其请教学习。`,
                    条件: npc.好感度 !== undefined ? `好感度 ≥ ${Math.max(30, currentLevel * 15)}` : undefined,
                    预计提升: `熟练度 +${5 + currentLevel * 3}`,
                });
            }
        });
    }

    // 从典籍学习
    if (books) {
        books.forEach(book => {
            const bookName = book.名称 || '';
            const bookDesc = book.描述 || '';
            if (bookName.includes(skill.名称) || bookDesc.includes(skill.名称)) {
                sources.push({
                    类型: '典籍',
                    名称: book.名称,
                    描述: `研读「${book.名称}」可提升${skill.名称}造诣。`,
                    条件: book.境界限制 || undefined,
                    预计提升: `熟练度 +${8 + currentLevel * 2}`,
                });
            }
        });
    }

    // 熟能生巧
    sources.push({
        类型: '熟能生巧',
        名称: '反复练习',
        描述: `通过日常使用${skill.名称}，积累经验逐步提升。每次成功使用可获得少量熟练度。`,
        预计提升: `熟练度 +${1 + Math.floor(currentLevel * 0.5)}（每次使用）`,
    });

    return sources;
};

// ─── 技艺详情面板 ─────────────────────────────────────────────────────────

const SkillDetail: React.FC<{
    skill: 角色技艺;
    sources: 学习来源[];
}> = ({ skill, sources }) => {
    const nextLevel = 获取下一等级(skill.等级);
    const progress = skill.熟练度 || 0;
    const maxProgress = 100;
    const pct = Math.min((progress / maxProgress) * 100, 100);

    return (
        <div className="space-y-4 animate-fadeIn">
            {/* 技艺标题 */}
            <div className="flex items-center gap-3 pb-3 border-b border-wuxia-gold/15">
                <span className="text-3xl">{获取技艺图标(skill.名称)}</span>
                <div>
                    <h3 className="text-xl font-serif font-bold text-wuxia-gold tracking-widest">{skill.名称}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded border font-serif ${获取等级背景(skill.等级)} ${获取等级颜色(skill.等级)}`}>
                            {skill.等级}
                        </span>
                        {nextLevel && (
                            <span className="text-[10px] text-gray-500">→ {nextLevel}</span>
                        )}
                    </div>
                </div>
            </div>

            {/* 描述 */}
            {skill.描述 && (
                <div className="bg-black/30 border-l-2 border-wuxia-gold/30 p-3 rounded-r-lg">
                    <p className="text-sm text-gray-300 font-serif italic leading-relaxed">{skill.描述}</p>
                </div>
            )}

            {/* 熟练度进度 */}
            <div className="bg-black/30 border border-gray-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-gray-500 font-serif tracking-widest">熟练度</span>
                    <span className="text-sm font-mono text-wuxia-gold">{progress} / {maxProgress}</span>
                </div>
                <div className="h-2 rounded-full border border-white/5 bg-black/60 overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-wuxia-gold/60 to-wuxia-gold transition-all duration-700 ease-out shadow-[0_0_6px_rgba(212,175,55,0.4)]"
                        style={{ width: `${pct}%` }}
                    />
                </div>
                {nextLevel && (
                    <div className="mt-1.5 text-[10px] text-gray-500">
                        达到 100 熟练度可突破至「{nextLevel}」
                    </div>
                )}
            </div>

            {/* 提升路径 */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <span className="w-1 h-3 bg-wuxia-gold/50 rounded-full"></span>
                    <span className="text-sm font-serif text-wuxia-gold/90 tracking-widest font-bold">提升路径</span>
                </div>
                <div className="space-y-2.5">
                    {sources.map((source, idx) => (
                        <div
                            key={`source-${idx}`}
                            className={`rounded-lg border p-3 transition-colors hover:border-wuxia-gold/30 ${
                                source.类型 === 'NPC' ? 'border-emerald-800/40 bg-emerald-950/10'
                                : source.类型 === '典籍' ? 'border-indigo-800/40 bg-indigo-950/10'
                                : 'border-gray-800/40 bg-gray-950/10'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-serif ${
                                        source.类型 === 'NPC' ? 'border-emerald-700/50 text-emerald-300 bg-emerald-950/30'
                                        : source.类型 === '典籍' ? 'border-indigo-700/50 text-indigo-300 bg-indigo-950/30'
                                        : 'border-gray-700/50 text-gray-300 bg-gray-950/30'
                                    }`}>
                                        {source.类型 === 'NPC' ? '👤 拜师' : source.类型 === '典籍' ? '📚 研读' : '🔄 练习'}
                                    </span>
                                    <span className="text-sm text-gray-200 font-serif">{source.名称}</span>
                                </div>
                                {source.预计提升 && (
                                    <span className="text-[10px] text-emerald-400/80 font-mono bg-emerald-950/30 px-1.5 py-0.5 rounded">
                                        {source.预计提升}
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-gray-400 leading-relaxed mt-1">{source.描述}</p>
                            {source.条件 && (
                                <div className="mt-1.5 text-[10px] text-yellow-400/70 flex items-center gap-1">
                                    <span>⚠️</span> 条件：{source.条件}
                                </div>
                            )}
                        </div>
                    ))}
                    {sources.length === 0 && (
                        <div className="text-center text-gray-600 text-sm py-4 border border-dashed border-gray-800 rounded-lg">
                            暂无可用提升路径
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── 主组件 ───────────────────────────────────────────────────────────────

const SkillsPanel: React.FC<Props> = ({
    技艺列表,
    社交列表,
    典籍列表,
    onClose,
}) => {
    const safeSkills = Array.isArray(技艺列表) ? 技艺列表 : [];
    const [selectedSkill, setSelectedSkill] = useState<string>(
        safeSkills.length > 0 ? safeSkills[0].名称 : ''
    );

    const currentSkill = useMemo(
        () => safeSkills.find(s => s.名称 === selectedSkill) || null,
        [safeSkills, selectedSkill]
    );

    const sources = useMemo(() => {
        if (!currentSkill) return [];
        return 计算提升路径(currentSkill, 社交列表 as any, 典籍列表);
    }, [currentSkill, 社交列表, 典籍列表]);

    // 按等级分组排序
    const sortedSkills = useMemo(() => {
        return [...safeSkills].sort((a, b) => {
            const levelDiff = 获取等级索引(b.等级) - 获取等级索引(a.等级);
            if (levelDiff !== 0) return levelDiff;
            return (b.熟练度 || 0) - (a.熟练度 || 0);
        });
    }, [safeSkills]);

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-ink-black/95 w-full max-w-5xl max-h-[90vh] h-[85vh] flex flex-col rounded-2xl border border-wuxia-gold/20 shadow-[0_0_80px_rgba(0,0,0,0.9)] shadow-wuxia-gold/10 relative overflow-hidden">

                {/* 装饰背景 */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[url('/assets/images/ui/paper-texture.png')] opacity-5 mix-blend-overlay"></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-wuxia-gold/5 via-transparent to-black"></div>
                </div>

                {/* 顶栏 */}
                <div className="h-14 shrink-0 border-b border-wuxia-gold/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-6 relative z-50">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-sm rotate-45 bg-wuxia-gold animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.8)]"></div>
                        <h3 className="text-wuxia-gold font-serif font-bold text-xl tracking-[0.4em] drop-shadow-md">
                            技艺修行
                            <span className="text-[10px] text-wuxia-gold/50 ml-2 font-mono tracking-widest border border-wuxia-gold/20 px-2 py-0.5 rounded-full">SKILLS</span>
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

                {/* 主体 */}
                <div className="flex-1 flex overflow-hidden relative z-10">
                    {/* 左侧：技艺列表 */}
                    <div className="w-[280px] shrink-0 border-r border-wuxia-gold/10 bg-black/40 backdrop-blur-sm flex flex-col overflow-hidden">
                        <div className="p-3 border-b border-gray-800/50">
                            <div className="text-[10px] text-gray-500 tracking-widest font-serif">
                                共 {safeSkills.length} 项技艺
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-1.5" style={{ scrollbarWidth: 'none' }}>
                            {sortedSkills.map((skill) => {
                                const isSelected = selectedSkill === skill.名称;
                                const progress = skill.熟练度 || 0;

                                return (
                                    <button
                                        key={skill.名称}
                                        onClick={() => setSelectedSkill(skill.名称)}
                                        className={`w-full text-left p-3 rounded-xl transition-all relative group overflow-hidden border ${
                                            isSelected
                                                ? `${获取等级背景(skill.等级)} shadow-[0_0_12px_rgba(212,175,55,0.08)]`
                                                : 'border-transparent bg-black/20 hover:border-gray-700/50 hover:bg-white/5'
                                        }`}
                                    >
                                        {isSelected && (
                                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-wuxia-gold shadow-[0_0_8px_rgba(212,175,55,0.6)]"></div>
                                        )}

                                        <div className="flex items-center gap-2.5">
                                            <span className="text-lg shrink-0">{获取技艺图标(skill.名称)}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <span className={`font-serif text-sm truncate ${
                                                        isSelected ? 'text-wuxia-gold font-bold' : 'text-gray-200'
                                                    }`}>
                                                        {skill.名称}
                                                    </span>
                                                    <span className={`text-[10px] shrink-0 ml-2 ${获取等级颜色(skill.等级)}`}>
                                                        {skill.等级}
                                                    </span>
                                                </div>
                                                <div className="mt-1.5 h-1 rounded-full bg-black/60 border border-white/5 overflow-hidden">
                                                    <div
                                                        className="h-full bg-wuxia-gold/50 transition-all duration-500"
                                                        style={{ width: `${Math.min(progress, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                            {sortedSkills.length === 0 && (
                                <div className="text-center text-gray-600 text-sm py-10 font-serif">
                                    尚无技艺记录
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右侧：技艺详情 */}
                    <div className="flex-1 p-6 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                        {currentSkill ? (
                            <SkillDetail skill={currentSkill} sources={sources} />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-3">
                                <span className="text-4xl opacity-30">📖</span>
                                <span className="font-serif tracking-widest">选择一项技艺查看详情</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SkillsPanel;
