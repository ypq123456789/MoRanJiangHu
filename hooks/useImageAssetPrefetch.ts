import { useEffect, useMemo, useState } from 'react';
import { 读取图片资源 } from '../services/dbService';
import { 读取图片资源缓存, 是否图片资源引用 } from '../utils/imageAssets';

const 取文本 = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const 收集图片资源引用 = (
    value: unknown,
    refs: Set<string>,
    seen: WeakSet<object> = new WeakSet()
): void => {
    const text = 取文本(value);
    if (text) {
        if (是否图片资源引用(text)) refs.add(text);
        return;
    }
    if (!value || typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    if (Array.isArray(value)) {
        value.forEach((item) => 收集图片资源引用(item, refs, seen));
        return;
    }

    Object.values(value as Record<string, unknown>).forEach((child) => {
        收集图片资源引用(child, refs, seen);
    });
};

export const 提取图片资源引用列表 = (...sources: unknown[]): string[] => {
    const refs = new Set<string>();
    sources.forEach((source) => 收集图片资源引用(source, refs));
    return Array.from(refs.values());
};

export const use图片资源回源预取 = (...sources: unknown[]): void => {
    const [, forceRefresh] = useState(0);
    const refList = useMemo(() => 提取图片资源引用列表(...sources), [...sources]);
    const refKey = refList.join('|');

    useEffect(() => {
        let cancelled = false;
        const unresolvedRefs = refList.filter((ref) => !读取图片资源缓存(ref));
        if (unresolvedRefs.length === 0) return;

        void Promise.allSettled(unresolvedRefs.map((ref) => 读取图片资源(ref))).then((results) => {
            if (cancelled) return;
            const hasLoaded = results.some((item) => item.status === 'fulfilled' && 取文本(item.value).length > 0);
            if (hasLoaded) {
                forceRefresh((value) => value + 1);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [refKey, refList]);
};
