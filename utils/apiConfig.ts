import {
    接口设置结构,
    单接口配置结构,
    接口供应商类型,
    OpenAI兼容方案类型,
    功能模型占位配置结构,
    请求协议覆盖类型,
    画师串预设结构,
    模型词组转化器预设结构,
    词组转化器提示词预设结构,
    画师串预设适用范围类型,
    词组转化器提示词预设类型,
    PNG画风预设结构,
    角色锚点结构,
    角色锚点特征结构,
    图片词组序列化策略类型
} from '../models/system';
import { 默认文章优化提示词 } from '../prompts/runtime/defaults';

export const 供应商标签: Record<接口供应商类型, string> = {
    gemini: 'Gemini',
    claude: 'Claude',
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    zhipu: '智谱',
    openai_compatible: 'OpenAI自定义'
};

export const OpenAI兼容方案预设: Record<OpenAI兼容方案类型, { label: string; baseUrl: string }> = {
    custom: { label: '自定义', baseUrl: '' },
    siliconflow: { label: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1' },
    together: { label: 'Together', baseUrl: 'https://api.together.xyz/v1' },
    groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' }
};

export const 请求协议覆盖标签: Record<请求协议覆盖类型, string> = {
    auto: '自动识别',
    openai: 'OpenAI 协议',
    gemini: 'Gemini 协议',
    claude: 'Claude 协议',
    deepseek: 'DeepSeek 协议'
};

const 构建结构化词组输出格式提示词 = (
    strategy: 图片词组序列化策略类型,
    scope: 'npc' | 'scene'
): string => {
    if (scope === 'npc') {
        const serializerHint = strategy === 'nai_character_segments'
            ? 'NovelAI 最终会直接使用这一条单角色 tags；如需要人数标签或权重分组，可直接写在同一个 <提示词> 中。'
            : strategy === 'grok_structured'
                ? 'Grok 最终会把这条单角色 tags 转成更电影化的描述式提示词。'
                : strategy === 'gemini_structured'
                    ? 'Gemini 最终会把这条单角色 tags 转成清晰、可执行的英文短语。'
                    : '输出必须可被后续解析成单角色提示词。';
        return [
            '请使用以下结构输出：',
            '<提示词>...</提示词>',
            '只输出当前单个角色最终用于生图的 tags。',
            serializerHint,
            '输出内容只保留这个结构本身。'
        ].join('\n');
    }
    const serializerHint = strategy === 'nai_character_segments'
        ? 'NovelAI 多角色会按基础段 + 角色段序列化，并使用 | 连接。<基础> 负责全局环境、镜头、天气、布局和光影；<角色> 内每条 [序号] 内容负责该角色当前镜头需要的最小必要 tags。'
        : strategy === 'grok_structured'
            ? 'Grok 最终会把这些段落转成更电影化的描述式提示词；<角色> 内每条 [序号] 仍只写对应角色的动作、姿态、视线和镜头关系。'
            : strategy === 'gemini_structured'
                ? 'Gemini 最终会把这些段落转成清晰的描述式提示词；<角色> 内每条 [序号] 写成完整、可执行的英文短语。'
                : '输出必须可被后续解析成基础段与 [序号] 角色段。';
    return [
        '请使用以下结构输出：',
        '<提示词结构>',
        '<基础>...</基础>',
        '<角色>',
        '[1]角色名称|...',
        '[2]角色名称|...',
        '</角色>',
        '</提示词结构>',
        '至少输出一个 <基础> 段；纯场景时可以不输出 <角色>。',
        '场景里每个主要角色都写进同一个 <角色> 块，并用 [序号] 逐条区分。',
        serializerHint,
        '输出内容只保留这个结构本身。'
    ].join('\n');
};

const 默认词组转化器提示词预设列表: 词组转化器提示词预设结构[] = [
    {
        id: 'transformer_nai_npc',
        名称: 'NAI · NPC角色生成',
        类型: 'npc',
        提示词: [
            '你是 NovelAI V4/V4.5 角色提示词整理器。',
            '你的任务是把 NPC 资料整理成可直接用于角色生图的英文 tags，并保持稳定、统一、可复用。',
            '请按 NovelAI 更易执行的单角色提示词思路组织内容：在同一条 tags 里先放稳定身份、外观、服饰，再补镜头、光影与动作。',
            '若输入没有明确指定画风介质，不要擅自锁定二次元、写实、国风或摄影风格；只整理并强化输入中已经存在的风格信息。',
            '建议信息顺序：主体身份与年龄感 > 外貌与面部辨识 > 身材体态 > 常驻服饰 > 手持物或身份道具 > 姿态表情 > 镜头构图 > 光影环境。',
            '质量串、画风串、主体身份可以使用权重分组；动作、景别、环境关系和临时状态更适合自然 tags。',
            '请把身份、境界、性格转换成 gaze, posture, silhouette, expression, lighting, fabric detail 这类可见结果。',
            '单次输出只服务一个清晰镜头、一个主姿态、一个主光源，避免互相冲突的多视角、多动作、多光线。',
            '用词少而准，避免同义重复、避免堆砌空泛质量词、避免把同一外观信息在多个分组里反复重写。',
            '资料缺口只做低冲突、可长期复用的保守补全。',
            '当资料有限时，可根据身份、境界、年龄、性别补全年龄感、脸部气质、体态、常驻衣着材质、配饰、身份道具与可见气场。'
        ].join('\n'),
        角色锚定模式提示词: [
            '请直接沿用锚点中的稳定外观，不要重复改写已经确定的五官、体型、常驻衣着和主要配饰。',
            '请直接沿用锚点中的稳定外观，只在最终 tags 里补当前镜头中的动作、姿态、表情、景别、构图、光影、临时服装变化、环境关系和道具。',
            '若正文与锚点一致，可直接吸收为动态补充；若正文与锚点冲突，以锚点中的稳定外观为主。',
            '避免把基础段里的全局镜头、天气、环境和特效平均复制到每个角色段。'
        ].join('\n'),
        无锚点回退提示词: [
            '请根据输入的角色设定完成完整角色生成，不能只输出镜头、姿态、光影或空泛气质词。',
            '请优先完整提炼年龄感、身份、境界、外貌、身材、常驻衣着和其他稳定辨识特征。',
            '请先完成稳定外观和身份辨识，再补动作、姿态、镜头、光影和环境。',
            '请在补全时选择稳妥、低冲突、容易长期保持一致的视觉表达，但对输入中已经明确给出的设定不得省略。',
            '当资料只给出身份、境界、年龄、性别等少量字段时，也要据此补全最稳妥的外观、体态、衣着层次、配饰、武器或身份道具。'
        ].join('\n'),
        输出格式提示词: [
            构建结构化词组输出格式提示词('nai_character_segments', 'npc'),
            '单角色图直接输出 <提示词>，不要再拆 <基础>/<角色>。',
            '请先写稳定主体，再补镜头、动作、光影和少量环境。',
            '有锚点时，只补动态动作、姿态、表情、临时服装变化和道具。'
        ].join('\n'),
        createdAt: 1,
        updatedAt: 1
    },
    {
        id: 'transformer_nai_scene',
        名称: 'NAI · 场景生成',
        类型: 'scene',
        提示词: [
            '你是 NovelAI V4/V4.5 场景提示词整理器。',
            '你的任务是把场景描述整理成可直接用于场景生图的英文 tags，并保持空间清晰、层次稳定、单帧可执行。',
            '请按 NovelAI 更易执行的场景结构组织内容：基础段负责地点、时间、天气、空间结构、镜头、光影与整体氛围；角色信息统一写进 <角色> 块并用 [序号] 区分。',
            '若输入没有明确指定画风介质，不要擅自锁定二次元、写实、国风或摄影风格；只整理输入里已有的风格线索。',
            '提示词顺序建议为：大地点 > 具体地点 > 空间结构 > 时间天气 > 环境材质与细节 > 人物站位与互动 > 镜头构图 > 氛围特效。',
            '纯场景时让环境作为第一主体；故事快照时也必须保留地点、前中后景、地面关系和空间尺度。',
            '请明确前景、中景、远景、地面接触点、建筑或山水层级，形成单一清晰视角。',
            '单次输出只服务一个稳定时刻、一个主镜头、一个主光源、一个主要叙事焦点，避免多视角、多时间切片和多事件并列。',
            '环境细节要为焦点服务，不要把每一层都写成同等密度，避免画面容量失衡。',
            '武侠、古风、仙侠场景可主动整理山、水、雾、风、树影、檐角、石阶、灯火、云气、雨雪、花叶、纹理、材质与气氛粒子。'
        ].join('\n'),
        场景角色锚定模式提示词: [
            '请沿用角色锚点中的稳定外观，把场景输出重点放在空间、角色站位、互动关系、动作调度、镜头构图、天气、光影、环境细节和气氛特效。',
            '<角色> 块里每条 [序号] 只补当前场景需要的识别外观、动作和站位，不要把完整角色设定重新灌入场景。',
            '多人场景时优先表达关系、位置、视线和调度，让环境层级与人物关系一起成立。'
        ].join('\n'),
        无锚点回退提示词: [
            '请为主要角色补少量辨识外观。',
            '多人画面里优先保留位置、动作、关系和少数识别标签，让环境与人物容量保持平衡。',
            '不要把场景图写成多个完整角色立绘的拼贴。'
        ].join('\n'),
        输出格式提示词: [
            构建结构化词组输出格式提示词('nai_character_segments', 'scene'),
            '纯场景时可以只输出 <基础>；故事快照或多人画面时，主要角色必须写进 <角色> 块。',
            'NovelAI 最终会用 | 连接基础段和角色段；<角色> 内每条 [序号] 内容开头优先写 1girl、1boy、1woman 或 1man。',
            '基础段负责地点、空间、天气、镜头、光影与整体特效；<角色> 内每条 [序号] 只写该角色自身的外观锚点补充、动作、姿态、视线、手部状态和与环境或他人的关系。'
        ].join('\n'),
        createdAt: 2,
        updatedAt: 2
    },
    {
        id: 'transformer_nai_scene_judge',
        名称: 'NAI · 场景判定',
        类型: 'scene_judge',
        提示词: [
            '你负责判断当前文本更适合生成“风景场景”还是“故事快照”。',
            '判定保持保守，优先选择稳定、易读、可执行的画面类型。',
            '只有在文本能够稳定对应到一个单一时刻、一个清晰地点、一个主要事件时，才可判为故事快照。',
            '故事快照通常至少满足以下四项：明确地点、可见环境细节、在场人物、稳定姿态、明确动作、道具交互、空间方向、单一时刻感。',
            '如果文本主要是对话、心理活动、设定说明、回忆叙述、抽象氛围、身份介绍或长段内心描写，则默认判为风景场景。',
            '若存在多人混战、频繁动作切换、连续剧情变化、复杂视角切换，也优先回退为风景场景。',
            '若文本能稳定对应到“门前对峙、亭中交谈、桥上回首、崖边停步、举剑相向、递物瞬间”这类单帧事件，可提高故事快照优先级。',
            '即使判为故事快照，也必须保证地点和环境仍然清晰可读，不允许变成拥挤人物拼贴。',
            '只输出“风景场景”或“故事快照”其中之一。'
        ].join('\n'),
        createdAt: 3,
        updatedAt: 3
    },
    {
        id: 'transformer_banana_npc',
        名称: 'GeminiBanana · NPC角色生成',
        类型: 'npc',
        提示词: [
            '你是 Gemini Banana 角色提示词整理器。',
            '你的任务是把 NPC 资料整理成清晰、可执行、偏描述式的英文角色图提示词。',
            '请优先输出短英文短语或短句，不要写 NovelAI 权重语法，不要堆砌过碎的 Danbooru 风格碎标签。',
            '若输入没有明确指定画风介质，不要擅自锁定二次元、写实、国风或摄影风格；只整理输入中已有的风格线索。',
            '提示词顺序：角色身份与主体 > 稳定外观 > 身材体态 > 常驻服装 > 道具 > 动作表情 > 镜头构图 > 光影环境。',
            '请把性格转换成表情、姿态、镜头和光线，把身份与境界转换成服装细节、气场和主体姿态。',
            '请保持一个清晰镜头、一个主姿态、一个主光源，避免互相冲突的多动作与多镜头描述。',
            '用词尽量具体、可画、可执行，避免空泛质量词和同义重复。',
            '当资料有限时，可根据身份、境界、年龄、性别补全年龄感、面部气质、体态、常驻服饰、配饰与身份道具。'
        ].join('\n'),
        角色锚定模式提示词: [
            '请沿用锚点中的稳定外观，把输出重点放在镜头、动作、姿态、表情、景别、光影、临时服装变化、道具和环境。',
            '不要把锚点已确定的稳定外观重新展开成冗长描述。'
        ].join('\n'),
        无锚点回退提示词: [
            '请根据人物设定补出稳定外观。',
            '请优先保证角色形象稳定、自然、容易长期保持一致。',
            '请先补足身份辨识、外貌、身材与常驻衣着，再补动作、镜头和环境。',
            '当资料只给出身份、境界、年龄、性别时，也要据此补出最稳妥的脸部气质、体态、衣着层次、配饰与身份道具。'
        ].join('\n'),
        输出格式提示词: [
            构建结构化词组输出格式提示词('gemini_structured', 'npc'),
            'Gemini 的基础段与角色段内容都以清晰英文短语表达。',
            '基础段负责全局镜头、光影、环境；角色段负责单个角色的身份、外观、服饰、动作。'
        ].join('\n'),
        createdAt: 4,
        updatedAt: 4
    },
    {
        id: 'transformer_banana_scene',
        名称: 'GeminiBanana · 场景生成',
        类型: 'scene',
        提示词: [
            '你是 Gemini Banana 场景提示词整理器。',
            '你的任务是把场景信息整理成适合 Gemini Banana 的英文场景提示词。',
            '请优先输出清晰、可执行的英文短语，不要使用 NovelAI 权重语法，也不要堆砌过度碎片化标签。',
            '先建立地点、空间、时间、天气和主要材质，再写人物位置与互动，最后写镜头和氛围。',
            '请保持一个清晰焦点、一个主要镜头、一个稳定时刻，避免把多段剧情折叠进同一张图。',
            '古风、江湖、仙侠场景里主动写清建筑风格、山水层次、树影灯火、雾气风向、天气、地面材质与环境粒子。'
        ].join('\n'),
        场景角色锚定模式提示词: [
            '角色外观来自锚点，请生成他们在场景中的位置、互动、动作、镜头设计与环境关系。',
            '环境继续作为主要主体。',
            '如果角色较多，优先表达站位、视线与关系。'
        ].join('\n'),
        无锚点回退提示词: [
            '请用少量角色外观词帮助辨识人物，但要避免角色喧宾夺主。',
            '多人场景时优先保空间清晰度和镜头可读性。',
            '请避免把场景提示词写成多个人物单独肖像的并列清单。'
        ].join('\n'),
        输出格式提示词: [
            构建结构化词组输出格式提示词('gemini_structured', 'scene'),
            'Gemini 场景图中，基础段先给地点、空间、天气和镜头，角色段再补每个角色的动作与位置。',
            '角色段只写与当前镜头相关的最小必要外观识别和动作关系。'
        ].join('\n'),
        createdAt: 5,
        updatedAt: 5
    },
    {
        id: 'transformer_banana_scene_judge',
        名称: 'GeminiBanana · 场景判定',
        类型: 'scene_judge',
        提示词: [
            '判断当前文本更适合风景场景还是故事快照。',
            '优先判断是否存在足够稳定的单帧视觉证据。',
            '如果地点、动作、在场人物、道具和空间关系至少有三项明确可见，且能归并成一个清晰瞬间，可考虑故事快照；否则改为风景场景。',
            '若文本更偏对话、回忆、情绪或抽象说明，一律回退为风景场景。',
            '即使判定通过，也要保持环境优先，避免人物占满画面。',
            '只输出“风景场景”或“故事快照”其中之一。'
        ].join('\n'),
        createdAt: 6,
        updatedAt: 6
    },
    {
        id: 'transformer_grok_npc',
        名称: 'Grok · NPC角色生成',
        类型: 'npc',
        提示词: [
            '你是 Grok 2D cinematic 角色提示词整理器。',
            '你的任务是把 NPC 资料整理成适合 Grok 的英文角色提示词。',
            '可使用更具电影感的描述式短语，但仍需保持可执行、可画、单帧稳定。',
            '若输入没有明确指定画风介质，不要擅自锁定二次元、写实、国风或摄影风格；只整理输入里已有的风格倾向。',
            '推荐顺序：角色主体 > 稳定外观 > 身材体态 > 服装与身份标志 > 道具 > 姿态动作 > 镜头景别 > 光影氛围 > 背景补充。',
            '请把性格、身份、压迫感、危险感转换成眼神、站姿、镜头角度、光源方向、轮廓对比和环境张力。',
            '保持人物辨识度，让电影感服务于角色识别和镜头清晰度。',
            '避免把多个镜头语法、多个动作重心和多个光源结构同时写入同一角色图。',
            '当资料有限时，可根据身份、境界、年龄、性别补全年龄感、轮廓气质、体态、常驻服饰、配饰与身份道具。'
        ].join('\n'),
        角色锚定模式提示词: [
            '角色稳定外观已经由锚点给定。',
            '请把输出重点放在镜头、姿态、表情、动作、光影张力、背景氛围、环境叙事和临时状态。',
            '不要重新发明锚点已经固定的外观基线。'
        ].join('\n'),
        无锚点回退提示词: [
            '请根据人物设定构建稳定外观，并保持克制、稳定、易识别。',
            '缺失信息请用稳妥外观补足，让电影感服务于角色一致性。',
            '请先稳住身份、外貌、身材、衣着，再补电影化镜头和光影。',
            '当资料只给出身份、境界、年龄、性别时，也要据此补出最稳妥的年龄感、轮廓、体态、衣着层次、配饰与身份道具。'
        ].join('\n'),
        输出格式提示词: [
            构建结构化词组输出格式提示词('grok_structured', 'npc'),
            'Grok 角色段应强化镜头、姿态、光源方向和情绪张力，但仍保持单一清晰动作。',
            '基础段负责整体镜头与环境倾向，角色段负责单体身份、外观、动作和与环境的关系。'
        ].join('\n'),
        createdAt: 7,
        updatedAt: 7
    },
    {
        id: 'transformer_grok_scene',
        名称: 'Grok · 场景生成',
        类型: 'scene',
        提示词: [
            '你是 Grok 2D cinematic 场景提示词整理器。',
            '你的任务是把场景信息整理成适合 Grok 的英文场景提示词。',
            '目标是生成带有电影叙事感、但仍然单帧稳定、可执行的场景图或故事快照。',
            '优先构建世界层级、景深、动作焦点和光源结构，让地点本身具有叙事性。',
            '人物服务于场景事件，环境层级与事件调度一起推进画面叙事。',
            '请保持一个主镜头、一个主要叙事焦点、一个主光源结构，避免同时塞入多个互斥场面。',
            '武侠和仙侠题材可以主动加入风、雾、气机、云层、碎叶、灯火、雨雪、余波等动态环境元素。'
        ].join('\n'),
        场景角色锚定模式提示词: [
            '角色基础外观由锚点提供。',
            '你应集中生成场景调度、人物站位、互动关系、镜头、天气、光影和史诗氛围。',
            '多人情况下优先表达关系、距离、方向、冲突感和环境张力。',
            '不要把完整角色肖像信息重复写进场景段。'
        ].join('\n'),
        无锚点回退提示词: [
            '请用少量人物外观帮助区分角色，但要继续保持大场景优先。',
            '复杂多人时优先降低人物细节密度，把容量留给环境和构图。',
            '请避免把场景图整理成多个人物海报元素的拼贴。'
        ].join('\n'),
        输出格式提示词: [
            构建结构化词组输出格式提示词('grok_structured', 'scene'),
            'Grok 场景图的基础段负责世界层级、景深和整体调度，角色段负责单个角色的电影化动作关系。',
            '角色段只写当前镜头需要的最小必要外观识别、站位和动作。'
        ].join('\n'),
        createdAt: 8,
        updatedAt: 8
    },
    {
        id: 'transformer_grok_scene_judge',
        名称: 'Grok · 场景判定',
        类型: 'scene_judge',
        提示词: [
            '判断当前文本更适合生成风景场景还是故事快照。',
            '优先寻找带有明确动作方向、人物站位、道具交互和环境细节的单一时刻。',
            '若正文更像情绪描写、纯对话、设定说明、回忆总结或多段连续动作，直接回退到风景场景。',
            '即使允许场景快照，也要确保环境和地点仍然是第一主体。',
            '优先选择稳定、可读、可执行的剧情瞬间。',
            '只输出“风景场景”或“故事快照”其中之一。'
        ].join('\n'),
        createdAt: 9,
        updatedAt: 9
    }
];

const 默认模型词组转化器预设列表: 模型词组转化器预设结构[] = [
    {
        id: 'transformer_model_bundle_nai',
        名称: 'NAI',
        是否启用: true,
        模型专属提示词: [
            '目标模型为 NovelAI V4/V4.5。',
            '输出采用 NovelAI 常用的英文 tags 习惯。',
            '若任务要求单角色图，则直接输出单个角色最终 tags；若任务要求场景图，则按基础段 + [序号]角色段组织。',
            '质量串、画风串、主体身份可以使用权重分组；动作、镜头、环境和临时状态保持自然标签表达，让画面更稳。',
            '若输入没有明确要求，不要擅自锁定二次元、写实、国风或摄影风格；只整理并强化已有风格线索。',
            '标签顺序保持稳定，信息容量均衡，避免同义重复，以及把多个镜头语法堆到一起。',
            '必须严格跟随任务要求给出的输出标签结构，不要自行改成带属性的 XML 角色标签。',
            '若 NPC 资料较少，可以根据身份、境界、年龄、性别做保守补全，但补全内容必须长期稳定、低冲突、易复用。'
        ].join('\n'),
        锚定模式模型提示词: [
            '目标模型为 NovelAI V4/V4.5。',
            '请沿用锚点中的稳定外观，把输出重点放在镜头、动作、姿态、构图、光影、环境和临时状态补充。',
            '不要把锚点已经固定的稳定外观重复展开成冗长角色段。'
        ].join('\n'),
        词组序列化策略: 'nai_character_segments',
        NPC词组转化器提示词预设ID: 'transformer_nai_npc',
        场景词组转化器提示词预设ID: 'transformer_nai_scene',
        场景判定提示词预设ID: 'transformer_nai_scene_judge',
        createdAt: 10,
        updatedAt: 10
    },
    {
        id: 'transformer_model_bundle_banana',
        名称: 'GeminiBanana',
        是否启用: false,
        模型专属提示词: [
            '目标模型为 Gemini Banana。',
            '输出更适合清晰、具体、可执行的英文描述式提示词，而不是纯 Danbooru 标签堆叠。',
            '请优先使用短英文短语或短句，不要使用 NovelAI 权重语法，不要堆砌过碎标签。',
            '若输入没有明确要求，不要擅自锁定二次元、写实、国风或摄影风格；只整理已有风格线索。',
            '描述要明确主体、服装、动作、镜头和环境，保持具体、可执行。',
            '基础段负责整体场景和镜头，角色段负责每个角色的完整可执行短语，并保持单镜头、单主动作、单主光源。',
            '若 NPC 资料较少，可以根据身份、境界、年龄、性别做保守补全，但补全内容必须长期稳定、低冲突、易复用。'
        ].join('\n'),
        锚定模式模型提示词: [
            '目标模型为 Gemini Banana。',
            '请沿用锚点中的稳定外观，把输出重点放在镜头、动作、姿态、表情、场景、气氛和临时变化补充。',
            '不要把锚点已确定的外观再次膨胀成大段重复描述。'
        ].join('\n'),
        词组序列化策略: 'gemini_structured',
        NPC词组转化器提示词预设ID: 'transformer_banana_npc',
        场景词组转化器提示词预设ID: 'transformer_banana_scene',
        场景判定提示词预设ID: 'transformer_banana_scene_judge',
        createdAt: 11,
        updatedAt: 11
    },
    {
        id: 'transformer_model_bundle_grok',
        名称: 'Grok',
        是否启用: false,
        模型专属提示词: [
            '目标模型为 Grok 的 2D cinematic 风格图像模型。',
            '允许更强的电影镜头感，但成图仍需保持单帧稳定、可执行、主体清晰。',
            '提示词需要兼顾叙事张力与可执行性，保持 cinematic illustration 的组织方式，而不是杂乱堆叠。',
            '若输入没有明确要求，不要擅自锁定二次元、写实、国风或摄影风格；只整理已有风格线索。',
            '在构图、光影和环境上可以更大胆，但仍要保持一个主镜头、一个主动作、一个主光源结构。',
            '让气势服务于主体识别度和镜头稳定性。',
            '基础段负责整体调度与光影，角色段负责每个角色的姿态、动作和镜头关系。',
            '若 NPC 资料较少，可以根据身份、境界、年龄、性别做保守补全，但补全内容必须长期稳定、低冲突、易复用。'
        ].join('\n'),
        锚定模式模型提示词: [
            '目标模型为 Grok 的 2D cinematic 风格图像模型。',
            '请沿用锚点中的稳定外观，把输出重点放在电影镜头、动作调度、姿态、光影和环境叙事。',
            '不要重复扩写锚点已经固定的核心外观。'
        ].join('\n'),
        词组序列化策略: 'grok_structured',
        NPC词组转化器提示词预设ID: 'transformer_grok_npc',
        场景词组转化器提示词预设ID: 'transformer_grok_scene',
        场景判定提示词预设ID: 'transformer_grok_scene_judge',
        createdAt: 12,
        updatedAt: 12
    }
];

export const 默认功能模型占位: 功能模型占位配置结构 = {
    主剧情使用模型: '',
    剧情回忆独立模型开关: false,
    剧情回忆静默确认: false,
    剧情回忆完整原文条数N: 20,
    剧情回忆最早触发回合: 10,
    记忆总结独立模型开关: false,
    世界演变独立模型开关: false,
    变量计算独立模型开关: false,
    规划分析独立模型开关: false,
    女主规划独立模型开关: false,
    剧情规划独立模型开关: false,
    文章优化独立模型开关: false,
    小说拆分功能启用: false,
    小说拆分独立模型开关: false,
    剧情回忆使用模型: '',
    剧情回忆API地址: '',
    剧情回忆API密钥: '',
    记忆总结使用模型: '',
    记忆总结API地址: '',
    记忆总结API密钥: '',
    世界演变使用模型: '',
    世界演变API地址: '',
    世界演变API密钥: '',
    变量计算使用模型: '',
    变量计算API地址: '',
    变量计算API密钥: '',
    规划分析使用模型: '',
    规划分析API地址: '',
    规划分析API密钥: '',
    女主规划使用模型: '',
    女主规划API地址: '',
    女主规划API密钥: '',
    剧情规划使用模型: '',
    剧情规划API地址: '',
    剧情规划API密钥: '',
    文章优化使用模型: '',
    文章优化API地址: '',
    文章优化API密钥: '',
    文章优化提示词: 默认文章优化提示词,
    小说拆分使用模型: '',
    小说拆分API地址: '',
    小说拆分API密钥: '',
    小说拆分RPM限制: 10,
    小说拆分按N章分组: 5,
    小说拆分单次处理批量: 1,
    小说拆分自动重试次数: 0,
    小说拆分后台运行: true,
    小说拆分自动续跑: true,
    小说拆分主剧情注入: true,
    小说拆分规划分析注入: true,
    小说拆分世界演变注入: true,
    小说拆分主剧情注入上限: 1200,
    小说拆分详细注入上限: 4000,
    文生图功能启用: false,
    文生图后端类型: 'openai',
    文生图模型使用模型: '',
    文生图模型API地址: '',
    文生图模型API密钥: '',
    图片后端注册表地址: '',
    当前图片后端发现ID: '',
    ComfyUI工作流JSON: '',
    场景生图独立接口启用: false,
    场景生图后端类型: 'openai',
    场景生图模型使用模型: '',
    场景生图模型API地址: '',
    场景生图模型API密钥: '',
    当前场景图片后端发现ID: '',
    场景ComfyUI工作流JSON: '',
    文生图接口路径模式: 'preset',
    文生图预设接口路径: 'openai_images',
    文生图接口路径: '',
    文生图响应格式: 'url',
    文生图OpenAI自定义格式: false,
    画师串预设列表: [],
    当前NPC画师串预设ID: '',
    当前场景画师串预设ID: '',
    当前NPCPNG画风预设ID: '',
    当前场景PNG画风预设ID: '',
    自动NPC生图画风: '通用',
    自动场景生图画风: '通用',
    自动场景生图构图要求: '纯场景',
        自动场景生图横竖屏: '横屏',
        自动场景生图分辨率: '1024x576',
    NovelAI启用自定义参数: false,
    NovelAI采样器: 'k_euler_ancestral',
    NovelAI噪点表: 'karras',
    NovelAI步数: 28,
    NovelAI负面提示词: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
    NPC生图使用词组转化器: true,
    词组转化兼容模式: false,
    香闺秘档特写强制裸体语义: false,
    词组转化器启用独立模型: false,
    词组转化器使用模型: '',
    词组转化器API地址: '',
    词组转化器API密钥: '',
    词组转化器提示词: '',
    模型词组转化器预设列表: 默认模型词组转化器预设列表,
    词组转化器提示词预设列表: 默认词组转化器提示词预设列表,
    当前NAI词组转化器提示词预设ID: 'transformer_nai_npc',
    当前NPC词组转化器提示词预设ID: 'transformer_banana_npc',
    当前场景词组转化器提示词预设ID: 'transformer_banana_scene',
    当前场景判定提示词预设ID: 'transformer_banana_scene_judge',
    角色锚点列表: [],
    当前角色锚点ID: '',
    PNG画风预设列表: [],
    当前PNG画风预设ID: '',
    PNG提炼启用独立模型: false,
    PNG提炼使用模型: '',
    PNG提炼API地址: '',
    PNG提炼API密钥: '',
    场景生图启用: false,
    NPC生图启用: false,
    NPC生图性别筛选: '全部',
    NPC生图重要性筛选: '全部'
};

const 供应商默认值: Record<接口供应商类型, { baseUrl: string; model: string }> = {
    gemini: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-2.0-flash'
    },
    claude: {
        baseUrl: '',
        model: 'claude-3-5-sonnet-latest'
    },
    openai: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini'
    },
    deepseek: {
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat'
    },
    zhipu: {
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        model: 'glm-4-flash'
    },
    openai_compatible: {
        baseUrl: '',
        model: 'gpt-4o-mini'
    }
};

