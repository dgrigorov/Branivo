'use client';

import { getFieldLabel } from '@/lib/constants/ocr-field-labels';
import type { OcrFieldStat } from '@/lib/hooks/use-ocr-analytics';

interface OcrOverviewChartProps {
  stats: OcrFieldStat[];
}

function barColor(confidence: number): string {
  if (confidence >= 0.85) return '#22c55e';
  if (confidence >= 0.70) return '#f59e0b';
  return '#ef4444';
}

export function OcrOverviewChart({ stats }: OcrOverviewChartProps) {
  if (stats.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-400">
        Няма данни
      </div>
    );
  }

  const sorted = [...stats].sort((a, b) => b.avgConfidence - a.avgConfidence);
  const BAR_HEIGHT = 28;
  const LABEL_WIDTH = 220;
  const BAR_MAX_WIDTH = 320;
  const ROW_GAP = 8;
  const PADDING = { top: 12, right: 60, bottom: 12, left: LABEL_WIDTH + 12 };
  const totalHeight =
    PADDING.top +
    sorted.length * (BAR_HEIGHT + ROW_GAP) -
    ROW_GAP +
    PADDING.bottom;
  const totalWidth = PADDING.left + BAR_MAX_WIDTH + PADDING.right;

  return (
    <div className="overflow-x-auto">
      <svg
        width={totalWidth}
        height={totalHeight}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        aria-label="OCR field confidence overview chart"
      >
        {/* 85% threshold line */}
        {(() => {
          const x = PADDING.left + BAR_MAX_WIDTH * 0.85;
          return (
            <g>
              <line
                x1={x}
                y1={PADDING.top}
                x2={x}
                y2={totalHeight - PADDING.bottom}
                stroke="#94a3b8"
                strokeDasharray="4 2"
                strokeWidth={1}
              />
              <text x={x + 3} y={PADDING.top + 10} fontSize={9} fill="#94a3b8">
                85%
              </text>
            </g>
          );
        })()}

        {sorted.map((stat, i) => {
          const y = PADDING.top + i * (BAR_HEIGHT + ROW_GAP);
          const barWidth = BAR_MAX_WIDTH * stat.avgConfidence;
          const color = barColor(stat.avgConfidence);
          const label = getFieldLabel(stat.fieldName);

          return (
            <g key={stat.fieldName}>
              {/* Field label */}
              <text
                x={PADDING.left - 8}
                y={y + BAR_HEIGHT / 2 + 4}
                textAnchor="end"
                fontSize={11}
                fill="#374151"
              >
                {label.length > 32 ? `${label.slice(0, 30)}…` : label}
              </text>

              {/* Background bar */}
              <rect
                x={PADDING.left}
                y={y}
                width={BAR_MAX_WIDTH}
                height={BAR_HEIGHT}
                rx={4}
                fill="#f1f5f9"
              />

              {/* Confidence bar */}
              <rect
                x={PADDING.left}
                y={y}
                width={Math.max(barWidth, 2)}
                height={BAR_HEIGHT}
                rx={4}
                fill={color}
                fillOpacity={0.85}
              />

              {/* Percentage label */}
              <text
                x={PADDING.left + barWidth + 6}
                y={y + BAR_HEIGHT / 2 + 4}
                fontSize={11}
                fontWeight="600"
                fill="#374151"
              >
                {(stat.avgConfidence * 100).toFixed(1)}%
              </text>

              {/* Fallback rate badge */}
              {stat.fallbackRate > 0 && (
                <text
                  x={totalWidth - 4}
                  y={y + BAR_HEIGHT / 2 + 4}
                  textAnchor="end"
                  fontSize={10}
                  fill={stat.fallbackRate > 0.2 ? '#ef4444' : '#6b7280'}
                >
                  ↺{(stat.fallbackRate * 100).toFixed(0)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[10px] text-gray-400">
        ↺ — fallback rate (AWS Textract)
      </p>
    </div>
  );
}
