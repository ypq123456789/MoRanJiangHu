import React from 'react';
import { ThemePreset } from '../../../types';
import { 主题列表 } from '../../../styles/themes';

interface Props {
    currentTheme: ThemePreset;
    onThemeChange: (theme: ThemePreset) => void;
}

const ThemeSettings: React.FC<Props> = ({ currentTheme, onThemeChange }) => {
    return (
        <div className="space-y-6">
            <h3 className="mb-4 text-lg font-bold font-serif text-wuxia-gold">界面风格</h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {主题列表.map((theme) => {
                    const selected = currentTheme === theme.id;
                    return (
                        <button
                            key={theme.id}
                            type="button"
                            onClick={() => onThemeChange(theme.id)}
                            className={`relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 ${
                                selected
                                    ? 'border-wuxia-gold bg-wuxia-gold/10 shadow-[0_0_15px_rgba(230,200,110,0.18)]'
                                    : 'border-gray-700 bg-black/40 hover:border-wuxia-gold/50'
                            }`}
                        >
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                    <div className={`font-bold font-serif ${selected ? 'text-wuxia-gold' : 'text-gray-200'}`}>
                                        {theme.name}
                                    </div>
                                    <div className="mt-1 text-xs leading-relaxed text-gray-500">{theme.description}</div>
                                </div>
                                {selected && <span className="text-[10px] font-mono text-wuxia-gold">已启用</span>}
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                                {theme.colors.map((color, colorIndex) => (
                                    <div
                                        key={`${theme.id}-color-${colorIndex}`}
                                        className="h-10 rounded-md border border-white/10 shadow-sm"
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>

                            <div className="mt-3 text-[10px] text-gray-500">推荐来源：{theme.source}</div>

                            <div className={`absolute right-0 top-0 h-2 w-2 border-r border-t transition-colors ${selected ? 'border-wuxia-gold' : 'border-gray-600'}`} />
                            <div className={`absolute bottom-0 left-0 h-2 w-2 border-b border-l transition-colors ${selected ? 'border-wuxia-gold' : 'border-gray-600'}`} />
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default ThemeSettings;
