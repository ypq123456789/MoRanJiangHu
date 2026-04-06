import type { OpeningConfig, 记忆配置结构 } from '../../types';
import { 规范化记忆配置 } from './memoryUtils';
import { 构建NPC记忆展示结果 } from './npcMemorySummary';
import { normalizeCanonicalGameTime, 结构化时间转标准串 } from './timeUtils';
import { 解析境界映射值 } from '../../prompts/runtime/fandom';

type 生图基础数据选项 = {
    cultivationSystemEnabled?: boolean;
};

export const 提取NPC生图基础数据 = (npc: any, options?: 生图基础数据选项) => {
    const 启用修炼体系 = options?.cultivationSystemEnabled !== false;
    const 清理空字段 = <T extends Record<string, any>>(obj: T): Partial<T> => {
        return Object.fromEntries(
            Object.entries(obj).filter(([, value]) => {
                if (value === undefined || value === null) return false;
                if (typeof value === 'string' && value.trim().length === 0) return false;
                if (Array.isArray(value) && value.length === 0) return false;
                if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false;
                return true;
            })
        ) as Partial<T>;
    };

    const 取首个非空文本 = (...values: unknown[]): string => {
        for (const value of values) {
            if (typeof value === 'string' && value.trim().length > 0) return value.trim();
            if (typeof value === 'number' && Number.isFinite(value)) return String(value);
        }
        return '';
    };

    const 读取档案对象 = (source: any): Record<string, unknown> => (
        source?.档案 && typeof source.档案 === 'object' && !Array.isArray(source.档案)
            ? source.档案 as Record<string, unknown>
            : {}
    );

    const 读取首个文本字段 = (source: any, keys: string[]): string => {
        const 档案 = 读取档案对象(source);
        return 取首个非空文本(
            ...keys.map((key) => source?.[key]),
            ...keys.map((key) => (档案 as any)?.[key])
        );
    };

    const 外貌 = 读取首个文本字段(npc, ['外貌描写', '外貌', '外貌要点']);
    const 身材 = 读取首个文本字段(npc, ['身材描写', '身材', '身材要点']);
    const 衣着 = 读取首个文本字段(npc, ['衣着风格', '衣着', '衣着要点']);
    const 核心性格特征 = 读取首个文本字段(npc, ['核心性格特征', '性格', '性格特征']);

    return 清理空字段({
        姓名: typeof npc?.姓名 === 'string' ? npc.姓名.trim() : undefined,
        性别: typeof npc?.性别 === 'string' ? npc.性别.trim() : undefined,
        年龄: typeof npc?.年龄 === 'number' ? npc.年龄 : undefined,
        身份: 读取首个文本字段(npc, ['身份']) || undefined,
        境界: 启用修炼体系 ? (读取首个文本字段(npc, ['境界']) || undefined) : undefined,
        简介: 读取首个文本字段(npc, ['简介']) || undefined,
        核心性格特征: 核心性格特征 || undefined,
        性格: 核心性格特征 || undefined,
        关系状态: 读取首个文本字段(npc, ['关系状态']) || undefined,
        外貌: 外貌 || undefined,
        身材: 身材 || undefined,
        衣着: 衣着 || undefined
    });
};

