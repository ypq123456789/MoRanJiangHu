import React from 'react';
import { OpeningConfig, 角色数据结构, NPC结构 } from '../../../types';
import { 获取题材界面文案, 获取题材资源文案 } from '../../../utils/resourceLabels';
import { 获取图片展示地址, 获取图片资源文本地址 } from '../../../utils/imageAssets';

interface Props {
    character: 角色数据结构;
    teammates: NPC结构[];
    openingConfig?: OpeningConfig;
    onClose: () => void;
}

const ProgressBar: React.FC<{ label: string; cur: number; max: number; color: string }> = ({ label, cur, max, color: _color }) => {
    const safeCur = Math.max(0, Number.isFinite(Number(cur)) ? Math.ceil(Number(cur)) : 0);
    const safeMax = Math.max(1, Number.isFinite(Number(max)) ? Math.ceil(Number(max)) : 0, safeCur);
    const pct = Math.max(0, Math.min(100, (safeCur / safeMax) * 100));
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">{label}</span>
                <span className="font-mono text-gray-300">{safeCur}/{safeMax}</span>
            </div>
            <div className="h-1.5 bg-gray-900 rounded-full border border-gray-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-wuxia-gold/70 via-wuxia-gold to-wuxia-gold/80" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

const 读数 = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.ceil(parsed) : fallback;
};

