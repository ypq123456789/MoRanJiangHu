import React, { useMemo } from 'react';
import { 角色数据结构, 视觉设置结构 } from '../../../types';
import { 构建区域文字样式 } from '../../../utils/visualSettings';
interface Props {
    character: 角色数据结构;
    visualConfig?: 视觉设置结构;
}

const CharacterProfileCard: React.FC<Props> = ({ character, visualConfig }) => {
    const 天赋列表 = Array.isArray(character.天赋列表) ? character.天赋列表 : [];
    const areaStyle = 构建区域文字样式(visualConfig, '角色档案');

    const attributes = [
        { key: '力', val: character.力量 },
        { key: '敏', val: character.敏捷 },
        { key: '体', val: character.体质 },
        { key: '根', val: character.根骨 },
        { key: '悟', val: character.悟性 },
        { key: '福', val: character.福源 },
    ];

    return (
        <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-wuxia-gold/35 bg-[linear-gradient(145deg,rgba(20,16,12,0.98),rgba(8,8,8,0.98))] shadow-[0_0_40px_rgba(0,0,0,0.6),0_0_20px_rgba(230,200,110,0.08)]" style={areaStyle}>
            <div className="relative border-b border-wuxia-gold/20 bg-[linear-gradient(180deg,rgba(230,200,110,0.12),rgba(0,0,0,0))] px-6 py-5 md:px-8 md:py-6">
                <div className="text-[10px] uppercase tracking-[0.45em] text-wuxia-gold/60">江湖身份文牒</div>
                <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h3 className="text-2xl font-bold tracking-[0.2em] text-wuxia-gold md:text-3xl" style={{ fontFamily: areaStyle.fontFamily, fontStyle: areaStyle.fontStyle }}>{character.姓名}</h3>
                        <p className="mt-1 text-sm text-gray-300 md:text-base" style={{ color: areaStyle.color }}>{character.称号 || '无称号'} · {character.境界}</p>
                    </div>
                    <div className="inline-flex items-center gap-2 self-start rounded-sm border border-wuxia-red/25 bg-black/25 px-3 py-1.5 text-xs tracking-[0.18em] text-wuxia-red/85 md:self-auto">
                        <span>身份编号</span>
                        <span className="font-mono text-wuxia-gold">{character.姓名}-{character.年龄}</span>
                    </div>
                </div>
                <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-[radial-gradient(circle_at_center,rgba(230,200,110,0.12),transparent_70%)]"></div>
            </div>

            <div className="grid gap-4 p-5 md:p-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4">
                    <div className="border border-wuxia-gold/20 bg-black/25 p-4">
                        <div className="mb-3 text-[10px] uppercase tracking-[0.35em] text-wuxia-gold/65">人物信息</div>
                        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2" style={{ color: areaStyle.color }}>
                            <div className="border border-gray-800/80 bg-white/[0.03] px-3 py-2">
                                <div className="text-[10px] tracking-[0.25em] text-gray-500">背景</div>
                                <div className="mt-1 text-wuxia-gold">{character.出身背景?.名称 || '无'}</div>
                            </div>
                            <div className="border border-gray-800/80 bg-white/[0.03] px-3 py-2">
                                <div className="text-[10px] tracking-[0.25em] text-gray-500">年龄</div>
                                <div className="mt-1">{character.年龄} 岁</div>
                            </div>
                            <div className="border border-gray-800/80 bg-white/[0.03] px-3 py-2">
                                <div className="text-[10px] tracking-[0.25em] text-gray-500">生辰</div>
                                <div className="mt-1">{character.出生日期 || '未知'}</div>
                            </div>
                            <div className="border border-gray-800/80 bg-white/[0.03] px-3 py-2 sm:col-span-2">
                                <div className="text-[10px] tracking-[0.25em] text-gray-500">性格</div>
                                <div className="mt-1">{character.性格 || '暂无性格记录'}</div>
                            </div>
                        </div>
                    </div>

                    <div className="border border-wuxia-gold/20 bg-black/25 p-4">
                        <div className="mb-3 text-[10px] uppercase tracking-[0.35em] text-wuxia-gold/65">外貌描摹</div>
                        <p className="text-sm leading-7" style={{ color: areaStyle.color }}>{character.外貌 || '暂无外貌记录。'}</p>
                    </div>

                    <div className="border border-wuxia-gold/20 bg-black/25 p-4">
                        <div className="mb-3 text-[10px] uppercase tracking-[0.35em] text-wuxia-gold/65">出身批注</div>
                        <p className="text-sm leading-7" style={{ color: areaStyle.color }}>{character.出身背景?.描述 || '暂无背景描述。'}</p>
                        {character.出身背景?.效果 && <div className="mt-3 border-l-2 border-wuxia-gold/40 pl-3 text-xs leading-6 text-wuxia-gold/85">{character.出身背景.效果}</div>}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="border border-wuxia-red/25 bg-[linear-gradient(180deg,rgba(120,20,20,0.12),rgba(0,0,0,0.1))] p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="text-[10px] uppercase tracking-[0.35em] text-wuxia-red/80">天赋卷宗</div>
                            <div className="text-[10px] text-gray-500">共 {天赋列表.length} 项</div>
                        </div>
                        <div className="space-y-3">
                            {天赋列表.length > 0 ? (
                                天赋列表.map((talent, index) => (
                                    <div key={`${talent.名称}-${index}`} className="border border-wuxia-red/15 bg-black/25 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-sm font-semibold tracking-[0.12em] text-wuxia-gold">{talent.名称}</span>
                                            <span className="text-[10px] text-wuxia-red/70">天赋 {index + 1}</span>
                                        </div>
                                        <p className="mt-2 text-xs leading-6" style={{ color: areaStyle.color }}>{talent.描述 || '暂无描述。'}</p>
                                        {talent.效果 && <div className="mt-2 rounded-sm border border-wuxia-gold/15 bg-white/[0.03] px-2.5 py-2 text-[11px] leading-5 text-wuxia-gold/90">{talent.效果}</div>}
                                    </div>
                                ))
                            ) : (
                                <div className="border border-dashed border-gray-700 px-3 py-6 text-center text-sm text-gray-500">暂无天赋记录</div>
                            )}
                        </div>
                    </div>

                    <div className="border border-gray-800/80 bg-black/30 p-4">
                        <div className="mb-3 text-[10px] uppercase tracking-[0.35em] text-wuxia-gold/65">基础六维</div>
                        <div className="grid grid-cols-3 gap-2">
                            {attributes.map((attr) => (
                                <div key={`detail-${attr.key}`} className="border border-gray-800 bg-white/[0.03] px-2 py-3 text-center">
                                    <div className="text-[10px] tracking-[0.2em] text-gray-500">{attr.key}</div>
                                    <div className="mt-1 text-lg font-mono font-bold text-wuxia-gold">{attr.val}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CharacterProfileCard;
