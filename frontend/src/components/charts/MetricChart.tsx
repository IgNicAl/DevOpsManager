import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';

export interface MetricSample {
  t: number;
  v: number;
}

interface Props {
  points: MetricSample[];
  unit?: string;
  color?: string;
  height?: number;
  yMax?: number;
  label?: string;
}

export default function MetricChart({ points, unit = '%', color, height = 120, yMax = 100, label }: Props) {
  const stroke = color || 'var(--color-primary, #5bf06c)';
  const data = points.map((p) => ({ t: p.t, v: Math.round((p.v ?? 0) * 100) / 100 }));

  return (
    <div className="surface-card border border-outline-variant rounded p-3" style={{ height: height + 36 }}>
      {label && <div className="text-label-xs text-on-surface-variant mb-2">{label}</div>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="t" hide />
          <YAxis
            domain={[0, yMax]}
            tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 10 }}
            tickFormatter={(v) => `${v}${unit}`}
            width={36}
            stroke="var(--color-outline-variant)"
          />
          <Tooltip
            cursor={{ stroke: 'var(--color-outline-variant)', strokeWidth: 1 }}
            contentStyle={{
              backgroundColor: 'var(--color-surface-container-high)',
              border: '1px solid var(--color-outline-variant)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
            }}
            labelFormatter={(t) => new Date((t as number) * 1000).toLocaleTimeString()}
            formatter={(value: number) => [`${value}${unit}`, label || 'value']}
          />
          <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
