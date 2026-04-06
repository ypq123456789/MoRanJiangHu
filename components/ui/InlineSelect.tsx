import React, { useEffect, useMemo, useRef, useState } from 'react';

export type InlineSelectOption<T extends string = string> = {
    value: T;
    label: string;
};

type InlineSelectProps<T extends string = string> = {
    value: T;
    options: InlineSelectOption<T>[];
    onChange: (next: T) => void;
    placeholder?: string;
    disabled?: boolean;
    buttonClassName?: string;
    panelClassName?: string;
};

const InlineSelect = <T extends string>({
    value,
    options,
    onChange,
    placeholder = '请选择',
    disabled = false,
    buttonClassName = '',
    panelClassName = ''
}: InlineSelectProps<T>) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const selected = useMemo(() => {
        return options.find((option) => option.value === value);
    }, [options, value]);

    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (event: MouseEvent) => {
            const root = rootRef.current;
            if (!root) return;
            if (event.target instanceof Node && root.contains(event.target)) return;
            setOpen(false);
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [open]);

    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);

    return (
        <div className="relative" ref={rootRef}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((prev) => !prev)}
                className={`w-full border p-3 text-left rounded-md transition-all flex items-center justify-between gap-2 ${
                    disabled
                        ? 'bg-black/30 border-gray-700 text-gray-500 cursor-not-allowed'
                        : (open
                            ? 'bg-black/55 border-wuxia-gold text-white'
                            : 'bg-black/40 border-gray-600 text-white hover:border-gray-500')
                } ${buttonClassName}`}
            >
                <span className={`truncate ${selected ? '' : 'text-gray-400'}`}>
                    {selected?.label || placeholder}
                </span>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-4 h-4 transition-transform ${
                        disabled ? 'text-gray-600' : (open ? 'text-wuxia-gold rotate-180' : 'text-gray-400')
                    }`}
                >
                    <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.512a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                    />
                </svg>
            </button>

            {open && !disabled && (
                <div className={`absolute left-0 right-0 top-full mt-2 z-50 bg-black/95 border border-wuxia-gold/35 rounded-md shadow-[0_10px_30px_rgba(0,0,0,0.45)] overflow-hidden ${panelClassName}`}>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar py-1">
                        {options.length === 0 && (
                            <div className="px-3 py-2 text-xs text-gray-500">暂无可选项</div>
                        )}
                        {options.map((option) => {
                            const active = option.value === value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(option.value);
                                        setOpen(false);
                                    }}
                                    className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center justify-between gap-2 ${
                                        active
                                            ? 'bg-wuxia-gold/15 text-wuxia-gold'
                                            : 'text-gray-200 hover:bg-white/5'
                                    }`}
                                >
                                    <span className="truncate">{option.label}</span>
                                    {active && <span className="text-[10px] text-wuxia-gold/80 shrink-0">当前</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default InlineSelect;
