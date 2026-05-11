interface Props {
  width?: number | string;
  height?: number | string;
  className?: string;
}

export default function Skeleton({ width = '100%', height = 16, className = '' }: Props) {
  return (
    <span
      className={`inline-block bg-surface-container-highest animate-pulse rounded-sm ${className}`}
      style={{ width, height }}
    />
  );
}
