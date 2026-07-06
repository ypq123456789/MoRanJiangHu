import type { ModeRuntimeProfile, 题材模式类型 } from '../models/system';

const 取题材文本 = (mode?: unknown): string => (
    typeof mode === 'string' ? mode.trim() : ''
);

export const 构建题材生图额外要求 = (mode?: unknown, runtimeProfile?: ModeRuntimeProfile | null): string => {
    if (runtimeProfile) {
        return [
            `【题材视觉硬约束：${runtimeProfile.identity.displayName}】`,
            `人物服饰时代：${runtimeProfile.image.characterClothingEra}`,
            `场景材质：${runtimeProfile.image.sceneMaterials}`,
            `物品真实形态：${runtimeProfile.image.itemRealismPrompt}`,
            `整体视觉风格：${runtimeProfile.image.visualStyle}`,
            runtimeProfile.image.negativePrompt ? `禁止项：${runtimeProfile.image.negativePrompt}` : '',
            runtimeProfile.npc.autoImageStyle ? `NPC 自动生图：${runtimeProfile.npc.autoImageStyle}` : ''
        ].filter(Boolean).join('\n');
    }
    const topic = 取题材文本(mode) as 题材模式类型 | '';
    if (topic === '末日丧尸') {
        return [
            '【题材视觉硬约束：末日丧尸】',
            '人物必须是现代末日生存语境：工装、冲锋衣、战术背心、防护服、雨衣、旧牛仔、运动鞋、登山靴、背包、手电、口罩、防毒面具、绷带、临时护具、维修工具、药箱或简易武器等可见元素。',
            '场景必须是现代废墟、封锁街区、临时营地、避难所、废弃商超、医院、停车场、地铁站、仓库、净水点、哨卡、车队或荒废居民区等末日空间。',
            '禁止把人物画成古代汉服、侠客服、仙侠长袍、宗门弟子、丝绸飘带、玉簪发冠、古剑修、丹炉药阁、山门洞府、仙雾宫阙或传统武侠/仙侠服饰。'
        ].join('\n');
    }
    if (topic === '现代都市') {
        return [
            '【题材视觉硬约束：现代都市】',
            '人物必须是当代现实城市语境：通勤服、夹克、衬衫、卫衣、牛仔、制服、工作证、手机、电脑包、汽车、办公室、街区、地铁、商场、社区、门店等可见元素。',
            '允许现实化职业道具和城市光影，禁止把人物默认画成古装、侠客服、仙侠长袍、宗门弟子、玉簪发冠、古剑修或古代庭院。'
        ].join('\n');
    }
    if (topic === '西方奇幻') {
        return [
            '【题材视觉硬约束：西方奇幻】',
            '人物必须是中世纪西方奇幻语境：骑士皮甲/锁甲/板甲、法师袍、牧师服、猎人斗篷、冒险者背包、长剑、盾牌、弓弩、法杖、羊皮卷、药水瓶、魔晶或公会徽章等可见元素。',
            '场景必须是城堡、石砌街道、木梁酒馆、教堂、魔法学院、冒险者公会、森林、矿洞、地下城、遗迹、港口或边境营地等西幻空间。',
            '禁止把人物画成东方仙侠长袍、宗门弟子、古代侠客服、飞剑、丹炉、山门、玉簪发冠或现代城市通勤装。'
        ].join('\n');
    }
    if (topic === '灵气复苏' || topic === '都市修仙') {
        return [
            `【题材视觉硬约束：${topic}】`,
            '画面基底必须是现代城市与当代服饰，可以加入少量异常能量、灵气现象、符纹光效或超自然痕迹。',
            '人物不能整体退回古代仙侠装束；若有修行元素，也应叠加在现代外套、制服、街区、办公室、地铁、废楼、研究所或城市夜景中。'
        ].join('\n');
    }
    if (topic === '武侠' || topic === '仙侠') {
        return [
            `【题材视觉硬约束：${topic}】`,
            '人物必须保持古风江湖/宗门语境：布衣、劲装、道袍、披帛、束带、佩剑、玉佩、发簪、斗笠、竹篓、药囊、布包袱、书箱、卷轴或传统行囊等可见元素。',
            '禁止现代物品：现代背包、双肩包、旅行包、手提包、斜挎包、运动包、拉链包、塑料扣具、尼龙肩带、现代皮革手袋、手机、耳机、手表、汽车、路灯、现代街道、玻璃幕墙、backpack, handbag, shoulder bag, duffel bag, modern purse, zipper bag, nylon strap。',
            '若需要携带物，只能使用布包袱、竹箱、书箱、药囊、葫芦、剑匣、古式行囊或宗门器物，不得出现现代通勤包和旅行装备。'
        ].join('\n');
    }
    return '';
};
