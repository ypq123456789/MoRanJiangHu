import React from 'react';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger';
    active?: boolean;
    contentClassName?: string;
}

const GameButton: React.FC<Props> = ({ children, variant = 'primary', active = false, className = '', contentClassName = '', style, ...props }) => {
    // Base styles: Skewed container
    const baseStyle = "group relative px-6 py-3 font-serif font-black uppercase transition-all duration-300 transform -skew-x-12 cursor-pointer outline-none overflow-hidden";
    
    // Background and Border logic
    let variantClasses = "";
    let textClasses = "relative z-10 transform skew-x-12 tracking-widest transition-colors duration-300";
    let decoColor = "";

    switch (variant) {
        case 'primary':
            variantClasses = active 
                ? "bg-wuxia-gold text-ink-black border-2 border-wuxia-gold shadow-[0_0_15px_rgba(230,200,110,0.5)]" 
                : "bg-ink-black/80 text-wuxia-gold border-2 border-wuxia-gold hover:bg-wuxia-gold hover:text-ink-black";
            decoColor = "bg-white";
            break;
        case 'secondary':
            variantClasses = active
                ? "bg-wuxia-cyan text-ink-black border-2 border-wuxia-cyan"
                : "bg-ink-black/80 text-wuxia-cyan border-2 border-wuxia-cyan hover:bg-wuxia-cyan hover:text-ink-black";
            decoColor = "bg-white";
            break;
        case 'danger':
            variantClasses = "bg-ink-black/80 text-wuxia-red border-2 border-wuxia-red hover:bg-wuxia-red hover:text-white";
            decoColor = "bg-wuxia-red";
            break;
    }

    return (
        <button
            className={`${baseStyle} ${variantClasses} ${className}`}
            style={{
                fontFamily: 'var(--ui-按钮-font-family, inherit)',
                fontSize: 'var(--ui-按钮-font-size, 14px)',
                lineHeight: 'var(--ui-按钮-line-height, 1.2)',
                fontStyle: 'var(--ui-按钮-font-style, normal)',
                ...style
            }}
            {...props}
        >
            {/* Flash Effect on Hover */}
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-75"></div>
            
            {/* Content */}
            <span className={`block font-bold ${textClasses} ${contentClassName}`}>
                {children}
            </span>
            
            {/* Decorative small blocks */}
            <div className={`absolute top-0 right-0 w-2 h-2 ${decoColor} transform translate-x-1 -translate-y-1 opacity-0 group-hover:opacity-100 transition-opacity`}></div>
            <div className={`absolute bottom-0 left-0 w-2 h-2 ${decoColor} transform -translate-x-1 translate-y-1 opacity-0 group-hover:opacity-100 transition-opacity`}></div>
        </button>
    );
};

export default GameButton;
