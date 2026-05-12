import type { 游戏物品, 物品生图结果 } from '../models/item';
import { 获取图片展示地址 } from './imageAssets';
import { 获取预置物品图片URL } from '../data/presetItemImages';

const 读取物品生图历史 = (item?: 游戏物品 | null): 物品生图结果[] => {
    if (!Array.isArray(item?.图片档案?.生图历史)) return [];
    return item!.图片档案!.生图历史 as 物品生图结果[];
};

export const 获取物品已选图标记录 = (item?: 游戏物品 | null): 物品生图结果 | null => {
    if (!item) return null;

    const history = 读取物品生图历史(item);
    const selectedIconId = typeof item.图片档案?.已选图标图片ID === 'string'
        ? item.图片档案.已选图标图片ID.trim()
        : '';

    const selectedRecord = selectedIconId
        ? history.find((entry) => entry?.id === selectedIconId)
            || (item.图片档案?.最近生图结果?.id === selectedIconId ? item.图片档案.最近生图结果 || null : null)
        : null;

    if (selectedRecord?.状态 === 'success' && 获取图片展示地址(selectedRecord)) {
        return selectedRecord;
    }

    const firstIconRecord = history.find((entry) => entry?.构图 === '物品图标' && entry?.状态 === 'success' && 获取图片展示地址(entry));
    if (firstIconRecord) return firstIconRecord;

    const recentRecord = item.图片档案?.最近生图结果;
    if (recentRecord?.状态 === 'success' && 获取图片展示地址(recentRecord)) {
        return recentRecord;
    }

    return history.find((entry) => entry?.状态 === 'success' && 获取图片展示地址(entry)) || null;
};

export const 获取物品已选图标地址 = (item?: 游戏物品 | null): string => {
    const record = 获取物品已选图标记录(item);
    const fromRecord = 获取图片展示地址(record);
    if (fromRecord) return fromRecord;

    // 如果没有已生成的图片，尝试从预置图片库匹配
    if (item) {
        const presetUrl = 获取预置物品图片URL(
            (item as any)?.名称 || '',
            (item as any)?.类型 || '',
            (item as any)?.品质 || ''
        );
        if (presetUrl) return presetUrl;
    }

    return '';
};

export const 物品已有可用图标 = (item?: 游戏物品 | null): boolean => Boolean(获取物品已选图标地址(item));

export const 合并物品图片档案 = (item: 游戏物品, result: 物品生图结果) => {
    const archive = item.图片档案 && typeof item.图片档案 === 'object' ? item.图片档案 : {};
    const history = Array.isArray(archive.生图历史) ? archive.生图历史 : [];
    const normalized: 物品生图结果 = {
        ...result,
        id: result.id || `item_img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
    const mergedHistory = [normalized, ...history.filter((entry) => entry?.id !== normalized.id)].slice(0, 12);
    return {
        ...archive,
        最近生图结果: normalized,
        生图历史: mergedHistory,
        已选图标图片ID: normalized.构图 === '物品图标'
            ? normalized.id
            : archive.已选图标图片ID || normalized.id,
    };
};
