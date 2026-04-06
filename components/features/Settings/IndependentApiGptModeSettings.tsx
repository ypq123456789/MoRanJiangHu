import React, { useEffect, useState } from 'react';
import { 游戏设置结构 } from '../../../types';
import { 规范化游戏设置 } from '../../../utils/gameSettings';
import GameButton from '../../ui/GameButton';
import ToggleSwitch from '../../ui/ToggleSwitch';

interface Props {
    settings: 游戏设置结构;
    onSave: (settings: 游戏设置结构) => void;
}

const 功能项列表: Array<{
    key: keyof NonNullable<游戏设置结构['独立APIGPT模式']>;
    title: string;
    description: string;
}> = [
    { key: '剧情回忆', title: '剧情回忆', description: '让剧情回忆链路优先按真实任务内容直发，而不是只用固定触发语。' },
    { key: '记忆总结', title: '记忆总结', description: '让记忆总结与 NPC 记忆总结沿用 GPT 模式的直达任务方式。' },
    { key: '文章优化', title: '文章优化', description: '让正文优化链路按真实润色任务直接触发。' },
    { key: '世界演变', title: '世界演变', description: '让世界演变使用真实任务提示作为本轮触发消息。' },
    { key: '变量生成', title: '变量生成', description: '让变量生成直接以当前变量任务作为触发消息。' },
    { key: '规划分析', title: '规划分析', description: '让规划分析直接以本轮规划审计任务作为触发消息。' },
    { key: '小说拆分', title: '小说分解', description: '让小说分解按当前分段任务直接发起，而不是固定开始任务。' }
];

const IndependentApiGptModeSettings: React.FC<Props> = ({ settings, onSave }) => {
    const [form, setForm] = useState<游戏设置结构>(() => 规范化游戏设置(settings));
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        setForm(规范化游戏设置(settings));
    }, [settings]);

    const 实时应用更新 = (patch: Partial<游戏设置结构>) => {
        const next = 规范化游戏设置({ ...form, ...patch });
        setForm(next);
        onSave(next);
    };

    const 更新单项开关 = (key: keyof NonNullable<游戏设置结构['独立APIGPT模式']>, value: boolean) => {
        实时应用更新({
            独立APIGPT模式: {
                ...(form.独立APIGPT模式 || {}),
                [key]: value
            } as NonNullable<游戏设置结构['独立APIGPT模式']>
        });
    };

    const handleSave = () => {
        const next = 规范化游戏设置(form);
        setForm(next);
        onSave(next);
        setShowSuccess(true);
        window.setTimeout(() => setShowSuccess(false), 2000);
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center border-b border-wuxia-gold/30 pb-3 mb-6">
                <div>
                    <h3 className="text-wuxia-gold font-serif font-bold text-xl">独立 API GPT 模式</h3>
                    <div className="mt-1 text-xs text-gray-400">
                        这里单独控制各独立链路是否套用 GPT 模式。主剧情本体仍使用“游戏设定”中的 GPT 模式开关。
                    </div>
                </div>
                {showSuccess && <span className="text-green-400 text-xs font-bold animate-pulse">✔ 设定已保存</span>}
            </div>

            <div className="rounded-md border border-wuxia-gold/20 bg-black/30 p-4 text-xs leading-6 text-gray-400">
                开启后，该独立 API 会尽量把“当前真实任务内容”作为最终触发消息发送，减少固定“开始任务”触发语带来的额外包裹层。
            </div>

            <div className="space-y-3">
                {功能项列表.map((item) => (
                    <div key={item.key} className="space-y-3 rounded-md border border-wuxia-gold/20 bg-black/30 p-4">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <div className="text-sm text-wuxia-cyan font-bold">{item.title}</div>
                                <div className="mt-1 text-xs text-gray-400">{item.description}</div>
                            </div>
                            <ToggleSwitch
                                checked={form.独立APIGPT模式?.[item.key] === true}
                                onChange={(next) => 更新单项开关(item.key, next)}
                                ariaLabel={`切换${item.title}GPT模式`}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="pt-6 border-t border-wuxia-gold/20 mt-8 flex justify-end">
                <GameButton onClick={handleSave} variant="primary" className="w-full md:w-auto px-8">
                    保存设定
                </GameButton>
            </div>
        </div>
    );
};

export default IndependentApiGptModeSettings;
