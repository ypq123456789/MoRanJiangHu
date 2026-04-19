import React from 'react';
import GameButton from '../ui/GameButton';
import { 视觉设置结构 } from '../../types';
import { 构建区域文字样式 } from '../../utils/visualSettings';
import { useMusic } from '../features/Music/MusicProvider';
import MusicPlayerUI from '../features/Music/MusicPlayerUI';

interface Props {
    onOpenSettings: () => void;
    onOpenInventory: () => void;
    onOpenEquipment: () => void;
    onOpenBattle: () => void;
    onOpenTeam: () => void;
    onOpenSocial: () => void;
    onOpenKungfu: () => void;
    onOpenWorld: () => void;
    onOpenMap: () => void;
    onOpenSect: () => void;
    onOpenTask: () => void;
    onOpenAgreement: () => void;
    onOpenStory: () => void;
    onOpenHeroinePlan: () => void;
    onOpenMemory: () => void;
    onOpenImageManager?: () => void;
    onOpenNovelDecomposition?: () => void;
    worldEvolutionEnabled?: boolean;
    worldEvolutionUpdating?: boolean;
    enableHeroinePlan?: boolean;
    enableKungfu?: boolean;
    onSave: () => void;
    onLoad: () => void;
    visualConfig?: 视觉设置结构;
}

const RightPanel: React.FC<Props> = ({
    onOpenSettings, onOpenInventory, onOpenEquipment, onOpenBattle, onOpenTeam,
    onOpenSocial, onOpenKungfu, onOpenWorld, onOpenMap, onOpenSect,
    onOpenTask, onOpenAgreement, onOpenStory, onOpenHeroinePlan, onOpenMemory, onOpenImageManager,
    onOpenNovelDecomposition,
    worldEvolutionEnabled = false,
    worldEvolutionUpdating = false,
    enableHeroinePlan = false,
    enableKungfu = true,
    onSave, onLoad, visualConfig
}) => {
    const { enabled, currentLyric } = useMusic();
    const areaStyle = 构建区域文字样式(visualConfig, '右侧栏');
    const 基础字号 = Number(areaStyle.fontSize) || 13;
    const 字号缩放 = (ratio: number, min = 13) => `${Math.max(min, Math.round(基础字号 * ratio))}px`;
    
    const MENU_ITEMS = [
        { label: '战斗', action: onOpenBattle, color: 'primary' },
        { label: '装备', action: onOpenEquipment, color: 'primary' },
        { label: '背包', action: onOpenInventory, color: 'primary' },
        { label: '队伍', action: onOpenTeam, color: 'primary' },
        { label: '社交', action: onOpenSocial, color: 'primary' },
        ...(enableKungfu ? [{ label: '功法', action: onOpenKungfu, color: 'primary' }] : []),
        {
            label: worldEvolutionUpdating ? '世界·更新中' : '世界',
            action: onOpenWorld,
            color: worldEvolutionUpdating ? 'secondary' : 'primary',
            className: worldEvolutionEnabled && worldEvolutionUpdating
                ? 'animate-pulse shadow-[0_0_18px_rgba(90,220,220,0.35)]'
                : ''
        },
        { label: '地图', action: onOpenMap, color: 'primary' },
        { label: '门派', action: onOpenSect, color: 'primary' },
        { label: '任务', action: onOpenTask, color: 'primary' },
        { label: '约定', action: onOpenAgreement, color: 'primary' },
        { label: '剧情', action: onOpenStory, color: 'primary' },
        ...(enableHeroinePlan ? [{ label: '规划', action: onOpenHeroinePlan, color: 'primary' }] : []),
        { label: '记忆', action: onOpenMemory, color: 'primary' },
        ...(onOpenImageManager ? [{ label: '图册', action: onOpenImageManager, color: 'secondary' }] : []),
        ...(onOpenNovelDecomposition ? [{ label: '小说分解', action: onOpenNovelDecomposition, color: 'secondary' }] : []),
    ];

    const SYSTEM_ITEMS = [
        { label: '保存进度', action: onSave },
        { label: '读取进度', action: onLoad },
        { label: '江湖设置', action: onOpenSettings },
    ];

    return (
        <div className="h-full flex flex-col p-3 border-l border-wuxia-gold/20 relative bg-transparent" style={areaStyle}>
            <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-700 via-black to-black"></div>
            
            {enabled ? (
                <div className="mb-4 pb-4 border-b border-gray-800 shrink-0">
                    <MusicPlayerUI />
                </div>
            ) : (
                <div className="mb-4 text-center border-b border-gray-800 pb-4 relative h-[80px] flex flex-col justify-center shrink-0">
                    <h1 className="font-black tracking-[0.5em] opacity-90 drop-shadow-md" style={{ ...areaStyle, color: areaStyle.color || '#e6c86e', fontSize: 字号缩放(2, 24) }}>天机</h1>
                    <div className="text-gray-600 tracking-[0.3em] mt-1 uppercase" style={{ fontSize: 字号缩放(1.05, 14), lineHeight: 1.2 }}>System Menu</div>
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-wuxia-gold/50 to-transparent"></div>
                </div>
            )}

            {enabled && currentLyric && (
                <div className="mb-2 -mt-1 text-center overflow-hidden animate-in fade-in duration-700 h-8 flex items-center justify-center">
                    <p className="text-wuxia-gold/90 italic tracking-wider leading-tight px-2 line-clamp-2 drop-shadow-[0_0_3px_rgba(230,200,110,0.3)]" style={{ fontSize: 字号缩放(1.02, 14) }}>
                        {currentLyric}
                    </p>
                </div>
            )}

            <div className="flex-1 flex flex-col gap-3 relative py-2 min-h-0">
                <div className="absolute inset-0 border border-gray-800 bg-white/[0.02] pointer-events-none">
                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-gray-600"></div>
                    <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-gray-600"></div>
                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-gray-600"></div>
                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-gray-600"></div>
                </div>
                <div className="p-4 space-y-3 h-full overflow-y-auto no-scrollbar relative z-10">
                    {MENU_ITEMS.map((item) => (
                        <GameButton
                            key={item.label}
                            onClick={item.action}
                            variant={item.color as any}
                            className={`w-full text-center py-2 text-sm tracking-widest hover:scale-[1.02] transition-transform !skew-x-0 border-opacity-60 ${item.className || ''}`}
                            contentClassName="!skew-x-0"
                        >
                            <span style={{ fontFamily: areaStyle.fontFamily, fontStyle: areaStyle.fontStyle, fontSize: 字号缩放(1.08, 14), lineHeight: areaStyle.lineHeight }}>{item.label}</span>
                        </GameButton>
                    ))}
                </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-800 space-y-2 shrink-0">
                {SYSTEM_ITEMS.map((item) => (
                    <button
                        key={item.label}
                        onClick={item.action}
                        className="w-full text-center transition-all py-1.5 uppercase tracking-wider border border-transparent hover:border-gray-800 hover:bg-white/5 rounded-sm"
                        style={{ ...areaStyle, fontSize: 字号缩放(1, 14), color: 'rgba(107,114,128,1)' }}
                    >
                        [ {item.label} ]
                    </button>
                ))}
            </div>
            <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>
        </div>
    );
};

export default RightPanel;
