import React from 'react';
import GameButton from './GameButton';

export type ConfirmOptions = {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
};

interface Props extends ConfirmOptions {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const InAppConfirmModal: React.FC<Props> = ({
    open,
    title = '请确认',
    message,
    confirmText = '确认',
    cancelText = '取消',
    danger = false,
    onConfirm,
    onCancel
}) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="w-full max-w-md rounded-xl border border-wuxia-gold/30 bg-ink-black/95 shadow-[0_0_60px_rgba(0,0,0,0.85)] p-5">
                <div className="text-lg font-serif font-bold text-wuxia-gold mb-3">{title}</div>
                <div className="max-h-[60vh] overflow-y-auto pr-1 text-sm text-gray-300 whitespace-pre-line break-words leading-relaxed">
                    {message}
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <GameButton onClick={onCancel} variant="secondary" className="px-4 py-2 text-xs">
                        {cancelText}
                    </GameButton>
                    <GameButton onClick={onConfirm} variant={danger ? 'danger' : 'primary'} className="px-4 py-2 text-xs">
                        {confirmText}
                    </GameButton>
                </div>
            </div>
        </div>
    );
};

export default InAppConfirmModal;
