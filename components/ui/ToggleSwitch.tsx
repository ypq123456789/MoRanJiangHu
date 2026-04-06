import React from 'react';

interface Props {
    checked: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
    ariaLabel?: string;
    className?: string;
}

const ToggleSwitch: React.FC<Props> = ({ checked, onChange, disabled = false, ariaLabel, className = '' }) => {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-all duration-200 align-middle ${
                checked
                    ? 'border-wuxia-gold/70 bg-wuxia-gold/18 shadow-[0_0_0_1px_rgba(230,200,110,0.12)]'
                    : 'border-gray-700 bg-black/35'
            } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-wuxia-gold/40'} ${className}`}
        >
            <span
                className={`absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-paper-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-transform duration-200 ${
                    checked ? 'translate-x-6' : 'translate-x-0'
                }`}
            >
                <span
                    className={`h-2.5 w-2.5 rounded-full transition-colors ${checked ? 'bg-wuxia-gold-dark' : 'bg-gray-500'}`}
                />
            </span>
        </button>
    );
};

export default ToggleSwitch;
