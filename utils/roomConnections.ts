interface RoomRef {
    ID: string;
    名称: string;
    层级: string;
    连通房间?: string[];
}

export function readRoomExits(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((entry): entry is string => typeof entry === 'string')
        .map(entry => entry.trim()).filter(Boolean))];
}

/** A recorded exit is bidirectional. Resolve only within this venue to avoid linking namesakes. */
export function getRoomPassages<T extends RoomRef>(children: T[]): Array<[T, T]> {
    const rooms = children.filter(child => child.层级 === '子地点');
    const byName = new Map(rooms.map(room => [room.名称, room]));
    const byId = new Map(rooms.map(room => [room.ID, room]));
    const seen = new Set<string>();
    const passages: Array<[T, T]> = [];
    for (const room of rooms) {
        for (const ref of readRoomExits(room.连通房间)) {
            const other = byId.get(ref) || byName.get(ref);
            if (!other || room === other) continue;
            const key = JSON.stringify([room.ID, other.ID].sort());
            if (seen.has(key)) continue;
            seen.add(key);
            passages.push([room, other]);
        }
    }
    return passages;
}
