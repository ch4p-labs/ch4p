/**
 * Tests for sanitizeChartData — the defensive data normalizer that
 * prevents NaN SVG coordinates from crashing tldraw's chart renderer.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeChartData } from './chart-utils';

describe('sanitizeChartData', () => {
  // ─── Valid data ─────────────────────────────────────────────────────

  it('returns valid data unchanged', () => {
    const input = {
      labels: ['A', 'B'],
      datasets: [{ label: 'Sales', values: [10, 20], color: '#f00' }],
    };
    const result = sanitizeChartData(input);
    expect(result).toEqual(input);
  });

  it('preserves multiple datasets', () => {
    const input = {
      labels: ['Q1', 'Q2'],
      datasets: [
        { label: 'Revenue', values: [100, 200] },
        { label: 'Costs', values: [80, 150] },
      ],
    };
    const result = sanitizeChartData(input);
    expect(result!.datasets).toHaveLength(2);
  });

  // ─── Null / invalid inputs ──────────────────────────────────────────

  it('returns null for null', () => {
    expect(sanitizeChartData(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(sanitizeChartData(undefined)).toBeNull();
  });

  it('returns null for non-object', () => {
    expect(sanitizeChartData('string')).toBeNull();
    expect(sanitizeChartData(42)).toBeNull();
    expect(sanitizeChartData(true)).toBeNull();
  });

  it('returns null when datasets is not an array', () => {
    expect(sanitizeChartData({ labels: ['A'], datasets: 'bad' })).toBeNull();
  });

  it('returns null when datasets is missing', () => {
    expect(sanitizeChartData({ labels: ['A'] })).toBeNull();
  });

  it('returns null when all datasets lack values arrays', () => {
    const input = {
      labels: ['A'],
      datasets: [{ label: 'Bad', values: 'not-an-array' }],
    };
    expect(sanitizeChartData(input)).toBeNull();
  });

  // ─── Value coercion ────────────────────────────────────────────────

  it('coerces NaN values to 0', () => {
    const input = {
      labels: ['A'],
      datasets: [{ label: 'Test', values: [NaN, 'bad', null, undefined] }],
    };
    const result = sanitizeChartData(input);
    expect(result!.datasets[0]!.values).toEqual([0, 0, 0, 0]);
  });

  it('coerces Infinity to 0', () => {
    const input = {
      labels: ['A'],
      datasets: [{ label: 'Test', values: [Infinity, -Infinity] }],
    };
    const result = sanitizeChartData(input);
    expect(result!.datasets[0]!.values).toEqual([0, 0]);
  });

  it('preserves valid numeric strings as numbers', () => {
    const input = {
      labels: ['A'],
      datasets: [{ label: 'Test', values: ['10', '20.5'] }],
    };
    const result = sanitizeChartData(input);
    expect(result!.datasets[0]!.values).toEqual([10, 20.5]);
  });

  // ─── Label coercion ────────────────────────────────────────────────

  it('coerces non-string labels to strings', () => {
    const input = {
      labels: [1, null, undefined, true],
      datasets: [{ label: 'Test', values: [1, 2, 3, 4] }],
    };
    const result = sanitizeChartData(input);
    expect(result!.labels).toEqual(['1', '', '', 'true']);
  });

  it('provides empty labels array when labels is missing', () => {
    const input = {
      datasets: [{ label: 'Test', values: [1] }],
    };
    const result = sanitizeChartData(input);
    expect(result!.labels).toEqual([]);
  });

  // ─── Dataset filtering ─────────────────────────────────────────────

  it('filters out non-object datasets', () => {
    const input = {
      labels: ['A'],
      datasets: [null, 'bad', 42, { label: 'Good', values: [1] }],
    };
    const result = sanitizeChartData(input);
    expect(result!.datasets).toHaveLength(1);
    expect(result!.datasets[0]!.label).toBe('Good');
  });

  it('filters out datasets without values array', () => {
    const input = {
      labels: ['A'],
      datasets: [
        { label: 'No values' },
        { label: 'Has values', values: [5] },
      ],
    };
    const result = sanitizeChartData(input);
    expect(result!.datasets).toHaveLength(1);
    expect(result!.datasets[0]!.label).toBe('Has values');
  });

  it('omits color when not provided', () => {
    const input = {
      labels: ['A'],
      datasets: [{ label: 'Test', values: [1] }],
    };
    const result = sanitizeChartData(input);
    expect(result!.datasets[0]).not.toHaveProperty('color');
  });

  it('includes color when provided', () => {
    const input = {
      labels: ['A'],
      datasets: [{ label: 'Test', values: [1], color: '#ff0000' }],
    };
    const result = sanitizeChartData(input);
    expect(result!.datasets[0]!.color).toBe('#ff0000');
  });
});
