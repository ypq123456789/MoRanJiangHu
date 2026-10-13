const DYNAMIC_IMPORT_FAILURE_PATTERNS = [
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'error loading dynamically imported module',
    'is not a valid JavaScript MIME type',
    'text/html',
    'ChunkLoadError',
    'Loading chunk'
];

export const isDynamicImportFetchError = (error: unknown): boolean => {
    const message = error instanceof Error
        ? `${error.name} ${error.message}`
        : String(error || '');

    return message.includes('DynamicImportDeferredReloadError')
        || DYNAMIC_IMPORT_FAILURE_PATTERNS.some((pattern) => message.includes(pattern));
};

/**
 * 是否已经进入游戏态（读过档或新开局）。
 *
 * view 是纯 React state、不持久化，任何整页 reload 都会把玩家踢回主页，
 * 并丢掉刚刚载入的对局。因此「刷新页面自愈」只能在尚未进入游戏态时使用：
 * 那时刷新最多损失一次点击，不会毁掉玩家正在进行的存档。
 */
let 游戏态已激活 = false;

export const setLazyImportInGameActive = (active: boolean): void => {
    游戏态已激活 = active;
};

export const isLazyImportInGameActive = (): boolean => 游戏态已激活;

const 预热标记前缀 = 'moranjianghu:lazy-import-reload:';

const 生成标记键 = (importKey: string): string => `${预热标记前缀}${importKey}`;

const 创建延迟加载错误 = (importKey: string, 恢复方式: 恢复方式类型, cause: unknown): Error => {
    let 提示: string;
    switch (恢复方式) {
        case '已刷新':
            提示 = `功能模块 ${importKey} 暂时无法加载。系统已尝试刷新页面；请先手动保存进度，稍后重新进入新版本。`;
            break;
        case '游戏态':
            // ⚠️ 游戏态绝不能引导玩家刷新页面：view 不持久化，
            // 刷新=退出当前对局 + 丢掉未保存进度。
            提示 = `功能模块 ${importKey} 暂时无法加载。请先保存当前进度，再点击「重试」；若持续失败，请关闭本界面后重新进入，或返回主页后刷新页面（会退出当前对局）。`;
            break;
        default:
            提示 = `功能模块 ${importKey} 暂时无法加载。请稍后重试，若持续失败请检查网络后刷新页面。`;
            break;
    }
    const reloadSafeError = new Error(提示);
    reloadSafeError.name = 'DynamicImportDeferredReloadError';
    (reloadSafeError as Error & { cause?: unknown }).cause = cause;
    return reloadSafeError;
};

type 恢复方式类型 = '已刷新' | '游戏态' | '默认';

type LazyImportOptions = {
    /**
     * 是否允许在失败时整页刷新。预热路径必须显式传false：
     * 预热只是「提前把chunk 拿进内存」，失败最多下次点开时再试一次，
     * 绝不该把玩家踢回主页。
     */
    allowReload?: boolean;
};

export const lazyImportWithReload = async <T>(
    importKey: string,
    loader: () => Promise<T>,
    options?: LazyImportOptions
): Promise<T> => {
    try {
        const result = await loader();
        try {
            window.sessionStorage.removeItem(生成标记键(importKey));
        } catch {
            // Storage cleanup is best-effort.
        }
        return result;
    } catch (error) {
        if (typeof window === 'undefined' || !isDynamicImportFetchError(error)) {
            throw error;
        }

        const allowReload = options?.allowReload !== false && !游戏态已激活;
        let 恢复方式: 恢复方式类型 = '默认';

        if (allowReload) {
            const reloadKey = 生成标记键(importKey);
            try {
                if (window.sessionStorage.getItem(reloadKey) !== '1') {
                    window.sessionStorage.setItem(reloadKey, '1');
                    window.location.reload();
                    恢复方式 = '已刷新';
                }
            } catch {
                // Storage/reload is best-effort; preserve the actionable error below.
            }
        } else if (游戏态已激活) {
            // 游戏态内禁止刷新：由调用方提供可重建的懒组件重试路径。
            恢复方式 = '游戏态';
        }

        console.warn(
            `Lazy module "${importKey}" failed to load (allowReload=${allowReload}).`,
            error
        );

        throw 创建延迟加载错误(importKey, 恢复方式, error);
    }
};

/**
 * 预热专用加载器：失败绝不整页刷新。
 *
 * 与 lazyImportWithReload 的区别只在于「不刷新」，但必须显式区分——
 * 预热失败和「玩家点开弹窗时加载失败」的风险等级完全不同，
 * 历史上正是因为两者共用了同一个 reload 路径，导致 iOS Safari 上
 * 读档成功后触发批量预热、任一 chunk 失败即整页刷新回主页。
 */
export const preloadLazyImport = <T>(
    importKey: string,
    loader: () => Promise<T>
): Promise<T> => lazyImportWithReload(importKey, loader, { allowReload: false });
