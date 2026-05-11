interface Props {
  count: number;
}

export default function AlertBadge({ count }: Props) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-error text-on-error text-label-xs font-bold pulse-error">
      {count > 99 ? '99+' : count}
    </span>
  );
}
