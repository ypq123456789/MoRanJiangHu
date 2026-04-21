const LAZY_IMPORT_RETRY_PREFIX = 'moranjianghu.lazy-import-retry:';

const DYNAMIC_IMPORT_FAILURE_PATTERNS = [
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'error loading dynamically imported module',
    'ChunkLoadError',
    'Loading chunk'
];

export const isDynamicImportFetchError = (error: unknown): boolean => {
    const message = error instanceof Error
        ? `${error.name} ${error.message}`
        : String(error || '');

    return DYNAMIC_IMPORT_FAILURE_PATTERNS.some((pattern) => message.includes(pattern));
};

export const lazyImportWithReload = async <T>(
    importKey: string,
    loader: () => Promise<T>
): Promise<T> => {
    const retryStorageKey = `${LAZY_IMPORT_RETRY_PREFIX}${importKey}`;

    try {
        const module = await loader();
        if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(retryStorageKey);
        }
        return module;
    } catch (error) {
        if (typeof window === 'undefined' || !isDynamicImportFetchError(error)) {
            throw error;
        }

        const alreadyRetried = window.sessionStorage.getItem(retryStorageKey) === '1';
        if (!alreadyRetried) {
            window.sessionStorage.setItem(retryStorageKey, '1');
            window.location.reload();
            await new Promise<never>(() => {});
        }

        window.sessionStorage.removeItem(retryStorageKey);
        throw error;
    }
};
