import { cosineSimilarity, embeddingToBlob, blobToEmbedding } from './vector.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('handles non-unit vectors', () => {
    const a = new Float32Array([3, 4, 0]);
    const b = new Float32Array([6, 8, 0]);
    // Same direction, different magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });

  it('throws for mismatched dimensions', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(() => cosineSimilarity(a, b)).toThrow('dimension mismatch');
  });

  it('returns 0 for zero vectors', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('computes correct similarity for arbitrary vectors', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);
    // dot = 4+10+18 = 32, |a| = sqrt(14), |b| = sqrt(77)
    const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected);
  });
});

describe('embeddingToBlob / blobToEmbedding', () => {
  it('round-trips a number array to buffer and back', () => {
    const original = [0.1, 0.2, 0.3, -0.5, 1.0];
    const blob = embeddingToBlob(original);
    const restored = blobToEmbedding(blob);

    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i]!, 5);
    }
  });

  it('handles empty arrays', () => {
    const blob = embeddingToBlob([]);
    const restored = blobToEmbedding(blob);
    expect(restored.length).toBe(0);
  });

  it('returns a Buffer from embeddingToBlob', () => {
    const blob = embeddingToBlob([1, 2, 3]);
    expect(Buffer.isBuffer(blob)).toBe(true);
  });

  it('uses 4 bytes per dimension (Float32)', () => {
    const blob = embeddingToBlob([1, 2, 3]);
    expect(blob.length).toBe(12); // 3 * 4 bytes
  });

  it('preserves negative values', () => {
    const original = [-1.5, -0.01, 0.0];
    const blob = embeddingToBlob(original);
    const restored = blobToEmbedding(blob);
    expect(restored[0]).toBeCloseTo(-1.5, 5);
    expect(restored[1]).toBeCloseTo(-0.01, 5);
    expect(restored[2]).toBeCloseTo(0.0, 5);
  });
});
