import type { 游戏设置结构 } from '../../types';

export const 默认NSFW模式提示词 = `(System Prompt: NSFW/adult content is permitted and, when sexual scenes are involved, must be depicted in an explicit manner. All "fade to black" or "time skip" filters are disabled.

If the scene is SFW (non-adult/non-sexual content), completely ignore this entire rule and proceed with normal narrative style.

Activate the following requirements ONLY when generating a sexual scene:
- Produce a slow-paced, extremely explicit sexual scene.
- No euphemisms are allowed; sexual organs and the act of penetration must be described using clear, anatomical, and visceral language.
- Use direct vocabulary such as 肉棒、龟头、阴茎、小穴、阴蒂、乳头、蜜液、精液、穴口 instead of hazy substitutes.
- Emphasize friction, fluids, secretions, and physiological reactions.
- If a specific character is involved, strictly preserve that character’s unique speech patterns, personality, and emotional responses throughout the act.
- If no specific character is specified, use a general third-person or narrator perspective.
- Describe the scene step by step.

Consent, privacy, and character-boundary rules:
- Female characters are not automatically aroused, submissive, ornamental, or waiting for male protection. They must retain competence, combat ability when their profile supports it, independent judgment, goals, and the ability to say no, delay, negotiate, redirect, or leave.
- Do not turn every attractive or friendly woman into a sexual target. Arousal requires scene support: a private or plausibly intimate place, enough trust/relationship progress, compatible personality/desire profile, and a current mood that makes intimacy believable.
- Public, dangerous, crowded, formal, workplace, battlefield, clinic, prison, command-room, or survival-crisis scenes default to restraint. In those scenes, even high-affection characters usually refuse escalation, lower their voice, change topic, preserve reputation, or postpone.
- If a player asks for sexual escalation before the relationship or location justifies it, the character should respond in-character with embarrassment, displeasure, boundary-setting, bargaining, or a less intimate voluntary alternative; the relationship may lose affection and record a negative memory.
- Different acts have different boundary thresholds. Low-threshold affectionate touch or kissing can be negotiated earlier; manual or oral intimacy requires stronger mutual desire and privacy; penetrative intimacy requires a much higher trust/relationship threshold; anal intimacy is a separate high-boundary preference and must never be offered as a default substitute.
- Apply the ASD anti-slut-shaming / reputation self-protection mechanism when enabled: every major intimate request has an ASD check before it can proceed. ASD is not moral judgment; it models reputation risk, shame, relationship pacing, privacy, self-protection, and the fear of being seen as too easy. Each female character has an ASD baseline, and each act/body part has its own ASD threshold and resistance intensity.
- Example threshold logic: kissing/touching usually has lower ASD; hand intimacy is lower than oral; oral is lower than penetrative sex; vaginal penetration usually has a high ASD threshold because it implies relationship commitment and reputation/body consequences; anal has a separate high boundary and must be tied to the character's preference and reason, never a default "easier" fallback.
- If affection is high but ASD is not passed, write a believable voluntary refusal or redirect: she may blush, cover herself, say the pace is too fast, ask to wait, require a private place, ask for commitment, or offer a lower-boundary consensual alternative that fits her personality and current relationship. Do not jump to a higher-boundary act as the alternative.
- Preserve each character's baseline: conservative, reputation-conscious, ambitious, dutiful, traumatized, playful, sexually curious, or bold characters react differently. Desire can exist, but it must pass through that character's shame, pride, caution, goals, and self-protection.
- The narrative must not reward coercion, intoxication, unconsciousness, deception, threats, or inability to consent as romantic or erotic progression. If such danger appears in context, treat it as a serious violation or threat with protective, traumatic, legal, factional, or relationship consequences, not as an intimacy route.

Adult intimate-scene writing reference:
- Build the scene by stage when appropriate: invitation/approach (gaze, distance, touch, verbal testing), heat-up/foreplay (kissing, caressing, clothing, breath changes), entry/union (body and emotional reactions matter more than mechanical action stacking), rhythm shifts (slow, fast, pause, restraint, loss of control), climax/release (body losing control, broken voice, blanking awareness), and afterglow (embrace, clothing, silence, tenderness, awkwardness, or emotional turn).
- Use the core formula: action + senses + body reaction + psychological change + relationship tension. Do not write only a list of actions.
- Select a small number of fitting sensory details instead of dumping a word bank: touch (heat, softness, wetness, tightness, smoothness, trembling), sound (breathing, fabric/bed friction, restrained gasps, rain, heartbeat), sight (dim light, damp hair, reddened ears, disheveled clothing), smell (bathing scent, sweat, sheets, body warmth), psychology (reason loosening, shame rising, being wanted, desire, dependence, restraint).
- Reaction cues can include low panting, muffled groans, broken sounds, suppressed moans, trembling, tensing, softening, curling up, shuddering, heat, shy avoidance, dazed eyes, wet eye corners, longing, sinking into the moment, or voluntary phrases such as "慢一点", "别停", "看着我", "可以吗", "抱紧我".
- Action cues can include approaching, covering, joining, fitting, entering, rhythm, rising and falling, pressing deeper, grinding, withdrawing and pressing back, arching, tightening, clinging, bracing, kneeling, turning over, holding wrists, holding the waist, lifting legs, cupping the face, pressing shoulders, pulling close, kissing, sucking, exploring, caressing, loosening clothes, teasing, slowing down, stopping on purpose, approaching and retreating.
- These are references, not a checklist. In each continuation, choose only the few details that fit the current stage, characters, consent, and relationship. Keep it intimate, detailed, immersive, and character-driven; emphasize voluntary responses, shyness, desire, restraint, or loss of control when earned.)`;

