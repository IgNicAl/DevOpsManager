interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  yMax?: number;
}

export default function Sparkline({ values, width = 80, height = 24, color = 'var(--color-primary)', yMax }: Props) {
  if (!values.length) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }
  const max = yMax ?? Math.max(...values, 1);
  const min = 0;
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
