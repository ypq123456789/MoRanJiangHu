import { useEffect, useRef, useState } from 'react';
import type { 天赋结构, 背景结构, 小说拆分数据集结构 } from '../../../types';
import type { 开局预设方案结构 } from '../../../data/newGamePresets';
import type { 创意工坊模块条目 } from '../../../data/creativeWorkshopModules';
import * as dbService from '../../../services/dbService';
import { 列出创意工坊模块 } from '../../../services/creativeWorkshop';
import { 读取小说拆分数据集列表 } from '../../../services/novelDecompositionStore';
import {
    订阅云端设置回填,
    订阅云端设置同步状态,
    读取云端设置同步状态,
    type 云端设置同步状态
} from '../../../services/cloudSettingsSync';
import {
    合并去重开局预设方案,
    合并去重背景,
    合并去重天赋,
    标准化开局预设方案,
    自定义开局预设存储键
} from '../../../utils/customNewGamePresets';
import { 设置键 } from '../../../utils/settingsSchema';

const 自定义天赋存储键 = 设置键.自定义天赋;
const 自定义背景存储键 = 设置键.自定义背景;

const 规范化自定义开局预设列表 = (raw: unknown): 开局预设方案结构[] => (
    Array.isArray(raw)
        ? 合并去重开局预设方案(raw.map((item) => 标准化开局预设方案(item)).filter(Boolean) as 开局预设方案结构[])
        : []
);

const 安全读取云端设置同步状态 = (): 云端设置同步状态 | null => (
    typeof 读取云端设置同步状态 === 'function' ? 读取云端设置同步状态() : null
);

export const 判断云端设置拉取中 = (status: 云端设置同步状态 | null): boolean => Boolean(
    status?.running && (
        status.direction === 'download'
        || status.direction === 'both'
        || status.stage === 'download'
        || status.stage === 'decrypt'
        || status.stage === 'merge'
    )
);

/**
 * 统一管理新建角色向导中的异步配置集合（天赋、背景、开局预设、小说数据集、创意工坊模块）。
 * 各项请求相互独立并行触发，任一慢请求不会阻塞其余列表渲染，并追踪本地读取与云端设置拉取状态。
 */