export const 提取主角生图基础数据 = (character: any, options?: 生图基础数据选项) => {
    const 启用修炼体系 = options?.cultivationSystemEnabled !== false;
    const 清理空字段 = <T extends Record<string, any>>(obj: T): Partial<T> => {
        return Object.fromEntries(
            Object.entries(obj).filter(([, value]) => {
                if (value === undefined || value === null) return false;
                if (typeof value === 'string' && value.trim().length === 0) return false;
                if (Array.isArray(value) && value.length === 0) return false;
                if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false;
                return true;
            })
        ) as Partial<T>;
    };

    const 取文本 = (value: unknown): string => (
        typeof value === 'string' ? value.trim() : ''
    );

    return 清理空字段({
        姓名: 取文本(character?.姓名) || '主角',
        性别: 取文本(character?.性别) || undefined,
        年龄: typeof character?.年龄 === 'number' ? character.年龄 : undefined,
        身份: [取文本(character?.称号), 取文本(character?.出身背景?.名称)].filter(Boolean).join(' / ') || undefined,
        境界: 启用修炼体系 ? (取文本(character?.境界) || undefined) : undefined,
        简介: 取文本(character?.出身背景?.描述) || undefined,
        核心性格特征: 取文本(character?.性格) || undefined,
        性格: 取文本(character?.性格) || undefined,
        外貌: 取文本(character?.外貌) || undefined,
        衣着: (() => {
            const equippedNames = ['头部', '胸部', '盔甲', '内衬', '腿部', '手部', '足部', '背部', '腰部']
                .map((slot) => {
                    const name = typeof character?.装备?.[slot] === 'string' ? character.装备[slot].trim() : '';
                    return !name || name === '无' ? '' : name;
                })
                .filter(Boolean);
            return equippedNames.join('，') || undefined;
        })()
    });
};

export const 提取NPC香闺秘档部位生图数据 = (npc: any, part: '胸部' | '小穴' | '屁穴', options?: 生图基础数据选项) => {
    const 基础 = 提取NPC生图基础数据(npc, options);
    const 读取文本 = (obj: any, key: string): string | undefined => (
        typeof obj?.[key] === 'string' && obj[key].trim().length > 0 ? obj[key].trim() : undefined
    );
    const 描述字段 = part === '胸部' ? '胸部描述' : part === '小穴' ? '小穴描述' : '屁穴描述';

    return {
        ...基础,
        胸部描述: part === '胸部' ? 读取文本(npc, '胸部描述') : undefined,
        小穴描述: part === '小穴' ? 读取文本(npc, '小穴描述') : undefined,
        屁穴描述: part === '屁穴' ? 读取文本(npc, '屁穴描述') : undefined,
        目标部位: part,
        目标描述字段: 描述字段,
        目标描述文本: 读取文本(npc, 描述字段),
        身材: 读取文本(npc, '身材描写') || 读取文本(npc, '身材'),
        外貌: 读取文本(npc, '外貌描写') || 读取文本(npc, '外貌'),
        衣着: 读取文本(npc, '衣着风格') || 读取文本(npc, '衣着')
    };
};