const 生成配置ID = (): string => `api_cfg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const 生成预设ID = (prefix: string): string => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const 读取字符串 = (value: unknown, fallback = ''): string => {
    return typeof value === 'string' ? value : fallback;
};

const 标准化字符串列表 = (value: unknown): string[] | undefined => {
    const list = Array.isArray(value) ? value : [];
    const normalized = list
        .map((item) => 读取字符串(item).trim())
        .filter(Boolean);
    return normalized.length > 0 ? normalized : undefined;
};

const 读取正整数 = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    if (typeof value === 'string') {
        const cleaned = value.trim();
        if (!cleaned) return undefined;
        const parsed = Number(cleaned);
        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.floor(parsed);
        }
    }
    return undefined;
};

const 读取温度值 = (value: unknown): number | undefined => {
    const 归一化 = (raw: number): number | undefined => {
        if (!Number.isFinite(raw)) return undefined;
        if (raw < 0 || raw > 2) return undefined;
        return Math.round(raw * 100) / 100;
    };

    if (typeof value === 'number') return 归一化(value);
    if (typeof value === 'string') {
        const cleaned = value.trim();
        if (!cleaned) return undefined;
        const parsed = Number(cleaned);
        return 归一化(parsed);
    }
    return undefined;
};

const 标准化画师串预设适用范围 = (value: unknown): 画师串预设适用范围类型 => {
    if (value === 'npc' || value === 'scene' || value === 'all') return value;
    return 'all';
};

const 标准化词组转化器提示词预设类型 = (value: unknown): 词组转化器提示词预设类型 => {
    if (value === 'nai' || value === 'npc' || value === 'scene' || value === 'scene_judge') return value;
    return 'npc';
};

const 标准化画师串预设列表 = (raw: unknown): 画师串预设结构[] => {
    const now = Date.now();
    const list = Array.isArray(raw) ? raw : [];
    const normalized = list
        .map((item, index) => {
            const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
            const 画师串 = 读取字符串(source?.画师串 ?? source?.artistPrompt ?? source?.artist).trim();
            const 正面提示词 = 读取字符串(source?.正面提示词 ?? source?.positivePrompt).trim();
            const 负面提示词 = 读取字符串(source?.负面提示词 ?? source?.negativePrompt).trim();
            if (!画师串 && !正面提示词 && !负面提示词) return null;
            const id = 读取字符串(source?.id).trim() || 生成预设ID('artist_preset');
            const 名称 = 读取字符串(source?.名称 ?? source?.name, `画师串预设 ${index + 1}`).trim() || `画师串预设 ${index + 1}`;
            const createdAt = typeof source?.createdAt === 'number' && Number.isFinite(source.createdAt) ? source.createdAt : now;
            const updatedAt = typeof source?.updatedAt === 'number' && Number.isFinite(source.updatedAt) ? source.updatedAt : now;
            return {
                id,
                名称,
                适用范围: 标准化画师串预设适用范围(source?.适用范围 ?? source?.scope),
                画师串,
                正面提示词,
                负面提示词,
                createdAt,
                updatedAt
            } satisfies 画师串预设结构;
        })
        .filter((item): item is 画师串预设结构 => Boolean(item));
    return normalized;
};

const 标准化PNG画风预设列表 = (raw: unknown): PNG画风预设结构[] => {
    const now = Date.now();
    const list = Array.isArray(raw) ? raw : [];
    return list
        .map((item, index) => {
            const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
            const 原始正面提示词 = 读取字符串(source?.原始正面提示词 ?? source?.rawPositivePrompt).trim();
            const 剥离后正面提示词 = 读取字符串(source?.剥离后正面提示词 ?? source?.strippedPositivePrompt).trim();
            const AI提炼正面提示词 = 读取字符串(source?.AI提炼正面提示词 ?? source?.refinedPositivePrompt).trim();
            const 正面提示词 = 读取字符串(source?.正面提示词 ?? source?.positivePrompt).trim();
            const 负面提示词 = 读取字符串(source?.负面提示词 ?? source?.negativePrompt).trim();
            const 画师串 = 读取字符串(source?.画师串 ?? source?.artistPrompt ?? source?.artist).trim();
            const artistHitsRaw = source?.画师命中项 ?? source?.artistHits;
            const 画师命中项 = Array.isArray(artistHitsRaw)
                ? artistHitsRaw
                    .map((entry) => 读取字符串(entry).trim())
                    .filter(Boolean)
                : [];
            if (!原始正面提示词 && !剥离后正面提示词 && !AI提炼正面提示词 && !正面提示词 && !负面提示词 && !画师串) return null;
            const id = 读取字符串(source?.id).trim() || 生成预设ID('png_preset');
            const 名称 = 读取字符串(source?.名称 ?? source?.name, `PNG预设 ${index + 1}`).trim() || `PNG预设 ${index + 1}`;
            const createdAt = typeof source?.createdAt === 'number' && Number.isFinite(source.createdAt) ? source.createdAt : now;
            const updatedAt = typeof source?.updatedAt === 'number' && Number.isFinite(source.updatedAt) ? source.updatedAt : now;
            const 参数 = typeof source?.参数 === 'object' && source?.参数
                ? {
                    ...(source.参数 as PNG画风预设结构['参数']),
                    宽度: undefined,
                    高度: undefined,
                    随机种子: undefined
                }
                : undefined;
            return {
                id,
                名称,
                来源: source?.来源 === 'novelai' || source?.来源 === 'sd_webui' ? source.来源 : 'unknown',
                原始正面提示词,
                剥离后正面提示词,
                AI提炼正面提示词,
                正面提示词,
                负面提示词,
                画师串,
                画师命中项,
                优先复刻原参数: source?.优先复刻原参数 === true || source?.preferReusePngParams === true,
                参数,
                封面: 读取字符串(source?.封面 ?? source?.cover ?? source?.coverDataUrl).trim() || undefined,
                原始元数据: 读取字符串(source?.原始元数据 ?? source?.rawMetadata).trim() || undefined,
                元数据标签: typeof source?.元数据标签 === 'object' && source?.元数据标签 ? source.元数据标签 as Record<string, string> : undefined,
                createdAt,
                updatedAt
            } as PNG画风预设结构;
        })
        .filter((item): item is PNG画风预设结构 => Boolean(item));
};

const 标准化角色锚点特征 = (raw: unknown): 角色锚点特征结构 | undefined => {
    if (!raw || typeof raw !== 'object') return undefined;
    const source = raw as Record<string, unknown>;
    const normalized: 角色锚点特征结构 = {
        外貌标签: 标准化字符串列表(source?.外貌标签 ?? source?.appearanceTags),
        身材标签: 标准化字符串列表(source?.身材标签 ?? source?.bodyTags),
        胸部标签: 标准化字符串列表(source?.胸部标签 ?? source?.bustTags),
        发型标签: 标准化字符串列表(source?.发型标签 ?? source?.hairStyleTags),
        发色标签: 标准化字符串列表(source?.发色标签 ?? source?.hairColorTags),
        眼睛标签: 标准化字符串列表(source?.眼睛标签 ?? source?.eyeTags),
        肤色标签: 标准化字符串列表(source?.肤色标签 ?? source?.skinTags),
        年龄感标签: 标准化字符串列表(source?.年龄感标签 ?? source?.ageTags),
        服装基底标签: 标准化字符串列表(source?.服装基底标签 ?? source?.outfitBaseTags),
        特殊特征标签: 标准化字符串列表(source?.特殊特征标签 ?? source?.specialTags)
    };
    return Object.values(normalized).some((item) => Array.isArray(item) && item.length > 0) ? normalized : undefined;
};

const 标准化角色锚点列表 = (raw: unknown): 角色锚点结构[] => {
    const now = Date.now();
    const list = Array.isArray(raw) ? raw : [];
    return list
        .map((item, index) => {
            const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
            const 正面提示词 = 读取字符串(source?.正面提示词 ?? source?.positivePrompt).trim();
            const 负面提示词 = 读取字符串(source?.负面提示词 ?? source?.negativePrompt).trim();
            const npcId = 读取字符串(source?.npcId ?? source?.NPCID).trim();
            if (!npcId || (!正面提示词 && !负面提示词)) return null;
            const id = 读取字符串(source?.id).trim() || 生成预设ID('character_anchor');
            const 名称 = 读取字符串(source?.名称 ?? source?.name, `角色锚点 ${index + 1}`).trim() || `角色锚点 ${index + 1}`;
            const createdAt = typeof source?.createdAt === 'number' && Number.isFinite(source.createdAt) ? source.createdAt : now;
            const updatedAt = typeof source?.updatedAt === 'number' && Number.isFinite(source.updatedAt) ? source.updatedAt : now;
            return {
                id,
                npcId,
                名称,
                是否启用: source?.是否启用 !== false && source?.enabled !== false,
                生成时默认附加: source?.生成时默认附加 === true || source?.defaultApply === true,
                场景生图自动注入: source?.场景生图自动注入 === true || source?.autoInjectForScene === true,
                正面提示词,
                负面提示词,
                结构化特征: 标准化角色锚点特征(source?.结构化特征 ?? source?.features),
                来源: source?.来源 === 'manual' || source?.来源 === 'imported' ? source.来源 : 'ai_extract',
                原始提取文本: 读取字符串(source?.原始提取文本 ?? source?.rawExtractedText).trim() || undefined,
                提取模型信息: 读取字符串(source?.提取模型信息 ?? source?.extractModelInfo).trim() || undefined,
                createdAt,
                updatedAt
            } satisfies 角色锚点结构;
        })
        .filter(Boolean) as 角色锚点结构[];
};

const 标准化词组转化器提示词预设列表 = (raw: unknown): 词组转化器提示词预设结构[] => {
    const now = Date.now();
    const list = Array.isArray(raw) ? raw : [];
    const normalized = list
        .map((item, index) => {
            const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
            const 提示词 = 读取字符串(source?.提示词 ?? source?.prompt).trim();
            if (!提示词) return null;
            const id = 读取字符串(source?.id).trim() || 生成预设ID('transformer_preset');
            const 名称 = 读取字符串(source?.名称 ?? source?.name, `词组提示词预设 ${index + 1}`).trim() || `词组提示词预设 ${index + 1}`;
            const createdAt = typeof source?.createdAt === 'number' && Number.isFinite(source.createdAt) ? source.createdAt : now;
            const updatedAt = typeof source?.updatedAt === 'number' && Number.isFinite(source.updatedAt) ? source.updatedAt : now;
            return {
                id,
                名称,
                类型: 标准化词组转化器提示词预设类型(source?.类型 ?? source?.scope),
                提示词,
                角色锚定模式提示词: 读取字符串(source?.角色锚定模式提示词 ?? source?.anchorPrompt).trim() || undefined,
                场景角色锚定模式提示词: 读取字符串(source?.场景角色锚定模式提示词 ?? source?.sceneAnchorPrompt).trim() || undefined,
                无锚点回退提示词: 读取字符串(source?.无锚点回退提示词 ?? source?.fallbackPrompt).trim() || undefined,
                输出格式提示词: 读取字符串(source?.输出格式提示词 ?? source?.outputFormatPrompt).trim() || undefined,
                createdAt,
                updatedAt
            } satisfies 词组转化器提示词预设结构;
        })
        .filter(Boolean) as 词组转化器提示词预设结构[];
    const mergedMap = new Map<string, 词组转化器提示词预设结构>();
    [...默认词组转化器提示词预设列表, ...normalized].forEach((item) => {
        mergedMap.set(item.id, item);
    });
    return Array.from(mergedMap.values());
};

const 标准化模型词组转化器预设列表 = (
    raw: unknown,
    promptPresets: 词组转化器提示词预设结构[]
): 模型词组转化器预设结构[] => {
    const now = Date.now();
    const list = Array.isArray(raw) ? raw : [];
    const normalized = list
        .map((item, index) => {
            const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
            const id = 读取字符串(source?.id).trim() || 生成预设ID('transformer_model');
            const 名称 = 读取字符串(source?.名称 ?? source?.name, `模型预设 ${index + 1}`).trim() || `模型预设 ${index + 1}`;
            const createdAt = typeof source?.createdAt === 'number' && Number.isFinite(source.createdAt) ? source.createdAt : now;
            const updatedAt = typeof source?.updatedAt === 'number' && Number.isFinite(source.updatedAt) ? source.updatedAt : now;
            const npcPresetId = 选取有效预设ID(
                promptPresets.filter((preset) => preset.类型 === 'npc'),
                source?.NPC词组转化器提示词预设ID ?? source?.npcPresetId,
                (preset) => preset.id === 'transformer_banana_npc'
            );
            const scenePresetId = 选取有效预设ID(
                promptPresets.filter((preset) => preset.类型 === 'scene'),
                source?.场景词组转化器提示词预设ID ?? source?.scenePresetId,
                (preset) => preset.id === 'transformer_banana_scene'
            );
            const sceneJudgePresetId = 选取有效预设ID(
                promptPresets.filter((preset) => preset.类型 === 'scene_judge'),
                source?.场景判定提示词预设ID ?? source?.sceneJudgePresetId,
                (preset) => preset.id === 'transformer_banana_scene_judge'
            );
            return {
                id,
                名称,
                是否启用: typeof source?.是否启用 === 'boolean' ? source.是否启用 : source?.enabled === true,
                模型专属提示词: 读取字符串(source?.模型专属提示词 ?? source?.modelPrompt ?? source?.prompt).trim(),
                锚定模式模型提示词: 读取字符串(source?.锚定模式模型提示词 ?? source?.anchorModelPrompt).trim() || undefined,
                NPC词组转化器提示词预设ID: npcPresetId,
                场景词组转化器提示词预设ID: scenePresetId,
                场景判定提示词预设ID: sceneJudgePresetId,
                createdAt,
                updatedAt
            } satisfies 模型词组转化器预设结构;
        })
        .filter(Boolean) as 模型词组转化器预设结构[];
    const 最后启用的原始预设ID = normalized
        .filter((item) => item.是否启用 === true)
        .slice(-1)[0]?.id || '';
    const mergedMap = new Map<string, 模型词组转化器预设结构>();
    [...默认模型词组转化器预设列表, ...normalized].forEach((item) => {
        mergedMap.set(item.id, item);
    });
    return Array.from(mergedMap.values()).map((item) => ({
        ...item,
        是否启用: 最后启用的原始预设ID
            ? item.id === 最后启用的原始预设ID
            : item.是否启用 === true
    }));
};

const 选取有效预设ID = <T extends { id: string }>(list: T[], candidate: unknown, fallback?: (item: T) => boolean): string => {
    const id = 读取字符串(candidate).trim();
    if (id && list.some((item) => item.id === id)) return id;
    if (fallback) return list.find(fallback)?.id || '';
    return list[0]?.id || '';
};

export const 推断供应商 = (baseUrlRaw: unknown): 接口供应商类型 => {
    const baseUrl = 读取字符串(baseUrlRaw).toLowerCase();
    if (!baseUrl) return 'openai';
    if (baseUrl.includes('generativelanguage.googleapis.com') || baseUrl.includes('googleapis.com')) return 'gemini';
    if (baseUrl.includes('deepseek')) return 'deepseek';
    if (baseUrl.includes('bigmodel.cn') || baseUrl.includes('open.bigmodel.cn')) return 'zhipu';
    if (baseUrl.includes('anthropic') || baseUrl.includes('claude')) return 'claude';
    if (baseUrl.includes('siliconflow') || baseUrl.includes('together') || baseUrl.includes('groq')) {
        return 'openai_compatible';
    }
    if (baseUrl.includes('openai')) return 'openai';
    return 'openai_compatible';
};

const 标准化供应商 = (value: unknown, fallback: 接口供应商类型): 接口供应商类型 => {
    if (value === 'gemini' || value === 'claude' || value === 'openai' || value === 'deepseek' || value === 'zhipu' || value === 'openai_compatible') {
        return value;
    }
    return fallback;
};

const 读取布尔值 = (value: unknown): boolean | undefined => {
    if (typeof value === 'boolean') return value;
    return undefined;
};

const 标准化兼容方案 = (value: unknown): OpenAI兼容方案类型 => {
    if (value === 'custom' || value === 'siliconflow' || value === 'together' || value === 'groq') {
        return value;
    }
    return 'custom';
};

const 标准化协议覆盖 = (value: unknown): 请求协议覆盖类型 => {
    if (value === 'auto' || value === 'openai' || value === 'gemini' || value === 'claude' || value === 'deepseek') {
        return value;
    }
    return 'auto';
};

const 标准化单配置 = (raw: any, index: number): 单接口配置结构 => {
    const now = Date.now();
    const fallbackSupplier = 推断供应商(raw?.baseUrl);
    const supplier = 标准化供应商(raw?.供应商 ?? raw?.provider, fallbackSupplier);
    const compatiblePreset = 标准化兼容方案(raw?.兼容方案 ?? raw?.compatiblePreset);
    const defaultPreset = 供应商默认值[supplier];

    const id = 读取字符串(raw?.id).trim() || 生成配置ID();
    const nameFallback = `${供应商标签[supplier]} 配置 ${index + 1}`;
    const name = 读取字符串(raw?.名称 ?? raw?.name, nameFallback).trim() || nameFallback;
    const baseUrl = 读取字符串(raw?.baseUrl, defaultPreset.baseUrl).trim();
    const apiKey = 读取字符串(raw?.apiKey).trim();
    const model = 读取字符串(raw?.model, defaultPreset.model).trim() || defaultPreset.model;
    const maxTokens = 读取正整数(raw?.maxTokens ?? raw?.max_tokens);
    const temperature = 读取温度值(raw?.temperature);
    const 协议覆盖 = 标准化协议覆盖(raw?.协议覆盖 ?? raw?.protocolOverride);

    const createdAt = typeof raw?.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now;
    const updatedAt = typeof raw?.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now;

    return {
        id,
        名称: name,
        供应商: supplier,
        兼容方案: supplier === 'openai_compatible' ? compatiblePreset : undefined,
        协议覆盖,
        baseUrl,
        apiKey,
        model,
        maxTokens,
        temperature,
        createdAt,
        updatedAt
    };
};

const 标准化功能模型占位 = (raw: any): 功能模型占位配置结构 => {
    const polishPromptCandidate = typeof raw?.文章优化提示词 === 'string' ? raw.文章优化提示词 : '';
    const legacyPlanningEnabled = Boolean(raw?.剧情规划独立模型开关) || Boolean(raw?.女主规划独立模型开关);
    const legacyPlanningModel = 读取字符串(raw?.剧情规划使用模型 || raw?.女主规划使用模型);
    const legacyPlanningBaseUrl = 读取字符串(raw?.剧情规划API地址 || raw?.女主规划API地址);
    const legacyPlanningApiKey = 读取字符串(raw?.剧情规划API密钥 || raw?.女主规划API密钥);
    const 画师串预设列表 = 标准化画师串预设列表(raw?.画师串预设列表);
    const 词组转化器提示词预设列表 = 标准化词组转化器提示词预设列表(raw?.词组转化器提示词预设列表);
    const 模型词组转化器预设列表 = 标准化模型词组转化器预设列表(raw?.模型词组转化器预设列表, 词组转化器提示词预设列表);
    const 角色锚点列表 = 标准化角色锚点列表(raw?.角色锚点列表 ?? raw?.characterAnchors);
    const PNG画风预设列表 = 标准化PNG画风预设列表(raw?.PNG画风预设列表 ?? raw?.pngPresets ?? raw?.png_style_presets);
    const 当前NPC画师串预设ID = (() => {
        if (Object.prototype.hasOwnProperty.call(raw || {}, '当前NPC画师串预设ID')) {
            const rawId = 读取字符串(raw?.当前NPC画师串预设ID).trim();
            if (rawId === '') return '';
        }
        return 选取有效预设ID(
            画师串预设列表.filter((item) => item.适用范围 === 'npc' || item.适用范围 === 'all'),
            raw?.当前NPC画师串预设ID
        );
    })();
    const 当前场景画师串预设ID = (() => {
        if (Object.prototype.hasOwnProperty.call(raw || {}, '当前场景画师串预设ID')) {
            const rawId = 读取字符串(raw?.当前场景画师串预设ID).trim();
            if (rawId === '') return '';
        }
        return 选取有效预设ID(
            画师串预设列表.filter((item) => item.适用范围 === 'scene' || item.适用范围 === 'all'),
            raw?.当前场景画师串预设ID
        );
    })();
    const 当前NPCPNG画风预设ID = (() => {
        const rawId = 读取字符串(raw?.当前NPCPNG画风预设ID ?? raw?.currentNpcPngPresetId).trim();
        if (rawId) return rawId;
        return 读取字符串(raw?.当前PNG画风预设ID ?? raw?.currentPngPresetId).trim();
    })();
    const 当前场景PNG画风预设ID = (() => {
        const rawId = 读取字符串(raw?.当前场景PNG画风预设ID ?? raw?.currentScenePngPresetId).trim();
        if (rawId) return rawId;
        return 读取字符串(raw?.当前PNG画风预设ID ?? raw?.currentPngPresetId).trim();
    })();
    const 当前NAI词组转化器提示词预设ID = (() => {
        if (!Object.prototype.hasOwnProperty.call(raw || {}, '当前NAI词组转化器提示词预设ID')) {
            return 'transformer_nai_npc';
        }
        const rawId = 读取字符串(raw?.当前NAI词组转化器提示词预设ID).trim();
        if (rawId === '') return '';
        return 选取有效预设ID(
            词组转化器提示词预设列表.filter((item) => item.类型 === 'nai' || item.类型 === 'npc'),
            rawId
        ) || 'transformer_nai_npc';
    })();
    const 当前NPC词组转化器提示词预设ID = (() => {
        if (!Object.prototype.hasOwnProperty.call(raw || {}, '当前NPC词组转化器提示词预设ID')) {
            return 'transformer_banana_npc';
        }
        const rawId = 读取字符串(raw?.当前NPC词组转化器提示词预设ID).trim();
        if (rawId === '') return '';
        return 选取有效预设ID(
            词组转化器提示词预设列表.filter((item) => item.类型 === 'npc'),
            rawId
        ) || 'transformer_banana_npc';
    })();
    const 当前场景词组转化器提示词预设ID = (() => {
        if (!Object.prototype.hasOwnProperty.call(raw || {}, '当前场景词组转化器提示词预设ID')) {
            return 'transformer_banana_scene';
        }
        const rawId = 读取字符串(raw?.当前场景词组转化器提示词预设ID).trim();
        if (rawId === '') return '';
        return 选取有效预设ID(
            词组转化器提示词预设列表.filter((item) => item.类型 === 'scene'),
            rawId
        ) || 'transformer_banana_scene';
    })();
    const 当前场景判定提示词预设ID = (() => {
        if (!Object.prototype.hasOwnProperty.call(raw || {}, '当前场景判定提示词预设ID')) {
            return 'transformer_banana_scene_judge';
        }
        const rawId = 读取字符串(raw?.当前场景判定提示词预设ID).trim();
        if (rawId === '') return '';
        return 选取有效预设ID(
            词组转化器提示词预设列表.filter((item) => item.类型 === 'scene_judge'),
            rawId
        ) || 'transformer_banana_scene_judge';
    })();
    return {
        主剧情使用模型: 读取字符串(raw?.主剧情使用模型),
        剧情回忆独立模型开关: Boolean(raw?.剧情回忆独立模型开关),
        剧情回忆静默确认: Boolean(raw?.剧情回忆静默确认),
        剧情回忆完整原文条数N: Math.max(1, Number(raw?.剧情回忆完整原文条数N) || 20),
        剧情回忆最早触发回合: Math.max(1, Number(raw?.剧情回忆最早触发回合) || 10),
        记忆总结独立模型开关: Boolean(raw?.记忆总结独立模型开关),
        世界演变独立模型开关: Boolean(raw?.世界演变独立模型开关),
        变量计算独立模型开关: Boolean(raw?.变量计算独立模型开关),
        规划分析独立模型开关: 读取布尔值(raw?.规划分析独立模型开关) ?? legacyPlanningEnabled,
        女主规划独立模型开关: Boolean(raw?.女主规划独立模型开关),
        剧情规划独立模型开关: Boolean(raw?.剧情规划独立模型开关),
        文章优化独立模型开关: Boolean(raw?.文章优化独立模型开关),
        小说拆分功能启用: Boolean(raw?.小说拆分功能启用),
        小说拆分独立模型开关: Boolean(raw?.小说拆分独立模型开关),
        剧情回忆使用模型: 读取字符串(raw?.剧情回忆使用模型),
        剧情回忆API地址: 读取字符串(raw?.剧情回忆API地址),
        剧情回忆API密钥: 读取字符串(raw?.剧情回忆API密钥),
        记忆总结使用模型: 读取字符串(raw?.记忆总结使用模型),
        记忆总结API地址: 读取字符串(raw?.记忆总结API地址),
        记忆总结API密钥: 读取字符串(raw?.记忆总结API密钥),
        世界演变使用模型: 读取字符串(raw?.世界演变使用模型),
        世界演变API地址: 读取字符串(raw?.世界演变API地址),
        世界演变API密钥: 读取字符串(raw?.世界演变API密钥),
        变量计算使用模型: 读取字符串(raw?.变量计算使用模型),
        变量计算API地址: 读取字符串(raw?.变量计算API地址),
        变量计算API密钥: 读取字符串(raw?.变量计算API密钥),
        规划分析使用模型: 读取字符串(raw?.规划分析使用模型 || legacyPlanningModel),
        规划分析API地址: 读取字符串(raw?.规划分析API地址 || legacyPlanningBaseUrl),
        规划分析API密钥: 读取字符串(raw?.规划分析API密钥 || legacyPlanningApiKey),
        女主规划使用模型: 读取字符串(raw?.女主规划使用模型),
        女主规划API地址: 读取字符串(raw?.女主规划API地址),
        女主规划API密钥: 读取字符串(raw?.女主规划API密钥),
        剧情规划使用模型: 读取字符串(raw?.剧情规划使用模型),
        剧情规划API地址: 读取字符串(raw?.剧情规划API地址),
        剧情规划API密钥: 读取字符串(raw?.剧情规划API密钥),
        文章优化使用模型: 读取字符串(raw?.文章优化使用模型),
        文章优化API地址: 读取字符串(raw?.文章优化API地址),
        文章优化API密钥: 读取字符串(raw?.文章优化API密钥),
        文章优化提示词: polishPromptCandidate.trim().length > 0 ? polishPromptCandidate : 默认文章优化提示词,
        小说拆分使用模型: 读取字符串(raw?.小说拆分使用模型),
        小说拆分API地址: 读取字符串(raw?.小说拆分API地址),
        小说拆分API密钥: 读取字符串(raw?.小说拆分API密钥),
        小说拆分RPM限制: Math.max(1, Number(raw?.小说拆分RPM限制) || 10),
        小说拆分按N章分组: Math.max(1, Number(raw?.小说拆分按N章分组) || 5),
        小说拆分单次处理批量: Math.max(1, Number(raw?.小说拆分单次处理批量) || 1),
        小说拆分自动重试次数: Math.max(0, Number(raw?.小说拆分自动重试次数) || 0),
        小说拆分后台运行: 读取布尔值(raw?.小说拆分后台运行) ?? true,
        小说拆分自动续跑: 读取布尔值(raw?.小说拆分自动续跑) ?? true,
        小说拆分主剧情注入: 读取布尔值(raw?.小说拆分主剧情注入) ?? true,
        小说拆分规划分析注入: 读取布尔值(raw?.小说拆分规划分析注入) ?? true,
        小说拆分世界演变注入: 读取布尔值(raw?.小说拆分世界演变注入) ?? true,
        小说拆分主剧情注入上限: Math.max(
            200,
            Number(raw?.小说拆分主剧情注入上限)
            || Number(raw?.小说拆分主剧情滑窗安全上限)
            || 1200
        ),
        小说拆分详细注入上限: Math.max(500, Number(raw?.小说拆分详细注入上限) || 4000),
        文生图功能启用: Boolean(raw?.文生图功能启用),
        文生图后端类型: raw?.文生图后端类型 === 'novelai' || raw?.文生图后端类型 === 'sd_webui' || raw?.文生图后端类型 === 'comfyui'
            ? raw.文生图后端类型
            : 'openai',
        文生图模型使用模型: 读取字符串(raw?.文生图模型使用模型),
        文生图模型API地址: 读取字符串(raw?.文生图模型API地址),
        文生图模型API密钥: 读取字符串(raw?.文生图模型API密钥),
        图片后端注册表地址: 读取字符串(raw?.图片后端注册表地址),
        当前图片后端发现ID: 读取字符串(raw?.当前图片后端发现ID),
        ComfyUI工作流JSON: 读取字符串(raw?.ComfyUI工作流JSON),
        场景生图独立接口启用: Boolean(raw?.场景生图独立接口启用),
        场景生图后端类型: raw?.场景生图后端类型 === 'novelai' || raw?.场景生图后端类型 === 'sd_webui' || raw?.场景生图后端类型 === 'comfyui'
            ? raw.场景生图后端类型
            : 'openai',
        场景生图模型使用模型: 读取字符串(raw?.场景生图模型使用模型),
        场景生图模型API地址: 读取字符串(raw?.场景生图模型API地址),
        场景生图模型API密钥: 读取字符串(raw?.场景生图模型API密钥),
        当前场景图片后端发现ID: 读取字符串(raw?.当前场景图片后端发现ID),
        场景ComfyUI工作流JSON: 读取字符串(raw?.场景ComfyUI工作流JSON),
        文生图接口路径模式: raw?.文生图接口路径模式 === 'custom' ? 'custom' : 'preset',
        文生图预设接口路径: raw?.文生图预设接口路径 === 'openai_chat'
            || raw?.文生图预设接口路径 === 'novelai_generate'
            || raw?.文生图预设接口路径 === 'sd_txt2img'
            || raw?.文生图预设接口路径 === 'comfyui_prompt'
            ? raw.文生图预设接口路径
            : 'openai_images',
        文生图接口路径: 读取字符串(raw?.文生图接口路径),
        文生图响应格式: raw?.文生图响应格式 === 'b64_json' ? 'b64_json' : 'url',
        文生图OpenAI自定义格式: Boolean(raw?.文生图OpenAI自定义格式),
        画师串预设列表,
        当前NPC画师串预设ID,
        当前场景画师串预设ID,
        当前NPCPNG画风预设ID,
        当前场景PNG画风预设ID,
        自动NPC生图画风: raw?.自动NPC生图画风 === '二次元' || raw?.自动NPC生图画风 === '写实' || raw?.自动NPC生图画风 === '国风'
            ? raw.自动NPC生图画风
            : '通用',
        自动场景生图画风: raw?.自动场景生图画风 === '二次元' || raw?.自动场景生图画风 === '写实' || raw?.自动场景生图画风 === '国风'
            ? raw.自动场景生图画风
            : '通用',
        自动场景生图构图要求: raw?.自动场景生图构图要求 === '故事快照' || raw?.自动场景生图构图要求 === '纯场景'
            ? raw.自动场景生图构图要求
            : '纯场景',
        自动场景生图横竖屏: raw?.自动场景生图横竖屏 === '竖屏' || raw?.自动场景生图横竖屏 === '横屏'
            ? raw.自动场景生图横竖屏
            : '横屏',
        自动场景生图分辨率: 读取字符串(raw?.自动场景生图分辨率).trim() || '1024x576',
        NovelAI启用自定义参数: Boolean(raw?.NovelAI启用自定义参数),
        NovelAI采样器: raw?.NovelAI采样器 === 'k_euler'
            || raw?.NovelAI采样器 === 'k_euler_ancestral'
            || raw?.NovelAI采样器 === 'k_dpmpp_2m'
            || raw?.NovelAI采样器 === 'k_dpmpp_2s_ancestral'
            || raw?.NovelAI采样器 === 'k_dpmpp_sde'
            || raw?.NovelAI采样器 === 'k_dpmpp_2m_sde'
            ? raw.NovelAI采样器
            : 'k_euler_ancestral',
        NovelAI噪点表: raw?.NovelAI噪点表 === 'native'
            || raw?.NovelAI噪点表 === 'karras'
            || raw?.NovelAI噪点表 === 'exponential'
            || raw?.NovelAI噪点表 === 'polyexponential'
            ? raw.NovelAI噪点表
            : 'karras',
        NovelAI步数: Math.max(1, Math.min(50, Number(raw?.NovelAI步数) || 28)),
        NovelAI负面提示词: 读取字符串(raw?.NovelAI负面提示词),
        NPC生图使用词组转化器: raw?.文生图后端类型 === 'novelai' ? true : raw?.NPC生图使用词组转化器 !== false,
        词组转化兼容模式: raw?.词组转化兼容模式 === true,
        香闺秘档特写强制裸体语义: raw?.香闺秘档特写强制裸体语义 === true,
        词组转化器启用独立模型: Boolean(raw?.词组转化器启用独立模型),
        词组转化器使用模型: 读取字符串(raw?.词组转化器使用模型),
        词组转化器API地址: 读取字符串(raw?.词组转化器API地址),
        词组转化器API密钥: 读取字符串(raw?.词组转化器API密钥),
        词组转化器提示词: '',
        模型词组转化器预设列表,
        词组转化器提示词预设列表,
        当前NAI词组转化器提示词预设ID,
        当前NPC词组转化器提示词预设ID,
        当前场景词组转化器提示词预设ID,
        当前场景判定提示词预设ID,
        角色锚点列表,
        当前角色锚点ID: 读取字符串(raw?.当前角色锚点ID ?? raw?.currentCharacterAnchorId).trim(),
        PNG画风预设列表,
        当前PNG画风预设ID: 读取字符串(raw?.当前PNG画风预设ID ?? raw?.currentPngPresetId).trim(),
        PNG提炼启用独立模型: Boolean(raw?.PNG提炼启用独立模型 ?? raw?.pngRefineIndependent),
        PNG提炼使用模型: 读取字符串(raw?.PNG提炼使用模型 ?? raw?.pngRefineModel),
        PNG提炼API地址: 读取字符串(raw?.PNG提炼API地址 ?? raw?.pngRefineApiBaseUrl),
        PNG提炼API密钥: 读取字符串(raw?.PNG提炼API密钥 ?? raw?.pngRefineApiKey),
        场景生图启用: Boolean(raw?.场景生图启用),
        NPC生图启用: Boolean(raw?.NPC生图启用),
        NPC生图性别筛选: raw?.NPC生图性别筛选 === '男' || raw?.NPC生图性别筛选 === '女' || raw?.NPC生图性别筛选 === '全部'
            ? raw.NPC生图性别筛选
            : '全部',
        NPC生图重要性筛选: raw?.NPC生图重要性筛选 === '仅重要' || raw?.NPC生图重要性筛选 === '全部'
            ? raw.NPC生图重要性筛选
            : '全部'
    };
};

export const 创建空接口设置 = (): 接口设置结构 => ({
    activeConfigId: null,
    configs: [],
    功能模型占位: { ...默认功能模型占位 }
});

export const 创建接口配置模板 = (
    supplier: 接口供应商类型,
    options?: { compatiblePreset?: OpenAI兼容方案类型 }
): 单接口配置结构 => {
    const now = Date.now();
    const preset = 供应商默认值[supplier];
    const compatiblePreset = supplier === 'openai_compatible'
        ? 标准化兼容方案(options?.compatiblePreset)
        : undefined;

    return {
        id: 生成配置ID(),
        名称: `${供应商标签[supplier]} 配置`,
        供应商: supplier,
        兼容方案: compatiblePreset,
        协议覆盖: 'auto',
        baseUrl: supplier === 'openai_compatible' && compatiblePreset
            ? OpenAI兼容方案预设[compatiblePreset].baseUrl
            : preset.baseUrl,
        apiKey: '',
        model: preset.model,
        maxTokens: undefined,
        temperature: undefined,
        createdAt: now,
        updatedAt: now
    };
};

export const 规范化接口设置 = (raw: unknown): 接口设置结构 => {
    if (!raw || typeof raw !== 'object') {
        return 创建空接口设置();
    }

    const source = raw as any;
    const configs: 单接口配置结构[] = Array.isArray(source.configs)
        ? source.configs.map((item: any, index: number) => 标准化单配置(item, index))
        : [];

    const activeConfigId = (() => {
        const candidate = 读取字符串(source.activeConfigId).trim();
        if (!candidate) return configs[0]?.id || null;
        return configs.some((cfg) => cfg.id === candidate) ? candidate : (configs[0]?.id || null);
    })();

    return {
        activeConfigId,
        configs,
        功能模型占位: 标准化功能模型占位(source.功能模型占位)
    };
};

export type 当前可用接口结构 = Pick<单接口配置结构, 'id' | '名称' | '供应商' | '协议覆盖' | 'baseUrl' | 'apiKey' | 'model' | 'maxTokens' | 'temperature'> & {
    图片后端类型?: 功能模型占位配置结构['文生图后端类型'];
    图片接口路径?: string;
    图片接口路径模式?: 功能模型占位配置结构['文生图接口路径模式'];
    图片预设接口路径?: 功能模型占位配置结构['文生图预设接口路径'];
    图片响应格式?: 'url' | 'b64_json';
    图片走OpenAI自定义格式?: boolean;
    画师串预设列表?: 画师串预设结构[];
    当前NPC画师串预设ID?: string;
    当前场景画师串预设ID?: string;
    NovelAI启用自定义参数?: boolean;
    NovelAI采样器?: 功能模型占位配置结构['NovelAI采样器'];
    NovelAI噪点表?: 功能模型占位配置结构['NovelAI噪点表'];
    NovelAI步数?: number;
    NovelAI负面提示词?: string;
    NPC生图使用词组转化器?: boolean;
    词组转化兼容模式?: boolean;
    词组转化器AI角色提示词?: string;
    词组转化器提示词?: string;
    场景判定提示词?: string;
    词组转化输出策略?: 图片词组序列化策略类型;
    模型词组转化器预设列表?: 模型词组转化器预设结构[];
    词组转化器提示词预设列表?: 词组转化器提示词预设结构[];
    当前NAI词组转化器提示词预设ID?: string;
    当前NPC词组转化器提示词预设ID?: string;
    当前场景词组转化器提示词预设ID?: string;
    当前场景判定提示词预设ID?: string;
    ComfyUI工作流JSON?: string;
    画风?: '通用' | '二次元' | '写实' | '国风';
    香闺秘档特写强制裸体语义?: boolean;
};

export type 词组转化器预设上下文结构 = {
    AI角色定制提示词: string;
    相关提示词: string;
    词组序列化策略: 图片词组序列化策略类型;
};

export const 获取生图画师串预设 = (
    settings: 接口设置结构,
    scope: 'npc' | 'scene',
    preferredId?: string
): 画师串预设结构 | null => {
    const feature = settings?.功能模型占位;
    const list = (Array.isArray(feature?.画师串预设列表) ? feature.画师串预设列表 : [])
        .filter((item) => item && typeof item.id === 'string' && !item.id.startsWith('png_artist_'));
    if (list.length <= 0) return null;
    const targetId = 读取字符串(preferredId).trim()
        || (scope === 'scene'
            ? 读取字符串(feature?.当前场景画师串预设ID).trim()
            : 读取字符串(feature?.当前NPC画师串预设ID).trim());
    const scopedList = list.filter((item) => item?.适用范围 === scope || item?.适用范围 === 'all');
    if (targetId) {
        const matched = scopedList.find((item) => item.id === targetId) || list.find((item) => item.id === targetId);
        if (matched) return matched;
    }
    return scopedList[0] || null;
};

export const 获取命中模型词组转化器预设 = (
    settings: 接口设置结构
): 模型词组转化器预设结构 | null => {
    const feature = settings?.功能模型占位;
    const list = Array.isArray(feature?.模型词组转化器预设列表) ? feature.模型词组转化器预设列表 : [];
    return list.find((item) => item?.是否启用 === true) || null;
};

export const 获取词组转化器预设上下文 = (
    settings: 接口设置结构,
    scope: 词组转化器提示词预设类型,
    mode?: 'default' | 'anchor',
    options?: { 包含输出格式提示词?: boolean }
): 词组转化器预设上下文结构 => {
    const feature = settings?.功能模型占位;
    const list = Array.isArray(feature?.词组转化器提示词预设列表) ? feature.词组转化器提示词预设列表 : [];
    const matchedModelPreset = 获取命中模型词组转化器预设(settings);
    const targetId = scope === 'scene'
        ? (
            读取字符串(matchedModelPreset?.场景词组转化器提示词预设ID).trim()
            || 读取字符串(feature?.当前场景词组转化器提示词预设ID).trim()
        )
        : scope === 'scene_judge'
            ? (
                读取字符串(matchedModelPreset?.场景判定提示词预设ID).trim()
                || 读取字符串(feature?.当前场景判定提示词预设ID).trim()
            )
            : scope === 'nai'
                ? 读取字符串(feature?.当前NAI词组转化器提示词预设ID).trim()
                : (
                    读取字符串(matchedModelPreset?.NPC词组转化器提示词预设ID).trim()
                    || 读取字符串(feature?.当前NPC词组转化器提示词预设ID).trim()
                );
    const matched = list.find((item) => item.id === targetId && (item?.类型 === scope || (scope === 'nai' && item?.类型 === 'npc')));
    const AI角色定制提示词 = [
        mode === 'anchor'
            ? 读取字符串(matchedModelPreset?.锚定模式模型提示词 ?? matchedModelPreset?.模型专属提示词).trim()
            : 读取字符串(matchedModelPreset?.模型专属提示词).trim(),
    ].filter(Boolean).join('\n\n');
    const 相关提示词 = [
        mode === 'anchor'
            ? (
                读取字符串(
                    scope === 'scene'
                        ? (matched?.场景角色锚定模式提示词 ?? matched?.角色锚定模式提示词 ?? matched?.提示词)
                        : (matched?.角色锚定模式提示词 ?? matched?.提示词)
                ).trim()
            )
            : (matched?.提示词?.trim() || ''),
        mode === 'default' ? 读取字符串(matched?.无锚点回退提示词).trim() : '',
        options?.包含输出格式提示词 === false ? '' : 读取字符串(matched?.输出格式提示词).trim()
    ].filter(Boolean).join('\n\n');
    const 词组序列化策略 = matchedModelPreset?.词组序列化策略
        || (scope === 'nai' ? 'nai_character_segments' : 'flat');
    return {
        AI角色定制提示词,
        相关提示词,
        词组序列化策略
    };
};

export const 获取词组转化器预设提示词 = (
    settings: 接口设置结构,
    scope: 词组转化器提示词预设类型,
    mode?: 'default' | 'anchor',
    options?: { 包含输出格式提示词?: boolean }
): string => {
    const context = 获取词组转化器预设上下文(settings, scope, mode, options);
    return [context.AI角色定制提示词, context.相关提示词].filter(Boolean).join('\n\n');
};

export const 获取当前接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    if (!settings || !Array.isArray(settings.configs) || settings.configs.length === 0) return null;
    const active = settings.configs.find(cfg => cfg.id === settings.activeConfigId) || settings.configs[0];
    if (!active) return null;
    return {
        id: active.id,
        名称: active.名称,
        供应商: active.供应商,
        协议覆盖: active.协议覆盖 || 'auto',
        baseUrl: active.baseUrl,
        apiKey: active.apiKey,
        model: active.model,
        maxTokens: active.maxTokens,
        temperature: active.temperature
    };
};

export const 获取主剧情接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    const current = 获取当前接口配置(settings);
    if (!current) return null;
    const mainModel = 读取字符串(current.model).trim() || 读取字符串((settings as any)?.功能模型占位?.主剧情使用模型).trim();
    if (!mainModel) return null;
    return {
        ...current,
        model: mainModel
    };
};

export const 获取剧情回忆接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    const current = 获取当前接口配置(settings);
    if (!current) return null;
    const feature = (settings as any)?.功能模型占位;
    const enabled = Boolean(feature?.剧情回忆独立模型开关);
    if (!enabled) return null;
    const recallModel = 读取字符串(feature?.剧情回忆使用模型).trim();
    if (!recallModel) return null;
    const recallBaseUrl = 读取字符串(feature?.剧情回忆API地址).trim();
    const recallApiKey = 读取字符串(feature?.剧情回忆API密钥).trim();
    const supplier = recallBaseUrl ? 推断供应商(recallBaseUrl) : current.供应商;
    return {
        ...current,
        供应商: supplier,
        协议覆盖: recallBaseUrl ? 'auto' : current.协议覆盖,
        baseUrl: recallBaseUrl || current.baseUrl,
        apiKey: recallApiKey || current.apiKey,
        model: recallModel
    };
};

export const 获取记忆总结接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    const current = 获取当前接口配置(settings);
    if (!current) return null;

    const feature = (settings as any)?.功能模型占位;
    const independent = Boolean(feature?.记忆总结独立模型开关);
    if (!independent) {
        const recallConfig = 获取剧情回忆接口配置(settings);
        if (接口配置是否可用(recallConfig)) return recallConfig;
        return current;
    }
    const summaryModel = 读取字符串(feature?.记忆总结使用模型).trim();
    if (!summaryModel) return null;
    const summaryBaseUrl = 读取字符串(feature?.记忆总结API地址).trim();
    const summaryApiKey = 读取字符串(feature?.记忆总结API密钥).trim();
    const supplier = summaryBaseUrl ? 推断供应商(summaryBaseUrl) : current.供应商;

    return {
        ...current,
        供应商: supplier,
        协议覆盖: summaryBaseUrl ? 'auto' : current.协议覆盖,
        baseUrl: summaryBaseUrl || current.baseUrl,
        apiKey: summaryApiKey || current.apiKey,
        model: summaryModel
    };
};

export const 获取文章优化接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    const current = 获取当前接口配置(settings);
    if (!current) return null;

    const feature = (settings as any)?.功能模型占位;
    const independent = Boolean(feature?.文章优化独立模型开关);
    if (!independent) return null;
    const polishModel = 读取字符串(feature?.文章优化使用模型).trim();
    if (!polishModel) return null;
    const polishBaseUrl = 读取字符串(feature?.文章优化API地址).trim();
    const polishApiKey = 读取字符串(feature?.文章优化API密钥).trim();
    const supplier = polishBaseUrl ? 推断供应商(polishBaseUrl) : current.供应商;

    return {
        ...current,
        供应商: supplier,
        协议覆盖: polishBaseUrl ? 'auto' : current.协议覆盖,
        baseUrl: polishBaseUrl || current.baseUrl,
        apiKey: polishApiKey || current.apiKey,
        model: polishModel
    };
};

export const 获取变量计算接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    const current = 获取当前接口配置(settings);
    if (!current) return null;

    const feature = (settings as any)?.功能模型占位;
    const enabled = Boolean(feature?.变量计算独立模型开关);
    const variableModel = 读取字符串(feature?.变量计算使用模型).trim();
    if (!enabled || !variableModel) return null;
    const variableBaseUrl = 读取字符串(feature?.变量计算API地址).trim();
    const variableApiKey = 读取字符串(feature?.变量计算API密钥).trim();
    const supplier = variableBaseUrl ? 推断供应商(variableBaseUrl) : current.供应商;

    return {
        ...current,
        供应商: supplier,
        协议覆盖: variableBaseUrl ? 'auto' : current.协议覆盖,
        baseUrl: variableBaseUrl || current.baseUrl,
        apiKey: variableApiKey || current.apiKey,
        model: variableModel
    };
};

export const 变量校准功能已启用 = (settings: 接口设置结构 | null | undefined): boolean => {
    const feature = (settings as any)?.功能模型占位;
    return Boolean(feature?.变量计算独立模型开关);
};

export const 获取世界演变接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    const current = 获取当前接口配置(settings);
    if (!current) return null;

    const feature = (settings as any)?.功能模型占位;
    const enabled = Boolean(feature?.世界演变独立模型开关);
    const worldModel = 读取字符串(feature?.世界演变使用模型).trim();
    if (!enabled || !worldModel) return null;
    const worldBaseUrl = 读取字符串(feature?.世界演变API地址).trim();
    const worldApiKey = 读取字符串(feature?.世界演变API密钥).trim();
    const supplier = worldBaseUrl ? 推断供应商(worldBaseUrl) : current.供应商;

    return {
        ...current,
        供应商: supplier,
        协议覆盖: worldBaseUrl ? 'auto' : current.协议覆盖,
        baseUrl: worldBaseUrl || current.baseUrl,
        apiKey: worldApiKey || current.apiKey,
        model: worldModel
    };
};

export const 获取小说拆分接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    const current = 获取当前接口配置(settings);
    const feature = (settings as any)?.功能模型占位;
    const baseUrl = 读取字符串(feature?.小说拆分API地址).trim();
    const apiKey = 读取字符串(feature?.小说拆分API密钥).trim();
    const dedicatedModel = 读取字符串(feature?.小说拆分使用模型).trim();
    const 小说拆分最大输出Token = 32_768;

    if (baseUrl && apiKey && dedicatedModel) {
        return {
            id: current?.id || 'novel_decomposition_dedicated',
            名称: current?.名称 || '小说拆分独立接口',
            供应商: 推断供应商(baseUrl),
            协议覆盖: 'auto',
            baseUrl,
            apiKey,
            model: dedicatedModel,
            maxTokens: 小说拆分最大输出Token,
            temperature: current?.temperature
        };
    }

    if (!current) return null;

    const enabled = Boolean(feature?.小说拆分独立模型开关);
    const model = enabled
        ? dedicatedModel
        : 读取字符串(current.model || feature?.主剧情使用模型).trim();
    if (!model) return null;
    const supplier = baseUrl ? 推断供应商(baseUrl) : current.供应商;

    return {
        ...current,
        供应商: supplier,
        协议覆盖: baseUrl ? 'auto' : current.协议覆盖,
        baseUrl: baseUrl || current.baseUrl,
        apiKey: apiKey || current.apiKey,
        model,
        maxTokens: 小说拆分最大输出Token
    };
};

export const 获取规划分析接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    const current = 获取当前接口配置(settings);
    if (!current) return null;

    const feature = (settings as any)?.功能模型占位;
    const enabled = Boolean(feature?.规划分析独立模型开关)
        || Boolean(feature?.剧情规划独立模型开关)
        || Boolean(feature?.女主规划独立模型开关);
    const model = 读取字符串(
        feature?.规划分析使用模型
        || feature?.剧情规划使用模型
        || feature?.女主规划使用模型
    ).trim();
    if (!enabled || !model) return null;
    const baseUrl = 读取字符串(
        feature?.规划分析API地址
        || feature?.剧情规划API地址
        || feature?.女主规划API地址
    ).trim();
    const apiKey = 读取字符串(
        feature?.规划分析API密钥
        || feature?.剧情规划API密钥
        || feature?.女主规划API密钥
    ).trim();
    const supplier = baseUrl ? 推断供应商(baseUrl) : current.供应商;

    return {
        ...current,
        供应商: supplier,
        协议覆盖: baseUrl ? 'auto' : current.协议覆盖,
        baseUrl: baseUrl || current.baseUrl,
        apiKey: apiKey || current.apiKey,
        model
    };
};

export const 获取女主规划接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => 获取规划分析接口配置(settings);

export const 获取剧情规划接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    return 获取规划分析接口配置(settings);
};

export const 获取文生图接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    const current = 获取当前接口配置(settings);
    if (!current) return null;

    const feature = (settings as any)?.功能模型占位;
    const enabled = Boolean(feature?.文生图功能启用);
    const 图片后端类型 = feature?.文生图后端类型 === 'novelai' || feature?.文生图后端类型 === 'sd_webui' || feature?.文生图后端类型 === 'comfyui'
        ? feature.文生图后端类型
        : 'openai';
    if (!enabled) return null;
    const imageModel = 读取字符串(feature?.文生图模型使用模型).trim();
    const 图片后端需要模型 = 图片后端类型 === 'openai' || 图片后端类型 === 'novelai';
    if (图片后端需要模型 && !imageModel) return null;
    const imageBaseUrl = 读取字符串(feature?.文生图模型API地址).trim();
    const imageApiKey = 读取字符串(feature?.文生图模型API密钥).trim();
    const 图片后端可复用主接口地址 = 图片后端类型 === 'openai' || 图片后端类型 === 'novelai';
    const resolvedImageBaseUrl = imageBaseUrl || (图片后端可复用主接口地址 ? current.baseUrl : '');
    const supplier = resolvedImageBaseUrl ? 推断供应商(resolvedImageBaseUrl) : current.供应商;
    const 图片后端需要鉴权 = 图片后端类型 === 'openai' || 图片后端类型 === 'novelai';
    const 图片接口路径模式 = feature?.文生图接口路径模式 === 'custom' ? 'custom' : 'preset';
    const 图片预设接口路径: NonNullable<当前可用接口结构['图片预设接口路径']> = feature?.文生图预设接口路径 === 'openai_chat'
        || feature?.文生图预设接口路径 === 'novelai_generate'
        || feature?.文生图预设接口路径 === 'sd_txt2img'
        || feature?.文生图预设接口路径 === 'comfyui_prompt'
        ? feature.文生图预设接口路径
        : 'openai_images';
    const 预设接口路径映射: Record<NonNullable<当前可用接口结构['图片预设接口路径']>, string> = {
        openai_images: '/v1/images/generations',
        openai_chat: '/v1/chat/completions',
        novelai_generate: '/ai/generate-image',
        sd_txt2img: '/sdapi/v1/txt2img',
        comfyui_prompt: '/prompt'
    };
    const 自定义图片路径 = 读取字符串(feature?.文生图接口路径).trim();
    const 图片接口路径 = 图片接口路径模式 === 'custom'
        ? 自定义图片路径
        : 预设接口路径映射[图片预设接口路径];

    return {
        ...current,
        供应商: supplier,
        协议覆盖: imageBaseUrl ? 'auto' : current.协议覆盖,
        baseUrl: resolvedImageBaseUrl,
        apiKey: 图片后端需要鉴权 ? (imageApiKey || current.apiKey) : imageApiKey,
        model: imageModel,
        图片后端类型,
        图片接口路径模式,
        图片预设接口路径,
        图片接口路径,
        图片响应格式: feature?.文生图响应格式 === 'b64_json' ? 'b64_json' : 'url',
        图片走OpenAI自定义格式: Boolean(feature?.文生图OpenAI自定义格式),
        画师串预设列表: Array.isArray(feature?.画师串预设列表) ? feature.画师串预设列表 : [],
        当前NPC画师串预设ID: 读取字符串(feature?.当前NPC画师串预设ID).trim(),
        当前场景画师串预设ID: 读取字符串(feature?.当前场景画师串预设ID).trim(),
        NovelAI启用自定义参数: Boolean(feature?.NovelAI启用自定义参数),
        NovelAI采样器: feature?.NovelAI采样器 === 'k_euler'
            || feature?.NovelAI采样器 === 'k_euler_ancestral'
            || feature?.NovelAI采样器 === 'k_dpmpp_2m'
            || feature?.NovelAI采样器 === 'k_dpmpp_2s_ancestral'
            || feature?.NovelAI采样器 === 'k_dpmpp_sde'
            || feature?.NovelAI采样器 === 'k_dpmpp_2m_sde'
            ? feature.NovelAI采样器
            : 'k_euler_ancestral',
        NovelAI噪点表: feature?.NovelAI噪点表 === 'native'
            || feature?.NovelAI噪点表 === 'karras'
            || feature?.NovelAI噪点表 === 'exponential'
            || feature?.NovelAI噪点表 === 'polyexponential'
            ? feature.NovelAI噪点表
            : 'karras',
        NovelAI步数: Math.max(1, Math.min(50, Number(feature?.NovelAI步数) || 28)),
        NovelAI负面提示词: 读取字符串(feature?.NovelAI负面提示词).trim(),
        NPC生图使用词组转化器: 图片后端类型 === 'novelai' ? true : feature?.NPC生图使用词组转化器 !== false,
        香闺秘档特写强制裸体语义: feature?.香闺秘档特写强制裸体语义 === true,
        模型词组转化器预设列表: Array.isArray(feature?.模型词组转化器预设列表) ? feature.模型词组转化器预设列表 : [],
        词组转化器提示词预设列表: Array.isArray(feature?.词组转化器提示词预设列表) ? feature.词组转化器提示词预设列表 : [],
        当前NAI词组转化器提示词预设ID: 读取字符串(feature?.当前NAI词组转化器提示词预设ID).trim(),
        当前NPC词组转化器提示词预设ID: 读取字符串(feature?.当前NPC词组转化器提示词预设ID).trim(),
        当前场景词组转化器提示词预设ID: 读取字符串(feature?.当前场景词组转化器提示词预设ID).trim(),
        当前场景判定提示词预设ID: 读取字符串(feature?.当前场景判定提示词预设ID).trim(),
        ComfyUI工作流JSON: 读取字符串(feature?.ComfyUI工作流JSON)
    };
};

export const 获取场景文生图接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    const sharedConfig = 获取文生图接口配置(settings);
    if (!sharedConfig) return null;

    const feature = (settings as any)?.功能模型占位;
    const independent = Boolean(feature?.场景生图独立接口启用);
    if (!independent) return sharedConfig;

    const sceneBackend: NonNullable<当前可用接口结构['图片后端类型']> = feature?.场景生图后端类型 === 'novelai' || feature?.场景生图后端类型 === 'sd_webui' || feature?.场景生图后端类型 === 'comfyui'
        ? feature.场景生图后端类型
        : 'openai';
    const sharedBackend: NonNullable<当前可用接口结构['图片后端类型']> = sharedConfig.图片后端类型 === 'novelai' || sharedConfig.图片后端类型 === 'sd_webui' || sharedConfig.图片后端类型 === 'comfyui'
        ? sharedConfig.图片后端类型
        : 'openai';
    const sceneModel = 读取字符串(feature?.场景生图模型使用模型).trim();
    const 场景后端需要模型 = sceneBackend === 'openai' || sceneBackend === 'novelai';
    if (场景后端需要模型 && !sceneModel) return null;
    const sceneBaseUrl = 读取字符串(feature?.场景生图模型API地址).trim();
    const sceneApiKey = 读取字符串(feature?.场景生图模型API密钥).trim();
    const sceneWorkflow = 读取字符串(feature?.场景ComfyUI工作流JSON);
    const canReuseSharedConnection = sceneBackend === sharedBackend;
    const resolvedBaseUrl = sceneBaseUrl || (canReuseSharedConnection ? sharedConfig.baseUrl : '');
    const 场景后端需要鉴权 = sceneBackend === 'openai' || sceneBackend === 'novelai';
    const resolvedApiKey = 场景后端需要鉴权
        ? (sceneApiKey || (canReuseSharedConnection ? sharedConfig.apiKey : ''))
        : sceneApiKey;
    const resolvedWorkflow = sceneBackend === 'comfyui'
        ? (sceneWorkflow || (canReuseSharedConnection ? sharedConfig.ComfyUI工作流JSON || '' : ''))
        : '';
    const supplier = resolvedBaseUrl ? 推断供应商(resolvedBaseUrl) : sharedConfig.供应商;
    const scenePresetPathMap: Record<'openai' | 'novelai' | 'sd_webui' | 'comfyui', NonNullable<当前可用接口结构['图片预设接口路径']>> = {
        openai: 'openai_images',
        novelai: 'novelai_generate',
        sd_webui: 'sd_txt2img',
        comfyui: 'comfyui_prompt'
    };
    const presetPathValue = scenePresetPathMap[sceneBackend];
    const presetPathMap: Record<NonNullable<当前可用接口结构['图片预设接口路径']>, string> = {
        openai_images: '/v1/images/generations',
        openai_chat: '/v1/chat/completions',
        novelai_generate: '/ai/generate-image',
        sd_txt2img: '/sdapi/v1/txt2img',
        comfyui_prompt: '/prompt'
    };
    const 图片接口路径模式 = canReuseSharedConnection
        ? sharedConfig.图片接口路径模式
        : 'preset';
    const 图片预设接口路径: NonNullable<当前可用接口结构['图片预设接口路径']> = canReuseSharedConnection
        ? (sharedConfig.图片接口路径模式 === 'preset'
            ? (sharedConfig.图片预设接口路径 || presetPathValue)
            : presetPathValue)
        : presetPathValue;
    const 图片接口路径 = 图片接口路径模式 === 'custom'
        ? (sharedConfig.图片接口路径 || presetPathMap[图片预设接口路径])
        : presetPathMap[图片预设接口路径];

    return {
        ...sharedConfig,
        供应商: supplier,
        协议覆盖: sceneBaseUrl ? 'auto' : (canReuseSharedConnection ? sharedConfig.协议覆盖 : 'auto'),
        baseUrl: resolvedBaseUrl,
        apiKey: resolvedApiKey,
        model: sceneModel,
        图片后端类型: sceneBackend,
        图片接口路径模式,
        图片预设接口路径,
        图片接口路径,
        图片响应格式: sceneBackend === 'openai' ? sharedConfig.图片响应格式 : 'url',
        图片走OpenAI自定义格式: sceneBackend === 'openai' ? Boolean(sharedConfig.图片走OpenAI自定义格式) : false,
        NPC生图使用词组转化器: sceneBackend === 'novelai' ? true : sharedConfig.NPC生图使用词组转化器,
        ComfyUI工作流JSON: resolvedWorkflow
    };
};

export const 获取生图词组转化器接口配置 = (settings: 接口设置结构): 当前可用接口结构 | null => {
    const current = 获取当前接口配置(settings);
    if (!current) return null;

    const feature = (settings as any)?.功能模型占位;
    const independent = Boolean(feature?.词组转化器启用独立模型);
    if (!independent) return {
        ...current,
        model: 读取字符串(current.model).trim() || 读取字符串(feature?.主剧情使用模型).trim(),
        词组转化器提示词: 读取字符串(feature?.词组转化器提示词).trim(),
        模型词组转化器预设列表: Array.isArray(feature?.模型词组转化器预设列表) ? feature.模型词组转化器预设列表 : [],
        词组转化器提示词预设列表: Array.isArray(feature?.词组转化器提示词预设列表) ? feature.词组转化器提示词预设列表 : [],
        当前NAI词组转化器提示词预设ID: 读取字符串(feature?.当前NAI词组转化器提示词预设ID).trim(),
        当前NPC词组转化器提示词预设ID: 读取字符串(feature?.当前NPC词组转化器提示词预设ID).trim(),
        当前场景词组转化器提示词预设ID: 读取字符串(feature?.当前场景词组转化器提示词预设ID).trim(),
        当前场景判定提示词预设ID: 读取字符串(feature?.当前场景判定提示词预设ID).trim()
        ,
        词组转化兼容模式: feature?.词组转化兼容模式 === true
    };
    const transformerModel = 读取字符串(feature?.词组转化器使用模型).trim();
    if (!transformerModel) return null;
    const transformerBaseUrl = 读取字符串(feature?.词组转化器API地址).trim();
    const transformerApiKey = 读取字符串(feature?.词组转化器API密钥).trim();
    const supplier = transformerBaseUrl ? 推断供应商(transformerBaseUrl) : current.供应商;

    return {
        ...current,
        供应商: supplier,
        协议覆盖: transformerBaseUrl ? 'auto' : current.协议覆盖,
        baseUrl: transformerBaseUrl || current.baseUrl,
        apiKey: transformerApiKey || current.apiKey,
        model: transformerModel,
        词组转化器提示词: 读取字符串(feature?.词组转化器提示词).trim(),
        模型词组转化器预设列表: Array.isArray(feature?.模型词组转化器预设列表) ? feature.模型词组转化器预设列表 : [],
        词组转化器提示词预设列表: Array.isArray(feature?.词组转化器提示词预设列表) ? feature.词组转化器提示词预设列表 : [],
        当前NAI词组转化器提示词预设ID: 读取字符串(feature?.当前NAI词组转化器提示词预设ID).trim(),
        当前NPC词组转化器提示词预设ID: 读取字符串(feature?.当前NPC词组转化器提示词预设ID).trim(),
        当前场景词组转化器提示词预设ID: 读取字符串(feature?.当前场景词组转化器提示词预设ID).trim(),
        当前场景判定提示词预设ID: 读取字符串(feature?.当前场景判定提示词预设ID).trim()
        ,
        词组转化兼容模式: feature?.词组转化兼容模式 === true
    };
};

export const 接口配置是否可用 = (config: 当前可用接口结构 | null): config is 当前可用接口结构 => {
    if (!config) return false;
    if (config.图片后端类型) {
        const backend = config.图片后端类型;
        const hasBaseUrl = Boolean(config.baseUrl?.trim());
        const needsApiKey = backend === 'openai' || backend === 'novelai';
        const needsModel = backend === 'openai' || backend === 'novelai';
        const needsWorkflow = backend === 'comfyui';
        const hasApiKey = Boolean(config.apiKey?.trim());
        const hasModel = Boolean(config.model?.trim());
        const hasWorkflow = Boolean(config.ComfyUI工作流JSON?.trim());
        return hasBaseUrl && (!needsApiKey || hasApiKey) && (!needsModel || hasModel) && (!needsWorkflow || hasWorkflow);
    }
    const hasRequiredConnection = Boolean(config.baseUrl?.trim() && config.apiKey?.trim());
    const hasModel = Boolean(config.model?.trim());
    return hasRequiredConnection && hasModel;
};
