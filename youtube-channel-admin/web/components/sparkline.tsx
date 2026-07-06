/** Tiny inline SVG sparkline for the daily views series. */
export function Sparkline({
  points,
  className,
  height = 32,
}: {
  points: number[];
  className?: string;
  height?: number;
}) {
  if (points.length < 2) return null;

  const width = 100;
  const max = Math.max(...points, 1);
  const step = width / (points.length - 1);
  const coords = points.map((value, index) => {
    const x = index * step;
    const y = height - (value / max) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height }}
      aria-hidden
    >
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
