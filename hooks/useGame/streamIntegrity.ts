/**
 * 功能模型的流式完整性保护（通用）。
 *
 * 背景：多条功能模型路径（记忆总结、变量校准、世界演变、规划分析……）默认走流式请求，
 * 但此前缺少「流式完整性校验 + 降级非流式重试」。中转站（gg 公益站等）中途断流或触发
 * 上游内容审核时，`chatCompletionClient.ts` 的 `解析SSE文本处理器.完成()` 会把
 * **已累积的半截文本当作完整结果返回**。
 *
 * 危险之处在于「半截往往仍能解析出合法子集」：例如变量校准的 `解析命令块` 有 JSON 修复
 * 与逐行降级解析，截断后照样能解析出几条命令，`dedupedCommands.length === 0` 的兜底不触发，
 * 于是**一半变量命令被静默合并进游戏状态**；世界演变、规划分析同理。
 *
 * 主剧情早就有这层保护（`generateStoryResponse` + `sendWorkflow.判定主剧情重试流式策略`），
 * 这里把同一模式抽成可复用的模块，让其余功能模型按需接入。
 */

/** SSE 流结束信息（与 `chatCompletionClient` 的 `通用流式结束信息` 同构）。 */
export type 功能模型流式结束信息 = {
    /** 是否收到了上游的 [DONE] 结束信号；false 表示连接被上游提前关闭。 */
    sawDone: boolean;
    /** SSE 最后一帧的 finish_reason；'content_filter' 表示明确命中上游内容审核。 */
    finishReason?: string;
    /** 流结束时的累积文本长度。 */
    accumulatedLength: number;
};

/**
 * 判断一次流式响应是否被上游中途掐断。
 *
 * 没有结束信息时返回 false，不视为异常——判定依据只能是「明确收到了 sawDone:false
 * 或 content_filter」，不能把「没收到结束信息」等同于「被掐断」：
 * `非流式回填流式回调`（服务端不支持流式而降级、Gemini Interactions 轮询完成）这类
 * 完整响应路径同样可能不经过 SSE 处理器，若把缺失信息一律当成截断，
 * 正常请求会被无谓地重试一次，反而平白多花一倍 token。
 */
export const 流式结果疑似被上游掐断 = (info: 功能模型流式结束信息 | null | undefined): boolean => Boolean(
    info && (info.sawDone === false || info.finishReason === 'content_filter')
);

/** 带完整性校验的流式选项：在调用方已有的流式选项上补一个 onStreamEnd 收集器。 */
export type 功能模型流式选项 = {
    stream?: boolean;
    onDelta?: (delta: string, accumulated: string) => void;
    onStreamEnd?: (info: 功能模型流式结束信息) => void;
};

export type 带完整性校验的请求结果<T> = {
    /** 最终采用的结果。文本路径是string，结构化路径是各自的返回对象。 */
    结果: T;
    /** 是否因为流式被掐断而走了非流式重试。 */
    已降级重试: boolean;
    /** 降级重试时，非流式请求自身也失败了（此时返回的是流式已收到的半截结果）。 */
    降级重试失败: boolean;
};

/**
 * 「重试也失败」时的处置策略。
 *
 * - `保留结果`（默认）：返回流式已收到的半截结果。对**纯文本展示**路径友好——
 *   玩家至少能看到内容并手动重试，整轮功能调用不会作废。
 * - `抛出错误`：**结构化命令**路径必须选它。变量/世界演变/地图/规划的返回对象里带着
 *   从半截文本解析出的**部分合法命令**，一旦被下游 `applyCommands` 合并就会静默写坏
 *   游戏状态（"只演变了一半"），这比整轮失败严重得多。
 */
export type 降级重试失败处置 = '保留结果' | '抛出错误';

export type 降级重试详情 = {
    /** 便于定位的功能名，用于日志。 */
    功能名?: string;
    sawDone?: boolean;
    finishReason?: string;
    accumulatedLength?: number;
    重试失败?: boolean;
    message?: string;
};

/** 降级重试也失败、且调用方选择阻断时抛出的错误。 */
export const 构建降级重试失败错误 = (功能名?: string) => {
    const error = new Error(
        `${功能名 || '功能模型'}的输出被上游中断（未收到结束标记），自动改用非流式重新生成仍失败。`
        + '为避免把不完整的结果写进游戏状态，本次结果已整体丢弃，请稍后重试或更换接口渠道。'
    );
    (error as any).name = 'StreamIntegrityError';
    (error as any).降级重试失败 = true;
    return error;
};

