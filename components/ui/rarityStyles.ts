import { 功法品质 } from '../../models/kungfu';
import { 物品品质 } from '../../models/item';

export type 稀有度 = 物品品质 | 功法品质 | string;

export interface 稀有度样式 {
    text: string;
    border: string;
    bg: string;
    glow: string;
    badge: string;
}

export const getRarityStyles = (rarity: 稀有度): 稀有度样式 => {
    switch (rarity) {
        case '凡品':
            return {
                text: 'text-gray-400',
                border: 'border-gray-700',
                bg: 'bg-gray-900/40',
                glow: '',
                badge: 'bg-gray-900/60 border-gray-700 text-gray-300'
            };
        case '良品':
            return {
                text: 'text-sky-300',
                border: 'border-sky-800/60',
                bg: 'bg-sky-900/10',
                glow: 'drop-shadow-[0_0_4px_rgba(125,211,252,0.45)]',
                badge: 'bg-sky-900/30 border-sky-800/60 text-sky-200'
            };
        case '上品':
            return {
                text: 'text-purple-300',
                border: 'border-purple-800/60',
                bg: 'bg-purple-900/10',
                glow: 'drop-shadow-[0_0_5px_rgba(196,181,253,0.5)]',
                badge: 'bg-purple-900/30 border-purple-800/60 text-purple-200'
            };
        case '极品':
            return {
                text: 'text-orange-300',
                border: 'border-orange-700/60',
                bg: 'bg-orange-900/10',
                glow: 'drop-shadow-[0_0_6px_rgba(253,186,116,0.55)]',
                badge: 'bg-orange-900/30 border-orange-700/60 text-orange-200'
            };
        case '绝世':
            return {
                text: 'text-red-400',
                border: 'border-red-700/60',
                bg: 'bg-red-900/10',
                glow: 'drop-shadow-[0_0_7px_rgba(248,113,113,0.6)]',
                badge: 'bg-red-900/30 border-red-700/60 text-red-200'
            };
        case '传说':
            return {
                text: 'text-amber-300',
                border: 'border-amber-600/60',
                bg: 'bg-amber-900/10',
                glow: 'drop-shadow-[0_0_8px_rgba(252,211,77,0.7)]',
                badge: 'bg-amber-900/35 border-amber-600/60 text-amber-200'
            };
        default:
            return {
                text: 'text-gray-400',
                border: 'border-gray-700',
                bg: 'bg-gray-900/40',
                glow: '',
                badge: 'bg-gray-900/60 border-gray-700 text-gray-300'
            };
    }
};

export const getRarityNameClass = (rarity: 稀有度): string => {
    const styles = getRarityStyles(rarity);
    return `${styles.text} ${styles.glow} font-semibold tracking-wide`;
};
