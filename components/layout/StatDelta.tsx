import React from 'react';

const use数值变化提示 = (value: number | string | undefined) => {
    const previousRef = React.useRef<number | null>(null);
    const [delta, setDelta] = React.useState<number | null>(null);
    const numeric = Number(value);
    React.useEffect(() => {
        if (!Number.isFinite(numeric)) return;
        const previous = previousRef.current;
        previousRef.current = numeric;
        if (previous === null || previous === numeric) return;
        setDelta(numeric - previous);
        const timer = window.setTimeout(() => setDelta(null), 2600);
        return () => window.clearTimeout(timer);
    }, [numeric]);
    return delta;
};

export default function StatDelta({ current, commandDelta }: { current: number | undefined; commandDelta?: number | null }) {
    const liveDelta = use数值变化提示(current);
    const value = commandDelta ?? liveDelta;
    return value === null ? null : (
        <span className="font-mono text-[0.9em] text-wuxia-gold">{value > 0 ? '+' : ''}{value}</span>
    );
}
