/**
 * Pure geometry for the Creator Analytics "plays over time" chart.
 *
 * Kept in its own module (no React/JSX) so it can be unit-tested directly and
 * so the component file only exports React components (react-refresh friendly).
 */

/** Round an axis maximum up to a calm "nice" value so the line never touches the top. */
function niceAxisMax(value: number): number {
  if (value <= 5) return Math.max(1, value);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const half = magnitude / 2;
  return Math.ceil(value / half) * half;
}

export interface ChartPoint {
  index: number;
  date: string;
  value: number;
  previousValue: number | null;
  /** Normalized 0–100 coordinates inside the plot rectangle. */
  x: number;
  y: number;
  previousY: number | null;
}

export interface ChartGeometry {
  points: ChartPoint[];
  maxValue: number;
  peak: number;
  hasCurrentValues: boolean;
  hasPreviousValues: boolean;
  areaPath: string;
  linePath: string;
  previousPath: string;
}

/**
 * Build normalized chart coordinates and SVG paths from the daily series.
 * Safe for zero data (no NaN) and high spikes (values clamp into the plot).
 */
export function buildChartGeometry(
  current: { date: string; plays: number }[],
  previous: { previousPlays: number }[],
): ChartGeometry {
  const count = current.length;
  const peak = current.reduce((max, day) => Math.max(max, day.plays), 0);
  const previousPeak = previous.reduce((max, day) => Math.max(max, day.previousPlays), 0);
  const hasCurrentValues = peak > 0;
  const hasPreviousValues = previousPeak > 0;
  const hasPreviousSeries = previous.length === count && count > 0;
  const maxValue = niceAxisMax(Math.max(1, peak, previousPeak));

  const toX = (index: number): number => (count > 1 ? (index / (count - 1)) * 100 : 50);
  const toY = (value: number): number => 100 - (value / maxValue) * 100;

  const points: ChartPoint[] = current.map((day, index) => {
    const previousValue = hasPreviousSeries ? previous[index].previousPlays : null;
    return {
      index,
      date: day.date,
      value: day.plays,
      previousValue,
      x: toX(index),
      y: toY(day.plays),
      previousY: previousValue !== null ? toY(previousValue) : null,
    };
  });

  const linePath = count > 0 ? `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}` : '';
  const areaPath =
    count > 0
      ? `M ${points[0].x},100 ${points.map((p) => `L ${p.x},${p.y}`).join(' ')} L ${
          points[count - 1].x
        },100 Z`
      : '';
  const previousPath =
    hasPreviousValues && hasPreviousSeries
      ? `M ${points.map((p) => `${p.x},${p.previousY}`).join(' L ')}`
      : '';

  return {
    points,
    maxValue,
    peak,
    hasCurrentValues,
    hasPreviousValues,
    areaPath,
    linePath,
    previousPath,
  };
}
