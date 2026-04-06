import { 图片管理设置结构 } from '../types';

const 限制最小值 = 1;
const 限制最大值 = 100;

const 规范化上限值 = (value: unknown, fallback: number): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.min(限制最大值, Math.max(限制最小值, Math.floor(value)));
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return Math.min(限制最大值, Math.max(限制最小值, Math.floor(parsed)));
        }
    }
    return fallback;
};

export const 默认图片管理设置: 图片管理设置结构 = {
    场景图历史上限: 10
};

export const 规范化图片管理设置 = (
    raw?: Partial<图片管理设置结构> | null
): 图片管理设置结构 => {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        场景图历史上限: 规范化上限值(source.场景图历史上限, 默认图片管理设置.场景图历史上限)
    };
};
