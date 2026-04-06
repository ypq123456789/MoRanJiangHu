export type 生图目标类型 = 'npc' | 'scene';
export type 生图筛选性别类型 = '男' | '女' | '全部';
export type 生图筛选重要性类型 = '仅重要' | '全部';
export type 图片生成状态类型 = 'success' | 'failed' | 'pending';
export type 生图任务状态类型 = 'queued' | 'running' | 'success' | 'failed';
export type 生图任务来源类型 = 'auto' | 'manual' | 'retry';
export type 生图构图类型 = '头像' | '半身' | '立绘' | '场景' | '部位特写';
export type 场景生成类型 = '场景快照' | '风景场景';
export type 香闺秘档部位类型 = '胸部' | '小穴' | '屁穴';
export type 图片记录来源类型 = 'generated' | 'upload';

export interface NPC生图结果 {
    id?: string;
    图片URL?: string;
    本地路径?: string;
    生图词组: string;
    最终正向提示词?: string;
    最终负向提示词?: string;
    原始描述: string;
    使用模型: string;
    生成时间: number;
    构图?: 生图构图类型;
    部位?: 香闺秘档部位类型;
    画风?: '通用' | '二次元' | '写实' | '国风';
    画师串?: string;
    尺寸?: string;
    状态?: 图片生成状态类型;
    错误信息?: string;
    来源?: 图片记录来源类型;
    上传文件名?: string;
    上传时间?: number;
}

export interface NPC香闺秘档生图结果 {
    id?: string;
    部位: 香闺秘档部位类型;
    图片URL?: string;
    本地路径?: string;
    生图词组: string;
    最终正向提示词?: string;
    最终负向提示词?: string;
    原始描述: string;
    使用模型: string;
    生成时间: number;
    构图?: '部位特写';
    画风?: '通用' | '二次元' | '写实' | '国风';
    画师串?: string;
    状态?: 图片生成状态类型;
    错误信息?: string;
    描述文本?: string;
    来源?: 图片记录来源类型;
    上传文件名?: string;
    上传时间?: number;
}

export interface 场景生图结果 {
    id?: string;
    图片URL?: string;
    本地路径?: string;
    生图词组: string;
    最终正向提示词?: string;
    最终负向提示词?: string;
    原始描述: string;
    使用模型: string;
    生成时间: number;
    构图?: '场景';
    场景类型?: 场景生成类型;
    场景判定说明?: string;
    画风?: '通用' | '二次元' | '写实' | '国风';
    画师串?: string;
    尺寸?: string;
    额外要求?: string;
    状态?: 图片生成状态类型;
    错误信息?: string;
    来源回合?: number;
    摘要?: string;
    来源?: 图片记录来源类型;
    上传文件名?: string;
    上传时间?: number;
}

export interface 图片管理筛选条件 {
    目标类型?: 生图目标类型 | '全部';
    角色标识?: string;
    角色姓名?: string;
    状态?: 图片生成状态类型 | '全部';
}

export interface NPC图片记录 {
    目标类型: 'npc';
    NPC标识: string;
    NPC姓名: string;
    NPC性别?: '男' | '女';
    是否主要角色?: boolean;
    结果: NPC生图结果;
}

export interface NPC图片档案 {
    最近生图结果?: NPC生图结果;
    生图历史?: NPC生图结果[];
    已选头像图片ID?: string;
    已选立绘图片ID?: string;
    已选背景图片ID?: string;
    香闺秘档部位档案?: Partial<Record<香闺秘档部位类型, NPC香闺秘档生图结果>>;
}

export interface 场景图片档案 {
    最近生图结果?: 场景生图结果;
    生图历史?: 场景生图结果[];
    当前壁纸图片ID?: string;
}

export interface NPC生图任务记录 {
    id: string;
    目标类型: 'npc';
    NPC标识: string;
    NPC姓名: string;
    NPC性别?: '男' | '女';
    NPC身份?: string;
    是否主要角色?: boolean;
    来源: 生图任务来源类型;
    状态: 生图任务状态类型;
    创建时间: number;
    开始时间?: number;
    完成时间?: number;
    使用模型?: string;
    生图词组?: string;
    最终正向提示词?: string;
    最终负向提示词?: string;
    原始描述?: string;
    构图?: '头像' | '半身' | '立绘' | '部位特写';
    部位?: 香闺秘档部位类型;
    画风?: '通用' | '二次元' | '写实' | '国风';
    画师串?: string;
    尺寸?: string;
    图片URL?: string;
    本地路径?: string;
    错误信息?: string;
    进度阶段?: 'queued' | 'prompting' | 'generating' | 'saving' | 'success' | 'failed';
    进度文本?: string;
    额外要求?: string;
}

export interface 场景生图任务记录 {
    id: string;
    目标类型: 'scene';
    来源: 生图任务来源类型;
    状态: 生图任务状态类型;
    创建时间: number;
    开始时间?: number;
    完成时间?: number;
    使用模型?: string;
    生图词组?: string;
    最终正向提示词?: string;
    最终负向提示词?: string;
    原始描述?: string;
    构图?: '场景';
    场景类型?: 场景生成类型;
    场景判定说明?: string;
    画风?: '通用' | '二次元' | '写实' | '国风';
    画师串?: string;
    尺寸?: string;
    额外要求?: string;
    图片URL?: string;
    本地路径?: string;
    错误信息?: string;
    进度阶段?: 'queued' | 'prompting' | 'generating' | 'saving' | 'success' | 'failed';
    进度文本?: string;
    来源回合?: number;
    摘要?: string;
    已应用为壁纸?: boolean;
}
