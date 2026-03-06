/**
 * chart-utils — Pure sanitization for chart data.
 *
 * Extracted from ChartShape.tsx so it can be unit-tested without
 * pulling in tldraw / React DOM dependencies.
 */

import type { ChartData } from '@ch4p/canvas';

/**
 * Sanitise chart data so the SVG renderer never receives NaN or undefined.
 * Returns a cleaned copy — or `null` if no usable data remains.
 */
export function sanitizeChartData(data: unknown): ChartData | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  const labels = Array.isArray(d.labels)
    ? (d.labels as unknown[]).map((l) => String(l ?? ''))
    : [];

  if (!Array.isArray(d.datasets)) return null;

  const datasets = (d.datasets as unknown[])
    .filter((ds): ds is Record<string, unknown> => !!ds && typeof ds === 'object')
    .filter((ds) => Array.isArray(ds.values))
    .map((ds) => ({
      label: String(ds.label ?? ''),
      values: (ds.values as unknown[]).map((v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      }),
      ...(ds.color ? { color: String(ds.color) } : {}),
    }));

  if (datasets.length === 0) return null;
  return { labels, datasets };
}
