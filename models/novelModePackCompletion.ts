import type { ModeRuntimeProfile, 题材模式类型 } from './system';

export type 小说模式包完善状态 = 'idle' | 'running' | 'paused' | 'finalizing' | 'completed';
export type 小说模式包完善阶段 = 'skeleton' | 'segment' | 'finalize';

export interface 小说模式包分段输入记录 {
    分段ID: string;
    原文总字符数: number;
    实际输入字符数: number;
    是否完整输入: boolean;
}

export interface 小说模式包完善记录 {
    id: string;
    数据集ID: string;
    题材: 题材模式类型;
    数据集指纹: string;
    状态: 小说模式包完善状态;
    当前阶段: 小说模式包完善阶段;
    总分段数: number;
    已完成分段数: number;
    下一个分段索引: number;
    最近失败分段索引?: number;
    最近错误?: string;
    当前分段ID?: string;
    当前分段标题?: string;
    分段输入记录: 小说模式包分段输入记录[];
    /** 玩家主动跳过的分段 ID：这些段不再重试，也不参与逐段完善，但仍算进进度。 */
    跳过分段ID列表: string[];
    待整理冲突提示: string[];
    当前草稿: Partial<ModeRuntimeProfile>;
    用户确认字段路径: string[];
    最近原始输出?: string;
    createdAt: number;
    updatedAt: number;
}
