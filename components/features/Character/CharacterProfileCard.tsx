import React, { useMemo } from 'react';
import { 角色数据结构, 视觉设置结构 } from '../../../types';
import { 构建区域文字样式 } from '../../../utils/visualSettings';
import { 格式化月日, 计算角色总气血 } from '../../../utils/characterVitals';
interface Props {
    character: 角色数据结构;
    visualConfig?: 视觉设置结构;
}

const CharacterProfileCard: React.FC<Props> = ({ character, visualConfig }) => {
    const 天赋列表 = Array.isArray(character.天赋列表) ? character.天赋列表 : [];
    const 技艺列表 = Array.isArray((character as any).技艺) ? (character as any).技艺 : [];
    const areaStyle = 构建区域文字样式(visualConfig, '角色档案');
    const profileFontStyle = {
        fontFamily: areaStyle.fontFamily,
        fontStyle: areaStyle.fontStyle,
    };
    const 总气血 = useMemo(() => 计算角色总气血(character), [character]);

    const 六维说明: Record<string, string> = {
        力: '力量：影响攻势、近战伤害、负重与破防压力。',
        敏: '敏捷：影响身法、移动预算、闪避与远程/突进节奏。',
        体: '体质：影响气血承受、近战/远程物理守势与续航稳定性。',
        根: '根骨：影响法术守势、内力承载、抗性与内功根基。',
        悟: '悟性：影响功法理解、修炼效率、术法/技能加成判定。',
        福: '福源：影响机缘、掉落、随机事件倾向与逢凶化吉概率。',
    };
    const attributes = [
        { key: '力', val: character.力量, title: 六维说明.力 },
        { key: '敏', val: character.敏捷, title: 六维说明.敏 },
        { key: '体', val: character.体质, title: 六维说明.体 },
        { key: '根', val: character.根骨, title: 六维说明.根 },
        { key: '悟', val: character.悟性, title: 六维说明.悟 },
        { key: '福', val: character.福源, title: 六维说明.福 },
    ];

    return (
        <div className="character-profile-card w-full max-w-5xl overflow-hidden rounded-2xl border border-[#c7a56a]/55 bg-[#fffaf0] text-[#4f2d16] shadow-[0_18px_50px_rgba(92,57,24,0.16)]" style={profileFontStyle}>
            <div className="relative border-b border-[#c7a56a]/45 bg-[linear-gradient(180deg,rgba(196,157,92,0.2),rgba(255,250,240,0))] px-6 py-5 md:px-8 md:py-6">
                <div className="text-[10px] uppercase tracking-[0.45em] text-[#9b5a22]">江湖身份文牒</div>
                <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h3 className="text-2xl font-bold tracking-[0.2em] text-[#7a3f12] md:text-3xl" style={{ fontFamily: areaStyle.fontFamily, fontStyle: areaStyle.fontStyle }}>{character.姓名}</h3>
                        <p className="mt-1 text-sm text-[#5f3a1e] md:text-base">{character.称号 || '无称号'} · {character.境界}</p>
                    </div>
                    <div className="inline-flex items-center gap-2 self-start rounded-sm border border-[#df8f7d]/45 bg-[#fff4eb] px-3 py-1.5 text-xs tracking-[0.18em] text-[#b42318] md:self-auto">
                        <span>身份编号</span>
                        <span className="font-mono text-[#7a3f12]">{character.姓名}-{character.年龄}</span>
                    </div>
                </div>
                <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-[radial-gradient(circle_at_center,rgba(196,157,92,0.16),transparent_70%)]"></div>
            </div>

            <div className="grid gap-4 p-5 md:p-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4">
                    <div className="border border-[#c7a56a]/35 bg-[#fffdf6] p-4">
                        <div className="mb-3 text-[10px] uppercase tracking-[0.35em] text-[#9b5a22]">人物信息</div>
                        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                            <div className="border border-[#d8c4a2] bg-[#fffaf0] px-3 py-2">
                                <div className="text-[10px] tracking-[0.25em] text-[#8a5a2f]">背景</div>
                                <div className="mt-1 text-[#7a3f12]">{character.出身背景?.名称 || '无'}</div>
                            </div>
                            <div className="border border-[#d8c4a2] bg-[#fffaf0] px-3 py-2">
                                <div className="text-[10px] tracking-[0.25em] text-[#8a5a2f]">年龄</div>
                                <div className="mt-1">{character.年龄} 岁</div>
                            </div>
                            <div className="border border-[#d8c4a2] bg-[#fffaf0] px-3 py-2">
                                <div className="text-[10px] tracking-[0.25em] text-[#8a5a2f]">生辰</div>
                                <div className="mt-1">{格式化月日(character.出生日期) || '未知'}</div>
                            </div>
                            <div className="border border-[#d8c4a2] bg-[#fffaf0] px-3 py-2">
                                <div className="text-[10px] tracking-[0.25em] text-[#8a5a2f]">总气血</div>
                                <div className={`mt-1 font-mono ${总气血.已死亡 ? 'text-[#b42318]' : 'text-[#7a3f12]'}`}>{总气血.当前}/{总气血.最大}</div>
                            </div>
                            <div className="border border-[#d8c4a2] bg-[#fffaf0] px-3 py-2 sm:col-span-2">
                                <div className="text-[10px] tracking-[0.25em] text-[#8a5a2f]">性格</div>
                                <div className="mt-1">{character.性格 || '暂无性格记录'}</div>
                            </div>
                        </div>
                    </div>

                    <div className="border border-[#c7a56a]/35 bg-[#fffdf6] p-4">
                        <div className="mb-3 text-[10px] uppercase tracking-[0.35em] text-[#9b5a22]">外貌描摹</div>
                        <p className="text-sm leading-7 text-[#4f2d16]">{character.外貌 || '暂无外貌记录。'}</p>
                    </div>

                    <div className="border border-[#c7a56a]/35 bg-[#fffdf6] p-4">
                        <div className="mb-3 text-[10px] uppercase tracking-[0.35em] text-[#9b5a22]">出身批注</div>
                        <p className="text-sm leading-7 text-[#4f2d16]">{character.出身背景?.描述 || '暂无背景描述。'}</p>
                        {character.出身背景?.效果 && <div className="mt-3 border-l-2 border-[#c7a56a] pl-3 text-xs leading-6 text-[#7a3f12]">{character.出身背景.效果}</div>}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="border border-[#df8f7d]/45 bg-[#fff6f1] p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="text-[10px] uppercase tracking-[0.35em] text-[#b42318]">天赋卷宗</div>
                            <div className="text-[10px] text-[#8a5a2f]">共 {天赋列表.length} 项</div>
                        </div>
                        <div className="space-y-3">
                            {天赋列表.length > 0 ? (
                                天赋列表.map((talent, index) => (
                                    <div key={`${talent.名称}-${index}`} className="border border-[#efb0a2]/70 bg-[#fffaf0] p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-sm font-semibold tracking-[0.12em] text-[#7a3f12]">{talent.名称}</span>
                                            <span className="text-[10px] text-[#b42318]">天赋 {index + 1}</span>
                                        </div>
                                        <p className="mt-2 text-xs leading-6 text-[#4f2d16]">{talent.描述 || '暂无描述。'}</p>
                                        {talent.效果 && <div className="mt-2 rounded-sm border border-[#d8c4a2] bg-[#fffdf6] px-2.5 py-2 text-[11px] leading-5 text-[#7a3f12]">{talent.效果}</div>}
                                    </div>
                                ))
                            ) : (
                                <div className="border border-dashed border-[#d8c4a2] px-3 py-6 text-center text-sm text-[#8a5a2f]">暂无天赋记录</div>
                            )}
                        </div>
                    </div>

                    <div className="border border-[#c7a56a]/35 bg-[#fffdf6] p-4">
                        <div className="mb-3 text-[10px] uppercase tracking-[0.35em] text-[#9b5a22]" title="悬浮每个六维格可查看具体影响">基础六维</div>
                        <div className="grid grid-cols-3 gap-2">
                            {attributes.map((attr) => (
                                <div key={`detail-${attr.key}`} title={attr.title} className="cursor-help border border-[#d8c4a2] bg-[#fffaf0] px-2 py-3 text-center">
                                    <div className="text-[10px] tracking-[0.2em] text-[#8a5a2f]">{attr.key}</div>
                                    <div className="mt-1 text-lg font-mono font-bold text-[#7a3f12]">{attr.val}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border border-[#c7a56a]/35 bg-[#fffdf6] p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="text-[10px] uppercase tracking-[0.35em] text-[#9b5a22]">技艺</div>
                            <div className="text-[10px] text-[#8a5a2f]">共 {技艺列表.length} 项</div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {技艺列表.length > 0 ? 技艺列表.map((skill: any, index: number) => (
                                <div
                                    key={`${skill?.名称 || '技艺'}-${index}`}
                                    title={skill?.描述 || '技艺会随故事里的学习、实践与突破更新。'}
                                    className="cursor-help border border-[#d8c4a2] bg-[#fffaf0] px-3 py-2"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="min-w-0 break-words text-sm font-semibold text-[#7a3f12]">{skill?.名称 || '未命名技艺'}</span>
                                        <span className="shrink-0 text-xs text-[#8a5a2f]">{skill?.等级 || '未入门'}</span>
                                    </div>
                                    <div className="mt-1 font-mono text-xs text-[#b42318]">熟练 {Number(skill?.熟练度 || 0)}</div>
                                </div>
                            )) : (
                                <div className="border border-dashed border-[#d8c4a2] px-3 py-6 text-center text-sm text-[#8a5a2f] sm:col-span-2">暂无技艺记录</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CharacterProfileCard;
