import React, { useEffect, useState } from 'react';
import { 游戏设置结构 } from '../../../types';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';

interface Props {
    settings: 游戏设置结构;
    onSave: (settings: 游戏设置结构) => void;
}

const RealitySettings: React.FC<Props> = ({ settings, onSave }) => {
    const [form, setForm] = useState<游戏设置结构>(settings);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        setForm(settings);
    }, [settings]);

    const handleToggle = (next: boolean) => {
        const updated = { ...form, 启用真实世界模式: next };
        setForm(updated);
        onSave(updated);
        setShowSuccess(true);
        window.setTimeout(() => setShowSuccess(false), 2000);
    };

    const handleSave = () => {
        onSave(form);
        setShowSuccess(true);
        window.setTimeout(() => setShowSuccess(false), 2000);
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center border-b border-wuxia-gold/30 pb-3 mb-6">
                <div>
                    <h3 className="text-wuxia-gold font-serif font-bold text-xl">真实世界模式</h3>
                    <p className="text-xs text-gray-400 mt-2">
                        独立设置页。开启后会在运行时额外注入“非主角中心、允许失败与死亡、NPC可拒绝”的专项规则，并与其他开关共同生效。
                    </p>
                </div>
                {showSuccess && <span className="text-green-400 text-xs font-bold animate-pulse">✔ 设定已保存</span>}
            </div>

            <div className="space-y-3 rounded-md border border-red-500/20 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm text-red-300 font-bold">启用真实世界模式</div>
                        <div className="text-xs text-gray-400 mt-1">
                            开启后，系统会禁止刻意保护主角、禁止强塞奇遇保底、允许主角因战斗、伤势、饥饿、脱水、判断失误等原因失败、残废或死亡；NPC 也会基于立场、利益、风险与情绪拒绝主角。
                        </div>
                    </div>
                    <ToggleSwitch
                        checked={form.启用真实世界模式 === true}
                        onChange={handleToggle}
                        ariaLabel="切换真实世界模式"
                    />
                </div>
            </div>

            <div className="rounded-md border border-wuxia-gold/20 bg-black/30 p-4 space-y-3 text-sm text-gray-300 leading-7">
                <div className="text-wuxia-cyan font-bold">生效原则</div>
                <ul className="list-disc pl-5 space-y-2 text-xs text-gray-400">
                    <li>不替换其他风格开关，而是在运行时作为独立 system 约束叠加。</li>
                    <li>与 [NTL后宫](components/features/Settings/GameSettings.tsx:28) 并存时，仍遵守禁绿主角设定。</li>
                    <li>允许主角遭遇真实失败，NPC 不会因“玩家身份”自动退让。</li>
                    <li>会配合后续协议审计，强化低生理值后果、死亡风险与 NPC 时间刷新。</li>
                </ul>
            </div>

            <div className="pt-6 border-t border-wuxia-gold/20 mt-8 flex justify-end">
                <GameButton onClick={handleSave} variant="primary" className="w-full md:w-auto px-8">
                    保存设定
                </GameButton>
            </div>
        </div>
    );
};

export default RealitySettings;
