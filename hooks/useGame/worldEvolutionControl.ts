import { useEffect } from 'react';
import { 获取世界演变接口配置, 接口配置是否可用 } from '../../utils/apiConfig';

type 世界演变控制依赖 = {
    view: string;
    loading: boolean;
    apiConfig: any;
    环境: any;
    世界: any;
    世界演变更新中: boolean;
    变量生成中: boolean;
    世界演变状态文本: string;
    世界演变最近更新时间: string | null;
    世界演变最近现实更新时间戳Ref: { current: number };
    世界演变去重签名Ref: { current: string };
    世界演变功能已开启: () => boolean;
    已进入主剧情回合: () => boolean;
    set世界演变状态文本: (value: string) => void;
    规范化世界状态: (raw?: any) => any;
    执行世界演变更新: (params?: {
        来源?: 'manual' | 'auto_due' | 'story_dynamic' | 'story_dynamic_and_due';
        动态世界线索?: string[];
        到期摘要?: string[];
        force?: boolean;
    }) => Promise<{ ok: boolean; statusText?: string }>;
};

export const use世界演变控制 = (deps: 世界演变控制依赖) => {
    const handleForceWorldEvolutionUpdate = async (): Promise<string | null> => {
        const result = await deps.执行世界演变更新({
            来源: 'manual',
            动态世界线索: [],
            force: true
        });
        return result.ok ? null : (result.statusText || deps.世界演变状态文本 || '世界演变更新未执行，请检查模型配置。');
    };

    useEffect(() => {
        if (!deps.世界演变功能已开启()) return;
        if (!接口配置是否可用(获取世界演变接口配置(deps.apiConfig))) return;
        if (deps.view !== 'game') return;
        if (!deps.已进入主剧情回合()) return;
        if ((deps.世界演变状态文本 || '').includes('到期')) {
            deps.set世界演变状态文本('世界演变待命');
        }
    }, [
        deps.view,
        deps.apiConfig,
        deps.世界演变状态文本
    ]);

    return {
        handleForceWorldEvolutionUpdate
    };
};
