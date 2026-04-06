import React from 'react';

interface Option {
    value: string;
    label: React.ReactNode;
    disabled?: boolean;
}

interface Props {
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    variant?: 'default' | 'pink';
    size?: 'default' | 'small';
}

const MobileCustomSelect: React.FC<Props> = ({
    value,
    options,
    onChange,
    placeholder = '请选择',
    disabled = false,
    variant = 'default',
    size = 'default'
}) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const selectedOption = options.find(opt => opt.value === value);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    const baseClasses = size === 'small'
        ? 'px-2 py-1.5 text-xs'
        : 'pl-3 pr-8 py-2.5 text-sm';

    const variantClasses = variant === 'pink'
        ? 'border-pink-900/30 bg-black/50 text-pink-100/90 focus:border-pink-300'
        : 'border-wuxia-gold/20 bg-black/50 text-wuxia-gold/90 focus:border-wuxia-gold/50';

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full rounded border ${baseClasses} ${variantClasses} outline-none transition-all font-serif text-left flex items-center justify-between ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-opacity-60'}`}
            >
                <span className={selectedOption ? '' : 'opacity-50'}>
                    {selectedOption?.label || placeholder}
                </span>
                <span className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${variant === 'pink' ? 'text-pink-200/40' : 'text-wuxia-gold/40'}`}>
                    ▼
                </span>
            </button>

            {isOpen && (
                <div className={`absolute z-50 w-full mt-1 rounded border shadow-lg max-h-60 overflow-y-auto custom-scrollbar ${variant === 'pink' ? 'border-pink-900/50 bg-black/95' : 'border-wuxia-gold/30 bg-black/95'}`}>
                    {options.length === 0 ? (
                        <div className={`px-3 py-2 text-xs ${variant === 'pink' ? 'text-pink-200/50' : 'text-wuxia-gold/50'}`}>
                            暂无选项
                        </div>
                    ) : (
                        options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => !option.disabled && handleSelect(option.value)}
                                disabled={option.disabled}
                                className={`w-full px-3 py-2.5 text-left text-xs font-serif transition-colors flex items-center justify-between ${option.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5'} ${value === option.value ? (variant === 'pink' ? 'bg-pink-900/30 text-pink-100' : 'bg-wuxia-gold/10 text-wuxia-gold') : (variant === 'pink' ? 'text-pink-100/80' : 'text-gray-300')}`}
                            >
                                <span>{option.label}</span>
                                {value === option.value && (
                                    <span className={variant === 'pink' ? 'text-pink-300' : 'text-wuxia-gold'}>✓</span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default MobileCustomSelect;