/**
 * 懒组件重建登记簿（游戏态加载失败的恢复路径）。
 *
 * ## 为什么需要它
 *
 * `React.lazy` 会把 rejected 的 payload 缓存住（`payload._status = 2`），
 * 之后再次渲染直接抛缓存的错误、**不再调用 loader**。
 * 游戏态内我们禁用了整页刷新（view 不持久化，刷新= 退出对局 + 丢进度），
 * 于是如果没有重建机制，玩家点开某个弹窗加载失败后就会**永远打不开**，
 * 只剩刷新页面一条路——那正是本项目要消除的行为。
 *
 * 所以重试必须能生成一个**全新的 React.lazy 实例**，而不是重挂载旧的。
 */

type 监听器 = () => void;

const 版本表 = new Map<string, number>();
const 监听表 = new Map<string, Set<监听器>>();

const 通知 = (importKey: string): void => {
    监听表.get(importKey)?.forEach((listener) => {
        try {
            listener();
        } catch (error) {
            console.warn('Lazy rebuild listener failed:', importKey, error);
        }
    });
};

/** 读取当前重建版本（React 用它当 useMemo 依赖，变化即生成新的 React.lazy）。 */
export const 读取懒组件版本 = (importKey: string): number => 版本表.get(importKey) || 0;

/** 递增重建版本并通知所有订阅者，用于「重新加载」。 */
export const 重置懒组件重建 = (importKey: string): void => {
    版本表.set(importKey, 读取懒组件版本(importKey) + 1);
    通知(importKey);
};

/** 订阅某个懒组件的重建变化，返回取消订阅函数。 */
export const 订阅懒组件重建 = (importKey: string, listener: 监听器): (() => void) => {
    const listeners = 监听表.get(importKey) || new Set<监听器>();
    listeners.add(listener);
    监听表.set(importKey, listeners);
    return () => {
        const current = 监听表.get(importKey);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) {
            监听表.delete(importKey);
        }
    };
};

/** 测试用：清空登记簿。 */
export const 清空懒组件重建登记 = (): void => {
    版本表.clear();
    监听表.clear();
};