/**
 * 统一发起「带流式完整性保护」的请求：
 * 先走流式，校验是否收到结束标记；疑似被上游掐断则自动改用非流式重试一次。
 *
 * 泛型 `T` 既可以是纯文本（记忆总结），也可以是结构化结果
 * （变量校准的 `VariableCalibrationResult`、世界演变/规划分析的返回对象）——
 * 这些路径的返回对象里通常带着从半截文本解析出的**部分合法子集**，
 * 正是最需要这道保护的地方。
 *
 * 降级重试仍失败时，默认返回流式已收到的结果——让调用方至少能展示/编辑，
 * 好过把整次功能调用的结果直接作废。但**结构化命令路径**必须传
 * `重试失败处置: '抛出错误'`：半截文本解析出的部分命令被下游合并会静默写坏状态。
 *
 * @param 强制非流式 调用方已明确要求非流式（或未启用流式 UI）时，完全不走流式通道
 * @param 重试失败处置 重试也失败时是保留半截结果还是抛错阻断
 * @param 重试前重置超时 降级重试发起前的钩子。外层超时包装器往往是「流式活动后切到
 *   idleMs 模式」（规划分析仅 10 秒），而非流式重试不产生增量、几乎必然被掐断——
 *   调用方需借此把计时器切回 firstResponseMs 预算。
 * @param onFallback 降级相关事件的诊断回调（写日志用）
 */
export const 执行带完整性校验的请求 = async <T,>(params: {
    功能名?: string;
    发起流式请求: (options: 功能模型流式选项) => Promise<T>;
    发起非流式请求: () => Promise<T>;
    强制非流式?: boolean;
    重试失败处置?: 降级重试失败处置;
    重试前重置超时?: () => void;
    onFallback?: (info: 降级重试详情) => void;
}): Promise<带完整性校验的请求结果<T>> => {
    const {
        功能名,
        发起流式请求,
        发起非流式请求,
        强制非流式,
        重试失败处置 = '保留结果',
        重试前重置超时,
        onFallback
    } = params;

    if (强制非流式) {
        return { 结果: await 发起非流式请求(), 已降级重试: false, 降级重试失败: false };
    }

    let 流式结束信息: 功能模型流式结束信息 | null = null;
    const 结果 = await 发起流式请求({
        stream: true,
        onStreamEnd: (info) => { 流式结束信息 = info; }
    });

    if (!流式结果疑似被上游掐断(流式结束信息)) {
        return { 结果, 已降级重试: false, 降级重试失败: false };
    }

    const 基础详情: 降级重试详情 = {
        功能名,
        sawDone: 流式结束信息?.sawDone,
        finishReason: 流式结束信息?.finishReason,
        accumulatedLength: 流式结束信息?.accumulatedLength
    };
    onFallback?.(基础详情);

    // 非流式重试不产生流式增量，外层计时器仍停在 idleMs 模式，必须先切回首响应预算。
    重试前重置超时?.();

    try {
        const 重试结果 = await 发起非流式请求();
        return { 结果: 重试结果, 已降级重试: true, 降级重试失败: false };
    } catch (error: any) {
        onFallback?.({ ...基础详情, 重试失败: true, message: String(error?.message || error) });
        if (重试失败处置 === '抛出错误') {
            throw 构建降级重试失败错误(功能名);
        }
        return { 结果, 已降级重试: true, 降级重试失败: true };
    }
};

/**
 * 在调用方已有的流式选项上挂一个 onStreamEnd 收集器，
 * 用于「只想知道流是否完整、但仍想自己控制重试」的场景。
 * 返回值需要用 `移除收集器` 之外的方式回传给原回调（如需要）。
 */
export const 挂接流式结束收集器 = (
    基础选项: 功能模型流式选项 | undefined,
    收集: (info: 功能模型流式结束信息) => void
): 功能模型流式选项 => ({
    ...(基础选项 || {}),
    onStreamEnd: (info) => {
        收集(info);
        基础选项?.onStreamEnd?.(info);
    }
});

export const 记忆总结被掐断提示 = '记忆总结的流式输出被上游中断（已收到部分内容但没有收到结束标记，'
    + '通常是接口中转断流或触发了上游内容审核）。已自动改用非流式重新生成一次；'
    + '若仍不完整，请重试或更换接口渠道。';