export const 构建NPC上下文 = (
    socialData: any[],
    memoryConfig: 记忆配置结构,
    options?: {
        worldPrompt?: string;
        realmPrompt?: string;
        openingConfig?: OpeningConfig | null;
        cultivationSystemEnabled?: boolean;
    }
): {
    在场数据块: string;
    离场数据块: string;
} => {
    const npcList = Array.isArray(socialData) ? socialData : [];
    const 启用修炼体系 = options?.cultivationSystemEnabled !== false;
    const 普通关键记忆条数N = 5;
    const 重要角色关键记忆条数N = 规范化记忆配置(memoryConfig).重要角色关键记忆条数N;

    const 清理空字段 = <T extends Record<string, any>>(obj: T): Partial<T> => {
        return Object.fromEntries(
            Object.entries(obj).filter(([, value]) => {
                if (value === undefined || value === null) return false;
                if (typeof value === 'string' && value.trim().length === 0) return false;
                if (Array.isArray(value) && value.length === 0) return false;
                if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false;
                return true;
            })
        ) as Partial<T>;
    };

    const 树状上下文缩进 = (depth: number): string => '  '.repeat(depth);

    const 树状上下文为空 = (value: unknown): boolean => {
        if (value == null) return true;
        if (typeof value === 'string') return value.trim().length <= 0;
        if (typeof value === 'number') return !Number.isFinite(value);
        if (typeof value === 'boolean') return false;
        if (Array.isArray(value)) {
            return value.every((item) => 树状上下文为空(item));
        }
        if (typeof value === 'object') {
            return Object.entries(value as Record<string, unknown>)
                .filter(([key]) => key !== '索引')
                .every(([, child]) => 树状上下文为空(child));
        }
        return false;
    };

    const 格式化树状上下文标量 = (value: unknown): string => {
        if (typeof value === 'string') return value.trim();
        if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
        if (typeof value === 'boolean') return value ? '是' : '否';
        return '';
    };

    const 树状上下文对象摘要键 = [
        '标题',
        '事件名',
        '镜头标题',
        '阶段名',
        '分歧线名',
        '女主姓名',
        '姓名',
        '对象',
        '名称',
        '标签',
        '类型'
    ];

    const 读取树状上下文对象摘要 = (
        value: Record<string, unknown>,
        fallbackIndex: number
    ): { key: string; label: string } => {
        const summaryIndex = typeof value?.索引 === 'number' && Number.isFinite(value.索引)
            ? value.索引
            : fallbackIndex;
        for (const key of 树状上下文对象摘要键) {
            const text = 格式化树状上下文标量(value[key]);
            if (text) {
                return {
                    key,
                    label: `[${summaryIndex}] ${key}: ${text}`
                };
            }
        }
        return {
            key: '',
            label: `[${summaryIndex}]`
        };
    };

    const 追加树状上下文行 = (
        lines: string[],
        label: string,
        value: unknown,
        depth: number
    ) => {
        if (树状上下文为空(value)) return;
        const indent = 树状上下文缩进(depth);

        if (Array.isArray(value)) {
            const items = value.filter((item) => !树状上下文为空(item));
            if (items.length <= 0) return;
            const scalarArray = items.every((item) => (
                item == null
                || typeof item === 'string'
                || typeof item === 'number'
                || typeof item === 'boolean'
            ));
            if (scalarArray) {
                const text = items
                    .map((item) => 格式化树状上下文标量(item))
                    .filter(Boolean)
                    .join('；');
                if (text) {
                    lines.push(`${indent}${label}: ${text}`);
                }
                return;
            }
            lines.push(`${indent}${label}:`);
            items.forEach((item, index) => {
                if (item && typeof item === 'object' && !Array.isArray(item)) {
                    const record = item as Record<string, unknown>;
                    const summary = 读取树状上下文对象摘要(record, index);
                    lines.push(`${树状上下文缩进(depth + 1)}- ${summary.label}`);
                    Object.entries(record)
                        .filter(([key, child]) => key !== '索引' && key !== summary.key && !树状上下文为空(child))
                        .forEach(([key, child]) => {
                            追加树状上下文行(lines, key, child, depth + 2);
                        });
                    return;
                }
                const text = 格式化树状上下文标量(item);
                if (text) {
                    lines.push(`${树状上下文缩进(depth + 1)}- ${text}`);
                }
            });
            return;
        }

        if (value && typeof value === 'object') {
            const entries = Object.entries(value as Record<string, unknown>)
                .filter(([key, child]) => key !== '索引' && !树状上下文为空(child));
            if (entries.length <= 0) return;
            lines.push(`${indent}${label}:`);
            entries.forEach(([key, child]) => {
                追加树状上下文行(lines, key, child, depth + 1);
            });
            return;
        }

        const text = 格式化树状上下文标量(value);
        if (text) {
            lines.push(`${indent}${label}: ${text}`);
        }
    };

    const 序列化树状上下文 = (value: unknown): string => {
        const lines: string[] = [];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.entries(value as Record<string, unknown>)
                .filter(([key, child]) => key !== '索引' && !树状上下文为空(child))
                .forEach(([key, child]) => {
                    追加树状上下文行(lines, key, child, 0);
                });
            return lines.join('\n').trim();
        }
        if (Array.isArray(value)) {
            const items = value.filter((item) => !树状上下文为空(item));
            if (items.length <= 0) return '';
            const scalarArray = items.every((item) => (
                item == null
                || typeof item === 'string'
                || typeof item === 'number'
                || typeof item === 'boolean'
            ));
            if (scalarArray) {
                return items
                    .map((item) => 格式化树状上下文标量(item))
                    .filter(Boolean)
                    .map((text) => `- ${text}`)
                    .join('\n')
                    .trim();
            }
            items.forEach((item, index) => {
                if (item && typeof item === 'object' && !Array.isArray(item)) {
                    const record = item as Record<string, unknown>;
                    const summary = 读取树状上下文对象摘要(record, index);
                    lines.push(`- ${summary.label}`);
                    Object.entries(record)
                        .filter(([key, child]) => key !== '索引' && key !== summary.key && !树状上下文为空(child))
                        .forEach(([key, child]) => {
                            追加树状上下文行(lines, key, child, 1);
                        });
                    return;
                }
                const text = 格式化树状上下文标量(item);
                if (text) {
                    lines.push(`- ${text}`);
                }
            });
            return lines.join('\n').trim();
        }
        追加树状上下文行(lines, '内容', value, 0);
        return lines.join('\n').trim();
    };

    const 包装NPC树状上下文 = (title: string, value: unknown): string => {
        const body = 序列化树状上下文(value);
        return `【${title}】(源于社交)\n${body || '无'}`;
    };

    const 规范化时间文本 = (raw: any, fallback: string = ''): string => {
        let source = '';
        if (typeof raw === 'string') {
            source = raw.trim();
        } else if (raw && typeof raw === 'object') {
            source = 结构化时间转标准串(raw) || '';
        }
        if (!source) return fallback;
        return normalizeCanonicalGameTime(source) || source;
    };

    const 标准化记忆 = (npc: any, limit: number) => {
        if (!Array.isArray(npc?.记忆)) return [];
        const 记忆源 = npc.记忆
            .map((m: any, 原始索引: number) => ({
                原始索引,
                时间: 规范化时间文本(m?.时间, '未知时间'),
                内容: typeof m?.内容 === 'string' ? m.内容 : String(m?.内容 ?? '')
            }))
            .filter((m: any) => m.内容.trim().length > 0)
            .slice(-Math.max(1, limit));
        return 记忆源.map((m: any) => ({
            索引: m.原始索引,
            时间: m.时间,
            内容: m.内容
        }));
    };

    const 标准化关系网变量 = (npc: any) => {
        if (!Array.isArray(npc?.关系网变量)) return [];
        return npc.关系网变量
            .map((item: any, 索引: number) => ({
                索引,
                对象姓名: typeof item?.对象姓名 === 'string' ? item.对象姓名.trim() : '',
                关系: typeof item?.关系 === 'string' ? item.关系.trim() : '',
                备注: typeof item?.备注 === 'string' ? item.备注.trim() : undefined
            }))
            .filter((item: any) => item.对象姓名 && item.关系);
    };

    const 标准化子宫档案 = (npc: any) => {
        const 子宫源 = (npc as any)?.子宫;
        if (!子宫源 || typeof 子宫源 !== 'object' || Array.isArray(子宫源)) return undefined;

        const 状态 = typeof 子宫源?.状态 === 'string' ? 子宫源.状态.trim() : '';
        const 宫口状态 = typeof 子宫源?.宫口状态 === 'string' ? 子宫源.宫口状态.trim() : '';
        const 内射记录源 = Array.isArray((子宫源 as any)?.内射记录)
            ? (子宫源 as any).内射记录
            : [];

        const 内射记录 = 内射记录源
            .map((记录项: any, 记录索引: number) => ({
                索引: 记录索引,
                日期: 规范化时间文本(记录项?.日期),
                描述: typeof 记录项?.描述 === 'string' ? 记录项.描述.trim() : '',
                怀孕判定日: 规范化时间文本(记录项?.怀孕判定日)
            }))
            .filter((记录: any) => 记录.日期 || 记录.描述 || 记录.怀孕判定日);

        if (!状态 && !宫口状态 && 内射记录.length === 0) return undefined;
        return {
            状态,
            宫口状态,
            内射记录
        };
    };

    const 读取文本 = (obj: any, key: string): string => (
        typeof obj?.[key] === 'string' ? obj[key].trim() : ''
    );

    const 读取胸部描述 = (npc: any): string => {
        return 读取文本(npc, '胸部描述');
    };

    const 读取小穴描述 = (npc: any): string => {
        return 读取文本(npc, '小穴描述');
    };

    const 读取屁穴描述 = (npc: any): string => {
        return 读取文本(npc, '屁穴描述');
    };

    const 读取性癖 = (npc: any): string => {
        return 读取文本(npc, '性癖');
    };

    const 读取敏感点 = (npc: any): string => {
        return 读取文本(npc, '敏感点');
    };

    const 提取基础数据 = (npc: any, index: number, 是否队友: boolean) => {
        const 核心性格特征 = typeof npc?.核心性格特征 === 'string' ? npc.核心性格特征.trim() : '';
        const 好感度突破条件 = typeof npc?.好感度突破条件 === 'string' ? npc.好感度突破条件.trim() : '';
        const 关系突破条件 = typeof npc?.关系突破条件 === 'string' ? npc.关系突破条件.trim() : '';
        const 关系网变量 = 标准化关系网变量(npc);
        return {
            索引: index,
            id: typeof npc?.id === 'string' ? npc.id : `npc_${index}`,
            姓名: typeof npc?.姓名 === 'string' ? npc.姓名 : `角色${index}`,
            性别: typeof npc?.性别 === 'string' ? npc.性别 : '未知',
            ...(启用修炼体系 ? {
                境界: typeof npc?.境界 === 'string' ? npc.境界 : '未知境界',
                境界映射值: 解析境界映射值(npc?.境界, {
                    worldPrompt: options?.worldPrompt,
                    realmPrompt: options?.realmPrompt,
                    openingConfig: options?.openingConfig
                })
            } : {}),
            身份: typeof npc?.身份 === 'string' ? npc.身份 : '未知身份',
            是否队友,
            关系状态: typeof npc?.关系状态 === 'string' ? npc.关系状态 : '未知',
            好感度: typeof npc?.好感度 === 'number' ? npc.好感度 : 0,
            简介: typeof npc?.简介 === 'string' ? npc.简介 : '暂无简介',
            ...(核心性格特征 ? { 核心性格特征 } : {}),
            ...(好感度突破条件 ? { 好感度突破条件 } : {}),
            ...(关系突破条件 ? { 关系突破条件 } : {}),
            ...(关系网变量.length > 0 ? { 关系网变量 } : {})
        };
    };

    const 提取完整基础数据 = (npc: any, index: number, 是否队友: boolean) => {
        const 基础 = 提取基础数据(npc, index, 是否队友);
        return 清理空字段({
            ...基础,
            年龄: typeof npc?.年龄 === 'number' ? npc.年龄 : undefined,
            外貌描写: typeof npc?.外貌描写 === 'string' ? npc.外貌描写 : undefined,
            身材描写: typeof npc?.身材描写 === 'string' ? npc.身材描写 : undefined,
            衣着风格: typeof npc?.衣着风格 === 'string' ? npc.衣着风格 : undefined,
            胸部描述: 读取胸部描述(npc) || undefined,
            小穴描述: 读取小穴描述(npc) || undefined,
            屁穴描述: 读取屁穴描述(npc) || undefined,
            性癖: 读取性癖(npc) || undefined,
            敏感点: 读取敏感点(npc) || undefined,
            子宫: (() => {
                const 子宫档案 = 标准化子宫档案(npc);
                return 子宫档案 || undefined;
            })(),
            是否处女: typeof npc?.是否处女 === 'boolean' ? npc.是否处女 : undefined,
            初夜夺取者: typeof npc?.初夜夺取者 === 'string' ? npc.初夜夺取者 : undefined,
            初夜时间: 规范化时间文本(npc?.初夜时间) || undefined,
            初夜描述: typeof npc?.初夜描述 === 'string' ? npc.初夜描述 : undefined
        });
    };

    const 提取队伍战斗附加 = (npc: any, 是否在场: boolean, 是否队友: boolean) => {
        if (!是否在场 || !是否队友) return undefined;
        const 附加 = 清理空字段({
            攻击力: typeof npc?.攻击力 === 'number' ? npc.攻击力 : undefined,
            防御力: typeof npc?.防御力 === 'number' ? npc.防御力 : undefined,
            上次更新时间: typeof npc?.上次更新时间 === 'string'
                ? (normalizeCanonicalGameTime(npc.上次更新时间) || npc.上次更新时间)
                : undefined,
            当前血量: typeof npc?.当前血量 === 'number' ? npc.当前血量 : undefined,
            最大血量: typeof npc?.最大血量 === 'number' ? npc.最大血量 : undefined,
            当前精力: typeof npc?.当前精力 === 'number' ? npc.当前精力 : undefined,
            最大精力: typeof npc?.最大精力 === 'number' ? npc.最大精力 : undefined,
            ...(启用修炼体系 ? {
                当前内力: typeof npc?.当前内力 === 'number' ? npc.当前内力 : undefined,
                最大内力: typeof npc?.最大内力 === 'number' ? npc.最大内力 : undefined
            } : {}),
            当前装备: typeof npc?.当前装备 === 'object' && npc.当前装备 ? npc.当前装备 : undefined,
            背包: Array.isArray(npc?.背包)
                ? npc.背包
                    .map((item: any) => {
                        if (typeof item === 'string') {
                            const 名称 = item.trim();
                            return 名称 ? { 名称 } : null;
                        }
                        if (item && typeof item === 'object') {
                            const 名称 = typeof item?.名称 === 'string' ? item.名称.trim() : '';
                            return 名称 ? { 名称 } : null;
                        }
                        return null;
                    })
                    .filter((item: any): item is { 名称: string } => Boolean(item))
                : undefined
        });
        return Object.keys(附加).length > 0 ? 附加 : undefined;
    };

    const 提取最后互动 = (npc: any): { 内容: string; 时间: string } | undefined => {
        const latest = 标准化记忆(npc, 1)[0];
        if (!latest || !latest.内容) return undefined;
        return {
            内容: latest.内容,
            时间: latest.时间 || '未知时间'
        };
    };

    const 提取离场刷新锚点 = (npc: any, lastInteraction?: { 内容: string; 时间: string }) => {
        const 最近记忆 = 标准化记忆(npc, 3);
        const 最近记忆摘要 = 最近记忆.map((item: any) => ({
            时间: item.时间,
            内容: item.内容
        }));
        const 最后互动时间 = lastInteraction?.时间
            || (typeof npc?.最后互动时间 === 'string' ? 规范化时间文本(npc?.最后互动时间) : '')
            || '';
        return 清理空字段({
            最后互动时间: 最后互动时间 || undefined,
            最近记忆摘要: 最近记忆摘要.length > 0 ? 最近记忆摘要 : undefined,
            最近状态: typeof npc?.状态 === 'string' ? npc.状态.trim() : undefined,
            最近位置: typeof npc?.当前位置 === 'string' ? npc.当前位置.trim() : undefined,
            再登场审计要求: '若当前环境时间与最后互动时间间隔过长，必须先刷新 NPC 档案/记忆/位置/状态后再出场。'
        });
    };

    const toEntry = (npc: any, index: number) => {
        const 是否在场 = typeof npc?.是否在场 === 'boolean' ? npc.是否在场 : true;
        const 是否队友 = typeof npc?.是否队友 === 'boolean' ? npc.是否队友 : false;
        const 是否主要角色 = typeof npc?.是否主要角色 === 'boolean' ? npc.是否主要角色 : false;
        const 记忆展示 = 构建NPC记忆展示结果(npc?.总结记忆, npc?.记忆);
        const 基础数据 = 提取基础数据(npc, index, 是否队友);
        const 完整基础数据 = 提取完整基础数据(npc, index, 是否队友);
        const 队伍战斗附加 = 提取队伍战斗附加(npc, 是否在场, 是否队友);
        const 最后互动 = 提取最后互动(npc);
        const 离场刷新锚点 = 提取离场刷新锚点(npc, 最后互动);
        return {
            索引: 基础数据.索引,
            id: 基础数据.id,
            姓名: 基础数据.姓名,
            性别: 基础数据.性别,
            境界: 基础数据.境界,
            境界映射值: 基础数据.境界映射值,
            年龄: typeof npc?.年龄 === 'number' ? npc.年龄 : undefined,
            简介: 基础数据.简介,
            是否在场,
            是否队友,
            是否主要角色,
            基础数据,
            完整基础数据,
            队伍战斗附加,
            最后互动,
            离场刷新锚点,
            总结记忆: 记忆展示.总结记忆,
            记忆: 记忆展示.记忆
        };
    };

    const entries = npcList.map((npc, index) => toEntry(npc, index));

    const 在场数据 = entries
        .filter(n => n.是否在场)
        .map(n => {
            const baseData = n.是否主要角色 ? n.完整基础数据 : n.基础数据;
            return 清理空字段({
                ...baseData,
                是否主要角色: n.是否主要角色,
                ...(n.总结记忆.length > 0 ? {
                    总结记忆: Object.fromEntries(
                        n.总结记忆.map((item: any) => [item.标签, {
                            索引范围: item.索引范围,
                            时间: item.时间,
                            内容: item.内容,
                            条数: item.条数
                        }])
                    )
                } : {}),
                ...(n.记忆.length > 0 ? {
                    记忆: Object.fromEntries(
                        n.记忆.map((item: any) => [item.标签, {
                            时间: item.时间,
                            内容: item.内容
                        }])
                    )
                } : {}),
                ...(n.队伍战斗附加 ? { 战斗状态: n.队伍战斗附加 } : {})
            });
        });

    const 离场数据 = entries
        .filter(n => !n.是否在场)
        .map(n => 清理空字段(
            n.是否主要角色
                ? {
                    ...n.完整基础数据,
                    是否主要角色: n.是否主要角色,
                    ...(n.总结记忆.length > 0 ? {
                        总结记忆: Object.fromEntries(
                            n.总结记忆.map((item: any) => [item.标签, {
                                索引范围: item.索引范围,
                                时间: item.时间,
                                内容: item.内容,
                                条数: item.条数
                            }])
                        )
                    } : {}),
                    ...(n.记忆.length > 0 ? {
                        记忆: Object.fromEntries(
                            n.记忆.map((item: any) => [item.标签, {
                                时间: item.时间,
                                内容: item.内容
                            }])
                        )
                    } : {})
                }
                : {
                    ...n.基础数据,
                    是否主要角色: n.是否主要角色,
                    最后互动: n.最后互动,
                    离场刷新锚点: n.离场刷新锚点,
                    ...(n.总结记忆.length > 0 ? {
                        总结记忆: Object.fromEntries(
                            n.总结记忆.map((item: any) => [item.标签, {
                                索引范围: item.索引范围,
                                时间: item.时间,
                                内容: item.内容,
                                条数: item.条数
                            }])
                        )
                    } : {}),
                    ...(n.记忆.length > 0 ? {
                        记忆: Object.fromEntries(
                            n.记忆.map((item: any) => [item.标签, {
                                时间: item.时间,
                                内容: item.内容
                            }])
                        )
                    } : {})
                }
        ));

    return {
        在场数据块: 包装NPC树状上下文('以下为在场角色', 在场数据),
        离场数据块: 包装NPC树状上下文('以下为不在场角色', 离场数据)
    };
};