const 读取资源值 = (source: unknown, keys: string[]) => {
    const data = source && typeof source === 'object' ? source as Record<string, unknown> : {};
    for (const key of keys) {
        const parsed = Number(data[key]);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
};

const 部位列表 = ['头部', '胸部', '腹部', '左手', '右手', '左腿', '右腿'];
const 聚合部位血量 = (source: unknown) => {
    const data = source && typeof source === 'object' ? source as Record<string, unknown> : {};
    const current = 部位列表.reduce((sum, part) => sum + Math.max(0, 读数(data[`${part}当前血量`])), 0);
    const max = 部位列表.reduce((sum, part) => sum + Math.max(0, 读数(data[`${part}最大血量`])), 0);
    return max > 0 ? { current: Math.min(current, max), max } : null;
};
const 读取生命资源 = (source: unknown, currentKeys: string[], maxKeys: string[]) => {
    const rawMax = 读取资源值(source, maxKeys);
    if (rawMax <= 1) return 聚合部位血量(source) || { current: 读取资源值(source, currentKeys), max: rawMax };
    return { current: 读取资源值(source, currentKeys), max: rawMax };
};
const 提取人物头像 = (person: any): string => {
    const archive = person?.图片档案 && typeof person.图片档案 === 'object' ? person.图片档案 : {};
    const history = Array.isArray(archive?.生图历史) ? archive.生图历史 : [];
    const recent = archive?.最近生图结果 || person?.最近生图结果;
    const records = [...history, recent].filter(Boolean);
    const selectedAvatarId = typeof archive?.已选头像图片ID === 'string' ? archive.已选头像图片ID.trim() : '';
    const selected = selectedAvatarId ? records.find((item) => item?.id === selectedAvatarId) : null;
    const avatar = selected || records.find((item) => item?.构图 === '头像' && item?.状态 === 'success' && 获取图片展示地址(item));
    const portrait = records.find((item) => item?.构图 === '立绘' && item?.图片用途 !== '背景' && item?.状态 === 'success' && 获取图片展示地址(item));
    return 获取图片展示地址(avatar) || 获取图片展示地址(portrait) || 获取图片资源文本地址(person?.头像图片URL) || 获取图片资源文本地址(person?.立绘图片URL);
};

const MobileTeamModal: React.FC<Props> = ({ character, teammates, openingConfig, onClose }) => {
    const [imageViewer, setImageViewer] = React.useState<{ src: string; title: string } | null>(null);
    const activeTeammates = React.useMemo(() => {
        const playerName = String(character?.姓名 || '').trim();
        const seen = new Set<string>();
        return (Array.isArray(teammates) ? teammates : [])
            .filter((n) => n?.是否队友 === true)
            .filter((n) => n?.是否玩家本人 !== true)
            .filter((n) => {
                const name = String(n?.姓名 || '').trim();
                return name && name !== playerName && name !== '主角';
            })
            .filter((n) => {
                const key = String(n?.id || n?.姓名 || '').trim();
                if (!key) return true;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }, [character?.姓名, teammates]);
    const 资源文案 = 获取题材资源文案(openingConfig?.题材模式, openingConfig?.modeRuntimeProfile);
    const 界面文案 = 获取题材界面文案(openingConfig?.题材模式, openingConfig?.modeRuntimeProfile);
    const Avatar: React.FC<{ person: any; title: string }> = ({ person, title }) => {
        const src = 提取人物头像(person);
        const first = String(person?.姓名 || title || '人').slice(0, 1) || '人';
        return (
            <button
                type="button"
                disabled={!src}
                onClick={() => src && setImageViewer({ src, title })}
                className="mr-3 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-wuxia-gold/35 bg-black/40 text-sm font-bold text-wuxia-gold disabled:cursor-default"
                title={src ? '查看头像' : '头像占位'}
            >
                {src ? <img src={src} alt="头像" className="h-full w-full object-cover object-top" /> : first}
            </button>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:hidden animate-fadeIn">
            <div className="bg-ink-black/95 border border-wuxia-gold/30 w-full max-w-[560px] h-[84vh] flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden rounded-2xl">
                <div className="h-12 shrink-0 border-b border-gray-800/60 bg-black/40 flex items-center justify-between px-4">
                    <h3 className="text-wuxia-gold font-serif font-bold text-base tracking-[0.3em]">{界面文案.标题.队伍}</h3>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-black/50 border border-gray-700 text-gray-400 hover:text-wuxia-red hover:border-wuxia-red transition-all"
                        title="关闭"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-ink-wash/5">
                    <div className="bg-black/40 border border-wuxia-gold/20 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex min-w-0 items-center">
                                <Avatar person={character} title={`${character.姓名 || '主角'}头像`} />
                                <div className="min-w-0">
                                    <div className="text-[10px] text-gray-500 tracking-[0.2em]">队长</div>
                                    <div className="text-lg text-wuxia-gold font-serif font-bold">{character.姓名}</div>
                                </div>
                            </div>
                            <div className="text-[10px] text-gray-400">{character.境界}</div>
                        </div>
                        <div className="space-y-2">
                            {(() => {
                                const hp = 读取生命资源(character, 资源文案.气血当前字段, 资源文案.气血最大字段);
                                return <ProgressBar label={资源文案.气血} cur={hp.current} max={hp.max} color="bg-red-500" />;
                            })()}
                            <ProgressBar label={资源文案.精力} cur={读取资源值(character, 资源文案.精力当前字段)} max={读取资源值(character, 资源文案.精力最大字段)} color="bg-teal-500" />
                            <ProgressBar label={资源文案.能量} cur={读取资源值(character, 资源文案.能量当前字段)} max={读取资源值(character, 资源文案.能量最大字段)} color="bg-indigo-500" />
                        </div>
                    </div>

                    <div className="bg-black/40 border border-gray-800 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-gray-500 tracking-[0.2em]">{界面文案.标题.队伍成员}</span>
                            <span className="text-[10px] text-wuxia-cyan/80">{activeTeammates.length} 人</span>
                        </div>

                        <div className="space-y-3">
                            {activeTeammates.map((npc) => (
                                <div key={npc.id} className="bg-black/35 border border-gray-800 rounded-lg p-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex min-w-0 items-center">
                                            <Avatar person={npc} title={`${npc.姓名 || '队员'}头像`} />
                                            <div className="min-w-0">
                                                <div className="truncate text-sm text-gray-200 font-serif">{npc.姓名}</div>
                                                <div className="truncate text-[10px] text-gray-500">{npc.身份} · {npc.境界}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-red-300">攻 {npc.攻击力 || 0}</div>
                                            <div className="text-[10px] text-blue-300">防 {npc.防御力 || 0}</div>
                                        </div>
                                    </div>
                                    <div className="mt-2 space-y-2">
                                        {(() => {
                                            const hp = 读取生命资源(npc, 资源文案.气血当前字段, 资源文案.气血最大字段);
                                            return <ProgressBar label={资源文案.气血} cur={hp.current} max={hp.max} color="bg-red-700" />;
                                        })()}
                                        <ProgressBar label={资源文案.精力} cur={读取资源值(npc, 资源文案.精力当前字段)} max={读取资源值(npc, 资源文案.精力最大字段)} color="bg-blue-700" />
                                        <ProgressBar label={资源文案.能量} cur={读取资源值(npc, 资源文案.能量当前字段)} max={读取资源值(npc, 资源文案.能量最大字段)} color="bg-indigo-700" />
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-1.5 text-[10px] text-gray-300">
                                        {[
                                            ['力', 读数((npc as any).力量)],
                                            ['敏', 读数((npc as any).敏捷)],
                                            ['体', 读数((npc as any).体质)],
                                            ['根', 读数((npc as any).根骨)],
                                            ['悟', 读数((npc as any).悟性)],
                                            ['福', 读数((npc as any).福源)],
                                            ['境层', 读数((npc as any).境界层级, 1)],
                                            ['攻', 读数(npc.攻击力)],
                                            ['防', 读数(npc.防御力)]
                                        ].map(([label, value]) => (
                                            <div key={label} className="rounded border border-wuxia-gold/10 bg-black/30 px-2 py-1">
                                                <span className="text-wuxia-gold/55">{label}</span> <span className="font-mono text-gray-100">{value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {activeTeammates.length === 0 && (
                                <div className="text-center text-gray-600 text-xs py-8">{界面文案.标题.队伍空状态}</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {imageViewer && (
                <div
                    className="fixed inset-0 z-[260] flex items-center justify-end bg-black/90 p-4 pr-8"
                    onClick={() => setImageViewer(null)}
                >
                    <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); setImageViewer(null); }}
                        className="absolute right-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-red-600 text-2xl font-bold text-white shadow-[0_0_22px_rgba(220,38,38,0.85)] transition-transform hover:scale-110"
                        title="关闭头像预览"
                    >
                        ×
                    </button>
                    <img
                        src={imageViewer.src}
                        alt={imageViewer.title}
                        className="max-h-[88vh] max-w-[85vw] object-contain shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
};

export default MobileTeamModal;