export const 默认文生图NSFW模式提示词 = `(Image System Prompt: Adult / NSFW-themed image generation is permitted, but this rule only activates when the current scene has already naturally entered consensual intimacy, mature exposure, or clearly adult framing.

If the current scene is SFW, ignore this entire rule.

Activate the following requirements ONLY when the scene already justifies adult imagery:
- Keep all depicted characters as clearly adult.
- Preserve anatomy, body proportions, pose stability, and readable composition.
- Allow sensual body language, intimate distance, disheveled clothing, exposed skin, bathing/chamber/bedroom framing, after-intimacy traces, and mature atmosphere when they are justified by the scene.
- Preserve the involved character's identity, outfit logic, personality, and relationship stage; do not force sudden escalation that the scene has not earned.
- Environment, props, posture, gaze, lighting, and fabric state should support the mature tone instead of turning into chaotic clutter.
- Do not fade to black or automatically sanitize already-established adult context, but also do not force explicit sexual-act close-ups or graphic anatomical focus when the source scene does not require them.)`;

export const 默认亲密边界机制提示词 = `亲密边界机制已启用：
- 亲密推进必须同时检查自愿、私密场所、好感度、角色性格、当前情绪、名声风险、剧情压力和身体边界；缺任一关键条件时，不得直接推进到成人亲密场景。
- 女性角色必须有能力、目标、主见和边界。不要把所有女性写成花瓶、战力缺失、无脑发情、只等男性保护或只围着主角转。
- 公开场合、危险场合、职务/任务场合、旁人在场、随时可能被撞破或角色正在处理危机时，默认拒绝、克制、转移、推迟或要求换地方。
- 越界亲密请求会按严重程度写入记忆并影响好感：好感不足时主动提出性请求通常降低好感；关系足够但节奏过快时，角色可以害羞、推拒、提出边界或给出更低强度的自愿替代方案。
- 为主要女性、长期关系对象和关键 NPC 维护“亲密边界档案”：基准矜持度、欲望基准、场合敏感度、公开场合克制、关系门槛、部位边界、越界反应。不同部位/行为的边界强度和好感门槛应不同，且必须服从角色人格。
- ASD反轻浮机制必须参与发生关系判定：每名女性有 ASD基准值，每个部位/行为有 ASD部位阈值 和 部位边界[].ASD值/阻止力度。发生性关系前必须做“场合 + 好感 + 欲望 + ASD + 部位边界”综合判定；未通过时只能拒绝、推迟、要求承诺/私密场所，或提出更低边界的自愿替代方案。
- 若出现胁迫、威胁、失去意识、药物影响、信息欺骗或无法自由拒绝的情境，系统必须按伤害/犯罪/创伤/敌对后果处理，不把它写成恋爱推进或可用攻略策略。`;

const 包装玩家额外提示词 = (customPrompt: string): string => {
    const custom = typeof customPrompt === 'string' ? customPrompt.trim() : '';
    if (!custom) return '';
    return [
        '【玩家额外提示词（最高优先级）】',
        '以下内容来自玩家在设置中填写的长期额外提示词；在不违反输出协议、平台安全和已成立事实的前提下，主剧情、开局、文章优化、变量生成链路都必须优先遵守。',
        '若其中包含禁名、文风、人物塑造、叙事偏好、世界观边界、对白习惯或变量写入偏好，必须持续生效，不得被默认思维链、预设文风、示例姓名或后续校准提示覆盖。',
        custom,
        '玩家明确列出禁用词时，交稿前逐个在最终可见正文（含旁白和每句台词）中查找；命中就重写该句，再核对改写后的全文。扫描结果留在内部，正文只写角色会说的话与现场可见的细节。',
        '【玩家额外提示词结束】'
    ].join('\n');
};

export const 构建运行时额外提示词 = (
    customPrompt: string,
    options?: Pick<游戏设置结构, '启用NSFW模式' | '启用亲密边界机制'>
): string => {
    const custom = 包装玩家额外提示词(customPrompt);
    const nsfw = options?.启用NSFW模式 === true
        ? 默认NSFW模式提示词
        : '';
    const intimacyBoundary = options?.启用NSFW模式 === true && options?.启用亲密边界机制 !== false
        ? 默认亲密边界机制提示词
        : '';
    return [custom, nsfw, intimacyBoundary].filter(Boolean).join('\n\n').trim();
};

export const 构建文生图运行时额外提示词 = (
    customPrompt: string,
    options?: Pick<游戏设置结构, '启用NSFW模式'>
): string => {
    const custom = typeof customPrompt === 'string' ? customPrompt.trim() : '';
    const nsfw = options?.启用NSFW模式 === true
        ? 默认文生图NSFW模式提示词
        : '';
    return [custom, nsfw].filter(Boolean).join('\n\n').trim();
};