export const useNewGameAsyncCollections = () => {
    const [自定义天赋列表, 设置自定义天赋列表] = useState<天赋结构[]>([]);
    const [自定义背景列表, 设置自定义背景列表] = useState<背景结构[]>([]);
    const [自定义开局预设列表, 设置自定义开局预设列表] = useState<开局预设方案结构[]>([]);
    const [小说拆分数据集列表, 设置小说拆分数据集列表] = useState<小说拆分数据集结构[]>([]);
    const [创意工坊模块列表, 设置创意工坊模块列表] = useState<创意工坊模块条目[]>([]);

    const [自定义天赋加载中, 设置自定义天赋加载中] = useState(true);
    const [自定义背景加载中, 设置自定义背景加载中] = useState(true);
    const [开局预设加载中, 设置开局预设加载中] = useState(true);
    const [小说数据集加载中, 设置小说数据集加载中] = useState(true);
    const [创意工坊加载中, 设置创意工坊加载中] = useState(true);

    const [云端设置同步状态, 设置云端设置同步状态] = useState<云端设置同步状态 | null>(() => 安全读取云端设置同步状态());

    const 请求序号Ref = useRef({
        talents: 0,
        backgrounds: 0,
        presets: 0,
        datasets: 0,
        workshop: 0
    });

    useEffect(() => {
        let 已卸载 = false;

        const 读取自定义天赋 = (clearOnNonArray: boolean) => {
            const reqId = ++请求序号Ref.current.talents;
            设置自定义天赋加载中(true);
            void Promise.resolve()
                .then(() => dbService.读取设置(自定义天赋存储键))
                .then((savedTalents) => {
                    if (已卸载 || reqId !== 请求序号Ref.current.talents) return;
                    if (Array.isArray(savedTalents)) {
                        设置自定义天赋列表(合并去重天赋(savedTalents as 天赋结构[]));
                    } else if (clearOnNonArray) {
                        设置自定义天赋列表([]);
                    }
                })
                .catch((error) => {
                    if (!已卸载) {
                        console.error('加载自定义天赋失败', error);
                    }
                })
                .finally(() => {
                    if (!已卸载 && reqId === 请求序号Ref.current.talents) {
                        设置自定义天赋加载中(false);
                    }
                });
        };

        const 读取自定义背景 = (clearOnNonArray: boolean) => {
            const reqId = ++请求序号Ref.current.backgrounds;
            设置自定义背景加载中(true);
            void Promise.resolve()
                .then(() => dbService.读取设置(自定义背景存储键))
                .then((savedBackgrounds) => {
                    if (已卸载 || reqId !== 请求序号Ref.current.backgrounds) return;
                    if (Array.isArray(savedBackgrounds)) {
                        设置自定义背景列表(合并去重背景(savedBackgrounds as 背景结构[]));
                    } else if (clearOnNonArray) {
                        设置自定义背景列表([]);
                    }
                })
                .catch((error) => {
                    if (!已卸载) {
                        console.error('加载自定义身份背景失败', error);
                    }
                })
                .finally(() => {
                    if (!已卸载 && reqId === 请求序号Ref.current.backgrounds) {
                        设置自定义背景加载中(false);
                    }
                });
        };

        const 读取自定义开局预设 = (clearOnNonArray: boolean) => {
            const reqId = ++请求序号Ref.current.presets;
            设置开局预设加载中(true);
            void Promise.resolve()
                .then(() => dbService.读取设置(自定义开局预设存储键))
                .then((savedStartPresets) => {
                    if (已卸载 || reqId !== 请求序号Ref.current.presets) return;
                    if (Array.isArray(savedStartPresets)) {
                        设置自定义开局预设列表(规范化自定义开局预设列表(savedStartPresets));
                    } else if (clearOnNonArray) {
                        设置自定义开局预设列表([]);
                    }
                })
                .catch((error) => {
                    if (!已卸载) {
                        console.error('加载自定义开局方案失败', error);
                    }
                })
                .finally(() => {
                    if (!已卸载 && reqId === 请求序号Ref.current.presets) {
                        设置开局预设加载中(false);
                    }
                });
        };

        const 读取小说数据集 = () => {
            const reqId = ++请求序号Ref.current.datasets;
            设置小说数据集加载中(true);
            void Promise.resolve()
                .then(() => 读取小说拆分数据集列表())
                .then((savedNovelDatasets) => {
                    if (已卸载 || reqId !== 请求序号Ref.current.datasets) return;
                    if (Array.isArray(savedNovelDatasets)) {
                        设置小说拆分数据集列表(savedNovelDatasets);
                    }
                })
                .catch((error) => {
                    if (!已卸载) {
                        console.error('加载小说拆分数据集失败', error);
                    }
                })
                .finally(() => {
                    if (!已卸载 && reqId === 请求序号Ref.current.datasets) {
                        设置小说数据集加载中(false);
                    }
                });
        };

        const 读取创意工坊 = () => {
            const reqId = ++请求序号Ref.current.workshop;
            设置创意工坊加载中(true);
            void Promise.resolve()
                .then(() => 列出创意工坊模块())
                .then((workshopModules) => {
                    if (已卸载 || reqId !== 请求序号Ref.current.workshop) return;
                    if (Array.isArray(workshopModules)) {
                        设置创意工坊模块列表(workshopModules.filter((item) => item.type === 'topic'));
                    }
                })
                .catch((error) => {
                    if (!已卸载) {
                        console.error('加载创意工坊模块失败', error);
                    }
                })
                .finally(() => {
                    if (!已卸载 && reqId === 请求序号Ref.current.workshop) {
                        设置创意工坊加载中(false);
                    }
                });
        };

        读取自定义天赋(false);
        读取自定义背景(false);
        读取自定义开局预设(false);
        读取小说数据集();
        读取创意工坊();

        设置云端设置同步状态(安全读取云端设置同步状态());

        const 取消订阅云端状态 = typeof 订阅云端设置同步状态 === 'function'
            ? 订阅云端设置同步状态((status) => {
                if (!已卸载) {
                    设置云端设置同步状态(status);
                }
            })
            : () => undefined;

        const 取消订阅云端回填 = typeof 订阅云端设置回填 === 'function'
            ? 订阅云端设置回填((keys) => {
                if (已卸载) return;
                const changed = new Set(keys);
                if (changed.has(自定义天赋存储键)) {
                    读取自定义天赋(true);
                }
                if (changed.has(自定义背景存储键)) {
                    读取自定义背景(true);
                }
                if (changed.has(自定义开局预设存储键)) {
                    读取自定义开局预设(true);
                }
            })
            : () => undefined;

        return () => {
            已卸载 = true;
            取消订阅云端状态();
            取消订阅云端回填();
        };
    }, []);

    const 云端设置拉取中 = 判断云端设置拉取中(云端设置同步状态);

    return {
        自定义天赋列表,
        设置自定义天赋列表,
        自定义背景列表,
        设置自定义背景列表,
        自定义开局预设列表,
        设置自定义开局预设列表,
        小说拆分数据集列表,
        设置小说拆分数据集列表,
        创意工坊模块列表,
        设置创意工坊模块列表,
        自定义天赋加载中,
        自定义背景加载中,
        开局预设加载中,
        小说数据集加载中,
        创意工坊加载中,
        云端设置同步状态,
        云端设置拉取中
    };
};
