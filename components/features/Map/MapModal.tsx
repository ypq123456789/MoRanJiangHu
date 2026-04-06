import React, { useEffect, useMemo, useState } from 'react';
import { 世界数据结构 } from '../../../models/world';
import { 环境信息结构 } from '../../../models/environment';

interface Props {
    world: 世界数据结构;
    env: 环境信息结构;
    onClose: () => void;
}

const 归一化文本 = (value: string | undefined | null) => (value || '').trim().replace(/\s+/g, '').toLowerCase();

const MapModal: React.FC<Props> = ({ world, env, onClose }) => {
    const maps = Array.isArray(world?.地图) ? world.地图 : [];
    const buildings = Array.isArray(world?.建筑) ? world.建筑 : [];
    const 当前地点归一 = 归一化文本(env?.具体地点 || '');
    const 当前层级 = {
        大: 归一化文本(env?.大地点 || ''),
        中: 归一化文本(env?.中地点 || ''),
        小: 归一化文本(env?.小地点 || '')
    };

    const 默认地图索引 = useMemo(() => {
        const bySmallName = maps.findIndex((m: any) => 归一化文本(m?.名称) === 当前层级.小);
        if (bySmallName >= 0) return bySmallName;

        const byBelong = maps.findIndex((m: any) => (
            归一化文本(m?.归属?.大地点) === 当前层级.大 &&
            归一化文本(m?.归属?.中地点) === 当前层级.中 &&
            归一化文本(m?.归属?.小地点) === 当前层级.小
        ));
        if (byBelong >= 0) return byBelong;

        const byCurrentPlace = maps.findIndex((m: any) => {
            const key = 归一化文本(m?.名称);
            return !!key && !!当前地点归一 && (当前地点归一.includes(key) || key.includes(当前地点归一));
        });
        return byCurrentPlace >= 0 ? byCurrentPlace : 0;
    }, [maps, 当前地点归一, 当前层级.大, 当前层级.中, 当前层级.小]);

    const [selectedMapIndex, setSelectedMapIndex] = useState(默认地图索引);
    useEffect(() => {
        setSelectedMapIndex(默认地图索引);
    }, [默认地图索引]);

    const 当前地图 = selectedMapIndex >= 0 ? maps[selectedMapIndex] || null : null;
    const 当前地图内部建筑名 = useMemo(() => {
        if (!当前地图 || !Array.isArray(当前地图.内部建筑)) return [];
        return 当前地图.内部建筑.filter((name: any) => typeof name === 'string' && name.trim().length > 0);
    }, [当前地图]);

    const 当前地图建筑列表 = useMemo(() => {
        if (当前地图内部建筑名.length === 0) return [];
        return buildings.filter((building: any) => {
            const name = 归一化文本(building?.名称);
            return 当前地图内部建筑名.some((raw: string) => 归一化文本(raw) === name);
        });
    }, [buildings, 当前地图内部建筑名]);

    const 命中建筑列表 = useMemo(() => {
        if (!当前地点归一) return [];
        return buildings.filter((building: any) => {
            const 名称归一 = 归一化文本(building?.名称);
            if (!名称归一) return false;
            return 当前地点归一 === 名称归一
                || 当前地点归一.includes(名称归一)
                || 名称归一.includes(当前地点归一);
        });
    }, [buildings, 当前地点归一]);

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[220] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-ink-black/95 border border-wuxia-gold/20 w-full max-w-7xl max-h-[90vh] h-[90vh] flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.9)] relative overflow-hidden rounded-2xl">
                
                {/* 背景装饰 */}
                <div className="absolute inset-0 pointer-events-none z-0">
                    <div className="absolute inset-0 bg-[url('/assets/images/ui/paper-texture.png')] opacity-[0.03] mix-blend-overlay"></div>
                    <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-radial from-wuxia-gold/5 to-transparent blur-[80px]"></div>
                    <div className="absolute top-1/2 left-[20%] -translate-x-1/2 -translate-y-1/2 text-[450px] font-serif text-wuxia-gold opacity-[0.02] filter blur-[4px]">
                        图
                    </div>
                </div>

                {/* 顶栏 */}
                <div className="h-20 shrink-0 border-b border-wuxia-gold/10 bg-gradient-to-r from-black/80 to-black/40 flex items-center justify-between px-8 relative z-50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full border border-wuxia-gold/40 bg-gradient-to-br from-wuxia-gold/20 to-black flex items-center justify-center text-wuxia-gold font-serif font-bold text-2xl shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                            图
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h3 className="text-wuxia-gold font-serif font-bold text-2xl tracking-[0.4em] drop-shadow-[0_0_10px_rgba(212,175,55,0.3)]">堪舆图鉴</h3>
                                <span className="text-[10px] uppercase text-wuxia-gold/50 tracking-widest border border-wuxia-gold/20 px-2 py-0.5 rounded-full mt-1">MAPS & ARCHITECTURE</span>
                            </div>
                            <p className="text-gray-400 text-xs tracking-widest mt-1.5 italic font-serif flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-wuxia-gold/50 rotate-45"></span>
                                当前具体地点：<span className="text-wuxia-gold">{env?.具体地点 || '未知之境'}</span>
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-black/60 border border-gray-700 text-gray-400 hover:text-wuxia-red hover:border-wuxia-red hover:bg-red-950/30 transition-all hover:rotate-90 group"
                    >
                        <svg className="w-5 h-5 group-hover:drop-shadow-[0_0_5px_rgba(220,38,38,0.8)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 内容网格 */}
                <div className="flex-1 grid grid-cols-12 gap-6 p-6 overflow-hidden relative z-10">
                    
                    {/* 左侧：地图列表 */}
                    <div className="col-span-3 border border-gray-800/80 rounded-xl bg-black/40 overflow-hidden flex flex-col shadow-inner backdrop-blur-sm relative group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-radial from-wuxia-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="px-5 py-3 border-b border-wuxia-gold/10 bg-black/60 flex items-center justify-between">
                            <div className="text-sm font-bold tracking-widest text-wuxia-gold/90 font-serif flex items-center gap-2">
                                <span className="text-wuxia-gold/50">◧</span> 九州纪略
                            </div>
                            <span className="text-[10px] text-gray-500 font-mono tracking-widest border border-gray-800 bg-black/50 px-2 py-0.5 rounded">{maps.length} 境</span>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 relative z-10">
                            {maps.length === 0 ? (
                                <div className="text-xs text-gray-600 text-center py-16 font-serif italic border border-dashed border-gray-800 rounded-lg">未见四海绘印</div>
                            ) : maps.map((item: any, idx: number) => {
                                const active = idx === selectedMapIndex;
                                const 内部建筑数 = Array.isArray(item?.内部建筑) ? item.内部建筑.length : 0;
                                return (
                                    <button
                                        key={`map-${item?.名称 || idx}`}
                                        onClick={() => setSelectedMapIndex(idx)}
                                        className={`w-full text-left p-3 mb-2 rounded-lg border transition-all relative overflow-hidden flex flex-col gap-1.5 ${
                                            active 
                                            ? 'border-wuxia-gold/40 bg-gradient-to-r from-wuxia-gold/10 to-transparent shadow-[0_0_15px_rgba(212,175,55,0.1)]' 
                                            : 'border-gray-800/50 bg-black/30 hover:border-gray-600 hover:bg-black/50'
                                        }`}
                                    >
                                        {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-wuxia-gold shadow-[0_0_8px_rgba(212,175,55,0.8)]"></div>}
                                        <div className={`text-sm font-bold tracking-wide font-serif ${active ? 'text-wuxia-gold drop-shadow-sm' : 'text-gray-300'}`}>
                                            {item?.名称 || `无名地带 ${idx + 1}`}
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono">
                                            <span className="flex items-center gap-1"><span className="text-gray-600">⦿</span> {item?.坐标 || '??:??'}</span>
                                            <span className="bg-black/40 border border-gray-800 px-1.5 rounded text-gray-400">阁 {内部建筑数}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 中间：地图详情 */}
                    <div className="col-span-5 border border-gray-800/80 rounded-xl bg-black/40 overflow-hidden flex flex-col shadow-inner backdrop-blur-sm relative group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-radial from-wuxia-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="px-5 py-3 border-b border-wuxia-cyan/10 bg-black/60 flex items-center justify-between">
                            <div className="text-sm font-bold tracking-widest text-wuxia-cyan/90 font-serif flex items-center gap-2">
                                <span className="text-wuxia-cyan/50">◨</span> 洞天玄录
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 text-sm relative z-10">
                            {当前地图 ? (
                                <div className="space-y-6">
                                    <div className="flex items-end justify-between border-b border-gray-800/60 pb-4">
                                        <div className="text-3xl font-bold text-gray-100 font-serif tracking-[0.1em]">{当前地图.名称 || '未具名之地'}</div>
                                        <div className="text-xs text-wuxia-cyan/80 font-mono border border-wuxia-cyan/20 bg-cyan-950/20 px-3 py-1 rounded shadow-inner">
                                            坐标：<span className="font-bold">{当前地图.坐标 || '暂不可考'}</span>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <span className="w-1 h-1 rounded-full bg-gray-500"></span> 归属地界
                                        </div>
                                        <div className="text-gray-300 font-serif flex items-center gap-3">
                                            <span className="bg-gray-900 border border-gray-700 px-3 py-1 rounded-md">{当前地图?.归属?.大地点 || '无'}</span>
                                            <span className="text-gray-600">/</span>
                                            <span className="bg-gray-900 border border-gray-700 px-3 py-1 rounded-md">{当前地图?.归属?.中地点 || '无'}</span>
                                            <span className="text-gray-600">/</span>
                                            <span className="bg-gray-900 border border-gray-700 px-3 py-1 rounded-md">{当前地图?.归属?.小地点 || '无'}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <span className="w-1 h-1 rounded-full bg-gray-500"></span> 风物志
                                        </div>
                                        <div className="text-gray-400 leading-[2.2] bg-black/30 border border-gray-800/50 p-4 rounded-lg text-justify font-serif italic">
                                            {(当前地图.描述 || '这片区域隐藏在迷雾之中，尚无风物记载。')}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <span className="w-1 h-1 rounded-full bg-cyan-600"></span> 图内蕴藏 (内部建筑声明)
                                        </div>
                                        <div className="text-cyan-100/70 bg-cyan-950/20 border border-cyan-900/30 p-3 rounded-lg leading-relaxed text-sm">
                                            {当前地图内部建筑名.length > 0 ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {当前地图内部建筑名.map((bName, i) => (
                                                        <span key={`inner-${bName}-${i}`} className="px-2 py-0.5 bg-black/40 border border-cyan-800/40 rounded tracking-widest text-[#a8c7fa]">{bName}</span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-500 italic">荒无人烟，未见片宇。</span>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <span className="w-1 h-1 rounded-full bg-wuxia-gold/50"></span> 已建档匹配 (具体建筑数据)
                                        </div>
                                        <div className="text-gray-300">
                                            {当前地图建筑列表.length > 0 ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {当前地图建筑列表.map((b: any, i) => (
                                                        <span key={`matched-${b?.名称}-${i}`} className="px-2 py-1 text-xs bg-wuxia-gold/10 border border-wuxia-gold/30 rounded text-wuxia-gold/90 font-bold tracking-widest shadow-inner">
                                                            {b?.名称 || '未名'}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-gray-500 text-xs py-2">
                                                    列表中无建筑详细建档与之匹配。
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-600 font-serif gap-4 opacity-50">
                                    <div className="w-16 h-16 rounded-full border border-dashed border-gray-600 flex items-center justify-center text-3xl">?</div>
                                    <div className="tracking-widest">请点选左侧卷轴，以观详情</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右侧：建筑变量注入 */}
                    <div className="col-span-4 border border-wuxia-gold/20 rounded-xl bg-gradient-to-b from-black/60 to-black/30 overflow-hidden flex flex-col shadow-[0_0_20px_rgba(212,175,55,0.05)] relative">
                        <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-wuxia-gold/50 to-transparent"></div>
                        
                        <div className="px-5 py-4 border-b border-gray-800/60 bg-black/60">
                            <div className="text-sm font-bold tracking-widest text-wuxia-gold font-serif flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-wuxia-gold/50 text-xs">◈</span> 命格交汇区
                                </div>
                                <span className="text-[10px] tracking-widest text-gray-500 border border-gray-700 bg-black/50 px-2 py-0.5 rounded">前端裁定注入量</span>
                            </div>
                            <div className="text-[11px] text-gray-400 tracking-wider flex items-center gap-2">
                                <span className="text-gray-500">寻源锚点：</span>
                                <span className={env?.具体地点 ? 'text-wuxia-gold font-bold bg-wuxia-gold/10 px-2 py-0.5 rounded' : 'text-gray-500 italic'}>
                                    {env?.具体地点 || '未知'}
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 relative z-10">
                            {命中建筑列表.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="text-[10px] text-wuxia-gold/70 text-center mb-4 tracking-widest font-serif flex items-center gap-3">
                                        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-wuxia-gold/20"></div>
                                        命中以下建筑，即将注入神识
                                        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-wuxia-gold/20"></div>
                                    </div>
                                    
                                    {命中建筑列表.map((building: any, idx: number) => (
                                        <div key={`hit-building-${building?.名称 || idx}`} className="p-4 rounded-xl border border-wuxia-gold/30 bg-gradient-to-br from-wuxia-gold/5 relative overflow-hidden group hover:border-wuxia-gold/60 transition-colors shadow-sm">
                                            <div className="absolute -right-4 -top-4 text-6xl text-wuxia-gold opacity-[0.03] group-hover:scale-110 transition-transform font-serif pointer-events-none">建</div>
                                            
                                            <div className="flex items-center justify-between mb-3 relative z-10">
                                                <div className="text-base font-bold text-gray-100 font-serif drop-shadow-sm">{building?.名称 || '未命名建筑'}</div>
                                                <div className="w-2 h-2 rounded-full bg-wuxia-gold animate-pulse shadow-[0_0_5px_rgba(212,175,55,0.8)]"></div>
                                            </div>
                                            
                                            <div className="text-xs text-gray-400 mb-3 leading-relaxed text-justify font-serif italic border-l-2 border-gray-700/50 pl-2 relative z-10">
                                                {building?.描述 || '此地平平无奇，未有传闻留下。'}
                                            </div>
                                            
                                            <div className="text-[10px] text-gray-500 flex flex-wrap gap-1.5 relative z-10">
                                                <span className="px-1.5 py-0.5 rounded bg-black/50 border border-gray-800">{(building?.归属?.大地点 || '?')}</span>
                                                <span className="text-gray-700 mt-0.5">/</span>
                                                <span className="px-1.5 py-0.5 rounded bg-black/50 border border-gray-800">{(building?.归属?.中地点 || '?')}</span>
                                                <span className="text-gray-700 mt-0.5">/</span>
                                                <span className="px-1.5 py-0.5 rounded bg-black/50 border border-gray-800">{(building?.归属?.小地点 || '?')}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center py-10 px-4">
                                    <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-700/50 flex items-center justify-center text-gray-700 mb-4 opacity-70">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    </div>
                                    <div className="text-gray-400 font-bold mb-2 tracking-widest font-serif">游离于化外之地</div>
                                    <div className="text-gray-600 text-[11px] leading-relaxed w-4/5">
                                        当前具体地点未命中任何名宇阁宇。<br />
                                        于此回合交汇中，将<span className="text-gray-400 mx-1">唯余这方天地坐标</span>注入识海，剥离具体殿宇之玄秘。
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default MapModal;
