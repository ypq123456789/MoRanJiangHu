export type RoomBox = { x: number; y: number; w: number; h: number };

/** Old saves use discovery order. Persisted slots survive later full-map updates and removals. */
export function getRoomSlots(rooms: Array<{ ID: string; 房间格序?: number }>): Map<string, number> {
    const slots = new Map<string, number>();
    const taken = new Set<number>();
    for (const room of rooms) {
        const slot = room.房间格序;
        // Ignore malformed imported coordinates; avoid allocating an arbitrarily large floor plan.
        if (slot === undefined || !Number.isSafeInteger(slot) || slot < 0 ||
            slot > Math.max(4096, rooms.length * 4) || taken.has(slot)) continue;
        slots.set(room.ID, slot);
        taken.add(slot);
    }
    let next = 0;
    for (const room of rooms) {
        if (slots.has(room.ID)) continue;
        while (taken.has(next)) next++;
        slots.set(room.ID, next);
        taken.add(next++);
    }
    return slots;
}

const makeRandom = (seed: string) => {
    let state = 2166136261;
    for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

/** Split the same venue the same way on every visit. Only unexplored cells are subdivided. */
export function layoutRoomGrid(venueId: string, bounds: RoomBox, roomCount: number) {
    const random = makeRandom(venueId);
    const split = (box: RoomBox, cols: number, rows: number) => {
        const cuts = (n: number) => Array.from({ length: n + 1 }, (_, i) =>
            i === 0 ? 0 : i === n ? 1 : (i + (random() - 0.5) * 0.28) / n);
        const xs = cuts(cols), ys = cuts(rows);
        const cells: RoomBox[] = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                cells.push({
                    x: box.x + xs[col] * box.w, y: box.y + ys[row] * box.h,
                    w: (xs[col + 1] - xs[col]) * box.w, h: (ys[row + 1] - ys[row]) * box.h
                });
            }
        }
        return cells;
    };
    const shuffle = (cells: RoomBox[]) => {
        for (let i = cells.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [cells[i], cells[j]] = [cells[j], cells[i]];
        }
        return cells;
    };
    const cols = Math.max(2, Math.min(8, Math.round(Math.sqrt(16 * bounds.w / bounds.h))));
    let available = shuffle(split(bounds, cols, Math.max(2, Math.round(16 / cols))));
    const occupied: RoomBox[] = [];
    while (roomCount - occupied.length > Math.ceil(available.length / 2)) {
        occupied.push(...available.splice(0, Math.ceil(available.length / 2)));
        available = shuffle(available.flatMap(cell => split(cell, 2, 2)));
    }
    occupied.push(...available.splice(0, roomCount - occupied.length));

    // Draw walls/gutters inside each cell, leaving the partition itself immutable.
    const inset = ({ x, y, w, h }: RoomBox): RoomBox => {
        const pad = Math.min(w, h) * 0.035;
        return { x: x + pad, y: y + pad, w: w - pad * 2, h: h - pad * 2 };
    };
    return { rooms: occupied.map(inset), fog: available.map(inset) };
}

export function roomDoorPoint(box: RoomBox, other: RoomBox) {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const dx = other.x + other.w / 2 - cx, dy = other.y + other.h / 2 - cy;
    const scale = 0.5 / Math.max(Math.abs(dx / box.w), Math.abs(dy / box.h));
    return { x: cx + dx * scale, y: cy + dy * scale };
}
