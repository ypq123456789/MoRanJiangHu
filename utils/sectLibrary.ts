import type { 世界数据结构, 环境信息结构 } from '../types';
import type { 详细门派结构, 门派藏经 } from '../models/sect';
import { 构建地点树 } from './locationTree';

export type 门派所在状态 = '门内' | '门外' | '未知';

export const 获取门派所在状态 = (
    sect: 详细门派结构 | undefined, env?: 环境信息结构 | null, world?: 世界数据结构 | null
): 门派所在状态 => {
    const name = sect?.名称?.trim();
    if (!sect || !name || !env) return '未知';
    const places = [env.大地点, env.中地点, env.小地点, env.具体地点]
        .flatMap(field => (field || '').split(/[>＞／/\\·•—|｜→-]+/u))
        .map(field => field.trim()).filter(field => field && !/^(?:未知.*|不明|未指定|待定|无)$/u.test(field));
    if (!places.length) return '未知';
    const outside = /^(?:山门外|驻地外|宗门外|门派外|大门外)/u;
    if (places.some(place => outside.test(place) || (place.startsWith(name) && /^(?:外$|外侧|外围|之外|以外|山门外|大门外|驻地外)/u.test(place.slice(name.length))))) return '门外';
    const isNamedGround = (place: string) => place === name || (
        place.startsWith(name) && /^(?:山门|驻地|正殿|大殿|内院|外院|内门|外门|后山|藏经阁|聚宝阁|分舵|总坛|总部|大楼|基地)/u.test(place.slice(name.length))
    );
    const faction = world?.势力列表?.find(item => item.名称 === name || item.ID === sect.ID);
    const { 面包屑 } = 构建地点树(world, env);
    const grounds = 面包屑.filter(node => node.层级 === '区地点' || node.层级 === '子地点');
    if (!grounds.some(node => places.includes(node.名称))) return places.some(isNamedGround) ? '门内' : '门外';
    const controlled = [...grounds].reverse().find(node => node.控制势力);
    if (controlled) return [name, sect.ID, faction?.ID].includes(controlled.控制势力) ? '门内' : '门外';
    if (places.some(isNamedGround) || grounds.some(node => isNamedGround(node.名称))) return '门内';
    // 地盘只有精确指向建筑或房间时才证明到场，整座城镇可以同时容纳多个门派。
    if (grounds.some(node => node.名称 === faction?.地盘归属)) return '门内';
    return '门外';
};

export const 门派位置文案 = (status: 门派所在状态, name: string) =>
    status === '门内' ? `当前位于${name}` : status === '门外' ? `当前不在${name}` : `当前位置未确认，请前往${name}`;

export const 已习得门派藏经 = (skills: Array<{ 来源藏经ID?: string; ID?: string; 名称?: string }> | undefined, book: 门派藏经) =>
    skills?.some(skill => skill?.来源藏经ID === book.id || skill?.ID === `sect_${book.id}` || skill?.名称 === book.名称) === true;

export const 门派研习标记 = '【门派研习】';

export const 构建门派研习行动 = (sect: 详细门派结构, book: 门派藏经): string =>
    `${门派研习标记}我在${sect.名称}申请研习《${book.名称}》（${book.类型}，${book.品阶}）：${book.简介}。要求职位「${book.要求职位}」，要求累计贡献 ${book.要求累计贡献}。请按当前条件演绎学习过程，明确是否学成；仅在实际学成时登记这门功法，名称「${book.名称}」、来源藏经ID「${book.id}」。累计贡献仅为资格门槛。`;
