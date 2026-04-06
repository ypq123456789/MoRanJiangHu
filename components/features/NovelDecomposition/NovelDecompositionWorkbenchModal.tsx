import React from 'react';
import { 接口设置结构 } from '../../../types';
import { OrnateBorder } from '../../ui/decorations/OrnateBorder';
import NovelDecompositionSettings from '../Settings/NovelDecompositionSettings';

interface Props {
    open: boolean;
    settings: 接口设置结构;
    onSave: (settings: 接口设置结构) => void;
    onClose: () => void;
    requestConfirm?: (options: { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>;
    onNotify?: (toast: { title: string; message: string; tone?: 'info' | 'success' | 'error' }) => void;
}

const NovelDecompositionWorkbenchModal: React.FC<Props> = ({ open, settings, onSave, onClose, requestConfirm, onNotify }) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[320] bg-black/85 backdrop-blur-sm overflow-y-auto animate-fadeIn">
            <div className="min-h-full w-full flex items-start md:items-center justify-center p-0 md:p-4">
                <OrnateBorder className="w-full h-[100dvh] md:max-w-7xl md:h-[88vh] md:max-h-[92vh] flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.9)] p-0 overflow-hidden backdrop-blur-md rounded-none md:rounded-2xl">
                    <div className="shrink-0 flex items-center justify-between gap-4 border-b border-wuxia-gold/10 bg-black/40 px-5 py-4">
                        <div>
                            <h2 className="text-lg md:text-xl font-serif font-bold text-wuxia-gold tracking-[0.18em]">小说分解工作台</h2>
                            <div className="mt-1 text-[11px] text-gray-400">导入、拆章、任务管理、进度续跑、注入校对与分享导入导出统一在这里完成。</div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 rounded-full border border-gray-700 bg-black/50 px-3 py-2 text-xs text-gray-300 hover:border-wuxia-gold/40 hover:text-wuxia-gold"
                        >
                            关闭
                        </button>
                    </div>

                    <div className="flex-1 min-h-0 flex flex-col bg-black/10">
                        <NovelDecompositionSettings settings={settings} onSave={onSave} requestConfirm={requestConfirm} onNotify={onNotify} />
                    </div>
                </OrnateBorder>
            </div>
        </div>
    );
};

export default NovelDecompositionWorkbenchModal;
