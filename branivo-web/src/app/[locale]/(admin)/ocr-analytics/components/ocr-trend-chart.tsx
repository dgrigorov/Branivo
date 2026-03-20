'use client';

import type { OcrTrendPoint } from '@/lib/hooks/use-ocr-analytics';

interface OcrTrendChartProps {
  data: OcrTrendPoint[];
  field: string;
}

export function OcrTrendChart({ data, field }: OcrTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-500">
        Няма данни за поле &quot;{field}&quot;
      </div>
    );
  }

  const WIDTH = 600;
  const HEIGHT = 200;
  const PADDING = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const confidences = data.map((d) => d.avgConfidence);
  const minY = Math.min(...confidences);
  const maxY = Math.max(...confidences);
  const yRange = maxY - minY || 0.1;

  const toX = (i: number): number =>
    PADDING.left + (i / (data.length - 1 || 1)) * chartWidth;
  const toY = (v: number): number =>
    PADDING.top + chartHeight - ((v - minY) / yRange) * chartHeight;

  const points = data.map((d, i) => `${toX(i)},${toY(d.avgConfidence)}`).join(' ');
  const area =
    `M ${toX(0)},${PADDING.top + chartHeight} ` +
    data.map((d, i) => `L ${toX(i)},${toY(d.avgConfidence)}`).join(' ') +
    ` L ${toX(data.length - 1)},${PADDING.top + chartHeight} Z`;

  return (
    <div className="overflow-x-auto">
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        aria-label={`Trend chart for ${field}`}
      >
        {/* Area fill */}
        <path d={area} fill="#3b82f6" fillOpacity={0.1} />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
        />
        {/* Data points */}
        {data.map((d, i) => (
          <circle
            key={d.date}
            cx={toX(i)}
            cy={toY(d.avgConfidence)}
            r={4}
            fill="#3b82f6"
          >
            <title>{`${d.date}: ${(d.avgConfidence * 100).toFixed(1)}%`}</title>
          </circle>
        ))}
        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % Math.ceil(data.length / 5) !== 0 && i !== data.length - 1)
            return null;
          return (
            <text
              key={`x-${d.date}`}
              x={toX(i)}
              y={HEIGHT - 5}
              textAnchor="middle"
              fontSize={10}
              fill="#6b7280"
            >
              {d.date.slice(5)}
            </text>
          );
        })}
        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => {
          const value = minY + v * yRange;
          const y = toY(value);
          if (y < PADDING.top || y > PADDING.top + chartHeight) return null;
          return (
            <g key={`y-${v}`}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + chartWidth}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="4"
              />
              <text
                x={PADDING.left - 5}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="#6b7280"
              >
                {(value * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
